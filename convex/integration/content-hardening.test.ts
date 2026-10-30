import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { DEFAULT_WARM_STUDIO_CUSTOMIZATION } from "../../src/lib/profile-customization";

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

async function claimCardOwnerFeatures(t: ReturnType<typeof convexTest>, profileId: Id<"profiles">) {
  await t.run((ctx) =>
    ctx.db.insert("cards", {
      cardUrl: "https://cards.test/claimed-owner",
      token: "claimed-owner",
      profileId,
      status: "active",
      claimCodeClaimedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
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
    await expect(t.query(api.profiles.checkSlugAvailability, { slug: "privacy" })).resolves.toEqual(
      {
        available: false,
        normalizedSlug: "privacy",
        error: "That profile slug is reserved.",
      },
    );
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

  it("rejects unsafe nonblank destinations even when a link is disabled", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));

    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: data.profileId,
        draft: validDraft([
          { id: "disabled", label: "Old link", destination: "javascript:alert(1)", enabled: false },
        ]),
        expectedDraftRevision: await draftRevision(t, data.profileId),
      }),
    ).rejects.toThrow("Every nonblank link needs a safe destination.");
  });

  it("allows white identity text with the night theme in server draft validation", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    await claimCardOwnerFeatures(t, data.profileId);
    const draft = {
      ...validDraft(),
      theme: "night" as const,
      customization: {
        ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        identityColors: { name: { kind: "custom" as const, hex: "#ffffff" } },
      },
    };

    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: data.profileId,
        draft,
        expectedDraftRevision: await draftRevision(t, data.profileId),
      }),
    ).resolves.toMatchObject({ draftRevision: expect.any(Number) });
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

  it("accepts links.replaceDraft calls from tabs that still send featuredLinkId", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));

    await expect(
      owner.mutation(api.links.replaceDraft, {
        profileId: data.profileId,
        links: [validLink("kept")],
        featuredLinkId: "kept",
        expectedDraftRevision: await draftRevision(t, data.profileId),
      }),
    ).resolves.toMatchObject({ draftRevision: expect.any(Number) });
    await expect(owner.query(api.profiles.mine, {})).resolves.toMatchObject({
      draft: { links: [{ id: "kept" }] },
    });
  });

  it("accepts links.replaceDraft calls from tabs that clear featuredLinkId with null", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));

    await expect(
      owner.mutation(api.links.replaceDraft, {
        profileId: data.profileId,
        links: [validLink("kept")],
        featuredLinkId: null,
        expectedDraftRevision: await draftRevision(t, data.profileId),
      }),
    ).resolves.toMatchObject({ draftRevision: 1 });
    await expect(owner.query(api.profiles.mine, {})).resolves.toMatchObject({
      draft: { links: [{ id: "kept" }] },
    });
  });

  it("loads legacy featuredLinkId profiles and saves them without the field", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const legacyCustomization = {
      preset: "paper" as const,
      accent: "coral" as const,
      typeScale: "comfortable" as const,
      linkTreatment: "filled" as const,
      contentOrder: "links-first" as const,
      featuredLinkId: "legacy-featured-link",
    };

    const legacyProfileId = await t.run(async (ctx) => {
      const profile = await ctx.db.get(data.profileId);
      if (profile === null) throw new Error("Profile missing");
      const draft = { ...profile.draft, customization: legacyCustomization };
      const profileId = await ctx.db.insert("profiles", {
        ownerId: profile.ownerId,
        slug: profile.slug,
        status: "published",
        draft,
        published: { ...draft, publishedAt: 1 },
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        publishedAt: 1,
      });
      await ctx.db.patch(profile.ownerId, { profileId });
      await ctx.db.delete(data.profileId);
      return profileId;
    });
    await claimCardOwnerFeatures(t, legacyProfileId);

    await expect(owner.query(api.profiles.mine, {})).resolves.toMatchObject({
      draft: { customization: legacyCustomization },
      published: { customization: legacyCustomization },
    });
    const publicProfile = await t.query(api.profiles.publicBySlug, { slug: "owner" });
    expect(publicProfile).toMatchObject({ slug: "owner" });
    expect(publicProfile?.customization).not.toHaveProperty("featuredLinkId");

    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: legacyProfileId,
        draft: {
          ...validDraft(),
          customization: {
            preset: "paper",
            accent: "coral",
            typeScale: "comfortable",
            linkTreatment: "filled",
            contentOrder: "links-first",
          },
        },
        expectedDraftRevision: await draftRevision(t, legacyProfileId),
      }),
    ).resolves.toMatchObject({ draftRevision: 1 });
  });

  it("rejects invalid destinations for enabled link redirects", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));

    for (const destination of [
      "http://redirect.example.com",
      "https://user:pass@redirect.example.com",
    ]) {
      await expect(
        owner.mutation(api.links.replaceDraft, {
          profileId: data.profileId,
          links: [validLink()],
          redirect: { enabled: true, destination },
          expectedDraftRevision: await draftRevision(t, data.profileId),
        }),
      ).rejects.toThrow("Redirect destination must be a valid HTTPS URL without credentials.");
    }
  });

  it("allows disabling a redirect with an invalid stored destination", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const invalidDestination = "http://redirect.example.com";

    await t.run(async (ctx) => {
      const profile = await ctx.db.get(data.profileId);
      if (profile === null) throw new Error("Profile missing");
      await ctx.db.patch(data.profileId, {
        draft: { ...profile.draft, redirect: { enabled: true, destination: invalidDestination } },
      });
    });

    await expect(
      owner.mutation(api.links.replaceDraft, {
        profileId: data.profileId,
        links: [validLink()],
        redirect: { enabled: false, destination: invalidDestination },
        expectedDraftRevision: await draftRevision(t, data.profileId),
      }),
    ).resolves.toMatchObject({ draftRevision: 1 });
  });

  it("keeps the stored redirect when links.replaceDraft omits redirect", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const redirect = { enabled: true, destination: "https://redirect.example.com/card" };

    await t.run(async (ctx) => {
      const profile = await ctx.db.get(data.profileId);
      if (profile === null) throw new Error("Profile missing");
      await ctx.db.patch(data.profileId, {
        draft: { ...profile.draft, redirect },
      });
    });

    await owner.mutation(api.links.replaceDraft, {
      profileId: data.profileId,
      links: [validLink("updated")],
      expectedDraftRevision: await draftRevision(t, data.profileId),
    });

    await expect(owner.query(api.profiles.mine, {})).resolves.toMatchObject({
      draft: { redirect, links: [{ id: "updated" }] },
    });
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
      cardUrl: "https://tapit-eosin.vercel.app/c/valid-token",
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
      "//tapit-eosin.vercel.app/c/token",
      "/c/token",
      "http://tapit-eosin.vercel.app/c/token",
      "https://tapit-eosin.vercel.app.evil.example/c/token",
      "https://user:pass@tapit-eosin.vercel.app/c/token",
      "https://tapit-eosin.vercel.app/c/token#fragment",
      "https://tapit-eosin.vercel.app/not-card/token",
      "https://tapit-eosin.vercel.app/c/other/../token",
      "https://tapit-eosin.vercel.app/c/token ",
    ]) {
      await expect(admin.mutation(api.cards.register, { cardUrl, token: "token" })).rejects.toThrow(
        "/c/<token> format",
      );
    }
    const queryUrl = "https://tapit-eosin.vercel.app/c/token?x=1";
    const queryCardId = await admin.mutation(api.cards.register, {
      cardUrl: queryUrl,
      token: "token",
    });
    await expect(t.run((ctx) => ctx.db.get(queryCardId))).resolves.toMatchObject({
      cardUrl: queryUrl,
    });
    await expect(
      admin.mutation(api.cards.register, {
        cardUrl: "https://tapit-eosin.vercel.app/c/other-token",
        token: "token",
      }),
    ).rejects.toThrow("/c/<token> format");
  });

  it("preserves card URL queries exactly when registering", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const admin = t.withIdentity(identity(data.adminUserId));
    const cardUrl = "https://tapit-eosin.vercel.app/c/query-token?source=print&x=a%2Fb";
    const cardId = await admin.mutation(api.cards.register, { cardUrl, token: "query-token" });

    await expect(t.run((ctx) => ctx.db.get(cardId))).resolves.toMatchObject({ cardUrl });
  });
});
