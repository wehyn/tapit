/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { httpRouter } from "convex/server";
import { ConvexError, v } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { httpAction, internalAction, type ActionCtx } from "../_generated/server";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");
const identity = (userId: Id<"users">) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const adminUserId = await ctx.db.insert("users", { email: "admin@example.test" });
    const ownerUserId = await ctx.db.insert("users", { email: "owner@example.test" });
    const otherUserId = await ctx.db.insert("users", { email: "other@example.test" });
    const customer = async (userId: Id<"users">, role: "admin" | "customer") =>
      await ctx.db.insert("customers", {
        userId,
        email: `${role}-${userId}@example.test`,
        role,
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
    const adminId = await customer(adminUserId, "admin");
    const ownerId = await customer(ownerUserId, "customer");
    await customer(otherUserId, "customer");
    return { adminUserId, ownerUserId, otherUserId, adminId, ownerId };
  });
}

async function order(
  t: ReturnType<typeof convexTest>,
  customerId: Id<"customers">,
  adminUserId: Id<"users">,
) {
  return await t.run(async (ctx) => {
    const methodId = await ctx.db.insert("cardOrderPaymentMethods", {
      provider: "Bank transfer",
      label: "Test bank",
      accountDetails: "Test account",
      instructions: "Transfer after ordering.",
      active: true,
      createdAt: 1,
      updatedAt: 1,
      updatedByUserId: adminUserId,
    });
    return await ctx.db.insert("cardOrders", {
      customerId,
      quantity: 1,
      designSource: { kind: "url", url: "https://example.test/front.png" },
      deliveryName: "Test Customer",
      deliveryPhone: "09123456789",
      deliveryAddress: "1 Test Street",
      cardPriceCentavos: 59900,
      discountCentavos: 0,
      paymentMethodId: methodId,
      paymentSnapshot: {
        provider: "Bank transfer",
        label: "Test bank",
        accountDetails: "Test account",
        instructions: "Transfer after ordering.",
      },
      paymentStatus: "unpaid",
      fulfillmentStatus: "awaiting_payment",
      commissionStatus: "none",
      commissionCentavos: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

describe("card order receipts", () => {
  it.each([
    ["recognized conflict", "conflict", 409, "Order is not awaiting payment."],
    ["storage failure", "storage", 503, "Upload failed. Please try again."],
  ] as const)(
    "maps %s across the receipt processing action boundary",
    async (_label, failure, status, body) => {
      vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
      try {
        const processLoader = modules["../cardOrderReceiptProcessing.ts"];
        expect(processLoader).toBeDefined();
        const realProcess = ((await processLoader!()) as { process: unknown }).process as {
          _handler: (
            ctx: ActionCtx,
            args: { uploadId: Id<"cardOrderReceiptUploads"> },
          ) => Promise<Id<"cardOrderReceiptUploads">>;
        };
        const process = internalAction({
          args: { uploadId: v.id("cardOrderReceiptUploads") },
          returns: v.id("cardOrderReceiptUploads"),
          handler:
            failure === "conflict"
              ? async () => {
                  throw new ConvexError("Order is not awaiting payment.");
                }
              : (ctx, args) =>
                  realProcess._handler(
                    {
                      ...ctx,
                      storage: {
                        ...ctx.storage,
                        get: async () => {
                          throw new Error("private receipt storage sentinel");
                        },
                      },
                    },
                    args,
                  ),
        });
        const overriddenModules = {
          ...modules,
          "../cardOrderReceiptProcessing.ts": async () => ({ process }),
        };
        const t = convexTest(schema, overriddenModules);
        const ids = await seed(t);
        const orderId = await order(t, ids.ownerId, ids.adminUserId);
        const owner = t.withIdentity(identity(ids.ownerUserId));
        const uploadId = await owner.mutation(api.cardOrderReceipts.createUploadIntent, {
          orderId,
        });
        const png = new Uint8Array(
          await sharp({ create: { width: 8, height: 8, channels: 4, background: "white" } })
            .png()
            .toBuffer(),
        );
        const response = await owner.fetch("/card-order-receipt-upload", {
          method: "POST",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "image/png",
            "X-File-Name": "receipt.png",
            "X-Upload-Id": uploadId,
          },
          body: png,
        });
        expect(response.status).toBe(status);
        const responseBody = await response.text();
        expect(responseBody).toBe(body);
        expect(responseBody).not.toContain("sentinel");
        if (failure === "storage") {
          await t.run(async (ctx) => {
            const uploads = await ctx.db.query("cardOrderReceiptUploads").collect();
            expect(uploads).toHaveLength(1);
            expect(uploads[0]?.status).toBe("failed");
            expect(uploads[0]).not.toHaveProperty("storageId");
            expect(await ctx.db.system.query("_storage").collect()).toHaveLength(0);
          });
        }
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it("maps receipt storage store failures safely and leaves the intent retryable", async () => {
    vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
    try {
      const uploadLoader = modules["../cardOrderReceiptUploadHttp.ts"];
      expect(uploadLoader).toBeDefined();
      const realUpload = ((await uploadLoader!()) as { upload: unknown }).upload as {
        _handler: (ctx: ActionCtx, request: Request) => Promise<Response>;
      };
      const uploadWithFailedStorageStore = httpAction((ctx, request) =>
        realUpload._handler(
          {
            ...ctx,
            storage: {
              ...ctx.storage,
              store: async () => {
                throw new Error("receipt store sentinel");
              },
            },
          },
          request,
        ),
      );
      const router = httpRouter();
      router.route({
        path: "/card-order-receipt-upload",
        method: "POST",
        handler: uploadWithFailedStorageStore,
      });
      const t = convexTest(schema, {
        ...modules,
        "../http.ts": async () => ({ default: router }),
      });
      const ids = await seed(t);
      const orderId = await order(t, ids.ownerId, ids.adminUserId);
      const owner = t.withIdentity(identity(ids.ownerUserId));
      const uploadId = await owner.mutation(api.cardOrderReceipts.createUploadIntent, { orderId });
      const png = new Uint8Array(
        await sharp({ create: { width: 8, height: 8, channels: 4, background: "white" } })
          .png()
          .toBuffer(),
      );
      const response = await owner.fetch("/card-order-receipt-upload", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "image/png",
          "X-File-Name": "receipt.png",
          "X-Upload-Id": uploadId,
        },
        body: png,
      });
      expect(response.status).toBe(503);
      const body = await response.text();
      expect(body).toBe("Upload failed. Please try again.");
      expect(body).not.toContain("sentinel");
      await t.run(async (ctx) => {
        const upload = await ctx.db.get(uploadId);
        expect(upload?.status).toBe("pending");
        expect(upload).not.toHaveProperty("storageId");
        expect(await ctx.db.system.query("_storage").collect()).toHaveLength(0);
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("logs unknown processor errors with the receipt route path", async () => {
    vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const modulesWithUnknownProcessor = {
        ...modules,
        "../cardOrderReceiptProcessing.ts": async () => ({
          process: internalAction({
            args: { uploadId: v.id("cardOrderReceiptUploads") },
            returns: v.id("cardOrderReceiptUploads"),
            handler: async () => {
              throw new Error("receipt processor sentinel");
            },
          }),
        }),
      };
      const t = convexTest(schema, modulesWithUnknownProcessor);
      const ids = await seed(t);
      const orderId = await order(t, ids.ownerId, ids.adminUserId);
      const owner = t.withIdentity(identity(ids.ownerUserId));
      const uploadId = await owner.mutation(api.cardOrderReceipts.createUploadIntent, {
        orderId,
      });
      const png = new Uint8Array(
        await sharp({ create: { width: 8, height: 8, channels: 4, background: "white" } })
          .png()
          .toBuffer(),
      );
      const response = await owner.fetch("/card-order-receipt-upload", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "image/png",
          "X-File-Name": "receipt.png",
          "X-Upload-Id": uploadId,
        },
        body: png,
      });
      expect(response.status).toBe(422);
      const body = await response.text();
      expect(body).toBe("Upload failed. Please try again.");
      expect(body).not.toContain("sentinel");
      expect(errorLog).toHaveBeenCalledWith(
        "Unexpected upload failure at /card-order-receipt-upload",
        expect.objectContaining({ message: "receipt processor sentinel" }),
      );
    } finally {
      errorLog.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("returns the safe receipt signature message and status", async () => {
    vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
    try {
      const t = convexTest(schema, modules);
      const ids = await seed(t);
      const orderId = await order(t, ids.ownerId, ids.adminUserId);
      const owner = t.withIdentity(identity(ids.ownerUserId));
      const uploadId = await owner.mutation(api.cardOrderReceipts.createUploadIntent, {
        orderId,
      });
      const response = await owner.fetch("/card-order-receipt-upload", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "application/pdf",
          "X-File-Name": "receipt.pdf",
          "X-Upload-Id": uploadId,
        },
        body: new TextEncoder().encode("not a PDF document"),
      });
      expect(response.status).toBe(422);
      expect(await response.text()).toBe("Upload a valid PDF receipt matching its file type.");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("register throws the safe order conflict as ConvexError data", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const orderId = await order(t, ids.ownerId, ids.adminUserId);
    const uploadId = await t
      .withIdentity(identity(ids.ownerUserId))
      .mutation(api.cardOrderReceipts.createUploadIntent, { orderId });
    const storageId = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["receipt"]));
      await ctx.db.patch(uploadId, {
        status: "processing",
        storageId,
        fileName: "receipt.png",
        declaredContentType: "image/png",
        processingAt: Date.now(),
      });
      await ctx.db.patch(orderId, { fulfillmentStatus: "cancelled" });
      return storageId;
    });

    await expect(
      t.mutation(internal.cardOrderReceipts.register, {
        uploadId,
        contentType: "image/png",
        byteSize: 7,
      }),
    ).rejects.toMatchObject({ data: "Order is not awaiting payment." });
    await t.run((ctx) => ctx.storage.delete(storageId));
  });

  it("lets the owner upload and replace a receipt without changing order state", async () => {
    vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
    try {
      const t = convexTest(schema, modules);
      const ids = await seed(t);
      const orderId = await order(t, ids.ownerId, ids.adminUserId);
      const otherOrderId = await order(t, ids.ownerId, ids.adminUserId);
      const owner = t.withIdentity(identity(ids.ownerUserId));
      const png = new Uint8Array(
        await sharp({ create: { width: 32, height: 32, channels: 4, background: "white" } })
          .png()
          .toBuffer(),
      );

      async function createIntent() {
        return await owner.mutation(api.cardOrderReceipts.createUploadIntent, { orderId });
      }

      async function upload(fileName: string) {
        const uploadId = await createIntent();
        const response = await owner.fetch("/card-order-receipt-upload", {
          method: "POST",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "image/png",
            "X-File-Name": encodeURIComponent(fileName),
            "X-Upload-Id": uploadId,
          },
          body: png,
        });
        expect(response.ok).toBe(true);
        return uploadId;
      }

      const other = t.withIdentity(identity(ids.otherUserId));
      const firstUploadId = await upload("receipt.png");
      const unauthorizedUploadId = await createIntent();
      const unauthorizedUpload = await other.fetch("/card-order-receipt-upload", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "image/png",
          "X-File-Name": "stolen.png",
          "X-Upload-Id": unauthorizedUploadId,
        },
        body: png,
      });
      expect(unauthorizedUpload.ok).toBe(false);
      expect(unauthorizedUpload.status).toBe(410);
      expect(await unauthorizedUpload.text()).toBe("This upload request is no longer available.");
      await owner.mutation(api.cardOrderReceipts.attach, { orderId, uploadId: firstUploadId });
      await t.run(async (ctx) => {
        const saved = await ctx.db.get(orderId);
        expect(saved?.receiptUploadId).toBe(firstUploadId);
        expect(saved?.paymentStatus).toBe("unpaid");
        expect(saved?.fulfillmentStatus).toBe("awaiting_payment");
      });

      const failedReplacementId = await createIntent();
      const failedReplacement = await owner.fetch("/card-order-receipt-upload", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "image/png",
          "X-File-Name": "corrupt-receipt.png",
          "X-Upload-Id": failedReplacementId,
        },
        body: new TextEncoder().encode("not a PNG image"),
      });
      expect(failedReplacement.ok).toBe(false);
      expect(failedReplacement.status).toBe(422);
      expect(await failedReplacement.text()).toBe("Upload failed. Please try again.");
      await t.run(async (ctx) => {
        const saved = await ctx.db.get(orderId);
        expect(saved?.receiptUploadId).toBe(firstUploadId);
        expect(saved?.paymentStatus).toBe("unpaid");
        expect(saved?.fulfillmentStatus).toBe("awaiting_payment");
      });
      expect(await owner.query(api.cardOrderReceipts.customerReceiptUrl, { orderId })).toEqual(
        expect.any(String),
      );

      const replacementUploadId = await upload("replacement.png");
      await owner.mutation(api.cardOrderReceipts.attach, {
        orderId,
        uploadId: replacementUploadId,
      });
      const admin = t.withIdentity(identity(ids.adminUserId));
      const detail = await admin.query(api.cardOrders.adminOrderById, { orderId });
      expect(detail.receipt).toEqual({
        fileName: "replacement.png",
        contentType: "image/png",
        byteSize: png.byteLength,
        uploadedAt: expect.any(Number),
      });
      expect("receiptUploadId" in detail).toBe(false);
      expect(
        (
          await admin.query(api.cardOrders.adminOrders, {
            paginationOpts: { numItems: 25, cursor: null },
          })
        ).page.find((item) => item._id === orderId)?.receipt,
      ).toEqual(detail.receipt);
      expect(
        (await owner.query(api.cardOrders.myOrders, {})).find((item) => item._id === orderId)
          ?.receipt,
      ).toEqual(detail.receipt);
      await t.run(async (ctx) => {
        const saved = await ctx.db.get(orderId);
        expect(saved?.receiptUploadId).toBe(replacementUploadId);
        expect(saved?.paymentStatus).toBe("unpaid");
        expect(saved?.fulfillmentStatus).toBe("awaiting_payment");
        expect((await ctx.db.get(firstUploadId))?.status).toBe("replaced");
      });

      const crossOrderUploadId = await upload("wrong-order.png");
      await expect(
        owner.mutation(api.cardOrderReceipts.attach, {
          orderId: otherOrderId,
          uploadId: crossOrderUploadId,
        }),
      ).rejects.toThrow();
      await t.run(async (ctx) => {
        expect((await ctx.db.get(orderId))?.receiptUploadId).toBe(replacementUploadId);
        const otherOrder = await ctx.db.get(otherOrderId);
        expect(otherOrder?.receiptUploadId).toBeUndefined();
        expect(otherOrder?.paymentStatus).toBe("unpaid");
        expect(otherOrder?.fulfillmentStatus).toBe("awaiting_payment");
      });

      expect(await owner.query(api.cardOrderReceipts.customerReceiptUrl, { orderId })).toEqual(
        expect.any(String),
      );
      await expect(
        t.withIdentity(identity(ids.otherUserId)).query(api.cardOrderReceipts.customerReceiptUrl, {
          orderId,
        }),
      ).rejects.toThrow();
      await expect(
        t
          .withIdentity(identity(ids.otherUserId))
          .mutation(api.cardOrderReceipts.createUploadIntent, {
            orderId,
          }),
      ).rejects.toThrow();
      const unauthorizedAttachUploadId = await upload("unauthorized-attach.png");
      await expect(
        other.mutation(api.cardOrderReceipts.attach, {
          orderId,
          uploadId: unauthorizedAttachUploadId,
        }),
      ).rejects.toThrow();
      await expect(
        owner.mutation(api.cardOrderReceipts.attach, { orderId, uploadId: firstUploadId }),
      ).rejects.toThrow();
      await expect(
        owner.query(api.cardOrderReceipts.adminOrderReceiptUrl, { orderId }),
      ).rejects.toThrow();
      await expect(
        t
          .withIdentity(identity(ids.adminUserId))
          .query(api.cardOrderReceipts.adminOrderReceiptUrl, {
            orderId,
          }),
      ).resolves.toEqual(expect.any(String));
      await t.run(async (ctx) => {
        const saved = await ctx.db.get(orderId);
        expect(saved?.paymentStatus).toBe("unpaid");
        expect(saved?.fulfillmentStatus).toBe("awaiting_payment");
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ["awaiting_shipping_quote", "unpaid"],
    ["awaiting_payment", "received"],
    ["awaiting_payment", "refunded"],
    ["cancelled", "unpaid"],
  ] as const)(
    "rejects receipt attachment for %s / %s orders",
    async (fulfillmentStatus, paymentStatus) => {
      vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
      try {
        const t = convexTest(schema, modules);
        const ids = await seed(t);
        const orderId = await order(t, ids.ownerId, ids.adminUserId);
        const owner = t.withIdentity(identity(ids.ownerUserId));
        const uploadId = await owner.mutation(api.cardOrderReceipts.createUploadIntent, {
          orderId,
        });
        const png = new Uint8Array(
          await sharp({ create: { width: 32, height: 32, channels: 4, background: "white" } })
            .png()
            .toBuffer(),
        );
        const response = await owner.fetch("/card-order-receipt-upload", {
          method: "POST",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "image/png",
            "X-File-Name": "ready-before-transition.png",
            "X-Upload-Id": uploadId,
          },
          body: png,
        });
        expect(response.ok).toBe(true);
        await t.run(async (ctx) => {
          await ctx.db.patch(orderId, { fulfillmentStatus, paymentStatus });
        });
        await expect(
          owner.mutation(api.cardOrderReceipts.createUploadIntent, { orderId }),
        ).rejects.toThrow();
        await expect(
          owner.mutation(api.cardOrderReceipts.attach, { orderId, uploadId }),
        ).rejects.toThrow("Order is not awaiting payment.");
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );
});
