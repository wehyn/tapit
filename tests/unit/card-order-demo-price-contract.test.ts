import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  released: [] as string[],
  customerId: "customer-mara",
  role: "customer" as "customer" | "admin",
  beforeCommit: undefined as (() => void) | undefined,
}));

vi.mock("@/lib/demo/store", () => ({
  getDemoSession: () => ({
    email: mocks.role === "admin" ? "admin@example.test" : "mara@example.test",
    role: mocks.role,
  }),
  refreshDemoAccessSnapshot: () => ({
    kind: "ready",
    snapshot: {
      state: mocks.state,
      session: {
        email: mocks.role === "admin" ? "admin@example.test" : "mara@example.test",
        role: mocks.role,
      },
    },
  }),
  resolveDemoSessionAccess: () => ({
    kind: "active",
    account: { id: mocks.customerId, role: mocks.role },
  }),
  updateDemoState: (updater: (state: typeof mocks.state) => typeof mocks.state) => {
    // Like the real store: the updater runs before persistence, so a throw leaves state unchanged.
    mocks.state = updater(mocks.state);
  },
}));
vi.mock("@/lib/demo/card-order-assets", () => ({
  withDemoCardOrderCommitLock: async (operation: () => Promise<unknown>) => {
    const beforeCommit = mocks.beforeCommit;
    mocks.beforeCommit = undefined;
    beforeCommit?.();
    return operation();
  },
  // Mirrors the real reservation helper: exception-only release, then rethrow.
  withDemoCardOrderAssetReservation: async (
    sources: { assetKey: string }[],
    _orderId: string,
    _ownerId: string,
    persist: () => unknown,
  ) => {
    try {
      return await persist();
    } catch (error) {
      for (const source of sources) mocks.released.push(source.assetKey);
      throw error;
    }
  },
}));

import {
  getDemoCardOrderAdminSettings,
  placeDemoCardOrder,
  previewDemoCardOrderReferral,
  saveDemoCardOrderReferralCode,
  saveDemoCardOrderOffer,
} from "@/lib/demo/card-ordering";

const delivery = {
  deliveryName: "Mara Santos",
  deliveryPhone: "09170000000",
  deliveryAddress: "1 Test Street",
};
const urlDesigns = {
  designSource: { kind: "url" as const, url: "https://example.test/front.png" },
  backDesignSource: { kind: "url" as const, url: "https://example.test/back.png" },
};

beforeEach(() => {
  mocks.released.length = 0;
  mocks.customerId = "customer-mara";
  mocks.role = "customer";
  mocks.beforeCommit = undefined;
  mocks.state = {
    cardOrderLaunchEndDate: "2099-12-31",
    cardOrderPaymentMethods: [
      {
        id: "method-1",
        active: true,
        provider: "Bank",
        label: "Main",
        accountDetails: "123",
        instructions: "Pay",
      },
    ],
    cardOrderReferralCodes: [
      { id: "founding-only", code: "FOUNDING", offerId: "founding", active: true },
      {
        id: "code-1",
        code: "FOUNDING-AHRON",
        offerId: "founding",
        referrerCode: "AHRON",
        referrerLabel: "Ahron",
        active: true,
      },
    ],
    cardOrderOffers: [
      { id: "founding", code: "FOUNDING", fixedPriceCentavos: 29_900, usageLimit: 1 },
    ],
    cardOrders: [],
    audits: [],
  };
});

describe("demo card order price confirmation", () => {
  it("does not preview an exhausted code", () => {
    mocks.state.cardOrders = [
      { id: "prior", customerId: "someone-else", referralCodeId: "code-1" },
    ];

    expect(previewDemoCardOrderReferral("FOUNDING-AHRON", Date.now())).toEqual({
      valid: false,
      discountCentavos: 0,
    });
  });

  it("allows the final use and rejects a later order from another customer", async () => {
    const first = await placeDemoCardOrder({
      paymentMethodId: "method-1",
      referralCode: "FOUNDING-AHRON",
      ...urlDesigns,
      ...delivery,
      expectedCardAmountCentavos: 29_900,
    });
    expect(first.kind).toBe("created");

    mocks.customerId = "customer-another";
    await expect(
      placeDemoCardOrder({
        paymentMethodId: "method-1",
        referralCode: "FOUNDING-AHRON",
        ...urlDesigns,
        ...delivery,
        expectedCardAmountCentavos: 29_900,
      }),
    ).rejects.toThrow("Referral code is unavailable for this order.");
    expect(mocks.state.cardOrders).toHaveLength(1);
  });

  it("shares LAUNCH usage across its aliases while keeping it independent from FOUNDING", async () => {
    (mocks.state.cardOrderReferralCodes as Record<string, unknown>[]).push({
      id: "launch",
      code: "LAUNCH",
      offerId: "launch-offer",
      active: true,
    });
    (mocks.state.cardOrderReferralCodes as Record<string, unknown>[]).push({
      id: "launch-ahron",
      code: "LAUNCH-AHRON",
      offerId: "launch-offer",
      referrerCode: "AHRON",
      referrerLabel: "Ahron",
      active: true,
    });
    (mocks.state.cardOrderOffers as Record<string, unknown>[]).push({
      id: "launch-offer",
      code: "LAUNCH",
      fixedPriceCentavos: 39_900,
      usageLimit: 1,
    });
    await placeDemoCardOrder({
      paymentMethodId: "method-1",
      referralCode: "FOUNDING",
      ...urlDesigns,
      ...delivery,
      expectedCardAmountCentavos: 29_900,
    });
    mocks.customerId = "customer-launch";
    await placeDemoCardOrder({
      paymentMethodId: "method-1",
      referralCode: "LAUNCH",
      ...urlDesigns,
      ...delivery,
      expectedCardAmountCentavos: 39_900,
    });
    mocks.customerId = "customer-launch-two";
    await expect(
      placeDemoCardOrder({
        paymentMethodId: "method-1",
        referralCode: "LAUNCH-AHRON",
        ...urlDesigns,
        ...delivery,
        expectedCardAmountCentavos: 39_900,
      }),
    ).rejects.toThrow("Referral code is unavailable for this order.");
    expect(mocks.state.cardOrders).toHaveLength(2);
    expect((mocks.state.cardOrders as Record<string, unknown>[])[1]).toMatchObject({
      offerId: "launch-offer",
      referralSnapshot: { code: "LAUNCH", referrerLabel: "" },
      commissionStatus: "none",
    });
  });

  it("rechecks the limit when another order consumes the last use before commit", async () => {
    expect(previewDemoCardOrderReferral("FOUNDING-AHRON", Date.now()).valid).toBe(true);
    mocks.beforeCommit = () => {
      (mocks.state.cardOrders as { id: string; customerId: string; referralCodeId: string }[]).push(
        { id: "competing-order", customerId: "customer-other", referralCodeId: "code-1" },
      );
    };

    await expect(
      placeDemoCardOrder({
        paymentMethodId: "method-1",
        referralCode: "FOUNDING-AHRON",
        ...urlDesigns,
        ...delivery,
        expectedCardAmountCentavos: 29_900,
      }),
    ).rejects.toThrow("Referral code is unavailable for this order.");
    expect(mocks.state.cardOrders).toHaveLength(1);
  });

  it("saves an offer and exposes it on each configured alias", async () => {
    mocks.customerId = "customer-admin";
    mocks.role = "admin";
    const input = {
      code: "LIMITED",
      referrerCode: "AHRON",
      referrerLabel: "Ahron",
      offerId: "",
      active: true,
    };
    const offerId = await saveDemoCardOrderOffer({ code: "LIMITED", usageLimit: 25 });
    input.offerId = offerId;
    const id = await saveDemoCardOrderReferralCode(input);
    expect(getDemoCardOrderAdminSettings().referralCodes).toContainEqual(
      expect.objectContaining({
        id,
        offer: expect.objectContaining({ id: offerId, usageLimit: 25, usageCount: 0 }),
      }),
    );

    await saveDemoCardOrderOffer({ id: offerId, code: "LIMITED", usageLimit: 20 });
    expect(getDemoCardOrderAdminSettings().referralCodes).toContainEqual(
      expect.objectContaining({
        id,
        offer: expect.objectContaining({ usageLimit: 20, usageCount: 0 }),
      }),
    );

    await saveDemoCardOrderOffer({ id: offerId, code: "LIMITED" });
    expect(
      getDemoCardOrderAdminSettings().referralCodes.find((code) => code.id === id)?.offer,
    ).toMatchObject({ usageLimit: undefined });
  });

  it("rejects an invalid usage limit when saving", async () => {
    mocks.customerId = "customer-admin";
    mocks.role = "admin";
    await expect(saveDemoCardOrderOffer({ code: "BAD", usageLimit: 0 })).rejects.toThrow(
      "Usage limit must be a positive whole number.",
    );
  });

  it("keeps referral-only codes discounted without creating a commission", async () => {
    mocks.state.cardOrderReferralCodes = [
      { id: "legacy", code: "LEGACY", referrerLabel: "", active: true },
    ];
    const result = await placeDemoCardOrder({
      paymentMethodId: "method-1",
      referralCode: "LEGACY",
      ...urlDesigns,
      ...delivery,
      expectedCardAmountCentavos: 53_910,
    });
    expect(result.kind).toBe("created");
    expect((mocks.state.cardOrders as Record<string, unknown>[])[0]).toMatchObject({
      discountCentavos: 5_990,
      commissionStatus: "none",
      commissionCentavos: 0,
    });
  });

  it("returns price_changed and writes no order when the reviewed amount is stale", async () => {
    const before = mocks.state;

    const outcome = await placeDemoCardOrder({
      paymentMethodId: "method-1",
      referralCode: "FOUNDING-AHRON",
      ...urlDesigns,
      ...delivery,
      expectedCardAmountCentavos: 59_900,
    });

    expect(outcome).toEqual({
      kind: "price_changed",
      price: { cardPriceCentavos: 59_900, discountCentavos: 30_000 },
    });
    expect(mocks.state).toBe(before);
    expect(mocks.state.cardOrders).toHaveLength(0);
  });

  it("releases temporary artwork reservations before reporting a price change", async () => {
    const upload = {
      kind: "upload" as const,
      assetKey: "asset-front",
      fileName: "front.png",
      contentType: "image/png" as const,
      byteSize: 5,
    };

    const outcome = await placeDemoCardOrder({
      paymentMethodId: "method-1",
      referralCode: "FOUNDING-AHRON",
      designSource: upload,
      backDesignSource: { ...urlDesigns.backDesignSource },
      ...delivery,
      expectedCardAmountCentavos: 59_900,
    });

    expect(outcome.kind).toBe("price_changed");
    expect(mocks.released).toEqual(["asset-front"]);
    expect(mocks.state.cardOrders).toHaveLength(0);
  });

  it("creates the order at the reviewed amount and persists the server's snapshot", async () => {
    const outcome = await placeDemoCardOrder({
      paymentMethodId: "method-1",
      referralCode: "FOUNDING-AHRON",
      ...urlDesigns,
      ...delivery,
      expectedCardAmountCentavos: 29_900,
    });

    expect(outcome.kind).toBe("created");
    const orders = mocks.state.cardOrders as {
      discountCentavos: number;
      cardPriceCentavos: number;
    }[];
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      cardPriceCentavos: 59_900,
      discountCentavos: 30_000,
      offerId: "founding",
      offerSnapshot: { code: "FOUNDING", fixedPriceCentavos: 29_900 },
    });
    expect(mocks.released).toEqual([]);
  });

  it("rejects a malformed expectation before any state read", async () => {
    await expect(
      placeDemoCardOrder({
        paymentMethodId: "method-1",
        ...urlDesigns,
        ...delivery,
        expectedCardAmountCentavos: 59_900.5,
      }),
    ).rejects.toThrow("Expected card amount must be non-negative integer centavos.");
    expect(mocks.state.cardOrders).toHaveLength(0);
  });
});
