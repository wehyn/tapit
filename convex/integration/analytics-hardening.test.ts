/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { PaginationResult } from "convex/server";
import { describe, expect, it } from "vitest";

import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");

const identity = (userId: Id<"users">) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "owner@example.com" });
    const customerId = await ctx.db.insert("customers", {
      userId,
      email: "owner@example.com",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const profileId = await ctx.db.insert("profiles", {
      ownerId: customerId,
      slug: "owner",
      status: "published",
      draft: {
        name: "Owner",
        slug: "owner",
        links: [{ id: "site", label: "Site", destination: "https://example.com", enabled: true }],
      },
      published: {
        name: "Owner",
        slug: "owner",
        links: [{ id: "site", label: "Site", destination: "https://example.com", enabled: true }],
        publishedAt: 1,
      },
      createdAt: 1,
      updatedAt: 1,
      publishedAt: 1,
    });
    await ctx.db.patch(customerId, { profileId });
    const unpublishedId = await ctx.db.insert("profiles", {
      ownerId: customerId,
      slug: "unpublished",
      status: "unpublished",
      draft: { name: "Unpublished", slug: "unpublished", links: [] },
      createdAt: 1,
      updatedAt: 1,
    });
    const deletedId = await ctx.db.insert("profiles", {
      ownerId: customerId,
      slug: "deleted",
      status: "draft",
      draft: { name: "Deleted", slug: "deleted", links: [] },
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.delete(deletedId);
    return { userId, profileId, unpublishedId, deletedId };
  });
}

describe("analytics hardening", () => {
  it("deduplicates repeated browser sessions on the server and preserves anonymous totals", async () => {
    const t = convexTest(schema, modules);
    const { profileId, userId } = await seed(t);
    const owner = t.withIdentity(identity(userId));

    await t.mutation(api.analytics.recordView, { profileId, sessionKey: "browser-a" });
    await t.mutation(api.analytics.recordView, { profileId, sessionKey: "browser-a" });
    await t.mutation(api.analytics.recordView, { profileId, sessionKey: "browser-b" });
    await t.mutation(api.analytics.recordView, { profileId });

    const result = await owner.query(api.analytics.mine, { range: "lifetime", now: Date.now() });
    expect(result).toMatchObject({ views: 4, uniqueViews: 2 });
  });

  it("does not record invalid or unpublished profiles and updates each link bucket independently", async () => {
    const t = convexTest(schema, modules);
    const { profileId, unpublishedId, deletedId, userId } = await seed(t);
    const owner = t.withIdentity(identity(userId));

    await t.mutation(api.analytics.recordView, { profileId: unpublishedId, sessionKey: "hidden" });
    await t.mutation(api.analytics.recordView, {
      profileId: deletedId,
      sessionKey: "invalid",
    });
    await t.mutation(api.analytics.recordLinkClick, { profileId, linkKey: "site" });
    await t.mutation(api.analytics.recordLinkClick, { profileId, linkKey: "site" });
    await t.mutation(api.analytics.recordLinkClick, { profileId, linkKey: "missing" });

    await expect(
      owner.query(api.analytics.mine, { range: "lifetime", now: Date.now() }),
    ).resolves.toMatchObject({
      views: 0,
      clicks: 2,
      linkClicks: { site: 2 },
    });
  });

  it("uses an inclusive lower boundary for range summaries", async () => {
    const t = convexTest(schema, modules);
    const { profileId, userId } = await seed(t);
    const owner = t.withIdentity(identity(userId));
    const now = 1_000 * 24 * 60 * 60 * 1000;
    const boundary = now - 7 * 24 * 60 * 60 * 1000;

    await t.run(async (ctx) => {
      await ctx.db.insert("analytics", {
        profileId,
        eventType: "profile_view",
        bucketStart: boundary,
        total: 3,
        uniqueCount: 1,
      });
      await ctx.db.insert("analytics", {
        profileId,
        eventType: "profile_view",
        bucketStart: boundary - 1,
        total: 9,
        uniqueCount: 9,
      });
    });

    await expect(owner.query(api.analytics.mine, { range: "7d", now })).resolves.toMatchObject({
      views: 3,
      uniqueViews: 1,
    });
  });

  it("accumulates beyond the former 1000-row lifetime cap", async () => {
    const t = convexTest(schema, modules);
    const { profileId, userId } = await seed(t);
    const owner = t.withIdentity(identity(userId));
    await t.run(async (ctx) => {
      for (let index = 0; index < 1001; index += 1) {
        await ctx.db.insert("analytics", {
          profileId,
          eventType: "profile_view",
          bucketStart: index + 1,
          total: 1,
          uniqueCount: 0,
        });
      }
    });

    let cursor: string | null = null;
    let views = 0;
    let isDone = false;
    while (!isDone) {
      const page: PaginationResult<Doc<"analytics">> = await owner.query(api.analytics.minePage, {
        range: "lifetime",
        now: Date.now(),
        paginationOpts: { numItems: 500, cursor },
      });
      views += page.page.reduce((total, row) => total + row.total, 0);
      isDone = page.isDone;
      cursor = page.continueCursor;
    }
    expect(views).toBe(1001);
  });
});
