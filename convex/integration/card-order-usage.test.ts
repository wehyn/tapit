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
    await ctx.db.insert("settings", {
      key: "cardOrderReferralUsageBackfillStarted",
      value: "completed",
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

  it("marks a capped code unavailable to a fresh customer and keeps canceled use counted", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    const customer = t.withIdentity(identity(ids.customerUserId));
    const nextCustomer = t.withIdentity(identity(ids.unrelatedUserId));
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
      await nextCustomer.query(api.cardOrderSettings.previewReferral, {
        code: "FOUNDING-AHRON",
        currentTime: Date.UTC(2099, 0, 1),
      }),
    ).toEqual({ valid: false, discountCentavos: 0 });
    await admin.mutation(api.cardOrders.cancelOrder, { orderId });
    await expect(
      nextCustomer.mutation(api.cardOrders.placeOrder, {
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

  it("blocks caps until the global backfill counts historical orders", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    const customer = t.withIdentity(identity(ids.unrelatedUserId));
    const historicalOrderId = await t.run(async (ctx) => {
      await ctx.db.patch(
        (await ctx.db
          .query("settings")
          .withIndex("by_scope_and_key", (q) =>
            q.eq("scope", undefined).eq("key", "cardOrderReferralUsageBackfillStarted"),
          )
          .first())!._id,
        { value: "started" },
      );
      return await ctx.db.insert("cardOrders", {
        customerId: ids.customerId,
        quantity: 1,
        designSource: { kind: "url", url: "https://example.test/historical.png" },
        deliveryName: "Historical Customer",
        deliveryPhone: "09170000000",
        deliveryAddress: "Historical address",
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
        paymentStatus: "unpaid",
        fulfillmentStatus: "awaiting_payment",
        commissionStatus: "pending",
        commissionCentavos: 5_990,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const saveLimit = () =>
      admin.mutation(api.cardOrderSettings.saveReferralCode, {
        id: ids.codeId,
        code: "FOUNDING-AHRON",
        referrerLabel: "Ahron",
        active: true,
        usageLimit: 1,
      });
    await expect(saveLimit()).rejects.toThrow("Referral usage backfill must complete");

    vi.useFakeTimers();
    try {
      await admin.mutation(api.cardOrderSettings.startReferralUsageBackfill, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    await expect(admin.query(api.cardOrderSettings.adminReferralCodes, {})).resolves.toMatchObject([
      { usageCount: 1 },
    ]);
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("settings")
          .withIndex("by_scope_and_key", (q) =>
            q.eq("scope", undefined).eq("key", "cardOrderReferralUsageBackfillStarted"),
          )
          .first(),
      ),
    ).resolves.toMatchObject({ value: "completed" });
    await saveLimit();
    expect(
      await customer.query(api.cardOrderSettings.previewReferral, {
        code: "FOUNDING-AHRON",
        currentTime: Date.UTC(2099, 0, 1),
      }),
    ).toEqual({ valid: false, discountCentavos: 0 });
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
    await expect(t.run((ctx) => ctx.db.get(historicalOrderId))).resolves.toMatchObject({
      usageCounted: true,
      referralSnapshot: { code: "FOUNDING-AHRON", referrerLabel: "Ahron" },
    });
  });

  it("applies limit changes to the existing count without changing order snapshots", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    const customer = t.withIdentity(identity(ids.customerUserId));
    const nextCustomer = t.withIdentity(identity(ids.unrelatedUserId));
    const saveLimit = (usageLimit?: number) =>
      admin.mutation(api.cardOrderSettings.saveReferralCode, {
        id: ids.codeId,
        code: "FOUNDING-AHRON",
        referrerLabel: "Ahron",
        active: true,
        usageLimit,
      });
    await saveLimit(2);
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
    const snapshot = await t.run((ctx) => ctx.db.get(orderId));
    await saveLimit(1);
    const previewArgs = { code: "FOUNDING-AHRON", currentTime: Date.UTC(2099, 0, 1) };
    expect(await nextCustomer.query(api.cardOrderSettings.previewReferral, previewArgs)).toEqual({
      valid: false,
      discountCentavos: 0,
    });
    await expect(
      nextCustomer.mutation(api.cardOrders.placeOrder, {
        paymentMethodId: ids.paymentMethodId,
        referralCode: "FOUNDING-AHRON",
        designSource: { kind: "url", url: "https://example.test/front.png" },
        backDesignSource: { kind: "url", url: "https://example.test/back.png" },
        deliveryName: "Next Customer",
        deliveryPhone: "09171111111",
        deliveryAddress: "2 Test Street",
        expectedCardAmountCentavos: 53_910,
      }),
    ).rejects.toThrow("Referral code is unavailable for this order.");
    await saveLimit(2);
    await expect(
      nextCustomer.query(api.cardOrderSettings.previewReferral, previewArgs),
    ).resolves.toMatchObject({
      valid: true,
    });
    await saveLimit(undefined);
    await expect(
      nextCustomer.query(api.cardOrderSettings.previewReferral, previewArgs),
    ).resolves.toMatchObject({
      valid: true,
    });
    await expect(t.run((ctx) => ctx.db.get(orderId))).resolves.toEqual(snapshot);
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
      const marker = await ctx.db
        .query("settings")
        .withIndex("by_scope_and_key", (q) =>
          q.eq("scope", undefined).eq("key", "cardOrderReferralUsageBackfillStarted"),
        )
        .first();
      if (marker !== null) await ctx.db.delete(marker._id);
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

  it("restarts a stalled backfill from the beginning without double counting", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.codeId, { usageCount: 100 });
      for (let index = 0; index < 101; index++) {
        await ctx.db.insert("cardOrders", {
          customerId: ids.customerId,
          quantity: 1,
          designSource: { kind: "url", url: "https://example.test/stalled.png" },
          deliveryName: "Historical Customer",
          deliveryPhone: "09170000000",
          deliveryAddress: "Historical address",
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
          paymentStatus: "unpaid",
          fulfillmentStatus: "awaiting_payment",
          commissionStatus: "pending",
          commissionCentavos: 5_990,
          createdAt: index + 1,
          updatedAt: index + 1,
          ...(index < 100 ? { usageCounted: true } : {}),
        });
      }
      const marker = await ctx.db
        .query("settings")
        .withIndex("by_scope_and_key", (q) =>
          q.eq("scope", undefined).eq("key", "cardOrderReferralUsageBackfillStarted"),
        )
        .first();
      if (marker !== null) await ctx.db.patch(marker._id, { value: "running", updatedAt: 1 });
    });

    const admin = t.withIdentity(identity(ids.adminUserId));
    vi.useFakeTimers();
    try {
      await admin.mutation(api.cardOrderSettings.startReferralUsageBackfill, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    await expect(admin.query(api.cardOrderSettings.adminReferralCodes, {})).resolves.toMatchObject([
      { usageCount: 101 },
    ]);
    await expect(
      t.run(async (ctx) => {
        const orders = await ctx.db
          .query("cardOrders")
          .withIndex("by_scope_and_referralCodeId_and_createdAt", (q) =>
            q.eq("scope", undefined).eq("referralCodeId", ids.codeId),
          )
          .take(101);
        const marker = await ctx.db
          .query("settings")
          .withIndex("by_scope_and_key", (q) =>
            q.eq("scope", undefined).eq("key", "cardOrderReferralUsageBackfillStarted"),
          )
          .first();
        return { counted: orders.filter((order) => order.usageCounted === true).length, marker };
      }),
    ).resolves.toMatchObject({ counted: 101, marker: { value: "completed" } });
  });

  it("backfills mixed FOUNDING aliases into one verified offer pool", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const offerId = await t.run(async (ctx) => {
      const offerId = await ctx.db.insert("cardOrderOffers", {
        code: "FOUNDING",
        usageCount: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      const oldAliasOfferId = await ctx.db.insert("cardOrderOffers", {
        code: "FOUNDING-OLD",
        usageCount: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(ids.codeId, { offerId });
      const codeId = await ctx.db.insert("cardOrderReferralCodes", {
        code: "FOUNDING",
        offerId: oldAliasOfferId,
        active: true,
        createdAt: 1,
        updatedAt: 1,
      });
      for (let index = 0; index < 5; index++) {
        await ctx.db.insert("cardOrders", {
          customerId: ids.customerId,
          quantity: 1,
          designSource: { kind: "url", url: "https://example.test/founding.png" },
          deliveryName: "Historical Customer",
          deliveryPhone: "09170000000",
          deliveryAddress: "Historical address",
          cardPriceCentavos: 59_900,
          discountCentavos: 5_990,
          paymentMethodId: ids.paymentMethodId,
          paymentSnapshot: {
            provider: "Bank transfer",
            label: "Test bank",
            accountDetails: "Test account",
            instructions: "Transfer.",
          },
          referralCodeId: index === 4 ? codeId : ids.codeId,
          offerId: index === 4 ? oldAliasOfferId : offerId,
          ...(index === 4
            ? {
                offerSnapshot: { code: "FOUNDING-OLD", fixedPriceCentavos: 51_000 },
                offerUsageCounted: true,
              }
            : {}),
          referralSnapshot: {
            code: index === 4 ? "FOUNDING" : "FOUNDING-AHRON",
            referrerLabel: index === 4 ? "Founding" : "Ahron",
          },
          paymentStatus: "unpaid",
          fulfillmentStatus: "awaiting_payment",
          commissionStatus: "pending",
          commissionCentavos: 5_990,
          createdAt: index + 1,
          updatedAt: index + 1,
        });
      }
      const marker = await ctx.db
        .query("settings")
        .withIndex("by_scope_and_key", (q) =>
          q.eq("scope", undefined).eq("key", "cardOrderReferralUsageBackfillStarted"),
        )
        .first();
      if (marker !== null) await ctx.db.patch(marker._id, { value: "started" });
      return { offerId, oldAliasOfferId };
    });

    const admin = t.withIdentity(identity(ids.adminUserId));
    vi.useFakeTimers();
    try {
      await admin.mutation(api.cardOrderSettings.startReferralUsageBackfill, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    const codes = await admin.query(api.cardOrderSettings.adminReferralCodes, {});
    expect(codes.find((code) => code.code === "FOUNDING-AHRON")).toMatchObject({
      usageCount: 4,
      offer: { code: "FOUNDING", usageCount: 5, usageLimit: 25 },
    });
    const foundingOnly = codes.find((code) => code.code === "FOUNDING");
    expect(foundingOnly).toMatchObject({ usageCount: 1, offer: { usageCount: 5, usageLimit: 25 } });
    await expect(t.run((ctx) => ctx.db.get(offerId.oldAliasOfferId))).resolves.toMatchObject({
      usageCount: 0,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.codeId, { usageLimit: undefined });
    });
    await t.mutation(internal.cardOrderReferralUsage.backfillUsageCounts, { cursor: null });
    await expect(t.run((ctx) => ctx.db.get(offerId.offerId))).resolves.toMatchObject({
      usageCount: 5,
      usageLimit: 25,
    });
    await expect(
      t.run(async (ctx) =>
        (await ctx.db.query("cardOrders").collect()).find(
          (order) => order.offerSnapshot?.code === "FOUNDING-OLD",
        ),
      ),
    ).resolves.toMatchObject({
      offerId: offerId.offerId,
      offerSnapshot: { code: "FOUNDING-OLD", fixedPriceCentavos: 51_000 },
      offerUsageCounted: true,
    });
    await t.run(async (ctx) => ctx.db.patch(offerId.offerId, { usageLimit: undefined }));
    const clearedCode = (await admin.query(api.cardOrderSettings.adminReferralCodes, {})).find(
      (code) => code.code === "FOUNDING-AHRON",
    );
    expect(clearedCode?.offer?.usageLimit).toBeUndefined();
  });

  it("keeps the FOUNDING cap blocked until backfill, then enforces 25 across aliases", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    const founding = await t.run(async (ctx) => {
      const offerId = await ctx.db.insert("cardOrderOffers", {
        code: "FOUNDING",
        usageCount: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(ids.codeId, { offerId, referrerCode: "AHRON", referrerLabel: "Ahron" });
      const foundingId = await ctx.db.insert("cardOrderReferralCodes", {
        code: "FOUNDING",
        offerId,
        active: true,
        createdAt: 1,
        updatedAt: 1,
      });
      for (let index = 0; index < 5; index++) {
        await ctx.db.insert("cardOrders", {
          customerId: ids.customerId,
          quantity: 1,
          designSource: { kind: "url", url: `https://example.test/history-${index}.png` },
          deliveryName: "History",
          deliveryPhone: "09170000000",
          deliveryAddress: "Historical",
          cardPriceCentavos: 59_900,
          discountCentavos: 5_990,
          paymentMethodId: ids.paymentMethodId,
          paymentSnapshot: {
            provider: "Bank",
            label: "Test",
            accountDetails: "Test",
            instructions: "Test",
          },
          referralCodeId: index === 4 ? foundingId : ids.codeId,
          offerId,
          offerSnapshot: { code: "FOUNDING", fixedPriceCentavos: undefined },
          referralSnapshot: {
            code: index === 4 ? "FOUNDING" : "FOUNDING-AHRON",
            referrerLabel: index === 4 ? "Founding" : "Ahron",
          },
          paymentStatus: index === 4 ? "refunded" : "unpaid",
          fulfillmentStatus: index === 4 ? "cancelled" : "awaiting_payment",
          commissionStatus: "pending",
          commissionCentavos: 4321,
          createdAt: index + 1,
          updatedAt: index + 1,
        });
      }
      return { offerId, foundingId };
    });
    const saveCap = () =>
      admin.mutation(api.cardOrderSettings.saveCardOrderOffer, {
        id: founding.offerId,
        code: "FOUNDING",
        usageLimit: 25,
      });
    await expect(saveCap()).rejects.toThrow("Offer usage backfill must complete");
    vi.useFakeTimers();
    try {
      await admin.mutation(api.cardOrderSettings.startReferralUsageBackfill, {});
      await expect(saveCap()).rejects.toThrow("Offer usage backfill must complete");
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    await saveCap();
    await expect(t.run((ctx) => ctx.db.get(founding.offerId))).resolves.toMatchObject({
      usageCount: 5,
      usageLimit: 25,
    });
    const snapshots = await t.run(async (ctx) =>
      (await ctx.db.query("cardOrders").collect()).map(
        ({ cardPriceCentavos, discountCentavos, referralSnapshot, commissionCentavos }) => ({
          cardPriceCentavos,
          discountCentavos,
          referralSnapshot,
          commissionCentavos,
        }),
      ),
    );

    const newCustomers = await t.run(async (ctx) =>
      Promise.all(
        Array.from({ length: 22 }, async (_, index) => {
          const userId = await ctx.db.insert("users", { email: `cap-${index}@example.test` });
          const customerId = await ctx.db.insert("customers", {
            userId,
            email: `cap-${index}@example.test`,
            role: "customer",
            status: "active",
            deletionStatus: "active",
            createdAt: 1,
            updatedAt: 1,
          });
          return { userId, customerId };
        }),
      ),
    );
    const args = (referralCode: string) => ({
      paymentMethodId: ids.paymentMethodId,
      referralCode,
      designSource: { kind: "url" as const, url: "https://example.test/front.png" },
      backDesignSource: { kind: "url" as const, url: "https://example.test/back.png" },
      deliveryName: "Test",
      deliveryPhone: "09170000000",
      deliveryAddress: "Test",
      expectedCardAmountCentavos: 53_910,
    });
    for (let index = 0; index < 19; index++) {
      await t
        .withIdentity(identity(newCustomers[index]!.userId))
        .mutation(api.cardOrders.placeOrder, args(index % 2 ? "FOUNDING" : "FOUNDING-AHRON"));
    }
    const finalAttempts = await Promise.allSettled([
      t
        .withIdentity(identity(newCustomers[19]!.userId))
        .mutation(api.cardOrders.placeOrder, args("FOUNDING")),
      t
        .withIdentity(identity(newCustomers[20]!.userId))
        .mutation(api.cardOrders.placeOrder, args("FOUNDING-AHRON")),
    ]);
    expect(finalAttempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(finalAttempts.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(t.run((ctx) => ctx.db.get(founding.offerId))).resolves.toMatchObject({
      usageCount: 25,
      usageLimit: 25,
    });
    await expect(
      t
        .withIdentity(identity(newCustomers[21]!.userId))
        .query(api.cardOrderSettings.previewReferral, {
          code: "FOUNDING",
          currentTime: Date.UTC(2099, 0, 1),
        }),
    ).resolves.toEqual({ valid: false, discountCentavos: 0 });
    await expect(
      t
        .withIdentity(identity(newCustomers[21]!.userId))
        .mutation(api.cardOrders.placeOrder, args("FOUNDING-AHRON")),
    ).rejects.toThrow("Referral code is unavailable");
    expect(
      await t.run(async (ctx) =>
        (await ctx.db.query("cardOrders").collect())
          .slice(0, 5)
          .map(({ cardPriceCentavos, discountCentavos, referralSnapshot, commissionCentavos }) => ({
            cardPriceCentavos,
            discountCentavos,
            referralSnapshot,
            commissionCentavos,
          })),
      ),
    ).toEqual(snapshots);
  });

  it("keeps offer alias attribution and LAUNCH usage in separate pools", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    const aliases = await t.run(async (ctx) => {
      const foundingOffer = await ctx.db.insert("cardOrderOffers", {
        code: "FOUNDING",
        usageCount: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      const zeroAliasOffer = await ctx.db.insert("cardOrderOffers", {
        code: "ORPHAN",
        usageCount: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      const launchOffer = await ctx.db.insert("cardOrderOffers", {
        code: "LAUNCH",
        usageCount: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(ids.codeId, {
        offerId: foundingOffer,
        referrerCode: "AHRON",
        referrerLabel: "Ahron",
      });
      const foundingId = await ctx.db.insert("cardOrderReferralCodes", {
        code: "FOUNDING",
        offerId: foundingOffer,
        active: true,
        createdAt: 1,
        updatedAt: 1,
      });
      const launchId = await ctx.db.insert("cardOrderReferralCodes", {
        code: "LAUNCH",
        offerId: launchOffer,
        active: true,
        createdAt: 1,
        updatedAt: 1,
      });
      return { foundingOffer, launchOffer, zeroAliasOffer, foundingId, launchId };
    });
    await expect(admin.query(api.cardOrderSettings.adminCardOrderOffers, {})).resolves.toEqual(
      expect.arrayContaining([{ _id: aliases.zeroAliasOffer, code: "ORPHAN", usageCount: 0 }]),
    );
    await expect(
      t
        .withIdentity(identity(ids.unrelatedUserId))
        .query(api.cardOrderSettings.adminCardOrderOffers, {}),
    ).rejects.toThrow("Administrator permission required.");
    await expect(admin.query(api.cardOrderSettings.adminReferralCodes, {})).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "ORPHAN" })]),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("settings", {
        key: "cardOrderOfferUsageBackfillStarted",
        value: "completed",
        updatedAt: Date.now(),
        updatedByUserId: ids.adminUserId,
      }),
    );
    await admin.mutation(api.cardOrderSettings.saveCardOrderOffer, {
      id: aliases.launchOffer,
      code: "LAUNCH",
      usageLimit: 1,
    });
    const customers = await t.run(async (ctx) =>
      Promise.all(
        ["founding-only", "ahron", "launch"].map(async (email) => {
          const userId = await ctx.db.insert("users", { email: `${email}@example.test` });
          await ctx.db.insert("customers", {
            userId,
            email: `${email}@example.test`,
            role: "customer",
            status: "active",
            deletionStatus: "active",
            createdAt: 1,
            updatedAt: 1,
          });
          return userId;
        }),
      ),
    );
    const place = (userId: Id<"users">, referralCode: string) =>
      t.withIdentity(identity(userId)).mutation(api.cardOrders.placeOrder, {
        paymentMethodId: ids.paymentMethodId,
        referralCode,
        designSource: { kind: "url" as const, url: "https://example.test/front.png" },
        backDesignSource: { kind: "url" as const, url: "https://example.test/back.png" },
        deliveryName: "Test",
        deliveryPhone: "09170000000",
        deliveryAddress: "Test",
        expectedCardAmountCentavos: 53_910,
      });
    const offerOnly = await place(customers[0]!, "FOUNDING");
    const ahron = await place(customers[1]!, "FOUNDING-AHRON");
    await place(customers[2]!, "LAUNCH");
    expect(offerOnly.kind).toBe("created");
    expect(ahron.kind).toBe("created");
    if (offerOnly.kind !== "created" || ahron.kind !== "created")
      throw new Error("Expected orders");
    const offerOnlyOrder = await t.run((ctx) => ctx.db.get(offerOnly.orderId));
    expect(offerOnlyOrder).toMatchObject({
      commissionStatus: "none",
      commissionCentavos: 0,
      offerId: aliases.foundingOffer,
    });
    expect(offerOnlyOrder).not.toHaveProperty("referralSnapshot");
    await expect(t.run((ctx) => ctx.db.get(ahron.orderId))).resolves.toMatchObject({
      commissionStatus: "pending",
      commissionCentavos: 5_990,
      offerId: aliases.foundingOffer,
      referralSnapshot: { code: "FOUNDING-AHRON", referrerLabel: "Ahron" },
    });
    await expect(t.run((ctx) => ctx.db.get(aliases.foundingOffer))).resolves.toMatchObject({
      usageCount: 2,
    });
    await expect(t.run((ctx) => ctx.db.get(aliases.launchOffer))).resolves.toMatchObject({
      usageCount: 1,
      usageLimit: 1,
    });
    await expect(
      t.withIdentity(identity(customers[0]!)).query(api.cardOrderSettings.previewReferral, {
        code: "FOUNDING-AHRON",
        currentTime: Date.UTC(2099, 0, 1),
      }),
    ).resolves.toMatchObject({ valid: false });
    if (offerOnly.kind === "created" && ahron.kind === "created") {
      await admin.mutation(api.cardOrders.cancelOrder, { orderId: offerOnly.orderId });
      await admin.mutation(api.cardOrders.quoteShipping, {
        orderId: ahron.orderId,
        shippingQuoteCentavos: 0,
      });
      await admin.mutation(api.cardOrders.markPaymentReceived, { orderId: ahron.orderId });
      await admin.mutation(api.cardOrders.refundOrder, { orderId: ahron.orderId });
    }
    await expect(t.run((ctx) => ctx.db.get(aliases.foundingOffer))).resolves.toMatchObject({
      usageCount: 2,
    });
  });

  it("isolates demo and production offer backfills and recovers a stale run", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const scoped = await t.run(async (ctx) => {
      const prodOffer = await ctx.db.insert("cardOrderOffers", {
        code: "FOUNDING",
        usageCount: 0,
        usageLimit: 25,
        createdAt: 1,
        updatedAt: 1,
      });
      const demoUser = await ctx.db.insert("users", { email: "demo@example.test" });
      const demoCustomer = await ctx.db.insert("customers", {
        userId: demoUser,
        email: "demo@example.test",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        scope: "demo",
        createdAt: 1,
        updatedAt: 1,
      });
      const demoPayment = await ctx.db.insert("cardOrderPaymentMethods", {
        scope: "demo",
        provider: "Bank",
        label: "Demo",
        accountDetails: "Demo",
        instructions: "Demo",
        active: true,
        createdAt: 1,
        updatedAt: 1,
      });
      const demoOffer = await ctx.db.insert("cardOrderOffers", {
        scope: "demo",
        code: "FOUNDING",
        usageCount: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      const demoAlias = await ctx.db.insert("cardOrderReferralCodes", {
        scope: "demo",
        code: "FOUNDING",
        offerId: demoOffer,
        active: true,
        createdAt: 1,
        updatedAt: 1,
      });
      for (const [scope, customerId, paymentMethodId, referralCodeId, offerId] of [
        [undefined, ids.customerId, ids.paymentMethodId, ids.codeId, prodOffer],
        ["demo", demoCustomer, demoPayment, demoAlias, demoOffer],
      ] as const) {
        await ctx.db.insert("cardOrders", {
          ...(scope === undefined ? {} : { scope }),
          customerId,
          quantity: 1,
          designSource: { kind: "url", url: "https://example.test/historical.png" },
          deliveryName: "Historical",
          deliveryPhone: "09170000000",
          deliveryAddress: "Historical",
          cardPriceCentavos: 59_900,
          discountCentavos: 5_990,
          paymentMethodId,
          paymentSnapshot: {
            provider: "Bank",
            label: "Test",
            accountDetails: "Test",
            instructions: "Test",
          },
          referralCodeId,
          offerId,
          referralSnapshot: {
            code: scope === "demo" ? "FOUNDING" : "FOUNDING-AHRON",
            referrerLabel: "Ahron",
          },
          paymentStatus: "unpaid",
          fulfillmentStatus: "awaiting_payment",
          commissionStatus: "pending",
          commissionCentavos: 5_990,
          createdAt: 2,
          updatedAt: 2,
        });
      }
      for (const scope of [undefined, "demo"] as const) {
        await ctx.db.insert("settings", {
          ...(scope === undefined ? {} : { scope }),
          key: "cardOrderOfferUsageBackfillStarted",
          value: "running",
          updatedAt: 1,
          updatedByUserId: ids.adminUserId,
        });
      }
      return { prodOffer, demoOffer };
    });
    const admin = t.withIdentity(identity(ids.adminUserId));
    vi.useFakeTimers();
    try {
      await admin.mutation(api.cardOrderSettings.startReferralUsageBackfill, {});
      await t.mutation(internal.cardOrderReferralUsage.backfillUsageCounts, {
        scope: "demo",
        cursor: null,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    const prodOffer = await t.run((ctx) => ctx.db.get(scoped.prodOffer));
    expect(prodOffer).toMatchObject({ usageCount: 1 });
    expect(prodOffer).not.toHaveProperty("usageLimit");
    await expect(t.run((ctx) => ctx.db.get(scoped.demoOffer))).resolves.toMatchObject({
      usageCount: 1,
    });
    await expect(
      t.run((ctx) =>
        ctx.db
          .query("settings")
          .withIndex("by_scope_and_key", (q) =>
            q.eq("scope", undefined).eq("key", "cardOrderOfferUsageBackfillStarted"),
          )
          .first(),
      ),
    ).resolves.toMatchObject({ value: expect.stringContaining("found 1") });
    await expect(
      t.run((ctx) =>
        ctx.db
          .query("settings")
          .withIndex("by_scope_and_key", (q) =>
            q.eq("scope", "demo").eq("key", "cardOrderOfferUsageBackfillStarted"),
          )
          .first(),
      ),
    ).resolves.toMatchObject({ value: expect.stringContaining("found 1") });
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
