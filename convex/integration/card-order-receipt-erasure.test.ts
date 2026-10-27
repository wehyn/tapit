/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");

describe("card order receipt account erasure", () => {
  it("keeps a receipt blob while its order exists, then removes both after the order is erased", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        email: "deleted@example.test",
        role: "customer",
        status: "deleted",
        deletionStatus: "deleted",
        deletionRequestedAt: Date.now(),
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("deletionRequests", {
        customerId,
        requestedAt: Date.now(),
        status: "approved",
      });
      const methodId = await ctx.db.insert("cardOrderPaymentMethods", {
        provider: "Bank transfer",
        label: "Test bank",
        accountDetails: "Test account",
        instructions: "Transfer after ordering.",
        active: true,
        createdAt: 1,
        updatedAt: 1,
      });
      const orderId = await ctx.db.insert("cardOrders", {
        customerId,
        quantity: 1,
        designSource: { kind: "url", url: "https://example.test/front.png" },
        deliveryName: "Deleted Customer",
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
        paymentStatus: "received",
        fulfillmentStatus: "processing",
        commissionStatus: "none",
        commissionCentavos: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      const storageId = await ctx.storage.store(new Blob(["receipt data"]));
      const uploadId = await ctx.db.insert("cardOrderReceiptUploads", {
        ownerId: customerId,
        orderId,
        storageId,
        fileName: "receipt.pdf",
        contentType: "application/pdf",
        byteSize: 12,
        status: "attached",
        createdAt: 1,
        availableAt: 1,
      });
      await ctx.db.patch(orderId, { receiptUploadId: uploadId });
      return { customerId, storageId, uploadId };
    });

    await t.mutation(internal.accountErasure.eraseAccountPass, { customerId: ids.customerId });
    expect(await t.run(async (ctx) => (await ctx.storage.get(ids.storageId)) !== null)).toBe(true);
    expect(await t.run((ctx) => ctx.db.get(ids.uploadId))).not.toBeNull();

    await t.mutation(internal.accountErasure.eraseAccountPass, { customerId: ids.customerId });
    expect(await t.run(async (ctx) => (await ctx.storage.get(ids.storageId)) !== null)).toBe(false);
    expect(await t.run((ctx) => ctx.db.get(ids.uploadId))).toBeNull();
  });
});
