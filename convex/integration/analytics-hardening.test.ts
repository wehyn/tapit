/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import type { PaginationResult } from "convex/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");
const testHmacSecret = "test-only-hmac-secret-with-at-least-32-characters";
let previousHmacSecret: string | undefined;

beforeEach(() => {
  previousHmacSecret = process.env.TAPIT_ANALYTICS_RATE_LIMIT_HMAC_SECRET;
  process.env.TAPIT_ANALYTICS_RATE_LIMIT_HMAC_SECRET = testHmacSecret;
});

afterEach(() => {
  if (previousHmacSecret === undefined) delete process.env.TAPIT_ANALYTICS_RATE_LIMIT_HMAC_SECRET;
  else process.env.TAPIT_ANALYTICS_RATE_LIMIT_HMAC_SECRET = previousHmacSecret;
});

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
  it("uses a keyed digest for network addresses and fails closed without a secret", async () => {
    const { networkAddressRateLimitKey } = await import("../analytics");
    const keyed = await networkAddressRateLimitKey("203.0.113.7", testHmacSecret);
    const plain = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("tapit-analytics-rate-limit:v1:203.0.113.7"),
    );
    expect(keyed).not.toBe(
      Array.from(new Uint8Array(plain), (byte) => byte.toString(16).padStart(2, "0")).join(""),
    );
    expect(keyed).toBe(await networkAddressRateLimitKey("203.0.113.7", testHmacSecret));
    expect(await networkAddressRateLimitKey("203.0.113.7", "short")).toBeNull();
    expect(await networkAddressRateLimitKey("203.0.113.7", undefined)).toBeNull();
  });

  it("does not record public events when the deployment HMAC key is missing or weak", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const { profileId, userId } = await seed(t);
    const owner = t.withIdentity(identity(userId));
    delete process.env.TAPIT_ANALYTICS_RATE_LIMIT_HMAC_SECRET;

    await expect(
      t.mutation(api.analytics.recordView, { profileId, sessionKey: "missing-key" }),
    ).resolves.toBeNull();
    process.env.TAPIT_ANALYTICS_RATE_LIMIT_HMAC_SECRET = "short";
    await expect(
      t.mutation(api.analytics.recordLinkClick, { profileId, linkKey: "site" }),
    ).resolves.toBeNull();

    const result = await owner.query(api.analytics.mine, { range: "lifetime", now: Date.now() });
    const stored = await t.run(async (ctx) => ({
      analytics: await ctx.db
        .query("analytics")
        .withIndex("by_profile_bucket", (query) => query.eq("profileId", profileId))
        .take(10),
      rateLimitKeys: await ctx.db
        .query("analyticsRateLimitKeys")
        .withIndex("by_profileId", (query) => query.eq("profileId", profileId))
        .take(10),
    }));
    expect(result).toMatchObject({ views: 0, clicks: 0 });
    expect(stored.analytics).toHaveLength(0);
    expect(stored.rateLimitKeys).toHaveLength(0);
  });

  it("deduplicates repeated browser sessions on the server and preserves anonymous totals", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const { profileId, userId } = await seed(t);
    const owner = t.withIdentity(identity(userId));

    await t.mutation(api.analytics.recordView, { profileId, sessionKey: "browser-a" });
    await t.mutation(api.analytics.recordView, { profileId, sessionKey: "browser-a" });
    await t.mutation(api.analytics.recordView, { profileId, sessionKey: "browser-b" });
    await t.mutation(api.analytics.recordView, { profileId });

    const result = await owner.query(api.analytics.mine, { range: "lifetime", now: Date.now() });
    expect(result).toMatchObject({ views: 4, uniqueViews: 2 });
  });

  it("limits rapid anonymous view and click bursts when callers rotate supplied values", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const { profileId, userId } = await seed(t);
    const owner = t.withIdentity(identity(userId));

    for (let index = 0; index < 2501; index += 1) {
      await t.mutation(api.analytics.recordView, {
        profileId,
        sessionKey: `rotating-session-${index}`,
      });
    }
    for (let index = 0; index < 2501; index += 1) {
      await t.mutation(api.analytics.recordLinkClick, {
        profileId,
        linkKey: "site",
        source: index % 2 === 0 ? "direct" : "qr",
      });
    }

    const result = await owner.query(api.analytics.mine, { range: "lifetime", now: Date.now() });
    expect(result.views).toBeGreaterThanOrEqual(2000);
    expect(result.views).toBeLessThan(2100);
    expect(result.uniqueViews).toBe(result.views);
    expect(result.clicks).toBeGreaterThanOrEqual(2000);
    expect(result.clicks).toBeLessThan(2100);
    expect(result.linkClicks).toEqual({ site: result.clicks });
  }, 30_000);

  it("does not record invalid or unpublished profiles and updates each link bucket independently", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const { profileId, unpublishedId, deletedId, userId } = await seed(t);
    const owner = t.withIdentity(identity(userId));

    await t.mutation(api.analytics.recordView, { profileId: unpublishedId, sessionKey: "hidden" });
    await t.mutation(api.analytics.recordView, {
      profileId: deletedId,
      sessionKey: "invalid",
    });
    await t.mutation(api.analytics.recordLinkClick, { profileId, linkKey: "site" });
    await t.mutation(api.analytics.recordLinkClick, { profileId, linkKey: "site" });
    await t.mutation(api.analytics.recordLinkClick, {
      profileId,
      linkKey: "site",
      source: "qr",
    });
    await t.mutation(api.analytics.recordLinkClick, { profileId, linkKey: "missing" });

    await expect(
      owner.query(api.analytics.mine, { range: "lifetime", now: Date.now() }),
    ).resolves.toMatchObject({
      views: 0,
      clicks: 3,
      linkClicks: { site: 3 },
    });
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("analytics")
            .withIndex("by_profile_event_bucket", (query) =>
              query.eq("profileId", profileId).eq("eventType", "link_click"),
            )
            .collect(),
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "unknown", total: 2, linkKey: "site" }),
        expect.objectContaining({ source: "qr", total: 1, linkKey: "site" }),
      ]),
    );
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

  it("coalesces legacy rows without a source into unknown attribution", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const { profileId } = await seed(t);
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    const bucketStart = date.getTime();
    await t.run(async (ctx) => {
      await ctx.db.insert("analytics", {
        profileId,
        eventType: "profile_view",
        bucketStart,
        total: 4,
        uniqueCount: 2,
      });
      await ctx.db.insert("analytics", {
        profileId,
        eventType: "link_click",
        linkKey: "site",
        bucketStart,
        total: 1,
        uniqueCount: 0,
      });
    });

    await t.mutation(api.analytics.recordView, { profileId });
    await t.mutation(api.analytics.recordLinkClick, { profileId, linkKey: "site" });
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("analytics")
            .withIndex("by_profile_bucket", (query) => query.eq("profileId", profileId))
            .collect(),
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "profile_view", source: "unknown", total: 5 }),
        expect.objectContaining({ eventType: "link_click", source: "unknown", total: 2 }),
      ]),
    );
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
