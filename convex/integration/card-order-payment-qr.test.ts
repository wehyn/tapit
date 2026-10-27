/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

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
    const adminId = await ctx.db.insert("customers", {
      userId: adminUserId,
      email: "admin@example.test",
      role: "admin",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const ownerId = await ctx.db.insert("customers", {
      userId: ownerUserId,
      email: "owner@example.test",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("customers", {
      userId: otherUserId,
      email: "other@example.test",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const activeMethodId = await ctx.db.insert("cardOrderPaymentMethods", {
      provider: "Bank transfer",
      label: "Test bank",
      accountDetails: "Test account",
      instructions: "Transfer after ordering.",
      active: true,
      createdAt: 1,
      updatedAt: 1,
      updatedByUserId: adminUserId,
    });
    const inactiveMethodId = await ctx.db.insert("cardOrderPaymentMethods", {
      provider: "Bank transfer",
      label: "Inactive bank",
      accountDetails: "Test account",
      instructions: "Transfer after ordering.",
      active: false,
      createdAt: 1,
      updatedAt: 1,
      updatedByUserId: adminUserId,
    });
    await ctx.db.insert("settings", {
      key: "cardOrderLaunchEndDate",
      value: "2099-12-31",
      updatedAt: 1,
      updatedByUserId: adminUserId,
    });
    return {
      adminUserId,
      ownerUserId,
      otherUserId,
      adminId,
      ownerId,
      activeMethodId,
      inactiveMethodId,
    };
  });
}

describe("card order payment QR", () => {
  it("reschedules cleanup for processing uploads and preserves referenced QR files", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const ids = await seed(t);
      const uploadId = await t.mutation(internal.cardOrderPaymentQr.createUploadIntent, {
        userId: ids.adminUserId,
      });
      vi.advanceTimersByTime(45 * 60 * 1000);
      const storageId = await t.run((ctx) =>
        ctx.storage.store(new Blob(["processing QR"])),
      );
      await t.mutation(internal.cardOrderPaymentQr.prepareUpload, {
        uploadId,
        storageId,
        fileName: "processing.png",
      });

      const referencedStorageId = await t.run((ctx) =>
        ctx.storage.store(new Blob(["referenced QR"])),
      );
      const referencedUploadId = await t.run(async (ctx) => {
        const id = await ctx.db.insert("cardOrderQrUploads", {
          ownerId: ids.adminId,
          actorUserId: ids.adminUserId,
          status: "available",
          storageId: referencedStorageId,
          contentType: "image/png",
          byteSize: 13,
          createdAt: Date.now() - 2 * 60 * 60 * 1000,
          availableAt: Date.now() - 48 * 60 * 60 * 1000,
        });
        await ctx.db.patch(ids.activeMethodId, { qrUploadId: id });
        return id;
      });

      vi.advanceTimersByTime(15 * 60 * 1000);
      await t.finishInProgressScheduledFunctions();
      expect(await t.run((ctx) => ctx.db.get(uploadId))).not.toBeNull();
      expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();

      vi.advanceTimersByTime(15 * 60 * 1000);
      await t.finishInProgressScheduledFunctions();

      await t.run((ctx) =>
        ctx.db.patch(referencedUploadId, {
          status: "available",
          availableAt: Date.now() - 48 * 60 * 60 * 1000,
        }),
      );
      await t.mutation(internal.cardOrderPaymentQr.cleanup, { uploadId: referencedUploadId });
      expect(await t.run((ctx) => ctx.db.get(uploadId))).toBeNull();
      expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
      expect(await t.run((ctx) => ctx.db.get(referencedUploadId))).not.toBeNull();
      expect(await t.run((ctx) => ctx.storage.getUrl(referencedStorageId))).not.toBeNull();
      expect(await t.run(async (ctx) => (await ctx.db.get(ids.activeMethodId))?.qrUploadId)).toBe(
        referencedUploadId,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts and attaches an administrator PNG, including an identical retry, and rejects invalid uploads", async () => {
    vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
    try {
      const t = convexTest(schema, modules);
      const ids = await seed(t);
      const png = new Uint8Array(
        await sharp({ create: { width: 32, height: 32, channels: 4, background: "white" } })
          .png()
          .toBuffer(),
      );
      const send = (userId: Id<"users">, bytes: Uint8Array, type = "image/png") =>
        t.withIdentity(identity(userId)).fetch("/card-order-payment-qr-upload", {
          method: "POST",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": type,
            "X-File-Name": "payment-qr.png",
          },
          body: Buffer.from(bytes),
        });

      const uploaded = await send(ids.adminUserId, png);
      expect(uploaded.status).toBe(200);
      const { uploadId: rawUploadId } = await uploaded.json();
      const uploadId = rawUploadId as Id<"cardOrderQrUploads">;
      const admin = t.withIdentity(identity(ids.adminUserId));
      const attach = () =>
        admin.mutation(api.cardOrderPaymentQr.setPaymentMethodQr, {
          methodId: ids.activeMethodId,
          uploadId,
        });
      await attach();
      await attach();
      await t.run(async (ctx) => {
        expect((await ctx.db.get(ids.activeMethodId))?.qrUploadId).toBe(uploadId);
        expect((await ctx.db.get(uploadId))?.status).toBe("attached");
      });

      expect((await send(ids.ownerUserId, png)).status).toBe(403);
      expect((await send(ids.adminUserId, png, "image/gif")).status).toBe(415);
      expect((await send(ids.adminUserId, new Uint8Array([1, 2, 3, 4]))).status).toBe(400);
      expect((await send(ids.adminUserId, png, "image/jpeg")).status).toBe(400);
      expect((await send(ids.adminUserId, new Uint8Array(5 * 1024 * 1024))).status).toBe(413);
      const oversizedPixels = new Uint8Array(
        await sharp({ create: { width: 3000, height: 2001, channels: 4, background: "white" } })
          .png()
          .toBuffer(),
      );
      const oversizedEdge = new Uint8Array(
        await sharp({ create: { width: 12_001, height: 1, channels: 4, background: "white" } })
          .png()
          .toBuffer(),
      );
      expect((await send(ids.adminUserId, oversizedPixels)).status).toBe(400);
      expect((await send(ids.adminUserId, oversizedEdge)).status).toBe(400);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("scopes QR management, preserves the current QR on rejected replacement, and removes references safely", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    const {
      originalUploadId,
      originalStorageId,
      replacementUploadId,
      foreignAvailableUploadId,
      foreignAvailableStorageId,
      foreignMethodId,
      foreignUploadId,
      foreignStorageId,
    } =
      await t.run(async (ctx) => {
        const originalStorageId = await ctx.storage.store(new Blob(["local QR"]));
        const replacementStorageId = await ctx.storage.store(new Blob(["other admin QR"]));
        const foreignAvailableStorageId = await ctx.storage.store(new Blob(["available foreign QR"]));
        const foreignStorageId = await ctx.storage.store(new Blob(["foreign scope QR"]));
        const replacementAdminUserId = await ctx.db.insert("users", {
          email: "replacement-admin@example.test",
        });
        const replacementAdminId = await ctx.db.insert("customers", {
          userId: replacementAdminUserId,
          email: "replacement-admin@example.test",
          role: "admin",
          status: "active",
          deletionStatus: "active",
          createdAt: 1,
          updatedAt: 1,
        });
        const foreignAdminUserId = await ctx.db.insert("users", {
          email: "foreign-admin@example.test",
        });
        const foreignAdminId = await ctx.db.insert("customers", {
          scope: "demo",
          userId: foreignAdminUserId,
          email: "foreign-admin@example.test",
          role: "admin",
          status: "active",
          deletionStatus: "active",
          createdAt: 1,
          updatedAt: 1,
        });
        const originalUploadId = await ctx.db.insert("cardOrderQrUploads", {
          ownerId: ids.adminId,
          actorUserId: ids.adminUserId,
          status: "attached",
          storageId: originalStorageId,
          contentType: "image/png",
          byteSize: 8,
          createdAt: 1,
          availableAt: 1,
          attachedAt: 1,
        });
        const replacementUploadId = await ctx.db.insert("cardOrderQrUploads", {
          ownerId: replacementAdminId,
          actorUserId: replacementAdminUserId,
          status: "available",
          storageId: replacementStorageId,
          contentType: "image/png",
          byteSize: 15,
          createdAt: 1,
          availableAt: 1,
        });
        const foreignMethodId = await ctx.db.insert("cardOrderPaymentMethods", {
          scope: "demo",
          provider: "Foreign bank",
          label: "Foreign method",
          accountDetails: "Foreign account",
          instructions: "Transfer after ordering.",
          active: true,
          createdAt: 1,
          updatedAt: 1,
          updatedByUserId: foreignAdminUserId,
        });
        const foreignAvailableUploadId = await ctx.db.insert("cardOrderQrUploads", {
          ownerId: foreignAdminId,
          actorUserId: foreignAdminUserId,
          scope: "demo",
          status: "available",
          storageId: foreignAvailableStorageId,
          contentType: "image/png",
          byteSize: 25,
          createdAt: 1,
          availableAt: 1,
        });
        const foreignUploadId = await ctx.db.insert("cardOrderQrUploads", {
          ownerId: foreignAdminId,
          actorUserId: foreignAdminUserId,
          scope: "demo",
          status: "attached",
          storageId: foreignStorageId,
          contentType: "image/png",
          byteSize: 16,
          createdAt: 1,
          availableAt: 1,
          attachedAt: 1,
        });
        await ctx.db.patch(foreignMethodId, { qrUploadId: foreignUploadId });
        await ctx.db.patch(ids.activeMethodId, { qrUploadId: originalUploadId });
        return {
          originalUploadId,
          originalStorageId,
          replacementUploadId,
          foreignAvailableUploadId,
          foreignAvailableStorageId,
          foreignMethodId,
          foreignUploadId,
          foreignStorageId,
        };
      });

    await expect(
      admin.mutation(api.cardOrderPaymentQr.setPaymentMethodQr, {
        methodId: ids.activeMethodId,
        uploadId: replacementUploadId,
      }),
    ).rejects.toThrow("QR upload unavailable.");
    await expect(
      admin.mutation(api.cardOrderPaymentQr.setPaymentMethodQr, {
        methodId: foreignMethodId,
        uploadId: null,
      }),
    ).rejects.toThrow("Payment method unavailable.");
    await expect(
      admin.mutation(api.cardOrderPaymentQr.setPaymentMethodQr, {
        methodId: ids.activeMethodId,
        uploadId: foreignAvailableUploadId,
      }),
    ).rejects.toThrow("QR upload unavailable.");
    await t.run(async (ctx) => {
      expect((await ctx.db.get(ids.activeMethodId))?.qrUploadId).toBe(originalUploadId);
      expect((await ctx.db.get(originalUploadId))?.status).toBe("attached");
      expect(await ctx.storage.getUrl(originalStorageId)).not.toBeNull();
      expect((await ctx.db.get(foreignAvailableUploadId))?.status).toBe("available");
      expect(await ctx.storage.getUrl(foreignAvailableStorageId)).not.toBeNull();
      expect((await ctx.db.get(foreignMethodId))?.qrUploadId).toBe(foreignUploadId);
      expect((await ctx.db.get(foreignUploadId))?.status).toBe("attached");
      expect(await ctx.storage.getUrl(foreignStorageId)).not.toBeNull();
    });

    await admin.mutation(api.cardOrderPaymentQr.setPaymentMethodQr, {
      methodId: ids.activeMethodId,
      uploadId: null,
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(ids.activeMethodId))?.qrUploadId).toBeUndefined();
      expect((await ctx.db.get(originalUploadId))?.status).toBe("available");
      expect(await ctx.storage.getUrl(originalStorageId)).not.toBeNull();
    });
  });

  it("authorizes QR URLs only for active methods and the customer's own order snapshot", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["payment QR"])));
    const orderId = await t.run(async (ctx) => {
      const uploadId = await ctx.db.insert("cardOrderQrUploads", {
        ownerId: ids.adminId,
        actorUserId: ids.adminUserId,
        status: "attached",
        storageId,
        contentType: "image/png",
        byteSize: 10,
        createdAt: Date.now(),
        availableAt: Date.now(),
        attachedAt: Date.now(),
      });
      await ctx.db.patch(ids.activeMethodId, { qrUploadId: uploadId });
      await ctx.db.patch(ids.inactiveMethodId, { qrUploadId: uploadId });
      return await ctx.db.insert("cardOrders", {
        customerId: ids.ownerId,
        quantity: 1,
        designSource: { kind: "url", url: "https://example.test/front.png" },
        deliveryName: "Owner",
        deliveryPhone: "09170000000",
        deliveryAddress: "1 Test Street",
        cardPriceCentavos: 100,
        discountCentavos: 0,
        paymentMethodId: ids.activeMethodId,
        paymentSnapshot: {
          provider: "Bank transfer",
          label: "Test bank",
          accountDetails: "Test account",
          instructions: "Transfer after ordering.",
          qrUploadId: uploadId,
        },
        qrUploadId: uploadId,
        paymentStatus: "unpaid",
        fulfillmentStatus: "awaiting_payment",
        commissionStatus: "none",
        commissionCentavos: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const owner = t.withIdentity(identity(ids.ownerUserId));
    await expect(
      owner.query(api.cardOrderPaymentQr.customerPaymentQrUrl, {
        paymentMethodId: ids.activeMethodId,
      }),
    ).resolves.toEqual(expect.any(String));
    await expect(
      owner.query(api.cardOrderPaymentQr.customerPaymentQrUrl, {
        paymentMethodId: ids.inactiveMethodId,
      }),
    ).rejects.toThrow("Payment method unavailable.");
    await expect(
      owner.query(api.cardOrderPaymentQr.customerPaymentQrUrl, { orderId }),
    ).resolves.toEqual(expect.any(String));
    await expect(
      t.withIdentity(identity(ids.otherUserId)).query(api.cardOrderPaymentQr.customerPaymentQrUrl, {
        orderId,
      }),
    ).rejects.toThrow("Payment method unavailable.");
  });
});
