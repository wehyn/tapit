/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../_generated/api";
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
    const customerUserId = await ctx.db.insert("users", { email: "customer@example.test" });
    const unrelatedUserId = await ctx.db.insert("users", { email: "other@example.test" });
    const adminId = await ctx.db.insert("customers", {
      userId: adminUserId,
      email: "admin@example.test",
      role: "admin",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const customerId = await ctx.db.insert("customers", {
      userId: customerUserId,
      email: "customer@example.test",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("customers", {
      userId: unrelatedUserId,
      email: "other@example.test",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("settings", {
      key: "cardOrderLaunchEndDate",
      value: "2099-12-31",
      updatedAt: 1,
      updatedByUserId: adminUserId,
    });
    const paymentMethodId = await ctx.db.insert("cardOrderPaymentMethods", {
      provider: "Bank transfer",
      label: "Test bank",
      accountDetails: "Test account",
      instructions: "Transfer and upload proof.",
      active: true,
      createdAt: 1,
      updatedAt: 1,
      updatedByUserId: adminUserId,
    });
    const codeId = await ctx.db.insert("cardOrderReferralCodes", {
      code: "FOUNDING-AHRON",
      referrerLabel: "Ahron",
      active: true,
      createdAt: 1,
      updatedAt: 1,
      updatedByUserId: adminUserId,
    });
    return { adminUserId, adminId, customerUserId, customerId, unrelatedUserId, paymentMethodId, codeId };
  });
}

describe("card order referral usage", () => {
  it("keeps the default 10% discount through preview and order placement", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    const customer = t.withIdentity(identity(ids.customerUserId));
    const currentTime = Date.UTC(2099, 0, 1);

    const preview = await customer.query(api.cardOrderSettings.previewReferral, {
      code: " founding-ahron ",
      currentTime,
    });
    expect(preview).toEqual({ valid: true, discountCentavos: 5_990 });

    const orderId = await customer.mutation(api.cardOrders.placeOrder, {
      paymentMethodId: ids.paymentMethodId,
      referralCode: " founding-ahron ",
      designSource: { kind: "url", url: "https://example.test/front.png" },
      backDesignSource: { kind: "url", url: "https://example.test/back.png" },
      deliveryName: "Test Customer",
      deliveryPhone: "09170000000",
      deliveryAddress: "1 Test Street",
    });
    await expect(admin.query(api.cardOrderSettings.adminReferralCodes, {})).resolves.toEqual([
      { code: "FOUNDING-AHRON", usageCount: 1 },
    ]);
    await t.run(async (ctx) => {
      const order = await ctx.db.get(orderId);
      expect(order?.discountCentavos).toBe(5_990);
      expect(order?.referralCodeId).toBe(ids.codeId);
    });
  });

  it("counts a submitted referral order after cancellation or refund", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    const customer = t.withIdentity(identity(ids.customerUserId));
    const orderId = await customer.mutation(api.cardOrders.placeOrder, {
      paymentMethodId: ids.paymentMethodId,
      referralCode: "FOUNDING-AHRON",
      designSource: { kind: "url", url: "https://example.test/front.png" },
      backDesignSource: { kind: "url", url: "https://example.test/back.png" },
      deliveryName: "Test Customer",
      deliveryPhone: "09170000000",
      deliveryAddress: "1 Test Street",
    });

    await admin.mutation(api.cardOrders.cancelOrder, { orderId });
    await expect(admin.query(api.cardOrderSettings.adminReferralCodes, {})).resolves.toEqual([
      { code: "FOUNDING-AHRON", usageCount: 1 },
    ]);

    const refundedOrderId = await t.run(async (ctx) => {
      const paidCustomerId = await ctx.db.insert("customers", {
        email: "paid@example.test",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      return await ctx.db.insert("cardOrders", {
        customerId: paidCustomerId,
        quantity: 1,
        designSource: { kind: "url", url: "https://example.test/paid.png" },
        deliveryName: "Paid Customer",
        deliveryPhone: "09171111111",
        deliveryAddress: "2 Test Street",
        cardPriceCentavos: 59_900,
        discountCentavos: 5_990,
        paymentMethodId: ids.paymentMethodId,
        paymentSnapshot: { provider: "Bank transfer", label: "Test bank", accountDetails: "Test account", instructions: "Transfer." },
        referralCodeId: ids.codeId,
        referralSnapshot: { code: "FOUNDING-AHRON", referrerLabel: "Ahron" },
        paymentStatus: "received",
        fulfillmentStatus: "processing",
        commissionStatus: "pending",
        commissionCentavos: 5_990,
        createdAt: 2,
        updatedAt: 2,
      });
    });
    await admin.mutation(api.cardOrders.refundOrder, { orderId: refundedOrderId });
    await expect(admin.query(api.cardOrderSettings.adminReferralCodes, {})).resolves.toEqual([
      { code: "FOUNDING-AHRON", usageCount: 2 },
    ]);
  });

  it("denies an unrelated customer access to the referral usage view", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    const unrelated = t.withIdentity(identity(ids.unrelatedUserId));
    const args = {
      codeId: ids.codeId,
      paginationOpts: { numItems: 20, cursor: null },
    };

    await expect(
      admin.query(api.cardOrderSettings.adminReferralCodeUsage, args),
    ).resolves.toMatchObject({ page: [], isDone: true });
    await expect(
      unrelated.query(api.cardOrderSettings.adminReferralCodeUsage, args),
    ).rejects.toThrow("Administrator permission required.");
  });
});
