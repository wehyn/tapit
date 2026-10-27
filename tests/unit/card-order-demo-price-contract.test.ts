import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  released: [] as string[],
}));

vi.mock("@/lib/demo/store", () => ({
  getDemoSession: () => ({ email: "mara@example.test", role: "customer" }),
  refreshDemoAccessSnapshot: () => ({
    kind: "ready",
    snapshot: { state: mocks.state, session: { email: "mara@example.test", role: "customer" } },
  }),
  resolveDemoSessionAccess: () => ({
    kind: "active",
    account: { id: "customer-mara", role: "customer" },
  }),
  updateDemoState: (updater: (state: typeof mocks.state) => typeof mocks.state) => {
    // Like the real store: the updater runs before persistence, so a throw leaves state unchanged.
    mocks.state = updater(mocks.state);
  },
}));
vi.mock("@/lib/demo/card-order-assets", () => ({
  withDemoCardOrderCommitLock: (operation: () => Promise<unknown>) => operation(),
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

import { placeDemoCardOrder } from "@/lib/demo/card-ordering";

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
      { id: "code-1", code: "FOUNDING-AHRON", referrerLabel: "Ahron", active: true },
    ],
    cardOrders: [],
    audits: [],
  };
});

describe("demo card order price confirmation", () => {
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
      price: { cardPriceCentavos: 59_900, discountCentavos: 5_990 },
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
      expectedCardAmountCentavos: 53_910,
    });

    expect(outcome.kind).toBe("created");
    const orders = mocks.state.cardOrders as {
      discountCentavos: number;
      cardPriceCentavos: number;
    }[];
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ cardPriceCentavos: 59_900, discountCentavos: 5_990 });
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
