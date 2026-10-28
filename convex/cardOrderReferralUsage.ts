import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const PAGE_SIZE = 100;
const BACKFILL_KEY = "cardOrderReferralUsageBackfillStarted";
const OFFER_BACKFILL_KEY = "cardOrderOfferUsageBackfillStarted";
const FOUNDING_OFFER = "FOUNDING";
const FOUNDING_CODE_USAGE_LIMIT = 25;

export const backfillUsageCounts = internalMutation({
  args: { scope: v.optional(v.literal("demo")), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const query = ctx.db.query("cardOrders");
    const page = await query
      .withIndex("by_scope_and_createdAt", (q) => q.eq("scope", args.scope))
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor });

    if (args.cursor === null) {
      const foundingOffer = await ctx.db
        .query("cardOrderOffers")
        .withIndex("by_scope_and_code", (q) => q.eq("scope", args.scope).eq("code", FOUNDING_OFFER))
        .first();
      if (foundingOffer !== null) {
        for (const code of ["FOUNDING", "FOUNDING-AHRON"]) {
          const alias = await ctx.db
            .query("cardOrderReferralCodes")
            .withIndex("by_scope_and_code", (q) => q.eq("scope", args.scope).eq("code", code))
            .first();
          if (
            alias?.code === "FOUNDING" &&
            (alias.offerId !== foundingOffer._id ||
              alias.referrerCode !== undefined ||
              alias.referrerLabel !== undefined)
          )
            await ctx.db.patch(alias._id, {
              offerId: foundingOffer._id,
              referrerCode: undefined,
              referrerLabel: undefined,
            });
          else if (
            alias?.code === "FOUNDING-AHRON" &&
            (alias.offerId !== foundingOffer._id ||
              alias.referrerCode !== "AHRON" ||
              alias.referrerLabel === undefined)
          )
            await ctx.db.patch(alias._id, {
              offerId: foundingOffer._id,
              referrerCode: "AHRON",
              referrerLabel: alias.referrerLabel ?? "Ahron",
            });
        }
      }
    }

    for (const order of page.page) {
      const linkedReferral =
        order.referralCodeId === undefined ? null : await ctx.db.get(order.referralCodeId);
      const referral = linkedReferral?.scope === order.scope ? linkedReferral : null;
      const historicalCode = order.referralSnapshot?.code ?? referral?.code;
      const foundingAlias = historicalCode === "FOUNDING" || historicalCode === "FOUNDING-AHRON";
      const foundingOffer = foundingAlias
        ? await ctx.db
            .query("cardOrderOffers")
            .withIndex("by_scope_and_code", (q) =>
              q.eq("scope", args.scope).eq("code", FOUNDING_OFFER),
            )
            .first()
        : null;
      const offer = foundingAlias
        ? foundingOffer
        : order.offerId === undefined
          ? null
          : await ctx.db.get(order.offerId);
      const scopedOffer = offer?.scope === order.scope ? offer : null;
      if (referral !== null && order.usageCounted !== true) {
        await ctx.db.patch(referral._id, { usageCount: (referral.usageCount ?? 0) + 1 });
        await ctx.db.patch(order._id, { usageCounted: true });
      }
      if (
        scopedOffer !== null &&
        order.offerUsageCounted === true &&
        order.offerId !== undefined &&
        order.offerId !== scopedOffer._id
      ) {
        const previousOffer = await ctx.db.get(order.offerId);
        if (previousOffer !== null && previousOffer.scope === order.scope)
          await ctx.db.patch(previousOffer._id, {
            usageCount: Math.max(0, previousOffer.usageCount - 1),
          });
        await ctx.db.patch(scopedOffer._id, { usageCount: scopedOffer.usageCount + 1 });
        await ctx.db.patch(order._id, { offerId: scopedOffer._id });
      } else if (scopedOffer !== null && order.offerUsageCounted !== true) {
        await ctx.db.patch(scopedOffer._id, { usageCount: scopedOffer.usageCount + 1 });
        await ctx.db.patch(order._id, { offerId: scopedOffer._id, offerUsageCounted: true });
      }
    }

    const marker = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (q) => q.eq("scope", args.scope).eq("key", BACKFILL_KEY))
      .first();

    const offerMarker = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (q) => q.eq("scope", args.scope).eq("key", OFFER_BACKFILL_KEY))
      .first();

    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.cardOrderReferralUsage.backfillUsageCounts, {
        ...(args.scope === undefined ? {} : { scope: args.scope }),
        cursor: page.continueCursor,
      });
    else {
      if (marker !== null && marker.value !== "completed") {
        await ctx.db.patch(marker._id, { value: "completed", updatedAt: Date.now() });
      }
      if (offerMarker !== null && offerMarker.value !== "completed") {
        const foundingOffer = await ctx.db
          .query("cardOrderOffers")
          .withIndex("by_scope_and_code", (q) =>
            q.eq("scope", args.scope).eq("code", FOUNDING_OFFER),
          )
          .first();
        if (foundingOffer?.usageCount === 5) {
          await ctx.db.patch(foundingOffer._id, { usageLimit: FOUNDING_CODE_USAGE_LIMIT });
          await ctx.db.patch(offerMarker._id, { value: "completed", updatedAt: Date.now() });
        } else {
          await ctx.db.patch(offerMarker._id, {
            value: `error:FOUNDING expected 5 historical uses; found ${foundingOffer?.usageCount ?? 0}. Review aliases/orders, then restart backfill.`,
            updatedAt: Date.now(),
          });
        }
      }
    }
    if (!page.isDone && marker !== null && marker.value !== "completed")
      await ctx.db.patch(marker._id, { updatedAt: Date.now() });
    if (!page.isDone && offerMarker !== null && offerMarker.value !== "completed")
      await ctx.db.patch(offerMarker._id, { updatedAt: Date.now() });
    return null;
  },
});
