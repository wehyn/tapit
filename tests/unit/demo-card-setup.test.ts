import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultDemoState } from "../../src/lib/demo/fixtures";
import { serializeDemoState } from "../../src/lib/demo/storage-codec";

const STORAGE_KEY = "tapit:demo-state:v1";

describe("local demo card setup", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("rechecks current card and customer state when verifying a code", async () => {
    localStorage.setItem(STORAGE_KEY, serializeDemoState(createDefaultDemoState()));
    const { getDemoState, verifyDemoCardClaim } = await import("../../src/lib/demo/store");
    getDemoState();
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    const card = state.cards.find(
      (candidate: { token: string }) => candidate.token === "unassigned-card-demo",
    );
    card.claimCodeInvalidatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    expect(() =>
      verifyDemoCardClaim("unassigned-card-demo", "DEMA29BC", "buyer@example.test"),
    ).toThrow("That code is invalid or unavailable.");
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").cards.find(
        (candidate: { token: string }) => candidate.token === "unassigned-card-demo",
      ).claimChallenge,
    ).toBeUndefined();
  });

  it("rechecks the latest challenge code and profile ownership before requesting correction", async () => {
    localStorage.setItem(STORAGE_KEY, serializeDemoState(createDefaultDemoState()));
    const { getDemoState, requestDemoCardCorrection, verifyDemoCardClaim } =
      await import("../../src/lib/demo/store");
    getDemoState();
    const challenge = verifyDemoCardClaim("claimable-card-demo", "MARA2Q8K", "buyer@example.test");
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    const card = state.cards.find(
      (candidate: { token: string }) => candidate.token === "claimable-card-demo",
    );
    card.claimCode = "CHANGED-CODE";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    expect(() =>
      requestDemoCardCorrection("claimable-card-demo", challenge, "buyer@example.test"),
    ).toThrow("This card is not available for correction.");
    const after = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(after.cardCorrectionRequests ?? []).toEqual([]);
    expect(
      after.cards.find((candidate: { token: string }) => candidate.token === "claimable-card-demo")
        .claimChallenge,
    ).toBe(challenge);
  });

  it("rechecks current card, challenge, and correction state before completing a claim", async () => {
    localStorage.setItem(STORAGE_KEY, serializeDemoState(createDefaultDemoState()));
    const { completeDemoCardClaim, getDemoState, verifyDemoCardClaim } =
      await import("../../src/lib/demo/store");
    getDemoState();
    const challenge = verifyDemoCardClaim("unassigned-card-demo", "DEMA29BC", "buyer@example.test");
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    state.cardCorrectionRequests = [
      {
        id: "pending-request",
        token: "unassigned-card-demo",
        challenge,
        profileId: "profile-buyer-setup",
        requestedBy: "buyer@example.test",
        requestedAt: Date.now(),
        status: "pending",
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    expect(() =>
      completeDemoCardClaim("unassigned-card-demo", challenge, "buyer@example.test"),
    ).toThrow("The card claim is not available for this account.");
    const after = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(after.cardCorrectionRequests[0].status).toBe("pending");
    expect(
      after.cards.find((candidate: { token: string }) => candidate.token === "unassigned-card-demo")
        .claimedAt,
    ).toBeUndefined();
  });

  it("consumes correction challenges, blocks duplicate requests and completion while pending", async () => {
    localStorage.setItem(STORAGE_KEY, serializeDemoState(createDefaultDemoState()));
    const {
      completeDemoCardClaim,
      getDemoState,
      requestDemoCardCorrection,
      setDemoSession,
      verifyDemoCardClaim,
    } = await import("../../src/lib/demo/store");
    setDemoSession({ email: "buyer@example.test", role: "customer" });

    const challenge = verifyDemoCardClaim("claimable-card-demo", "MARA2Q8K", "buyer@example.test");
    expect(() =>
      requestDemoCardCorrection("claimable-card-demo", challenge, "owner@example.test"),
    ).toThrow(/not available for correction/i);
    requestDemoCardCorrection("claimable-card-demo", challenge, "buyer@example.test");

    expect(getDemoState().cards.find((card) => card.token === "claimable-card-demo")).toMatchObject(
      {
        claimCode: "MARA2Q8K",
        claimChallenge: undefined,
        claimChallengeExpiresAt: undefined,
        profileId: "profile-claimable",
      },
    );
    expect(() =>
      requestDemoCardCorrection("claimable-card-demo", challenge, "buyer@example.test"),
    ).toThrow(/not available for correction/i);
    expect(() =>
      completeDemoCardClaim("claimable-card-demo", challenge, "buyer@example.test"),
    ).toThrow(/not available for this account/i);
    expect(
      getDemoState().cardCorrectionRequests?.filter((request) => request.status === "pending"),
    ).toHaveLength(1);
  });

  it("rejects attachment when the signed-in customer's profile already has another live card", async () => {
    const state = createDefaultDemoState();
    state.cards.push({
      id: "card-already-attached-to-buyer",
      token: "buyer-live-card",
      cardUrl: "https://tapit-eosin.vercel.app/c/buyer-live-card",
      status: "active",
      profileId: "profile-buyer-setup",
      claimedAt: 1,
    });
    localStorage.setItem(STORAGE_KEY, serializeDemoState(state));
    const { completeDemoCardClaim, setDemoSession, verifyDemoCardClaim } =
      await import("../../src/lib/demo/store");
    setDemoSession({ email: "buyer@example.test", role: "customer" });
    const challenge = verifyDemoCardClaim("unassigned-card-demo", "DEMA29BC", "buyer@example.test");

    expect(() =>
      completeDemoCardClaim("unassigned-card-demo", challenge, "buyer@example.test"),
    ).toThrow(/not available for this account/i);
  });

  it("binds a verified challenge to the verifying email", async () => {
    const state = createDefaultDemoState();
    state.cards = state.cards.filter(
      (card) => card.token !== "claimable-card-demo" && card.token !== "active-unclaimed-card-demo",
    );
    localStorage.setItem(STORAGE_KEY, serializeDemoState(state));
    const { completeDemoCardClaim, setDemoSession, verifyDemoCardClaim } =
      await import("../../src/lib/demo/store");
    setDemoSession({ email: "buyer@example.test", role: "customer" });
    const challenge = verifyDemoCardClaim("unassigned-card-demo", "DEMA29BC", "buyer@example.test");

    expect(() =>
      completeDemoCardClaim("unassigned-card-demo", challenge, "owner@example.test"),
    ).toThrow(/not available for this account/i);
    expect(() =>
      completeDemoCardClaim("unassigned-card-demo", challenge, "buyer@example.test"),
    ).not.toThrow();
  });

  it("lets an active admin claim a card assigned to their own profile", async () => {
    const state = createDefaultDemoState();
    state.customers.find((customer) => customer.id === "customer-claimable")!.role = "admin";
    localStorage.setItem(STORAGE_KEY, serializeDemoState(state));
    const { completeDemoCardClaim, getDemoState, verifyDemoCardClaim } =
      await import("../../src/lib/demo/store");
    const challenge = verifyDemoCardClaim("claimable-card-demo", "MARA2Q8K", "owner@example.test");

    expect(() =>
      completeDemoCardClaim("claimable-card-demo", challenge, "owner@example.test"),
    ).not.toThrow();
    expect(
      getDemoState().cards.find((card) => card.token === "claimable-card-demo")?.claimedAt,
    ).toEqual(expect.any(Number));
  });

  it("does not let an admin claim a card assigned to another account's profile", async () => {
    localStorage.setItem(STORAGE_KEY, serializeDemoState(createDefaultDemoState()));
    const { completeDemoCardClaim, verifyDemoCardClaim } = await import("../../src/lib/demo/store");
    const challenge = verifyDemoCardClaim("claimable-card-demo", "MARA2Q8K", "admin@tapit.local");

    expect(() =>
      completeDemoCardClaim("claimable-card-demo", challenge, "admin@tapit.local"),
    ).toThrow("The card claim is not available for this account.");
  });

  it("lets a Demo-flag customer claim an eligible card", async () => {
    const state = createDefaultDemoState();
    state.customers.find((customer) => customer.id === "customer-buyer-setup")!.isDemo = true;
    localStorage.setItem(STORAGE_KEY, serializeDemoState(state));
    const { completeDemoCardClaim, verifyDemoCardClaim } = await import("../../src/lib/demo/store");
    const challenge = verifyDemoCardClaim("unassigned-card-demo", "DEMA29BC", "buyer@example.test");

    expect(() =>
      completeDemoCardClaim("unassigned-card-demo", challenge, "buyer@example.test"),
    ).not.toThrow();
  });
});
