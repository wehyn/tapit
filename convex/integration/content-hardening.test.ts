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

type TestLink = {
  id: string;
  label: string;
  destination: string;
  enabled: boolean;
  icon?: string;
};

const validLink = (id = "link"): TestLink => ({
  id,
  label: "Website",
  destination: "https://example.com",
  enabled: true,
  icon: "link",
});

const validDraft = (links: TestLink[] = [validLink()]) => ({
  name: "Owner",
  slug: "owner",
  bio: "Owner bio",
  links,
});

const validRedirect = { enabled: true, destination: "https://redirect.example.com/card" };

async function draftRevision(t: ReturnType<typeof convexTest>, profileId: Id<"profiles">) {
  return await t.run(async (ctx) => (await ctx.db.get(profileId))?.draftRevision ?? 0);
}

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
    const ownerUserId = await ctx.db.insert("users", { email: "owner@example.com" });
    const adminCustomerId = await ctx.db.insert("customers", {
      userId: adminUserId,
      email: "admin@example.com",
      role: "admin",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const ownerCustomerId = await ctx.db.insert("customers", {
      userId: ownerUserId,
      email: "owner@example.com",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const profileId = await ctx.db.insert("profiles", {
      ownerId: ownerCustomerId,
      slug: "owner",
      status: "draft",
      draft: validDraft(),
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(ownerCustomerId, { profileId });
    return { adminUserId, ownerUserId, adminCustomerId, profileId };
  });
}

describe("content hardening", () => {
  it("reports only availability for valid, duplicate, reserved, and malformed slugs", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    await expect(
      t.query(api.profiles.checkSlugAvailability, { slug: " Fresh-Profile " }),
    ).resolves.toEqual({
      available: true,
      normalizedSlug: "fresh-profile",
      error: null,
    });
    await expect(t.query(api.profiles.checkSlugAvailability, { slug: "owner" })).resolves.toEqual({
      available: false,
      normalizedSlug: "owner",
      error: "That profile slug is already in use.",
    });
    await expect(t.query(api.profiles.checkSlugAvailability, { slug: "login" })).resolves.toEqual({
      available: false,
      normalizedSlug: "login",
      error: "That profile slug is reserved.",
    });
    await expect(t.query(api.profiles.checkSlugAvailability, { slug: "c" })).resolves.toEqual({
      available: false,
      normalizedSlug: "c",
      error: "That profile slug is reserved.",
    });
    await expect(
      t.query(api.profiles.checkSlugAvailability, { slug: "bad_slug" }),
    ).resolves.toEqual({
      available: false,
      normalizedSlug: "bad_slug",
      error: "The profile slug is invalid.",
    });
    expect(data.profileId).toBeDefined();
  });

  it("rejects oversized and duplicate-id link drafts", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const tooMany = Array.from({ length: 101 }, (_, index) => validLink(`link-${index}`));

    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: data.profileId,
        draft: validDraft(tooMany),
        expectedDraftRevision: await draftRevision(t, data.profileId),
      }),
    ).rejects.toThrow("more than 100 links");
    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: data.profileId,
        draft: validDraft([validLink("same"), validLink("same")]),
        expectedDraftRevision: await draftRevision(t, data.profileId),
      }),
    ).rejects.toThrow("Duplicate link IDs");
  });

  it("rejects credential-bearing profile websites in draft validation", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));

    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: data.profileId,
        draft: { ...validDraft(), website: "https://user:password@example.com" },
        expectedDraftRevision: await draftRevision(t, data.profileId),
      }),
    ).rejects.toThrow("A profile website must be a valid HTTPS URL without credentials.");
  });

  it("rejects unknown icons while allowing incomplete draft fields", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));

    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: data.profileId,
        draft: validDraft([{ ...validLink(), icon: "unknown" }]),
        expectedDraftRevision: await draftRevision(t, data.profileId),
      }),
    ).rejects.toThrow("icon");
    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: data.profileId,
        draft: validDraft([{ ...validLink(), label: "", destination: "" }]),
        expectedDraftRevision: await draftRevision(t, data.profileId),
      }),
    ).resolves.toMatchObject({ updatedAt: expect.any(Number) });
  });

  it("keeps saveDraft links synchronized with the links table", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const links = [validLink("first"), { ...validLink("second"), enabled: false }];

    await owner.mutation(api.profiles.saveDraft, {
      profileId: data.profileId,
      draft: validDraft(links),
      expectedDraftRevision: await draftRevision(t, data.profileId),
    });
    await expect(
      owner.query(api.links.listForProfile, { profileId: data.profileId }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ position: 0, label: "Website" }),
        expect.objectContaining({ position: 1, enabled: false }),
      ]),
    );
  });

  it("persists redirect settings through saveDraft and links.replaceDraft", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));

    const saved = await owner.mutation(api.profiles.saveDraft, {
      profileId: data.profileId,
      draft: { ...validDraft(), redirect: validRedirect },
      expectedDraftRevision: await draftRevision(t, data.profileId),
    });
    await expect(owner.query(api.profiles.mine, {})).resolves.toMatchObject({
      draft: { redirect: validRedirect },
    });

    const replacement = { enabled: true, destination: "https://next.example.com/card" };
    await owner.mutation(api.links.replaceDraft, {
      profileId: data.profileId,
      links: [validLink("updated")],
      redirect: replacement,
      expectedDraftRevision: saved.draftRevision,
    });
    await expect(owner.query(api.profiles.mine, {})).resolves.toMatchObject({
      draft: { redirect: replacement, links: [{ id: "updated" }] },
    });

    await expect(
      owner.mutation(api.profiles.publish, { profileId: data.profileId }),
    ).resolves.toMatchObject({
      redirect: replacement,
    });
    await expect(owner.query(api.profiles.mine, {})).resolves.toMatchObject({
      published: { redirect: replacement },
    });
  });

  it("links.replaceDraft saves featured selection atomically with links", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    await t.run(async (ctx) => {
      const profile = await ctx.db.get(data.profileId);
      if (profile)
        await ctx.db.patch(data.profileId, { draft: { ...profile.draft, theme: "moss" } });
    });
    const sensitiveFeaturedLinkId = "owner@example.com";
    const original = [
      { ...validLink("first"), destination: "https://first.example.com" },
      { ...validLink(sensitiveFeaturedLinkId), destination: "https://second.example.com" },
    ];
    const replaceDraft = (args: {
      links: TestLink[];
      expectedDraftRevision: number;
      featuredLinkId?: string | null;
    }) =>
      owner.mutation(api.links.replaceDraft, {
        profileId: data.profileId,
        ...args,
      });

    await replaceDraft({
      links: original,
      expectedDraftRevision: 0,
      featuredLinkId: sensitiveFeaturedLinkId,
    });
    await expect(owner.query(api.profiles.mine, {})).resolves.toMatchObject({
      draft: {
        links: original,
        theme: "moss",
        customization: {
          featuredLinkId: sensitiveFeaturedLinkId,
          preset: "moss",
          accent: "jade",
          typeScale: "comfortable",
          linkTreatment: "filled",
          contentOrder: "links-first",
        },
      },
    });
    await expect(
      owner.query(api.links.listForProfile, { profileId: data.profileId }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ position: 0, label: "Website" }),
        expect.objectContaining({ position: 1, label: "Website" }),
      ]),
    );

    await replaceDraft({ links: [validLink("third")], expectedDraftRevision: 1 });
    await expect(owner.query(api.profiles.mine, {})).resolves.toMatchObject({
      draft: {
        links: [validLink("third")],
        customization: { featuredLinkId: sensitiveFeaturedLinkId },
      },
    });

    await replaceDraft({
      links: [validLink("third")],
      expectedDraftRevision: 2,
      featuredLinkId: null,
    });
    const cleared = await owner.query(api.profiles.mine, {});
    expect(cleared?.draft.customization).not.toHaveProperty("featuredLinkId");
    expect(cleared?.draft.customization).toMatchObject({ preset: "moss", accent: "jade" });

    const audits = await t.run((ctx) => ctx.db.query("auditLogs").collect());
    const linkAudits = audits.filter((entry) => entry.action === "profile.links_updated");
    expect(linkAudits).toHaveLength(3);
    expect(linkAudits.map(({ before, after }) => `${before}\n${after}`).join("\n")).not.toContain(
      sensitiveFeaturedLinkId,
    );
    expect(
      linkAudits.map(({ before, after }) => ({
        before: JSON.parse(before ?? "null"),
        after: JSON.parse(after ?? "null"),
      })),
    ).toEqual([
      {
        before: {
          links: 0,
          featuredLinkSelected: false,
          featuredSelectionChanged: false,
        },
        after: { links: 2, featuredLinkSelected: true, featuredSelectionChanged: true },
      },
      {
        before: {
          links: 2,
          featuredLinkSelected: true,
          featuredSelectionChanged: false,
        },
        after: { links: 1, featuredLinkSelected: true, featuredSelectionChanged: false },
      },
      {
        before: {
          links: 1,
          featuredLinkSelected: true,
          featuredSelectionChanged: false,
        },
        after: { links: 1, featuredLinkSelected: false, featuredSelectionChanged: true },
      },
    ]);
    expect(await draftRevision(t, data.profileId)).toBe(3);
  });

  it("links.replaceDraft rejects invalid or stale featured selections without partial writes", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const replaceDraft = (args: {
      links: TestLink[];
      expectedDraftRevision: number;
      featuredLinkId?: string | null;
    }) =>
      owner.mutation(api.links.replaceDraft, {
        profileId: data.profileId,
        ...args,
      });
    const first = [validLink("first")];

    await expect(
      replaceDraft({ links: first, expectedDraftRevision: 0, featuredLinkId: "not-submitted" }),
    ).rejects.toThrow();
    await expect(
      replaceDraft({
        links: [validLink("disabled"), { ...validLink("inactive"), enabled: false }],
        expectedDraftRevision: 0,
        featuredLinkId: "inactive",
      }),
    ).rejects.toThrow();
    const unchanged = await owner.query(api.profiles.mine, {});
    expect(unchanged?.draft.links).toEqual([validLink()]);
    expect(unchanged?.draft.customization).toBeUndefined();
    await expect(
      owner.query(api.links.listForProfile, { profileId: data.profileId }),
    ).resolves.toEqual([]);
    expect(await draftRevision(t, data.profileId)).toBe(0);
    await expect(t.run((ctx) => ctx.db.query("auditLogs").collect())).resolves.toHaveLength(0);

    await replaceDraft({ links: first, expectedDraftRevision: 0, featuredLinkId: "first" });
    await expect(
      replaceDraft({
        links: [validLink("stale")],
        expectedDraftRevision: 0,
        featuredLinkId: "stale",
      }),
    ).rejects.toThrow("profile draft changed");
    await expect(owner.query(api.profiles.mine, {})).resolves.toMatchObject({
      draft: { links: first, customization: { featuredLinkId: "first" } },
    });
    expect(await draftRevision(t, data.profileId)).toBe(1);
    const audits = await t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(audits.filter((entry) => entry.action === "profile.links_updated")).toHaveLength(1);
  });

  it("does not let a stale full-draft save overwrite newer link edits", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const latestLinks = [validLink("latest")];

    await owner.mutation(api.links.replaceDraft, {
      profileId: data.profileId,
      links: latestLinks,
      expectedDraftRevision: 0,
    });
    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: data.profileId,
        draft: { ...validDraft(), name: "Stale profile edit" },
        expectedDraftRevision: 0,
      }),
    ).rejects.toThrow("profile draft changed");

    const saved = await t.run((ctx) => ctx.db.get(data.profileId));
    expect(saved?.draft).toMatchObject({ name: "Owner", links: latestLinks });
  });

  it("does not let a stale link replacement overwrite a newer full-draft save", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const latestLinks = [validLink("latest")];

    await owner.mutation(api.profiles.saveDraft, {
      profileId: data.profileId,
      draft: { ...validDraft(latestLinks), name: "Latest profile edit" },
      expectedDraftRevision: 0,
    });
    await expect(
      owner.mutation(api.links.replaceDraft, {
        profileId: data.profileId,
        links: [validLink("stale")],
        expectedDraftRevision: 0,
      }),
    ).rejects.toThrow("profile draft changed");

    const saved = await t.run((ctx) => ctx.db.get(data.profileId));
    expect(saved?.draft).toMatchObject({ name: "Latest profile edit", links: latestLinks });
  });

  it("rejects redirect destinations that are not credential-free HTTPS URLs", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    for (const destination of [
      "http://redirect.example.com",
      "https://user:pass@redirect.example.com",
    ]) {
      await expect(
        owner.mutation(api.profiles.saveDraft, {
          profileId: data.profileId,
          draft: { ...validDraft(), redirect: { enabled: true, destination } },
          expectedDraftRevision: await draftRevision(t, data.profileId),
        }),
      ).rejects.toThrow("Redirect destination must be a valid HTTPS URL without credentials.");
    }
  });

  it("accepts legacy profiles with no redirect field", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));

    await expect(owner.query(api.profiles.mine, {})).resolves.toMatchObject({
      draft: { name: "Owner" },
    });
  });

  it("requires valid published content for status changes and card assignment", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const admin = t.withIdentity(identity(data.adminUserId));
    const cardId = await admin.mutation(api.cards.register, {
      cardUrl: "https://cards.example/c/valid-token",
      token: "valid-token",
    });

    await expect(
      admin.mutation(api.profiles.setStatus, { profileId: data.profileId, status: "published" }),
    ).rejects.toThrow("published content");
    await expect(
      admin.mutation(api.cards.assign, { cardId, profileId: data.profileId }),
    ).rejects.toThrow("published profile");
  });

  it("rejects unsafe, ambiguous, and mismatched card URLs", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const admin = t.withIdentity(identity(data.adminUserId));
    for (const cardUrl of [
      "javascript:alert(1)",
      "data:text/plain,/c/token",
      "//cards.example/c/token",
      "/c/token",
      "https://cards.example/c/token?x=1",
      "https://cards.example/c/token#fragment",
    ]) {
      await expect(admin.mutation(api.cards.register, { cardUrl, token: "token" })).rejects.toThrow(
        "/c/<token> format",
      );
    }
    await expect(
      admin.mutation(api.cards.register, {
        cardUrl: "https://cards.example/c/other-token",
        token: "token",
      }),
    ).rejects.toThrow("/c/<token> format");
  });
});
