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

// Launch pricing runs through 2099, so the server's live price is ₱599 (59_900).
const LAUNCH_NET_WITH_REFERRAL = 53_910;
const LAUNCH_NET_WITHOUT_REFERRAL = 59_900;

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
    return { customerUserId, customerId, paymentMethodId, codeId };
  });
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
      referralCode: "FOUNDING-AHRON",
      ...urlDesigns,
      ...delivery,
      expectedCardAmountCentavos: LAUNCH_NET_WITHOUT_REFERRAL,
    });

    expect(outcome).toEqual({
      kind: "price_changed",
      price: { cardPriceCentavos: 59_900, discountCentavos: 5_990 },
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

    // The customer reviewed the discounted amount, but this attempt has no referral.
    await expect(
      customer.mutation(api.cardOrders.placeOrder, {
        ...placement,
        expectedCardAmountCentavos: LAUNCH_NET_WITH_REFERRAL,
      }),
    ).resolves.toEqual({
      kind: "price_changed",
      price: { cardPriceCentavos: 59_900, discountCentavos: 0 },
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(uploads.front))?.status).toBe("available");
      expect((await ctx.db.get(uploads.back))?.orderId).toBeUndefined();
    });

    const retry = await customer.mutation(api.cardOrders.placeOrder, {
      ...placement,
      expectedCardAmountCentavos: LAUNCH_NET_WITH_REFERRAL,
      referralCode: "FOUNDING-AHRON",
    });
    expect(retry.kind).toBe("created");
  });

  it("creates the order at the reviewed amount, using the server's referral discount", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const customer = t.withIdentity(identity(ids.customerUserId));

    const outcome = await customer.mutation(api.cardOrders.placeOrder, {
      paymentMethodId: ids.paymentMethodId,
      referralCode: "FOUNDING-AHRON",
      ...urlDesigns,
      ...delivery,
      expectedCardAmountCentavos: LAUNCH_NET_WITH_REFERRAL,
    });

    if (outcome.kind !== "created") throw new Error(`Expected created, got ${outcome.kind}.`);
    await t.run(async (ctx) => {
      const order = await ctx.db.get(outcome.orderId);
      expect(order?.cardPriceCentavos).toBe(59_900);
      expect(order?.discountCentavos).toBe(5_990);
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
