import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { isActiveCustomer, requireAdministrator, requireUser } from "./admin";

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

function cutoffForRange(range: "lifetime" | "7d" | "30d" | "90d"): number {
  if (range === "lifetime") return 0;
  return Date.now() - Number(range.slice(0, -1)) * 24 * 60 * 60 * 1000;
}

export const recordView = mutation({
  args: { profileId: v.id("profiles"), unique: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    const owner = profile === null ? null : await ctx.db.get(profile.ownerId);
    if (profile === null || !isActiveCustomer(owner) || profile.status !== "published") return;
    const start = bucketStart();
    const buckets = await ctx.db
      .query("analytics")
      .withIndex("by_profile_bucket", (query) =>
        query.eq("profileId", args.profileId).eq("bucketStart", start),
      )
      .collect();
    const existing = buckets.find((bucket) => bucket.eventType === "profile_view");
    if (existing === undefined) {
      await ctx.db.insert("analytics", {
        profileId: args.profileId,
        eventType: "profile_view",
        bucketStart: start,
        total: 1,
        uniqueCount: args.unique === true ? 1 : 0,
      });
    } else {
      await ctx.db.patch(existing._id, {
        total: existing.total + 1,
        uniqueCount: existing.uniqueCount + (args.unique === true ? 1 : 0),
      });
    }
  },
});

export const recordLinkClick = mutation({
  args: { profileId: v.id("profiles"), linkId: v.id("links") },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    const link = await ctx.db.get(args.linkId);
    const owner = profile === null ? null : await ctx.db.get(profile.ownerId);
    if (
      profile === null ||
      link === null ||
      !isActiveCustomer(owner) ||
      link.profileId !== profile._id ||
      profile.status !== "published" ||
      !link.enabled
    )
      return;
    const start = bucketStart();
    const buckets = await ctx.db
      .query("analytics")
      .withIndex("by_profile_bucket", (query) =>
        query.eq("profileId", args.profileId).eq("bucketStart", start),
      )
      .collect();
    const existing = buckets.find(
      (bucket) => bucket.eventType === "link_click" && bucket.linkId === args.linkId,
    );
    if (existing === undefined)
      await ctx.db.insert("analytics", {
        profileId: args.profileId,
        linkId: args.linkId,
        eventType: "link_click",
        bucketStart: start,
        total: 1,
        uniqueCount: 0,
      });
    else await ctx.db.patch(existing._id, { total: existing.total + 1 });
  },
});

function summarize(
  rows: Array<{
    eventType: "profile_view" | "link_click";
    linkId?: string;
    total: number;
    uniqueCount: number;
  }>,
) {
  return rows.reduce(
    (summary, row) => {
      if (row.eventType === "profile_view") {
        summary.views += row.total;
        summary.uniqueViews += row.uniqueCount;
      } else {
        summary.clicks += row.total;
        if (row.linkId !== undefined)
          summary.linkClicks[row.linkId] = (summary.linkClicks[row.linkId] ?? 0) + row.total;
      }
      return summary;
    },
    { views: 0, uniqueViews: 0, clicks: 0, linkClicks: {} as Record<string, number> },
  );
}

export const mine = query({
  args: { range: rangeValidator },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const account = await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();
    if (account === null || !isActiveCustomer(account) || account.profileId === undefined)
      return { views: 0, uniqueViews: 0, clicks: 0, linkClicks: {} };
    const rows = await ctx.db
      .query("analytics")
      .withIndex("by_profile_bucket", (query) => query.eq("profileId", account.profileId!))
      .collect();
    return summarize(rows.filter((row) => row.bucketStart >= cutoffForRange(args.range)));
  },
});

export const all = query({
  args: { range: rangeValidator },
  handler: async (ctx, args) => {
    await requireAdministrator(ctx);
    const rows = await ctx.db.query("analytics").collect();
    return summarize(rows.filter((row) => row.bucketStart >= cutoffForRange(args.range)));
  },
});
