import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultDemoState } from "../../src/lib/demo/fixtures";
import { serializeDemoState } from "../../src/lib/demo/storage-codec";

const KEY = "tapit:demo-state:v1";

describe("demo customer card controls", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    localStorage.setItem(KEY, serializeDemoState(createDefaultDemoState()));
  });

  async function session(email = "mara@example.test") {
    const store = await import("../../src/lib/demo/store");
    store.setDemoSession({ email, role: email === "admin@tapit.local" ? "admin" : "customer" });
    return store;
  }

  it("projects only the current customer's cards without claim secrets", async () => {
    const store = await session();
    const cards = store.getMyDemoCards();
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => !("profileId" in card))).toBe(true);
    expect(
      cards.some((card) => "claimCode" in card || "token" in card || "ownerDisabledAt" in card),
    ).toBe(false);
  });

  it("allows an eligible claimed card to be disabled and reactivated only by its owner", async () => {
    const state = createDefaultDemoState();
    const card = state.cards.find((item) => item.id === "card-mara-active")!;
    card.status = "active";
    card.claimedAt = Date.now();
    card.claimCode = "secret";
    localStorage.setItem(KEY, serializeDemoState(state));
    const store = await session();
    store.disableMyDemoCard(card.id);
    expect(store.getMyDemoCards().find((item) => item.id === card.id)?.canReactivate).toBe(true);
    expect(store.getDemoState().cards.find((item) => item.id === card.id)).toMatchObject({
      status: "inactive",
      ownerDisabledAt: expect.any(Number),
    });
    store.startMyDemoCardReactivation(card.id);
    expect(store.getDemoState().cards.find((item) => item.id === card.id)).toMatchObject({
      status: "active",
      claimedAt: undefined,
      ownerDisabledAt: undefined,
      claimCodeInvalidatedAt: expect.any(Number),
    });
  });

  it("marks an assigned card lost with default return preference and allows preference changes", async () => {
    const store = await session();
    const card = store.getDemoState().cards.find((item) => item.id === "card-mara-active")!;
    store.markMyDemoCardLost(card.id);
    expect(store.getDemoState().cards.find((item) => item.id === card.id)).toMatchObject({
      status: "lost",
      lostCardResolution: "return",
    });
    store.setMyLostDemoCardResolution(card.id, "inactive");
    expect(store.getDemoState().cards.find((item) => item.id === card.id)?.lostCardResolution).toBe(
      "inactive",
    );
  });

  it("sets an explicitly selected lost resolution atomically with one audit", async () => {
    const store = await session();
    const card = store.getDemoState().cards.find((item) => item.id === "card-mara-active")!;
    store.markMyDemoCardLost(card.id, "inactive");
    const after = store.getDemoState();
    expect(after.cards.find((item) => item.id === card.id)).toMatchObject({
      status: "lost",
      lostCardResolution: "inactive",
    });
    const audits = after.audits.filter((item) => item.cardId === card.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "card.owner_marked_lost",
      before: "active:return",
      after: "lost:inactive",
    });
    const beforeInvalid = store.getDemoState();
    expect(() => store.markMyDemoCardLost(card.id, "invalid" as "return")).toThrow();
    expect(store.getDemoState()).toEqual(beforeInvalid);
  });

  it.each(["missing", "invalid"] as const)(
    "hides owner reactivation and rejects the action when published content is %s",
    async (contentState) => {
      const state = createDefaultDemoState();
      const card = state.cards.find((item) => item.id === "card-mara-active")!;
      card.status = "inactive";
      card.ownerDisabledAt = 10;
      const profile = state.profiles.find((item) => item.id === "profile-mara")!;
      if (contentState === "missing") profile.published = null;
      else profile.published!.links = [];
      localStorage.setItem(KEY, serializeDemoState(state));
      const store = await session();
      expect(store.getMyDemoCards().find((item) => item.id === card.id)?.canReactivate).toBe(false);
      const before = store.getDemoState();
      expect(() => store.startMyDemoCardReactivation(card.id)).toThrow();
      expect(store.getDemoState()).toEqual(before);
    },
  );

  it("keeps the list empty for an active customer with no assigned cards", async () => {
    const state = createDefaultDemoState();
    state.cards = state.cards.filter((card) => card.profileId !== "profile-mara");
    localStorage.setItem(KEY, serializeDemoState(state));
    const store = await session();
    expect(store.getMyDemoCards()).toEqual([]);
  });

  it("includes assigned unclaimed and archived cards, but never another profile's or inventory", async () => {
    const state = createDefaultDemoState();
    state.cards.find((card) => card.id === "card-mara-active")!.archivedAt = 10;
    localStorage.setItem(KEY, serializeDemoState(state));
    const store = await session();
    const ids = store.getMyDemoCards().map((card) => card.id);
    expect(ids).toContain("card-mara-active");
    expect(ids).not.toContain("card-unassigned-demo");
    expect(ids).not.toContain("card-claimable-demo");
    expect(store.getMyDemoCards().find((card) => card.id === "card-mara-active")?.archivedAt).toBe(
      10,
    );
  });

  it("allows preference changes on admin-lost unclaimed cards, while rejecting mark-lost for them", async () => {
    const state = createDefaultDemoState();
    const card = state.cards.find((item) => item.id === "card-mara-active")!;
    card.status = "lost";
    card.claimedAt = undefined;
    localStorage.setItem(KEY, serializeDemoState(state));
    const store = await session();
    expect(() => store.markMyDemoCardLost(card.id)).toThrow();
    store.setMyLostDemoCardResolution(card.id, "inactive");
    expect(store.getDemoState().cards.find((item) => item.id === card.id)?.lostCardResolution).toBe(
      "inactive",
    );
  });

  it("rejects correction-pending and stale owner actions without changing card state", async () => {
    const state = createDefaultDemoState();
    const card = state.cards.find((item) => item.id === "card-mara-active")!;
    card.correctionRequestedAt = 1;
    localStorage.setItem(KEY, serializeDemoState(state));
    const store = await session();
    expect(() => store.disableMyDemoCard(card.id)).toThrow();
    expect(() => store.markMyDemoCardLost(card.id)).toThrow();
    expect(store.getDemoState().cards.find((item) => item.id === card.id)).toMatchObject({
      status: "active",
      claimedAt: 1,
    });
  });

  it("requires a current claim for disable and mark-lost but preserves archived assignment on lost", async () => {
    const state = createDefaultDemoState();
    const card = state.cards.find((item) => item.id === "card-mara-active")!;
    card.claimCodeInvalidatedAt = 2;
    localStorage.setItem(KEY, serializeDemoState(state));
    const store = await session();
    expect(() => store.disableMyDemoCard(card.id)).toThrow();
    expect(() => store.markMyDemoCardLost(card.id)).toThrow();
    card.claimCodeInvalidatedAt = undefined;
    card.archivedAt = 3;
    localStorage.setItem(KEY, serializeDemoState(state));
    vi.resetModules();
    const archivedStore = await session();
    archivedStore.markMyDemoCardLost(card.id);
    expect(archivedStore.getDemoState().cards.find((item) => item.id === card.id)).toMatchObject({
      status: "lost",
      archivedAt: 3,
      lostCardResolution: "return",
      ownerDisabledAt: undefined,
    });
  });

  it.each(["inactive", "claimable", "replaced"] as const)(
    "marks an assigned currently claimed %s card lost",
    async (status) => {
      const state = createDefaultDemoState();
      const card = state.cards.find((item) => item.id === "card-mara-active")!;
      card.status = status;
      card.claimedAt = 10;
      localStorage.setItem(KEY, serializeDemoState(state));
      const store = await session();
      store.markMyDemoCardLost(card.id);
      expect(store.getDemoState().cards.find((item) => item.id === card.id)?.status).toBe("lost");
    },
  );

  it("does not disable or mark-lost an assigned but unclaimed card", async () => {
    const state = createDefaultDemoState();
    const card = state.cards.find((item) => item.id === "card-mara-inactive")!;
    localStorage.setItem(KEY, serializeDemoState(state));
    const store = await session();
    expect(() => store.disableMyDemoCard(card.id)).toThrow();
    expect(() => store.markMyDemoCardLost(card.id)).toThrow();
    expect(store.getDemoState().cards.find((item) => item.id === card.id)?.status).toBe("inactive");
  });

  it("audits owner actions and reactivation invalidates old claim state without touching siblings or override", async () => {
    const state = createDefaultDemoState();
    const card = state.cards.find((item) => item.id === "card-mara-active")!;
    card.claimChallenge = "old-challenge";
    card.claimChallengeCode = "old-code";
    card.claimChallengeEmail = "mara@example.test";
    card.claimCode = "old-code";
    const customer = state.customers.find((item) => item.email === "mara@example.test")!;
    customer.claimedCardIds = [card.id];
    customer.cardOwnerAccessOverride = true;
    const sibling = {
      ...card,
      id: "sibling",
      token: "sibling-token",
      cardUrl: "/c/sibling",
      claimedAt: 2,
    };
    state.cards.push(sibling);
    localStorage.setItem(KEY, serializeDemoState(state));
    const store = await session();
    store.disableMyDemoCard(card.id);
    store.startMyDemoCardReactivation(card.id);
    const after = store.getDemoState();
    expect(after.cards.find((item) => item.id === card.id)).toMatchObject({
      status: "active",
      claimedAt: undefined,
      ownerDisabledAt: undefined,
      claimCode: undefined,
      claimCodeInvalidatedAt: expect.any(Number),
      claimChallenge: undefined,
      claimChallengeCode: undefined,
      claimChallengeEmail: undefined,
    });
    expect(after.cards.find((item) => item.id === sibling.id)).toMatchObject({
      id: sibling.id,
      status: "active",
      claimedAt: 2,
      claimCode: "old-code",
    });
    expect(after.customers.find((item) => item.id === customer.id)).toMatchObject({
      claimedCardIds: [],
      cardOwnerAccessOverride: true,
    });
    expect(after.audits.slice(0, 2)).toMatchObject([
      {
        actorId: customer.id,
        cardId: card.id,
        profileId: "profile-mara",
        action: "card.owner_reactivation_started",
      },
      {
        actorId: customer.id,
        cardId: card.id,
        profileId: "profile-mara",
        action: "card.owner_disabled",
      },
    ]);
    expect(() =>
      store.completeDemoCardClaim(card.token, "old-challenge", customer.email),
    ).toThrow();
    store.updateDemoState((current) => ({
      ...current,
      cards: current.cards.map((candidate) =>
        candidate.id === card.id
          ? { ...candidate, claimCode: "FRESH-CODE", claimCodeInvalidatedAt: undefined }
          : candidate,
      ),
    }));
    const challenge = store.verifyDemoCardClaim(card.token, "FRESH-CODE", customer.email);
    store.completeDemoCardClaim(card.token, challenge, customer.email);
    expect(
      store.getDemoState().customers.find((item) => item.id === customer.id)?.claimedCardIds,
    ).toContain(card.id);
  });

  it("rejects cards assigned to another profile and inactive customers", async () => {
    const state = createDefaultDemoState();
    localStorage.setItem(KEY, serializeDemoState(state));
    const store = await session();
    expect(() => store.disableMyDemoCard("card-claimable-demo")).toThrow();
    store.clearDemoSession();
    store.setDemoSession({ email: "mara@example.test", role: "customer" });
    store.updateDemoState((current) => ({
      ...current,
      customers: current.customers.map((customer) =>
        customer.email === "mara@example.test" ? { ...customer, status: "deleted" } : customer,
      ),
    }));
    expect(() => store.getMyDemoCards()).toThrow();
  });

  it("rejects guest, admin, and customer mutations without writes", async () => {
    const store = await import("../../src/lib/demo/store");
    const before = store.getDemoState();
    expect(() => store.getMyDemoCards()).toThrow();
    expect(() => store.disableMyDemoCard("card-mara-active")).toThrow();
    store.setDemoSession({ email: "admin@tapit.local", role: "admin" });
    expect(() => store.markMyDemoCardLost("card-mara-active")).toThrow();
    expect(store.getDemoState().audits).toEqual(before.audits);
  });
});
