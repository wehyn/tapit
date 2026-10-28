import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const PAGE_SIZE = 100;
const BACKFILL_KEY = "cardOrderReferralUsageBackfillStarted";
const FOUNDING_CODE = "FOUNDING-AHRON";
const FOUNDING_CODE_USAGE_LIMIT = 25;

export const backfillUsageCounts = internalMutation({
  args: { scope: v.optional(v.literal("demo")), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const query = ctx.db.query("cardOrders");
    const page = await (
      args.scope === undefined
        ? query.withIndex("by_scope_and_createdAt")
        : query.withIndex("by_scope_and_createdAt", (q) => q.eq("scope", args.scope))
    ).paginate({ numItems: PAGE_SIZE, cursor: args.cursor });

    for (const order of page.page) {
      if (order.referralCodeId === undefined || order.usageCounted === true) continue;
      const referral = await ctx.db.get(order.referralCodeId);
      if (referral !== null)
        await ctx.db.patch(referral._id, { usageCount: (referral.usageCount ?? 0) + 1 });
      await ctx.db.patch(order._id, { usageCounted: true });
    }

    const marker = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (q) => q.eq("scope", args.scope).eq("key", BACKFILL_KEY))
      .first();

    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.cardOrderReferralUsage.backfillUsageCounts, {
        ...(args.scope === undefined ? {} : { scope: args.scope }),
        cursor: page.continueCursor,
      });
    else {
      if (marker !== null && marker.value !== "completed") {
        const foundingCode = await ctx.db
          .query("cardOrderReferralCodes")
          .withIndex("by_scope_and_code", (q) =>
            q.eq("scope", args.scope).eq("code", FOUNDING_CODE),
          )
          .first();
        if (foundingCode !== null && foundingCode.usageLimit === undefined)
          await ctx.db.patch(foundingCode._id, { usageLimit: FOUNDING_CODE_USAGE_LIMIT });
        await ctx.db.patch(marker._id, { value: "completed", updatedAt: Date.now() });
      }
    }
    if (!page.isDone && marker !== null && marker.value !== "completed")
      await ctx.db.patch(marker._id, { updatedAt: Date.now() });
    return null;
  },
});
