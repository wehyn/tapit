import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hashSetupToken } from "../../src/lib/auth/setup-token";

type DemoStore = typeof import("../../src/lib/demo/store");

async function loadStore(): Promise<DemoStore> {
  vi.resetModules();
  return import("../../src/lib/demo/store");
}

const profile = {
  name: "Prepared Person",
  slug: "prepared-person",
  contactEmail: "contact@example.test",
  website: "https://prepared.example",
  links: [{ label: "Portfolio", url: "https://portfolio.example" }],
};

describe("demo prepared customer lifecycle", () => {
  let store: DemoStore;

  beforeEach(async () => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    store = await loadStore();
    store.resetDemoState();
  });

  afterEach(() => vi.useRealTimers());

  it("creates a waiting draft and persists only the setup token hash", async () => {
    const created = await store.createPrepared(profile);
    const state = store.getDemoState();
    const invitation = state.setupInvitations.find(
      (candidate) => candidate.customerId === created.customerId,
    );

    expect(created).toMatchObject({
      customerId: "prepared-customer-1",
      token: "demo-setup-1",
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    expect(invitation?.tokenHash).toBe(await hashSetupToken(created.token));
    expect(invitation).not.toHaveProperty("token");
    expect(JSON.stringify(state)).not.toContain(created.token);
    expect(state.customers.find((customer) => customer.id === created.customerId)?.email).toBe("");
    expect(state.profiles.find((candidate) => candidate.ownerId === created.customerId)?.id).toBe(
      "prepared-profile-1",
    );
    expect(invitation?.id).toBe("prepared-invitation-1");
    expect(
      state.profiles.find((candidate) => candidate.ownerId === created.customerId),
    ).toMatchObject({
      status: "draft",
      draft: {
        name: profile.name,
        slug: profile.slug,
        email: profile.contactEmail,
        links: [{ destination: "https://portfolio.example" }],
      },
      published: null,
    });
    expect(store.listCustomers({ setupState: "waiting" })).toContainEqual(
      expect.objectContaining({
        id: created.customerId,
        setupState: "waiting",
        linkExpiresAt: created.expiresAt,
      }),
    );
  });

  it("continues deterministic prepared IDs from the persisted counter after reload", async () => {
    const first = await store.createPrepared(profile);
    expect(first.customerId).toBe("prepared-customer-1");
    store = await loadStore();

    const second = await store.createPrepared({ ...profile, slug: "prepared-second" });
    const secondInvitation = store
      .getDemoState()
      .setupInvitations.find((candidate) => candidate.customerId === second.customerId);

    expect(second).toMatchObject({
      customerId: "prepared-customer-2",
      token: "demo-setup-2",
    });
    expect(secondInvitation?.id).toBe("prepared-invitation-2");
  });

  it("transitions to draft after revoke and expiry without writing on expiry", async () => {
    const created = await store.createPrepared(profile);
    store.revokeLink(created.customerId);
    expect(store.listCustomers({ setupState: "draft" })).toContainEqual(
      expect.objectContaining({ id: created.customerId, linkExpiresAt: null }),
    );

    const expiring = await store.createPrepared({ ...profile, slug: "expires-person" });
    vi.setSystemTime(expiring.expiresAt);
    const before = localStorage.getItem("tapit:demo-state:v1");
    expect(store.listCustomers({ setupState: "draft" })).toContainEqual(
      expect.objectContaining({ id: expiring.customerId, setupState: "draft" }),
    );
    expect(localStorage.getItem("tapit:demo-state:v1")).toBe(before);
  });

  it("regenerates a revoked or live link with a new seven-day lifetime", async () => {
    const created = await store.createPrepared(profile);
    store.revokeLink(created.customerId);
    const regenerated = await store.generateLink(created.customerId);
    expect(regenerated).toEqual({
      token: "demo-setup-3",
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    expect(await store.setupPreview(created.token)).toBeNull();
    expect(await store.setupPreview(regenerated.token)).toMatchObject({
      name: profile.name,
      slug: profile.slug,
    });

    const again = await store.generateLink(created.customerId);
    expect(again.token).toBe("demo-setup-4");
    expect(await store.setupPreview(regenerated.token)).toBeNull();
    expect(await store.setupPreview(again.token)).not.toBeNull();
  });

  it("returns the same null preview for every invalid token cause", async () => {
    const created = await store.createPrepared(profile);
    const revoked = await store.createPrepared({ ...profile, slug: "revoked-person" });
    store.revokeLink(revoked.customerId);
    const regenerated = await store.createPrepared({ ...profile, slug: "regenerated-person" });
    const replacement = await store.generateLink(regenerated.customerId);
    const expired = await store.createPrepared({ ...profile, slug: "expired-person" });
    store.setDemoSession({ email: "claiming.person@example.test", role: "customer" });
    expect(await store.claimSetup(created.token)).toBe(true);
    vi.setSystemTime(expired.expiresAt);

    const results = await Promise.all([
      store.setupPreview("not-a-token"),
      store.setupPreview(revoked.token),
      store.setupPreview(regenerated.token),
      store.setupPreview(replacement.token),
      store.setupPreview(expired.token),
      store.setupPreview(created.token),
    ]);
    expect(results).toEqual([null, null, null, null, null, null]);
  });

  it("claims once, rejects replay, and blocks updates and deletion after claim", async () => {
    const created = await store.createPrepared(profile);
    store.setDemoSession({ email: "new.owner@example.test", role: "customer" });
    expect(await store.claimSetup(created.token)).toBe(true);
    expect(await store.claimSetup(created.token)).toBe(false);
    expect(store.listCustomers({ setupState: "active" })).toContainEqual(
      expect.objectContaining({ id: created.customerId, email: "new.owner@example.test" }),
    );
    expect(() => store.updatePrepared(created.customerId, profile)).toThrow(/cannot be updated/i);
    expect(() => store.deletePreparedDraft(created.customerId)).toThrow(/cannot be deleted/i);
  });

  it("keeps legacy invited and deleted customers outside setup states", async () => {
    store.updateDemoState((current) => ({
      ...current,
      customers: [
        ...current.customers,
        ...(["invited", "deleted"] as const).map((status, index) => ({
          id: `legacy-${status}`,
          email: `legacy-${index}@example.test`,
          role: "customer" as const,
          status,
          deletionStatus: status === "deleted" ? ("deleted" as const) : ("active" as const),
        })),
      ],
    }));

    const legacy = store.listCustomers({ setupState: null });
    expect(legacy.map((customer) => customer.id)).toEqual(
      expect.arrayContaining(["legacy-invited", "legacy-deleted"]),
    );
    expect(legacy.every((customer) => customer.setupState === null)).toBe(true);
    expect(store.listCustomers({ setupState: "draft" })).toEqual([]);
    expect(
      store
        .listCustomers({ setupState: "active" })
        .every((customer) => customer.status === "active"),
    ).toBe(true);
    expect(() => store.updatePrepared("legacy-invited", profile)).toThrow(/cannot be updated/i);
    await expect(store.generateLink("legacy-invited")).rejects.toThrow(/cannot receive/i);
    expect(() => store.deletePreparedDraft("legacy-invited")).toThrow(/cannot be deleted/i);
  });
});
