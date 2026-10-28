/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../_generated/api";
import {
  calculatePromoAdjustedPriceCentavos,
  CARD_REGULAR_PRICE_CENTAVOS,
} from "../../src/lib/card-ordering";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");
const identity = (userId: Id<"users">) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});

const LAUNCH_NET_WITH_REFERRAL = 71_910;
const LAUNCH_NET_WITHOUT_REFERRAL = 79_900;

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const adminUserId = await ctx.db.insert("users", { email: "admin@example.test" });
    const customerUserId = await ctx.db.insert("users", { email: "customer@example.test" });
    await ctx.db.insert("customers", {
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
      code: "TEST-REFERRAL",
      referrerLabel: "Test Referrer",
      active: true,
      createdAt: 1,
      updatedAt: 1,
      updatedByUserId: adminUserId,
    });
    return { adminUserId, customerUserId, customerId, paymentMethodId, codeId };
  });
}

async function markFoundingOfferUsageVerified(
  t: ReturnType<typeof convexTest>,
  adminUserId: Id<"users">,
) {
  await t.run((ctx) =>
    ctx.db.insert("settings", {
      key: "cardOrderOfferUsageBackfillStarted",
      value: "completed:founding=5",
      updatedAt: 1,
      updatedByUserId: adminUserId,
    }),
  );
}

const delivery = {
  deliveryName: "Test Customer",
  deliveryPhone: "09170000000",
  deliveryAddress: "1 Test Street",
};
const urlDesigns = {
  designSource: { kind: "url" as const, url: "https://example.test/front.png" },
  backDesignSource: { kind: "url" as const, url: "https://example.test/back.png" },
};

describe("card order price confirmation on the server", () => {
  it("returns price_changed and writes nothing when the reviewed amount is stale", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const customer = t.withIdentity(identity(ids.customerUserId));

    // The customer reviewed the undiscounted launch price; the server applies the referral.
    const outcome = await customer.mutation(api.cardOrders.placeOrder, {
      paymentMethodId: ids.paymentMethodId,
      referralCode: "TEST-REFERRAL",
      ...urlDesigns,
      ...delivery,
      expectedCardAmountCentavos: LAUNCH_NET_WITHOUT_REFERRAL,
    });

    expect(outcome).toEqual({
      kind: "price_changed",
      price: { cardPriceCentavos: 79_900, discountCentavos: 7_990 },
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("cardOrders").collect()).toHaveLength(0);
      const code = await ctx.db.get(ids.codeId);
      expect(code?.usageCount ?? 0).toBe(0);
    });
  });

  it("keeps available uploads unattached after a price change so they can be reused", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const customer = t.withIdentity(identity(ids.customerUserId));
    const uploads = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["front"], { type: "image/png" }));
      const backStorageId = await ctx.storage.store(new Blob(["back"], { type: "image/png" }));
      const common = {
        ownerId: ids.customerId,
        contentType: "image/png" as const,
        byteSize: 5,
        status: "available" as const,
        createdAt: 1,
        availableAt: 1,
      };
      return {
        front: await ctx.db.insert("cardOrderDesignUploads", {
          ...common,
          storageId,
          fileName: "front.png",
        }),
        back: await ctx.db.insert("cardOrderDesignUploads", {
          ...common,
          storageId: backStorageId,
          fileName: "back.png",
        }),
      };
    });
    const placement = {
      paymentMethodId: ids.paymentMethodId,
      designSource: { kind: "upload" as const, uploadId: uploads.front },
      backDesignSource: { kind: "upload" as const, uploadId: uploads.back },
      ...delivery,
    };

    await expect(
      customer.mutation(api.cardOrders.placeOrder, {
        ...placement,
        expectedCardAmountCentavos: LAUNCH_NET_WITH_REFERRAL,
      }),
    ).resolves.toEqual({
      kind: "price_changed",
      price: { cardPriceCentavos: 79_900, discountCentavos: 0 },
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(uploads.front))?.status).toBe("available");
      expect((await ctx.db.get(uploads.back))?.orderId).toBeUndefined();
    });

    const retry = await customer.mutation(api.cardOrders.placeOrder, {
      ...placement,
      expectedCardAmountCentavos: LAUNCH_NET_WITH_REFERRAL,
      referralCode: "TEST-REFERRAL",
    });
    expect(retry.kind).toBe("created");
  });

  it("creates the order at the reviewed amount, using the server's referral discount", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const customer = t.withIdentity(identity(ids.customerUserId));

    const outcome = await customer.mutation(api.cardOrders.placeOrder, {
      paymentMethodId: ids.paymentMethodId,
      referralCode: "TEST-REFERRAL",
      ...urlDesigns,
      ...delivery,
      expectedCardAmountCentavos: LAUNCH_NET_WITH_REFERRAL,
    });

    if (outcome.kind !== "created") throw new Error(`Expected created, got ${outcome.kind}.`);
    await t.run(async (ctx) => {
      const order = await ctx.db.get(outcome.orderId);
      expect(order?.cardPriceCentavos).toBe(79_900);
      expect(order?.discountCentavos).toBe(7_990);
      expect((await ctx.db.get(ids.codeId))?.usageCount).toBe(1);
    });
  });

  it("rejects a malformed expectation before any write", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const customer = t.withIdentity(identity(ids.customerUserId));

    for (const expectedCardAmountCentavos of [-1, 1.5, Number.MAX_SAFE_INTEGER + 2]) {
      await expect(
        customer.mutation(api.cardOrders.placeOrder, {
          paymentMethodId: ids.paymentMethodId,
          ...urlDesigns,
          ...delivery,
          expectedCardAmountCentavos,
        }),
      ).rejects.toThrow("Expected card amount must be non-negative integer centavos.");
    }
    await t.run(async (ctx) => {
      expect(await ctx.db.query("cardOrders").collect()).toHaveLength(0);
    });
  });
});

describe("separate promo and referral pricing", () => {
  it("rounds percentage promo prices and rejects invalid offer selectors", () => {
    expect(calculatePromoAdjustedPriceCentavos(79_900, undefined, 20)).toBe(63_920);
    expect(calculatePromoAdjustedPriceCentavos(79_900, undefined, 1)).toBe(79_101);
    expect(() => calculatePromoAdjustedPriceCentavos(79_900, 59_900, 20)).toThrow();
    expect(() => calculatePromoAdjustedPriceCentavos(79_900, undefined, 0)).toThrow();
    expect(() => calculatePromoAdjustedPriceCentavos(79_900, undefined, 100)).toThrow();
  });

  it.each([
    ["LAUNCH", 59_900, 5_990, 53_910],
    ["FOUNDING", 29_900, 2_990, 26_910],
    ["PERCENT20", 63_920, 6_392, 57_528],
  ])("combines %s with a standalone referral", async (promoCode, price, discount, due) => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    if (promoCode === "FOUNDING") await markFoundingOfferUsageVerified(t, ids.adminUserId);
    const customer = t.withIdentity(identity(ids.customerUserId));
    const offerId = await t.run((ctx) =>
      ctx.db.insert("cardOrderOffers", {
        code: promoCode,
        ...(promoCode === "PERCENT20" ? { percentOff: 20 } : { fixedPriceCentavos: price }),
        usageCount: 0,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const preview = await customer.query(api.cardOrderSettings.previewOrderCodes, {
      promoCode,
      referralCode: "TEST-REFERRAL",
      currentTime: Date.now(),
    });
    expect(preview).toEqual({
      promoValid: true,
      referralValid: true,
      promoAdjustedPriceCentavos: price,
      discountCentavos: discount,
    });
    const outcome = await customer.mutation(api.cardOrders.placeOrder, {
      paymentMethodId: ids.paymentMethodId,
      promoCode,
      referralCode: "TEST-REFERRAL",
      ...urlDesigns,
      ...delivery,
      expectedCardAmountCentavos: due,
    });
    if (outcome.kind !== "created") throw new Error("Expected created order.");
    await t.run(async (ctx) => {
      const order = await ctx.db.get(outcome.orderId);
      expect(order?.cardPriceCentavos).toBe(price);
      expect(order?.discountCentavos).toBe(discount);
      expect(order?.commissionCentavos).toBe(price * 0.1);
      expect(order?.offerId).toBe(offerId);
      expect(order?.referralCodeId).toBe(ids.codeId);
      expect(order?.offerSnapshot?.code).toBe(promoCode);
      expect(order?.referralSnapshot?.code).toBe("TEST-REFERRAL");
      expect((await ctx.db.get(offerId))?.usageCount).toBe(1);
      expect((await ctx.db.get(ids.codeId))?.usageCount).toBe(1);
    });
  });

  it("places a no-code order at the regular price without a launch setting", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const customer = t.withIdentity(identity(ids.customerUserId));
    const outcome = await customer.mutation(api.cardOrders.placeOrder, {
      paymentMethodId: ids.paymentMethodId,
      ...urlDesigns,
      ...delivery,
      expectedCardAmountCentavos: CARD_REGULAR_PRICE_CENTAVOS,
    });
    expect(outcome.kind).toBe("created");
  });
  it.each([
    ["LAUNCH", 59_900],
    ["FOUNDING", 29_900],
  ])("places %s without referral attribution", async (promoCode, due) => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    if (promoCode === "FOUNDING") await markFoundingOfferUsageVerified(t, ids.adminUserId);
    await t.run((ctx) =>
      ctx.db.insert("cardOrderOffers", {
        code: promoCode,
        fixedPriceCentavos: due,
        usageCount: 0,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const outcome = await t
      .withIdentity(identity(ids.customerUserId))
      .mutation(api.cardOrders.placeOrder, {
        paymentMethodId: ids.paymentMethodId,
        promoCode,
        ...urlDesigns,
        ...delivery,
        expectedCardAmountCentavos: due,
      });
    if (outcome.kind !== "created") throw new Error("Expected created order.");
    await expect(t.run((ctx) => ctx.db.get(outcome.orderId))).resolves.toMatchObject({
      cardPriceCentavos: due,
      discountCentavos: 0,
      commissionStatus: "none",
      commissionCentavos: 0,
    });
    await expect(t.run((ctx) => ctx.db.get(outcome.orderId))).resolves.not.toHaveProperty(
      "referralSnapshot",
    );
  });

  it("rejects an expired promo in preview and submission before writing", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const offerId = await t.run((ctx) =>
      ctx.db.insert("cardOrderOffers", {
        code: "EXPIRED",
        fixedPriceCentavos: 59_900,
        expiresOn: "2020-01-01",
        usageCount: 0,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const customer = t.withIdentity(identity(ids.customerUserId));
    await expect(
      customer.query(api.cardOrderSettings.previewOrderCodes, {
        promoCode: "EXPIRED",
        currentTime: Date.UTC(2020, 0, 1, 0, 0),
      }),
    ).resolves.toMatchObject({ promoValid: false });
    await expect(
      customer.mutation(api.cardOrders.placeOrder, {
        paymentMethodId: ids.paymentMethodId,
        promoCode: "EXPIRED",
        ...urlDesigns,
        ...delivery,
        expectedCardAmountCentavos: 59_900,
      }),
    ).rejects.toThrow("Promo code is unavailable");
    await t.run(async (ctx) => {
      expect(await ctx.db.query("cardOrders").collect()).toHaveLength(0);
      expect((await ctx.db.get(offerId))?.usageCount).toBe(0);
    });
  });

  it("rejects invalid promo percentages and conflicting price selectors", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    for (const percentOff of [0, 100, 1.5]) {
      await expect(
        admin.mutation(api.cardOrderSettings.saveCardOrderOffer, {
          code: `BAD-${String(percentOff).replace(".", "-")}`,
          percentOff,
        }),
      ).rejects.toThrow("whole number from 1 to 99");
    }
    await expect(
      admin.mutation(api.cardOrderSettings.saveCardOrderOffer, {
        code: "CONFLICT",
        fixedPriceCentavos: 59_900,
        percentOff: 20,
      }),
    ).rejects.toThrow("Choose a fixed price or percentage discount");
  });
});
