import { v } from "convex/values";
import { paginationResultValidator, paginationOptsValidator } from "convex/server";

import { mutation, query } from "./_generated/server";
import { isActiveCustomer, requireAdministrator, requireUser } from "./admin";
import schema from "./schema";
import { analyticsSourceValidator, MAX_PROFILE_LINKS } from "./validators";

const rangeValidator = v.union(
  v.literal("lifetime"),
  v.literal("7d"),
  v.literal("30d"),
  v.literal("90d"),
);

function bucketStart(): number {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

function cutoffForRange(range: "lifetime" | "7d" | "30d" | "90d", now: number): number {
  if (range === "lifetime") return 0;
  return now - Number(range.slice(0, -1)) * 24 * 60 * 60 * 1000;
}

export const recordView = mutation({
  args: {
    profileId: v.id("profiles"),
    sessionKey: v.optional(v.string()),
    source: v.optional(analyticsSourceValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    const owner = profile === null ? null : await ctx.db.get(profile.ownerId);
    if (profile === null || !isActiveCustomer(owner) || profile.status !== "published") return null;
    const start = bucketStart();
    const source = args.source ?? "unknown";
    const sessionKey = args.sessionKey?.trim();
    const hasSessionKey =
      sessionKey !== undefined && sessionKey.length > 0 && sessionKey.length <= 128;
    const session = hasSessionKey
      ? await ctx.db
          .query("analyticsSessions")
          .withIndex("by_profile_session", (query) =>
            query.eq("profileId", args.profileId).eq("sessionKey", sessionKey),
          )
          .unique()
      : null;
    const isUnique = hasSessionKey && session === null;
    if (isUnique) {
      await ctx.db.insert("analyticsSessions", {
        scope: profile.scope,
        profileId: args.profileId,
        sessionKey,
        firstSeenAt: start,
      });
    }
    let existing = await ctx.db
      .query("analytics")
      .withIndex("by_profile_event_bucket_source", (query) =>
        query
          .eq("profileId", args.profileId)
          .eq("eventType", "profile_view")
          .eq("bucketStart", start)
          .eq("source", source),
      )
      .unique();
    if (existing === null && source === "unknown") {
      const legacyRows = await ctx.db
        .query("analytics")
        .withIndex("by_profile_event_bucket", (query) =>
          query
            .eq("profileId", args.profileId)
            .eq("eventType", "profile_view")
            .eq("bucketStart", start),
        )
        .take(5);
      existing = legacyRows.find((row) => row.source === undefined) ?? null;
    }
    if (existing === null) {
      await ctx.db.insert("analytics", {
        scope: profile.scope,
        profileId: args.profileId,
        eventType: "profile_view",
        bucketStart: start,
        total: 1,
        uniqueCount: isUnique ? 1 : 0,
        source,
      });
    } else {
      await ctx.db.patch(existing._id, {
        total: existing.total + 1,
        uniqueCount: existing.uniqueCount + (isUnique ? 1 : 0),
        source,
      });
    }
    return null;
  },
});

export const recordLinkClick = mutation({
  args: {
    profileId: v.id("profiles"),
    linkKey: v.string(),
    source: v.optional(analyticsSourceValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    const owner = profile === null ? null : await ctx.db.get(profile.ownerId);
    if (
      profile === null ||
      !isActiveCustomer(owner) ||
      profile.status !== "published" ||
      profile.published === undefined ||
      !profile.published.links.some((link) => link.id === args.linkKey && link.enabled)
    )
      return null;
    const start = bucketStart();
    const source = args.source ?? "unknown";
    let existing = await ctx.db
      .query("analytics")
      .withIndex("by_profile_event_bucket_link_source", (query) =>
        query
          .eq("profileId", args.profileId)
          .eq("eventType", "link_click")
          .eq("bucketStart", start)
          .eq("linkKey", args.linkKey)
          .eq("source", source),
      )
      .unique();
    if (existing === null && source === "unknown") {
      const legacyRows = await ctx.db
        .query("analytics")
        .withIndex("by_profile_event_bucket", (query) =>
          query
            .eq("profileId", args.profileId)
            .eq("eventType", "link_click")
            .eq("bucketStart", start),
        )
        .take(MAX_PROFILE_LINKS + 1);
      existing =
        legacyRows.find((row) => row.linkKey === args.linkKey && row.source === undefined) ?? null;
    }
    if (existing === null)
      await ctx.db.insert("analytics", {
        scope: profile.scope,
        profileId: args.profileId,
        linkKey: args.linkKey,
        eventType: "link_click",
        bucketStart: start,
        total: 1,
        uniqueCount: 0,
        source,
      });
    else await ctx.db.patch(existing._id, { total: existing.total + 1, source });
    return null;
  },
});

const analyticsRowValidator = schema.doc("analytics");

const summaryPageValidator = v.object({
  views: v.number(),
  uniqueViews: v.number(),
  clicks: v.number(),
  linkClicks: v.record(v.string(), v.number()),
  isComplete: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
});

function summarize(
  rows: Array<{
    eventType: "profile_view" | "link_click";
    linkId?: string;
    linkKey?: string;
    total: number;
    uniqueCount: number;
    source?: "nfc" | "qr" | "direct" | "unknown";
  }>,
) {
  return rows.reduce(
    (summary, row) => {
      if (row.eventType === "profile_view") {
        summary.views += row.total;
        summary.uniqueViews += row.uniqueCount;
      } else {
        summary.clicks += row.total;
        const linkKey = row.linkKey ?? row.linkId;
        if (linkKey !== undefined)
          summary.linkClicks[linkKey] = (summary.linkClicks[linkKey] ?? 0) + row.total;
      }
      return summary;
    },
    {
      views: 0,
      uniqueViews: 0,
      clicks: 0,
      linkClicks: {} as Record<string, number>,
    },
  );
}

export const mine = query({
  args: { range: rangeValidator, now: v.number() },
  returns: summaryPageValidator,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const account = await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();
    if (account === null || !isActiveCustomer(account) || account.profileId === undefined)
      return {
        views: 0,
        uniqueViews: 0,
        clicks: 0,
        linkClicks: {},
        isComplete: true,
        continueCursor: null,
      };
    const cutoff = cutoffForRange(args.range, args.now);
    const page = await ctx.db
      .query("analytics")
      .withIndex("by_profile_bucket", (query) =>
        query.eq("profileId", account.profileId!).gte("bucketStart", cutoff),
      )
      .order("asc")
      .paginate({ numItems: 500, cursor: null });
    return {
      ...summarize(page.page),
      isComplete: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

export const all = query({
  args: { range: rangeValidator, now: v.number() },
  returns: summaryPageValidator,
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const cutoff = cutoffForRange(args.range, args.now);
    const page = await ctx.db
      .query("analytics")
      .withIndex("by_scope_and_bucketStart", (query) =>
        query.eq("scope", account.scope).gte("bucketStart", cutoff),
      )
      .order("asc")
      .paginate({ numItems: 500, cursor: null });
    return {
      ...summarize(page.page),
      isComplete: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

export const minePage = query({
  args: { range: rangeValidator, now: v.number(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(analyticsRowValidator),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const account = await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();
    if (account === null || !isActiveCustomer(account) || account.profileId === undefined)
      return { page: [], isDone: true, continueCursor: "" };
    return await ctx.db
      .query("analytics")
      .withIndex("by_profile_bucket", (query) =>
        query
          .eq("profileId", account.profileId!)
          .gte("bucketStart", cutoffForRange(args.range, args.now)),
      )
      .order("asc")
      .paginate(args.paginationOpts);
  },
});

export const allPage = query({
  args: { range: rangeValidator, now: v.number(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(analyticsRowValidator),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const page = await ctx.db
      .query("analytics")
      .withIndex("by_scope_and_bucketStart", (query) =>
        query.eq("scope", account.scope).gte("bucketStart", cutoffForRange(args.range, args.now)),
      )
      .order("asc")
      .paginate(args.paginationOpts);
    return page;
  },
});
