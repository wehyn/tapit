import { beforeEach, describe, expect, it, vi } from "vitest";

import { projectPublicProfile } from "../../src/lib/domain";
import { createDefaultDemoState } from "../../src/lib/demo/fixtures";

type DemoStore = typeof import("../../src/lib/demo/store");

async function loadStore(): Promise<DemoStore> {
  vi.resetModules();
  return import("../../src/lib/demo/store");
}

const account = {
  email: "  New.Person@Example.com ",
  name: " New Person ",
  slug: " new-person ",
  passwordHash: "sha256:secret-hash",
};

describe("demo self-service signup", () => {
  let store: DemoStore;

  beforeEach(async () => {
    localStorage.clear();
    store = await loadStore();
    store.resetDemoState();
  });

  it("creates an owned draft account and persists it across a local reload", async () => {
    const created = store.createDemoSelfServiceAccount(account);
    const state = store.getDemoState();
    const customer = state.customers.find((candidate) => candidate.id === created.customerId);
    const profile = state.profiles.find((candidate) => candidate.id === created.profileId);

    expect(created.slug).toBe("new-person");
    expect(customer).toMatchObject({
      email: "new.person@example.com",
      role: "customer",
      profileId: created.profileId,
      status: "active",
      deletionStatus: "active",
      passwordHash: account.passwordHash,
    });
    expect(customer?.setupToken).toBeUndefined();
    expect(profile).toMatchObject({
      id: created.profileId,
      ownerId: created.customerId,
      status: "draft",
      theme: "paper",
      draft: {
        name: "New Person",
        slug: "new-person",
        email: "new.person@example.com",
        links: [],
      },
      published: null,
    });
    expect(profile && projectPublicProfile(profile)).toBeNull();
    expect(state.profile.id).toBe("profile-mara");
    expect(
      state.customers.find((candidate) => candidate.email === "admin@tapit.local"),
    ).toBeDefined();
    expect(state.audits.at(-1)).toMatchObject({
      action: "customer.self_service_created",
      target: "new.person@example.com / new-person",
    });
    expect(JSON.stringify(state.audits.at(-1))).not.toContain(account.passwordHash);
    expect(
      store.getDemoProfileForSession(state, { email: "new.person@example.com", role: "customer" }),
    ).toEqual(profile);

    const reloaded = await loadStore();
    expect(reloaded.getDemoState().customers).toEqual(state.customers);
    expect(
      reloaded.getDemoProfileForSession(reloaded.getDemoState(), {
        email: "new.person@example.com",
        role: "customer",
      }).id,
    ).toBe(created.profileId);
  });

  it("rejects duplicate email and slug without mutating state", () => {
    store.createDemoSelfServiceAccount(account);
    const before = localStorage.getItem("tapit:demo-state:v1");

    expect(() =>
      store.createDemoSelfServiceAccount({ ...account, name: "Other", slug: "other" }),
    ).toThrow(
      "That email already has a Tapit account or invitation. Sign in or use the setup link.",
    );
    expect(localStorage.getItem("tapit:demo-state:v1")).toBe(before);

    expect(() =>
      store.createDemoSelfServiceAccount({ ...account, email: "other@example.com" }),
    ).toThrow("That profile slug is already in use.");
    expect(localStorage.getItem("tapit:demo-state:v1")).toBe(before);
  });

  it("rejects invalid, reserved, blank, and oversized signup values", () => {
    for (const [input, message] of [
      [{ ...account, slug: "not valid" }, "The profile slug is invalid."],
      [{ ...account, slug: "admin" }, "That profile slug is reserved."],
      [{ ...account, name: "   " }, "Enter your display name."],
      [{ ...account, name: "x".repeat(121) }, "Your display name is too long."],
    ] as const) {
      expect(() => store.createDemoSelfServiceAccount(input)).toThrow(message);
    }
  });

  it("rejects slugs already used by draft or published profiles", () => {
    const baseProfile = createDefaultDemoState().profiles[0];
    if (baseProfile === undefined) throw new Error("Missing demo profile fixture.");
    store.updateDemoState((current) => ({
      ...current,
      profiles: [
        ...current.profiles,
        {
          ...baseProfile,
          id: "profile-draft",
          ownerId: "customer-draft",
          status: "draft",
          theme: "paper",
          draft: { ...baseProfile.draft, slug: "draft-slug" },
          published: null,
        },
      ],
    }));

    expect(() => store.createDemoSelfServiceAccount({ ...account, slug: "draft-slug" })).toThrow(
      "That profile slug is already in use.",
    );
    expect(() =>
      store.createDemoSelfServiceAccount({ ...account, slug: "mara-velasquez" }),
    ).toThrow("That profile slug is already in use.");
  });
});
