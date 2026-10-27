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
      await t.finishAllScheduledFunctions(vi.runAllTimers);

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

  it("accepts an administrator PNG and rejects unauthorized or invalid uploads", async () => {
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
      const { uploadId } = await uploaded.json();
      const admin = t.withIdentity(identity(ids.adminUserId));
      const owner = t.withIdentity(identity(ids.ownerUserId));
      await admin.mutation(api.cardOrderPaymentQr.setPaymentMethodQr, {
        methodId: ids.activeMethodId,
        uploadId,
      });
      const inactiveImage = await send(ids.adminUserId, png);
      expect(inactiveImage.status).toBe(200);
      const { uploadId: inactiveUploadId } = await inactiveImage.json();
      await admin.mutation(api.cardOrderPaymentQr.setPaymentMethodQr, {
        methodId: ids.inactiveMethodId,
        uploadId: inactiveUploadId,
      });
      await t.run(async (ctx) => {
        await ctx.db.patch(ids.inactiveMethodId, { active: false });
      });
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
      const ownOrderId = await owner.mutation(api.cardOrders.placeOrder, {
        paymentMethodId: ids.activeMethodId,
        designSource: { kind: "url", url: "https://example.test/front.png" },
        backDesignSource: { kind: "url", url: "https://example.test/back.png" },
        deliveryName: "Owner",
        deliveryPhone: "09170000000",
        deliveryAddress: "1 Test Street",
      });
      const replacementPng = new Uint8Array(
        await sharp({ create: { width: 64, height: 64, channels: 4, background: "red" } })
          .png()
          .toBuffer(),
      );
      const replacementResponse = await send(ids.adminUserId, replacementPng);
      expect(replacementResponse.status).toBe(200);
      const { uploadId: replacementUploadId } = await replacementResponse.json();
      await admin.mutation(api.cardOrderPaymentQr.setPaymentMethodQr, {
        methodId: ids.activeMethodId,
        uploadId: replacementUploadId,
      });
      await t.run(async (ctx) => {
        const order = await ctx.db.get(ownOrderId);
        const method = await ctx.db.get(ids.activeMethodId);
        expect(order?.paymentSnapshot.qrUploadId).toBe(uploadId);
        expect(method?.qrUploadId).toBe(replacementUploadId);
      });
      await expect(
        t
          .withIdentity(identity(ids.otherUserId))
          .query(api.cardOrderPaymentQr.customerPaymentQrUrl, {
            orderId: ownOrderId,
          }),
      ).rejects.toThrow("Payment method unavailable.");
      const orderUrl = await owner.query(api.cardOrderPaymentQr.customerPaymentQrUrl, {
        orderId: ownOrderId,
      });
      const methodUrl = await owner.query(api.cardOrderPaymentQr.customerPaymentQrUrl, {
        paymentMethodId: ids.activeMethodId,
      });
      expect(orderUrl).toEqual(expect.any(String));
      expect(methodUrl).toEqual(expect.any(String));
      expect(orderUrl).not.toBe(methodUrl);

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
});
