import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const PAGE_SIZE = 100;

export const backfillUsageCounts = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("cardOrders")
      .withIndex("by_scope_and_createdAt")
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor });

    for (const order of page.page) {
      if (order.referralCodeId === undefined || order.usageCounted === true) continue;
      const referral = await ctx.db.get(order.referralCodeId);
      if (referral !== null)
        await ctx.db.patch(referral._id, { usageCount: (referral.usageCount ?? 0) + 1 });
      await ctx.db.patch(order._id, { usageCounted: true });
    }

    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.cardOrderReferralUsage.backfillUsageCounts, {
        cursor: page.continueCursor,
      });
    return null;
  },
});
