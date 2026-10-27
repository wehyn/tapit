/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");

describe("card order receipt upload cleanup", () => {
  it("preserves an active winner and removes a rejected request's unreferenced blob", async () => {
    const t = convexTest(schema, modules);
    const { userId, uploadId, winningStorageId, losingStorageId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "owner@example.test" });
      const ownerId = await ctx.db.insert("customers", {
        userId,
        email: "owner@example.test",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const methodId = await ctx.db.insert("cardOrderPaymentMethods", {
        provider: "Bank transfer",
        label: "Test bank",
        accountDetails: "Test account",
        instructions: "Transfer after ordering.",
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const orderId = await ctx.db.insert("cardOrders", {
        customerId: ownerId,
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
      const winningStorageId = await ctx.storage.store(new Blob(["winning upload"]));
      const losingStorageId = await ctx.storage.store(new Blob(["losing upload"]));
      const uploadId = await ctx.db.insert("cardOrderReceiptUploads", {
        ownerId,
        orderId,
        storageId: winningStorageId,
        status: "processing",
        createdAt: Date.now(),
        processingAt: Date.now(),
      });
      return { userId, uploadId, winningStorageId, losingStorageId };
    });

    await t.mutation(internal.cardOrderReceipts.cleanupFailedUpload, { uploadId, userId });
    expect(await t.run(async (ctx) => (await ctx.storage.get(winningStorageId)) !== null)).toBe(
      true,
    );
    expect((await t.run((ctx) => ctx.db.get(uploadId)))?.status).toBe("processing");

    await t.mutation(internal.cardOrderReceipts.cleanupFailedUpload, {
      uploadId,
      userId,
      storageId: losingStorageId,
    });
    expect(await t.run(async (ctx) => (await ctx.storage.get(losingStorageId)) !== null)).toBe(
      false,
    );
    expect(await t.run(async (ctx) => (await ctx.storage.get(winningStorageId)) !== null)).toBe(
      true,
    );
    expect((await t.run((ctx) => ctx.db.get(uploadId)))?.storageId).toBe(winningStorageId);

    await t.mutation(internal.cardOrderReceipts.cleanupFailedUpload, { uploadId });
    expect(await t.run(async (ctx) => (await ctx.storage.get(winningStorageId)) !== null)).toBe(
      false,
    );
    expect((await t.run((ctx) => ctx.db.get(uploadId)))?.status).toBe("failed");
  });
});
