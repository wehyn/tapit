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

function content(slug: string, name: string, bio = `${name} bio`) {
  return {
    name,
    slug,
    bio,
    website: "https://example.com",
    links: [
      {
        id: `${slug}-link`,
        label: "Website",
        destination: "https://example.com",
        enabled: true,
      },
    ],
  };
}

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
    const ownerUserId = await ctx.db.insert("users", { email: "owner@example.com" });
    const otherUserId = await ctx.db.insert("users", { email: "other@example.com" });
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
    const otherCustomerId = await ctx.db.insert("customers", {
      userId: otherUserId,
      email: "other@example.com",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const ownerProfileId = await ctx.db.insert("profiles", {
      ownerId: ownerCustomerId,
      slug: "owner",
      status: "published",
      draft: content("owner", "Owner"),
      published: { ...content("owner", "Owner"), publishedAt: 1 },
      createdAt: 1,
      updatedAt: 1,
      publishedAt: 1,
    });
    const otherProfileId = await ctx.db.insert("profiles", {
      ownerId: otherCustomerId,
      slug: "other",
      status: "published",
      draft: content("other", "Other"),
      published: { ...content("other", "Other"), publishedAt: 1 },
      createdAt: 1,
      updatedAt: 1,
      publishedAt: 1,
    });
    await ctx.db.patch(ownerCustomerId, { profileId: ownerProfileId });
    await ctx.db.patch(otherCustomerId, { profileId: otherProfileId });
    return {
      adminUserId,
      ownerUserId,
      otherUserId,
      adminCustomerId,
      ownerCustomerId,
      otherCustomerId,
      ownerProfileId,
      otherProfileId,
    };
  });
}

describe("Convex links, cards, analytics, and admin operations", () => {
  it("validates owned link drafts and enforces the card lifecycle", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const other = t.withIdentity(identity(data.otherUserId));
    const admin = t.withIdentity(identity(data.adminUserId));

    await expect(
      other.query(api.links.listForProfile, { profileId: data.ownerProfileId }),
    ).rejects.toThrow("Profile access denied.");
    await expect(
      owner.mutation(api.links.replaceDraft, {
        profileId: data.ownerProfileId,
        links: [
          {
            id: "one",
            label: "One",
            destination: "https://example.com",
            enabled: true,
          },
          {
            id: "two",
            label: "Two",
            destination: "HTTPS://EXAMPLE.COM",
            enabled: true,
          },
        ],
      }),
    ).rejects.toThrow("Duplicate link destinations are not allowed.");
    await expect(
      owner.mutation(api.links.replaceDraft, {
        profileId: data.ownerProfileId,
        links: [
          {
            id: "unsafe",
            label: "Unsafe",
            destination: "javascript:alert(1)",
            enabled: true,
          },
        ],
      }),
    ).rejects.toThrow("safe destination");

    await owner.mutation(api.links.replaceDraft, {
      profileId: data.ownerProfileId,
      links: [
        {
          id: "website",
          label: "Website",
          destination: "https://example.com",
          enabled: true,
        },
        {
          id: "email",
          label: "Email",
          destination: "mailto:hello@example.com",
          enabled: true,
        },
      ],
    });
    await expect(
      owner.query(api.links.listForProfile, { profileId: data.ownerProfileId }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Website", position: 0 }),
        expect.objectContaining({ label: "Email", position: 1 }),
      ]),
    );
    await expect(owner.query(api.profiles.mine, {})).resolves.toMatchObject({
      draft: { links: [{ id: "website" }, { id: "email" }] },
      published: { links: [{ id: "owner-link" }] },
    });

    await expect(
      owner.mutation(api.cards.register, {
        cardUrl: "https://tapit.test/c/not-admin",
        token: "not-admin",
      }),
    ).rejects.toThrow("Administrator permission required.");
    const cardId = await admin.mutation(api.cards.register, {
      cardUrl: "https://tapit.test/c/owned-card",
      token: "owned-card",
    });
    await expect(
      owner.mutation(api.cards.assign, {
        cardId,
        profileId: data.ownerProfileId,
      }),
    ).rejects.toThrow("Administrator permission required.");
    await expect(
      admin.mutation(api.cards.assign, {
        cardId,
        profileId: data.ownerProfileId,
      }),
    ).resolves.toEqual({ status: "active" });
    await expect(t.query(api.cards.resolve, { token: "owned-card" })).resolves.toMatchObject({
      status: "active",
      profile: { slug: "owner", links: [{ id: "owner-link" }] },
    });

    const replacementId = await admin.mutation(api.cards.replace, {
      oldCardId: cardId,
      newCardUrl: "https://tapit.test/c/replacement-card",
      newToken: "replacement-card",
    });
    await expect(t.query(api.cards.resolve, { token: "owned-card" })).resolves.toEqual({
      status: "inactive",
    });
    await expect(t.query(api.cards.resolve, { token: "replacement-card" })).resolves.toMatchObject({
      status: "active",
      profile: { slug: "owner" },
    });
    const secondReplacementId = await admin.mutation(api.cards.replace, {
      oldCardId: replacementId,
      newCardUrl: "https://tapit.test/c/replacement-card-two",
      newToken: "replacement-card-two",
    });
    const thirdReplacementId = await admin.mutation(api.cards.replace, {
      oldCardId: secondReplacementId,
      newCardUrl: "https://tapit.test/c/replacement-card-three",
      newToken: "replacement-card-three",
    });
    await admin.mutation(api.cards.deactivate, { cardId: thirdReplacementId });
    await expect(t.query(api.cards.resolve, { token: "replacement-card-three" })).resolves.toEqual({
      status: "inactive",
    });
    const reusableCardId = await admin.mutation(api.cards.register, {
      cardUrl: "https://tapit.test/c/reusable-card",
      token: "reusable-card",
    });
    await expect(
      admin.mutation(api.cards.assign, {
        cardId: reusableCardId,
        profileId: data.ownerProfileId,
      }),
    ).resolves.toEqual({ status: "active" });
  });

  it("scopes analytics and protects admin settings, audits, and deletion workflows", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const other = t.withIdentity(identity(data.otherUserId));
    const admin = t.withIdentity(identity(data.adminUserId));

    await t.run(async (ctx) => {
      await ctx.db.insert("analytics", {
        profileId: data.ownerProfileId,
        eventType: "profile_view",
        bucketStart: 1,
        total: 4,
        uniqueCount: 3,
      });
    });

    await t.mutation(api.analytics.recordView, { profileId: data.ownerProfileId });
    await t.mutation(api.analytics.recordView, {
      profileId: data.ownerProfileId,
      sessionKey: "remaining-operations-viewer",
    });
    await t.mutation(api.analytics.recordLinkClick, {
      profileId: data.ownerProfileId,
      linkKey: "owner-link",
    });
    await t.mutation(api.analytics.recordLinkClick, {
      profileId: data.ownerProfileId,
      linkKey: "missing-link",
    });

    const now = Date.now();
    await expect(
      owner.query(api.analytics.mine, { range: "lifetime", now }),
    ).resolves.toMatchObject({
      views: 6,
      uniqueViews: 4,
      clicks: 1,
      linkClicks: { "owner-link": 1 },
    });
    await expect(owner.query(api.analytics.mine, { range: "7d", now })).resolves.toMatchObject({
      views: 2,
      uniqueViews: 1,
      clicks: 1,
    });
    await expect(other.query(api.analytics.mine, { range: "lifetime", now })).resolves.toEqual({
      views: 0,
      uniqueViews: 0,
      clicks: 0,
      linkClicks: {},
      isComplete: true,
      continueCursor: null,
    });
    await expect(other.query(api.analytics.all, { range: "lifetime", now })).rejects.toThrow(
      "Administrator permission required.",
    );
    await expect(admin.query(api.analytics.all, { range: "lifetime", now })).resolves.toMatchObject(
      {
        views: 6,
        clicks: 1,
      },
    );
    await expect(
      owner.query(api.analytics.minePage, {
        range: "lifetime",
        now,
        paginationOpts: { numItems: 50, cursor: null },
      }),
    ).resolves.toMatchObject({
      page: expect.arrayContaining([
        expect.objectContaining({ eventType: "profile_view" }),
        expect.objectContaining({ eventType: "link_click", linkKey: "owner-link" }),
      ]),
      isDone: true,
    });

    await expect(owner.query(api.settings.support, {})).resolves.toBe(
      "mailto:support@example.test",
    );
    await expect(
      owner.mutation(api.settings.setSupport, { value: "https://support.example.test" }),
    ).rejects.toThrow("Administrator permission required.");
    await expect(
      admin.mutation(api.settings.setSupport, { value: "https://support.example.test" }),
    ).resolves.toEqual({ value: "https://support.example.test" });
    await expect(owner.query(api.settings.support, {})).resolves.toBe(
      "https://support.example.test",
    );

    await expect(admin.query(api.customers.list, { search: "owner" })).resolves.toEqual([
      expect.objectContaining({ email: "owner@example.com" }),
    ]);
    await expect(owner.query(api.customers.list, {})).rejects.toThrow(
      "Administrator permission required.",
    );
    await expect(owner.query(api.audit.list, {})).rejects.toThrow(
      "Administrator permission required.",
    );
    await expect(admin.query(api.audit.list, {})).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "settings.support_updated" })]),
    );

    const deletion = await owner.mutation(api.customers.requestDeletion, {});
    await expect(admin.query(api.customers.listDeletionRequests, {})).resolves.toEqual([
      expect.objectContaining({
        request: expect.objectContaining({ _id: deletion.requestId, status: "requested" }),
        customer: expect.objectContaining({
          email: "owner@example.com",
          deletionStatus: "requested",
        }),
      }),
    ]);
    await expect(
      admin.mutation(api.customers.approveDeletion, { requestId: deletion.requestId }),
    ).resolves.toEqual({ status: "deleted" });
    await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.toBeNull();
  });
});
