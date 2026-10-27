/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");

type CardOrderTestClient = ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;

async function placeCreatedOrder(
  customer: CardOrderTestClient,
  args: FunctionArgs<typeof api.cardOrders.placeOrder>,
): Promise<Id<"cardOrders">> {
  const outcome = await customer.mutation(api.cardOrders.placeOrder, args);
  if (outcome.kind !== "created") throw new Error(`Expected a created order, got ${outcome.kind}.`);
  return outcome.orderId;
}
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
    return {
      adminUserId,
      adminId,
      customerUserId,
      customerId,
      unrelatedUserId,
      paymentMethodId,
      codeId,
    };
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

    const orderId = await placeCreatedOrder(customer, {
      paymentMethodId: ids.paymentMethodId,
      referralCode: " founding-ahron ",
      designSource: { kind: "url", url: "https://example.test/front.png" },
      backDesignSource: { kind: "url", url: "https://example.test/back.png" },
      deliveryName: "Test Customer",
      deliveryPhone: "09170000000",
      deliveryAddress: "1 Test Street",
      expectedCardAmountCentavos: 53_910,
    });
    await expect(admin.query(api.cardOrderSettings.adminReferralCodes, {})).resolves.toEqual([
      {
        _id: ids.codeId,
        code: "FOUNDING-AHRON",
        referrerLabel: "Ahron",
        active: true,
        usageCount: 1,
      },
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
    const orderId = await placeCreatedOrder(customer, {
      paymentMethodId: ids.paymentMethodId,
      referralCode: "FOUNDING-AHRON",
      designSource: { kind: "url", url: "https://example.test/front.png" },
      backDesignSource: { kind: "url", url: "https://example.test/back.png" },
      deliveryName: "Test Customer",
      deliveryPhone: "09170000000",
      deliveryAddress: "1 Test Street",
      expectedCardAmountCentavos: 53_910,
    });

    await admin.mutation(api.cardOrders.cancelOrder, { orderId });
    await expect(admin.query(api.cardOrderSettings.adminReferralCodes, {})).resolves.toEqual([
      {
        _id: ids.codeId,
        code: "FOUNDING-AHRON",
        referrerLabel: "Ahron",
        active: true,
        usageCount: 1,
      },
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
        paymentSnapshot: {
          provider: "Bank transfer",
          label: "Test bank",
          accountDetails: "Test account",
          instructions: "Transfer.",
        },
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
      {
        _id: ids.codeId,
        code: "FOUNDING-AHRON",
        referrerLabel: "Ahron",
        active: true,
        usageCount: 2,
      },
    ]);
  });

  it("saves, clears, and returns a safe usage limit without changing the existing count", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.codeId, { usageCount: 5 });
    });
    for (const usageLimit of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        admin.mutation(api.cardOrderSettings.saveReferralCode, {
          id: ids.codeId,
          code: "FOUNDING-AHRON",
          referrerLabel: "Ahron",
          active: true,
          usageLimit,
        }),
      ).rejects.toThrow("Usage limit must be a positive safe integer.");
    }
    await admin.mutation(api.cardOrderSettings.saveReferralCode, {
      id: ids.codeId,
      code: "FOUNDING-AHRON",
      referrerLabel: "Ahron",
      active: true,
      usageLimit: 25,
    });
    await expect(admin.query(api.cardOrderSettings.adminReferralCodes, {})).resolves.toMatchObject([
      { usageCount: 5, usageLimit: 25 },
    ]);
    await admin.mutation(api.cardOrderSettings.saveReferralCode, {
      id: ids.codeId,
      code: "FOUNDING-AHRON",
      referrerLabel: "Ahron",
      active: true,
    });
    const cleared = await admin.query(api.cardOrderSettings.adminReferralCodes, {});
    expect(cleared[0]).toMatchObject({ usageCount: 5 });
    expect(cleared[0]).not.toHaveProperty("usageLimit");
  });

  it("marks a capped code unavailable and counts its final use even after cancellation", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    const customer = t.withIdentity(identity(ids.customerUserId));
    await admin.mutation(api.cardOrderSettings.saveReferralCode, {
      id: ids.codeId,
      code: "FOUNDING-AHRON",
      referrerLabel: "Ahron",
      active: true,
      usageLimit: 1,
    });
    const orderId = await placeCreatedOrder(customer, {
      paymentMethodId: ids.paymentMethodId,
      referralCode: "FOUNDING-AHRON",
      designSource: { kind: "url", url: "https://example.test/front.png" },
      backDesignSource: { kind: "url", url: "https://example.test/back.png" },
      deliveryName: "Test Customer",
      deliveryPhone: "09170000000",
      deliveryAddress: "1 Test Street",
      expectedCardAmountCentavos: 53_910,
    });
    expect(
      await customer.query(api.cardOrderSettings.previewReferral, {
        code: "FOUNDING-AHRON",
        currentTime: Date.UTC(2099, 0, 1),
      }),
    ).toEqual({ valid: false, discountCentavos: 0 });
    await admin.mutation(api.cardOrders.cancelOrder, { orderId });
    await expect(
      customer.mutation(api.cardOrders.placeOrder, {
        paymentMethodId: ids.paymentMethodId,
        referralCode: "FOUNDING-AHRON",
        designSource: { kind: "url", url: "https://example.test/front.png" },
        backDesignSource: { kind: "url", url: "https://example.test/back.png" },
        deliveryName: "Test Customer",
        deliveryPhone: "09170000000",
        deliveryAddress: "1 Test Street",
        expectedCardAmountCentavos: 53_910,
      }),
    ).rejects.toThrow("Referral code is unavailable for this order.");
    await expect(admin.query(api.cardOrderSettings.adminReferralCodes, {})).resolves.toMatchObject([
      { usageCount: 1, usageLimit: 1 },
    ]);
  });

  it("allows only one of two customers to claim the remaining use", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    const first = t.withIdentity(identity(ids.customerUserId));
    const second = t.withIdentity(identity(ids.unrelatedUserId));
    await admin.mutation(api.cardOrderSettings.saveReferralCode, {
      id: ids.codeId,
      code: "FOUNDING-AHRON",
      referrerLabel: "Ahron",
      active: true,
      usageLimit: 1,
    });
    const args = {
      paymentMethodId: ids.paymentMethodId,
      referralCode: "FOUNDING-AHRON",
      designSource: { kind: "url" as const, url: "https://example.test/front.png" },
      backDesignSource: { kind: "url" as const, url: "https://example.test/back.png" },
      deliveryName: "Test Customer",
      deliveryPhone: "09170000000",
      deliveryAddress: "1 Test Street",
      expectedCardAmountCentavos: 53_910,
    };
    const results = await Promise.allSettled([
      first.mutation(api.cardOrders.placeOrder, args),
      second.mutation(api.cardOrders.placeOrder, args),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(admin.query(api.cardOrderSettings.adminReferralCodes, {})).resolves.toMatchObject([
      { usageCount: 1, usageLimit: 1 },
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

  it("starts the legacy usage backfill once and resumes across pages without double counting", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < 205; index++) {
        await ctx.db.insert("cardOrders", {
          customerId: ids.customerId,
          quantity: 1,
          designSource: { kind: "url", url: "https://example.test/legacy.png" },
          deliveryName: "Legacy Customer",
          deliveryPhone: "09170000000",
          deliveryAddress: "Private address",
          cardPriceCentavos: 59_900,
          discountCentavos: 5_990,
          paymentMethodId: ids.paymentMethodId,
          paymentSnapshot: {
            provider: "Bank transfer",
            label: "Test bank",
            accountDetails: "Private account details",
            instructions: "Transfer.",
          },
          referralCodeId: ids.codeId,
          referralSnapshot: { code: "FOUNDING-AHRON", referrerLabel: "Ahron" },
          paymentStatus: "unpaid",
          fulfillmentStatus: "awaiting_payment",
          commissionStatus: "pending",
          commissionCentavos: 5_990,
          createdAt: index + 1,
          updatedAt: index + 1,
        });
      }
    });

    const admin = t.withIdentity(identity(ids.adminUserId));
    vi.useFakeTimers();
    try {
      await admin.mutation(api.cardOrderSettings.startReferralUsageBackfill, {});
      await admin.mutation(api.cardOrderSettings.startReferralUsageBackfill, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      await expect(
        admin.query(api.cardOrderSettings.adminReferralCodes, {}),
      ).resolves.toMatchObject([{ usageCount: 205 }]);

      await t.mutation(internal.cardOrderReferralUsage.backfillUsageCounts, { cursor: null });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      await expect(
        admin.query(api.cardOrderSettings.adminReferralCodes, {}),
      ).resolves.toMatchObject([{ usageCount: 205 }]);
    } finally {
      vi.useRealTimers();
    }
    const countedOrders = await t.run(async (ctx) => {
      const orders = await ctx.db
        .query("cardOrders")
        .withIndex("by_scope_and_referralCodeId_and_createdAt", (q) =>
          q.eq("scope", undefined).eq("referralCodeId", ids.codeId),
        )
        .take(250);
      return orders.filter((order) => order.usageCounted === true);
    });
    expect(countedOrders).toHaveLength(205);
  });

  it("paginates referral history with only the approved customer and status fields", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.customerId, { onboardingName: "Test Customer" });
      for (let index = 1; index <= 3; index++) {
        await ctx.db.insert("cardOrders", {
          customerId: ids.customerId,
          quantity: 1,
          designSource: { kind: "url", url: "https://example.test/history.png" },
          deliveryName: "Private delivery name",
          deliveryPhone: "Private phone",
          deliveryAddress: "Private address",
          cardPriceCentavos: 59_900,
          discountCentavos: 5_990,
          paymentMethodId: ids.paymentMethodId,
          paymentSnapshot: {
            provider: "Bank transfer",
            label: "Test bank",
            accountDetails: "Private account details",
            instructions: "Transfer.",
          },
          referralCodeId: ids.codeId,
          referralSnapshot: { code: "FOUNDING-AHRON", referrerLabel: "Ahron" },
          paymentStatus: "unpaid",
          fulfillmentStatus: "awaiting_payment",
          commissionStatus: "pending",
          commissionCentavos: 5_990,
          createdAt: index,
          updatedAt: index,
        });
      }
    });

    const admin = t.withIdentity(identity(ids.adminUserId));
    const args = { codeId: ids.codeId, paginationOpts: { numItems: 2, cursor: null } };
    const first = await admin.query(api.cardOrderSettings.adminReferralCodeUsage, args);
    expect(first.page).toEqual([
      {
        date: 3,
        orderId: expect.any(String),
        customerName: "Test Customer",
        customerEmail: "customer@example.test",
        paymentStatus: "unpaid",
        fulfillmentStatus: "awaiting_payment",
        commissionStatus: "pending",
      },
      {
        date: 2,
        orderId: expect.any(String),
        customerName: "Test Customer",
        customerEmail: "customer@example.test",
        paymentStatus: "unpaid",
        fulfillmentStatus: "awaiting_payment",
        commissionStatus: "pending",
      },
    ]);
    expect(first.isDone).toBe(false);
    expect(
      first.page.every((row) => !("deliveryAddress" in row) && !("deliveryPhone" in row)),
    ).toBe(true);

    const second = await admin.query(api.cardOrderSettings.adminReferralCodeUsage, {
      codeId: ids.codeId,
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(second.page).toEqual([
      {
        date: 1,
        orderId: expect.any(String),
        customerName: "Test Customer",
        customerEmail: "customer@example.test",
        paymentStatus: "unpaid",
        fulfillmentStatus: "awaiting_payment",
        commissionStatus: "pending",
      },
    ]);
    expect(second.isDone).toBe(true);
  });
});
