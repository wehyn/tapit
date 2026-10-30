import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultDemoState } from "../../src/lib/demo/fixtures";
import { serializeDemoState } from "../../src/lib/demo/storage-codec";

const STORAGE_KEY = "tapit:demo-state:v1";
const SESSION_KEY = "tapit:demo-session:v1";
const futureVersionState = JSON.stringify({
  profile: { id: "future-profile" },
  cards: [],
  customers: [],
  __tapitMediaDataUrls: [],
  __tapitMediaCodecVersion: 3,
});

describe("demo storage store", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => vi.restoreAllMocks());

  it("preserves a future-version state when loading it", async () => {
    localStorage.setItem(STORAGE_KEY, futureVersionState);
    const { getDemoState } = await import("../../src/lib/demo/store");

    expect(getDemoState().profile.id).toBeDefined();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(futureVersionState);
  });

  it("preserves code usage limits when saved demo state is reloaded", async () => {
    const state = createDefaultDemoState();
    state.cardOrderReferralCodes = [
      {
        id: "limited-code",
        code: "FOUNDING-AHRON",
        referrerLabel: "Ahron",
        usageLimit: 25,
        active: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    localStorage.setItem(STORAGE_KEY, serializeDemoState(state));
    const { getDemoState } = await import("../../src/lib/demo/store");

    expect(getDemoState().cardOrderReferralCodes).toMatchObject([
      { id: "limited-code", code: "FOUNDING-AHRON", usageLimit: 25 },
    ]);
  });

  it("migrates legacy relative card URLs with their query and fields, then persists them", async () => {
    const state = createDefaultDemoState();
    state.cards[0] = {
      ...state.cards[0]!,
      cardUrl: "/c/mara-card-7f2q?source=print&campaign=spring",
      status: "inactive",
    };
    state.cards[2] = { ...state.cards[2]!, cardUrl: "/c/not-the-card?campaign=spring" };
    state.cards[1] = {
      ...state.cards[1]!,
      cardUrl: "https://cards.example.test/c/claimable-card-demo?source=existing",
    };
    const localCard = state.cards.find((card) => card.token === "active-unclaimed-card-demo")!;
    localCard.cardUrl = new URL(
      "/c/active-unclaimed-card-demo?source=local&claim=1",
      window.location.origin,
    ).toString();
    localStorage.setItem(STORAGE_KEY, serializeDemoState(state));
    const { getDemoState } = await import("../../src/lib/demo/store");

    expect(getDemoState().cards[0]).toMatchObject({
      id: "card-mara-active",
      token: "mara-card-7f2q",
      cardUrl: "https://tapit-eosin.vercel.app/c/mara-card-7f2q?source=print&campaign=spring",
      status: "inactive",
      profileId: "profile-mara",
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").cards[0]).toMatchObject({
      id: "card-mara-active",
      cardUrl: "https://tapit-eosin.vercel.app/c/mara-card-7f2q?source=print&campaign=spring",
      status: "inactive",
    });
    expect(getDemoState().cards[1]?.cardUrl).toBe(
      "https://cards.example.test/c/claimable-card-demo?source=existing",
    );
    expect(getDemoState().cards[2]?.cardUrl).toBe("/c/not-the-card?campaign=spring");
    expect(
      getDemoState().cards.find((card) => card.token === "active-unclaimed-card-demo")?.cardUrl,
    ).toBe("https://tapit-eosin.vercel.app/c/active-unclaimed-card-demo?source=local&claim=1");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").cards[1]?.cardUrl).toBe(
      "https://cards.example.test/c/claimable-card-demo?source=existing",
    );
  });

  it("normalizes only the exact FOUNDING aliases and preserves other legacy code limits", async () => {
    const state = createDefaultDemoState();
    state.cardOrderReferralCodes = [
      {
        id: "founding",
        code: "FOUNDING",
        referrerLabel: "Founding",
        active: true,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "founding-ahron",
        code: "FOUNDING-AHRON",
        referrerLabel: "Ahron",
        active: true,
        createdAt: 2,
        updatedAt: 2,
      },
      {
        id: "other-one",
        code: "OTHER-ONE",
        referrerLabel: "One",
        fixedPriceCentavos: 14_900,
        usageCount: 2,
        usageLimit: 2,
        active: true,
        createdAt: 3,
        updatedAt: 3,
      },
      {
        id: "other-two",
        code: "OTHER-TWO",
        referrerLabel: "Two",
        active: true,
        createdAt: 4,
        updatedAt: 4,
      },
    ];
    localStorage.setItem(STORAGE_KEY, serializeDemoState(state));
    const { getDemoState } = await import("../../src/lib/demo/store");
    const normalized = getDemoState();
    expect(
      normalized.cardOrderReferralCodes.map(({ id, offerId, referrerCode }) => ({
        id,
        offerId,
        referrerCode,
      })),
    ).toEqual([
      { id: "founding", offerId: "offer-founding", referrerCode: undefined },
      { id: "founding-ahron", offerId: "offer-founding", referrerCode: "AHRON" },
      { id: "other-one", offerId: undefined, referrerCode: undefined },
      { id: "other-two", offerId: undefined, referrerCode: undefined },
    ]);
    expect(normalized.cardOrderReferralCodes.find(({ id }) => id === "other-one")).toMatchObject({
      fixedPriceCentavos: 14_900,
      usageCount: 2,
      usageLimit: 2,
    });
    expect(normalized.cardOrderOffers.map(({ code }) => code)).toEqual(["FOUNDING"]);
    expect(normalized.cardOrderOffers.find(({ id }) => id === "offer-founding")).toMatchObject({
      code: "FOUNDING",
      fixedPriceCentavos: 29_900,
      usageCount: 5,
      usageLimit: 25,
    });
  });

  it("relinks historical FOUNDING orders without changing their saved snapshots", async () => {
    const state = createDefaultDemoState();
    state.cardOrderReferralCodes = [
      {
        id: "founding",
        code: "FOUNDING",
        offerId: "old-founding-offer",
        active: true,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "founding-ahron",
        code: "RENAMED-AHRON",
        offerId: "old-ahron-offer",
        active: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    state.cardOrderOffers = [
      {
        id: "old-founding-offer",
        code: "FOUNDING",
        scope: "demo",
        fixedPriceCentavos: 29_900,
        usageLimit: 25,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: "old-ahron-offer",
        code: "FOUNDING-AHRON",
        scope: "demo",
        fixedPriceCentavos: 29_900,
        usageLimit: 25,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    state.cardOrders = Array.from({ length: 5 }, (_, index) => {
      const referralCodeId = index < 3 ? "founding" : "founding-ahron";
      const code = referralCodeId === "founding" ? "FOUNDING" : "FOUNDING-AHRON";
      return {
        id: `historical-${index}`,
        customerId: `customer-${index}`,
        quantity: 1,
        designSource: { kind: "url", url: "https://example.test/front.png" },
        deliveryName: "Mara Santos",
        deliveryPhone: "09170000000",
        deliveryAddress: "1 Test Street",
        cardPriceCentavos: 59_900,
        discountCentavos: 30_000,
        paymentMethodId: "method-1",
        paymentSnapshot: {
          provider: "Bank",
          label: "Main",
          accountDetails: "123",
          instructions: "Pay",
        },
        referralCodeId,
        referralSnapshot: {
          code: index < 3 ? `OLD-${code}` : "OLD-FOUNDING-AHRON",
          referrerLabel: "Original label",
        },
        offerId: referralCodeId === "founding" ? "old-founding-offer" : "old-ahron-offer",
        offerSnapshot: { code: "Old custom offer", fixedPriceCentavos: 29_900 },
        paymentStatus: "unpaid",
        fulfillmentStatus: "awaiting_shipping_quote",
        commissionStatus: "none",
        commissionCentavos: 0,
        createdAt: index + 1,
        updatedAt: index + 1,
      };
    });
    localStorage.setItem(STORAGE_KEY, serializeDemoState(state));
    const { getDemoState } = await import("../../src/lib/demo/store");

    const normalized = getDemoState();
    expect(normalized.cardOrders).toHaveLength(5);
    expect(normalized.cardOrders.map(({ offerId }) => offerId)).toEqual(
      Array(5).fill("offer-founding"),
    );
    expect(
      normalized.cardOrderReferralCodes.find(({ id }) => id === "founding-ahron")?.offerId,
    ).toBe("offer-founding");
    expect(normalized.cardOrders[0]).toMatchObject({
      referralSnapshot: { code: "OLD-FOUNDING", referrerLabel: "Original label" },
      offerSnapshot: { code: "Old custom offer", fixedPriceCentavos: 29_900 },
    });
    expect(normalized.cardOrderOffers.filter(({ code }) => code === "FOUNDING")).toHaveLength(1);
    expect(normalized.cardOrderOffers.find(({ id }) => id === "offer-founding")).toMatchObject({
      usageCount: 5,
      usageLimit: 25,
    });
  });

  it("preserves a deliberately cleared founding alias offer mapping", async () => {
    const state = createDefaultDemoState();
    state.cardOrderReferralCodes = [
      {
        id: "founding-ahron",
        code: "FOUNDING-AHRON",
        offerId: null,
        active: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    state.cardOrderOffers = [
      { id: "offer-founding", code: "FOUNDING", scope: "demo", createdAt: 1, updatedAt: 1 },
    ];
    localStorage.setItem(STORAGE_KEY, serializeDemoState(state));
    const { getDemoState } = await import("../../src/lib/demo/store");

    expect(getDemoState().cardOrderReferralCodes[0]?.offerId).toBeNull();
  });

  it("keeps a cleared referral mapping cleared through the real save and reload path", async () => {
    const store = await import("../../src/lib/demo/store");
    store.setDemoSession({ email: "admin@tapit.local", role: "admin" });
    const { saveDemoCardOrderReferralCode } = await import("../../src/lib/demo/card-ordering");
    const originalLocks = navigator.locks;
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (_name: string, _options: unknown, operation: () => Promise<unknown>) =>
          operation(),
      },
    });

    let id: string;
    try {
      id = await saveDemoCardOrderReferralCode({ code: "FOUNDING-AHRON", active: true });
    } finally {
      Object.defineProperty(navigator, "locks", { configurable: true, value: originalLocks });
    }
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").cardOrderReferralCodes.find(
      (code: { id: string }) => code.id === id,
    );
    expect(saved).toMatchObject({ offerId: null, referrerCode: null });

    vi.resetModules();
    const reloadedStore = await import("../../src/lib/demo/store");
    expect(
      reloadedStore.getDemoState().cardOrderReferralCodes.find((code) => code.id === id),
    ).toMatchObject({ offerId: null, referrerCode: null });
    const reloadedOrdering = await import("../../src/lib/demo/card-ordering");
    expect(
      reloadedOrdering.getDemoCardOrderAdminSettings().referralCodes.find((code) => code.id === id),
    ).not.toHaveProperty("referrerCode");
  });

  it("keeps an order without an offer mapping valid after persist and reload", async () => {
    const state = createDefaultDemoState();
    state.cardOrderReferralCodes = [
      { id: "unmapped", code: "UNMAPPED", offerId: null, active: true, createdAt: 1, updatedAt: 1 },
    ];
    state.cardOrders = [
      {
        id: "unmapped-order",
        customerId: "customer-mara",
        quantity: 1,
        designSource: { kind: "url", url: "https://example.test/front.png" },
        deliveryName: "Mara Santos",
        deliveryPhone: "09170000000",
        deliveryAddress: "1 Test Street",
        cardPriceCentavos: 59_900,
        discountCentavos: 0,
        paymentMethodId: "method-1",
        paymentSnapshot: {
          provider: "Bank",
          label: "Main",
          accountDetails: "123",
          instructions: "Pay",
        },
        referralCodeId: "unmapped",
        paymentStatus: "unpaid",
        fulfillmentStatus: "awaiting_shipping_quote",
        commissionStatus: "none",
        commissionCentavos: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    localStorage.setItem(STORAGE_KEY, serializeDemoState(state));
    const { getDemoState, updateDemoState } = await import("../../src/lib/demo/store");

    expect(getDemoState().cardOrders[0]?.id).toBe("unmapped-order");
    expect(getDemoState().cardOrders[0]?.offerId).toBeUndefined();
    updateDemoState((current) => ({ ...current, supportUrl: "/saved" }));
    vi.resetModules();

    expect((await import("../../src/lib/demo/store")).getDemoState().cardOrders).toHaveLength(1);
  });

  it("keeps edited founding pricing and cleared limits after storage normalization", async () => {
    const state = createDefaultDemoState();
    state.cardOrderReferralCodes = [
      {
        id: "founding",
        code: "FOUNDING",
        active: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    state.cardOrderOffers = [
      {
        id: "offer-founding",
        code: "FOUNDING",
        scope: "demo",
        usageCount: 5,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    localStorage.setItem(STORAGE_KEY, serializeDemoState(state));
    const { getDemoState } = await import("../../src/lib/demo/store");

    const normalized = getDemoState().cardOrderOffers[0];
    expect(normalized?.fixedPriceCentavos).toBeUndefined();
    expect(normalized?.usageLimit).toBeUndefined();
    expect(normalized?.usageCount).toBe(5);
  });

  it("keeps an exhausted legacy referral count without order history", async () => {
    const state = createDefaultDemoState();
    state.cardOrderReferralCodes = [
      {
        id: "legacy-limited",
        code: "LEGACY-LIMITED",
        fixedPriceCentavos: 14_900,
        usageCount: 2,
        usageLimit: 2,
        active: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    localStorage.setItem(STORAGE_KEY, serializeDemoState(state));
    const { getDemoState } = await import("../../src/lib/demo/store");

    expect(getDemoState().cardOrderReferralCodes[0]).toMatchObject({
      id: "legacy-limited",
      fixedPriceCentavos: 14_900,
      usageCount: 2,
      usageLimit: 2,
    });
    expect(getDemoState().cardOrderOffers).toEqual([]);
  });

  it("rejects updates that would overwrite a future-version state", async () => {
    localStorage.setItem(STORAGE_KEY, futureVersionState);
    const { updateDemoState } = await import("../../src/lib/demo/store");

    let updateError: unknown;
    try {
      updateDemoState((current) => ({ ...current, supportUrl: "/stale-write" }));
    } catch (error) {
      updateError = error;
    }

    expect(updateError).toBeInstanceOf(Error);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(futureVersionState);
  });

  it("does not reset a future-version state before checking its format", async () => {
    localStorage.setItem(STORAGE_KEY, futureVersionState);
    const { resetDemoState } = await import("../../src/lib/demo/store");

    expect(() => resetDemoState()).toThrow(/unsupported format/i);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(futureVersionState);
  });

  it("does not reset over future-version data written after hydration", async () => {
    const { getDemoState, resetDemoState } = await import("../../src/lib/demo/store");
    getDemoState();
    localStorage.setItem(STORAGE_KEY, futureVersionState);

    expect(() => resetDemoState()).toThrow(/unsupported format/i);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(futureVersionState);
  });

  it.each([
    [
      "malformed nested profile data",
      JSON.stringify({
        profile: { id: "legacy", draft: null },
        cards: [],
        customers: [],
      }),
    ],
    [
      "an unresolved media sidecar reference",
      JSON.stringify({
        profile: { id: "legacy", draft: { imageUrl: "\u0001tapit-media:4" } },
        cards: [],
        customers: [],
        __tapitMediaDataUrls: ["data:image/png;base64,abc"],
      }),
    ],
    [
      "a malformed customer entry",
      JSON.stringify({
        profile: { id: "legacy", draft: {} },
        cards: [],
        customers: [null],
      }),
    ],
    [
      "a malformed card entry",
      JSON.stringify({
        profile: { id: "legacy", draft: {} },
        cards: [null],
        customers: [],
      }),
    ],
    [
      "a malformed analytics collection",
      JSON.stringify({
        profile: { id: "legacy", draft: {} },
        cards: [],
        customers: [],
        analytics: {},
      }),
    ],
  ])("preserves raw data and blocks destructive writes for %s", async (_case, raw) => {
    localStorage.setItem(STORAGE_KEY, raw);
    const { refreshDemoAccessSnapshot, resetDemoState, updateDemoState } =
      await import("../../src/lib/demo/store");

    expect(refreshDemoAccessSnapshot()).toEqual({
      kind: "unavailable",
      reason: "saved-demo-data-unreadable",
    });
    expect(() => updateDemoState((current) => ({ ...current, supportUrl: "/stale" }))).toThrow();
    expect(() => resetDemoState()).toThrow();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it("does not overwrite storage changed by another tab", async () => {
    const initialState = JSON.stringify({
      profile: { id: "current-profile", draft: {} },
      cards: [],
      customers: [],
    });
    localStorage.setItem(STORAGE_KEY, initialState);
    const { getDemoState, updateDemoState } = await import("../../src/lib/demo/store");
    getDemoState();
    localStorage.setItem(STORAGE_KEY, futureVersionState);

    expect(() =>
      updateDemoState((current) => ({ ...current, supportUrl: "/stale-write" })),
    ).toThrow(/changed in another tab/i);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(futureVersionState);
  });

  it("adopts supported changes from another tab before allowing a save", async () => {
    const { getDemoState, subscribeDemoState, updateDemoState } =
      await import("../../src/lib/demo/store");
    const unsubscribe = subscribeDemoState(() => {});
    const externalState = { ...getDemoState(), supportUrl: "https://other-tab.example" };
    const raw = JSON.stringify(externalState);
    localStorage.setItem(STORAGE_KEY, raw);
    window.dispatchEvent(
      new StorageEvent("storage", { key: STORAGE_KEY, newValue: raw, storageArea: localStorage }),
    );

    expect(getDemoState().supportUrl).toBe("https://other-tab.example");
    expect(() =>
      updateDemoState((current) => ({ ...current, supportUrl: "https://this-tab.example" })),
    ).not.toThrow();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").supportUrl).toBe(
      "https://this-tab.example",
    );

    unsubscribe();
  });

  it("clears a malformed session from the snapshot without deleting its bytes", async () => {
    const { getDemoSession, subscribeDemoState } = await import("../../src/lib/demo/store");
    const unsubscribe = subscribeDemoState(() => {});
    localStorage.setItem(SESSION_KEY, "not-json");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SESSION_KEY,
        newValue: "not-json",
        storageArea: localStorage,
      }),
    );

    expect(getDemoSession()).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBe("not-json");

    unsubscribe();
  });

  it("keeps the in-memory session unchanged when session storage writes fail", async () => {
    const { clearDemoSession, getDemoSession, setDemoSession } =
      await import("../../src/lib/demo/store");
    const originalSetItem = Storage.prototype.setItem;
    const blockedSetItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === SESSION_KEY) throw new DOMException("Storage is full", "QuotaExceededError");
      return originalSetItem.call(this, key, value);
    });

    let sessionWriteError: unknown;
    try {
      setDemoSession({ email: "mara@example.test", role: "customer" });
    } catch (error) {
      sessionWriteError = error;
    }
    expect(getDemoSession()).toBeNull();
    expect(sessionWriteError).toBeInstanceOf(Error);
    expect(sessionWriteError).toMatchObject({
      message: expect.stringMatching(/could not save tapit data locally/i),
    });

    blockedSetItem.mockRestore();
    setDemoSession({ email: "mara@example.test", role: "customer" });
    const originalRemoveItem = Storage.prototype.removeItem;
    const blockedRemoveItem = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(function (this: Storage, key: string) {
        if (key === SESSION_KEY) throw new DOMException("Storage is blocked", "SecurityError");
        return originalRemoveItem.call(this, key);
      });

    const clearResult = clearDemoSession();
    expect(getDemoSession()).toEqual({ email: "mara@example.test", role: "customer" });
    expect(clearResult).toBe(false);
    blockedRemoveItem.mockRestore();
  });

  it("does not crash or change memory when localStorage reads are blocked", async () => {
    const originalGetItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === STORAGE_KEY || key === SESSION_KEY)
        throw new DOMException("Storage is blocked", "SecurityError");
      return originalGetItem.call(this, key);
    });
    const { getDemoSession, getDemoState, subscribeDemoState, updateDemoState } =
      await import("../../src/lib/demo/store");

    expect(() => getDemoState()).not.toThrow();
    expect(() => getDemoSession()).not.toThrow();
    expect(() => subscribeDemoState(() => undefined)).not.toThrow();
    const before = getDemoState();

    expect(() =>
      updateDemoState((current) => ({ ...current, supportUrl: "/unsaved-support-url" })),
    ).toThrow(/could not save tapit data locally/i);
    expect(getDemoState()).toBe(before);
  });
});
