import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { customerForAuthUser, isActiveCustomer, requireAdministrator, sameScope } from "./admin";
import { digest } from "./cards";

const unavailable = () => new Error("Correction request unavailable.");

export const requestCorrection = mutation({
  args: { token: v.string(), challenge: v.string() },
  returns: v.id("cardCorrectionRequests"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentication required.");
    const requester = await customerForAuthUser(ctx, userId);
    if (!requester || !isActiveCustomer(requester) || requester.role !== "customer")
      throw unavailable();
    const challengeHash = await digest(args.challenge);
    const challenge = await ctx.db
      .query("cardClaimChallenges")
      .withIndex("by_challengeHash", (q) => q.eq("challengeHash", challengeHash))
      .unique();
    const now = Date.now();
    if (
      !challenge ||
      challenge.userId !== userId ||
      challenge.usedAt !== undefined ||
      challenge.expiresAt <= now
    )
      throw unavailable();
    const card = await ctx.db.get(challenge.cardId);
    if (
      !card ||
      card.token !== args.token ||
      (card.status !== "active" && card.status !== "claimable") ||
      card.claimCodeHash !== challenge.claimCodeHash ||
      card.claimCodeInvalidatedAt !== undefined ||
      card.claimCodeClaimedAt !== undefined ||
      card.correctionRequestedAt !== undefined ||
      !sameScope(requester, card)
    )
      throw unavailable();
    const profile =
      requester.profileId === undefined ? null : await ctx.db.get(requester.profileId);
    if (!profile || profile.ownerId !== requester._id || !sameScope(requester, profile))
      throw unavailable();
    const open = await ctx.db
      .query("cardCorrectionRequests")
      .withIndex("by_cardId_and_status", (q) => q.eq("cardId", card._id).eq("status", "open"))
      .first();
    if (open) throw unavailable();
    await ctx.db.patch(challenge._id, { usedAt: now });
    await ctx.db.patch(card._id, { correctionRequestedAt: now, updatedAt: now });
    return await ctx.db.insert("cardCorrectionRequests", {
      scope: card.scope,
      cardId: card._id,
      requesterId: requester._id,
      profileId: profile._id,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const adminList = query({
  args: {},
  returns: v.array(
    v.object({
      requestId: v.id("cardCorrectionRequests"),
      cardId: v.id("cards"),
      cardUrl: v.string(),
      token: v.string(),
      requesterProfileId: v.id("profiles"),
      requesterProfileName: v.string(),
      requesterProfileSlug: v.string(),
      currentProfileId: v.union(v.id("profiles"), v.null()),
      currentProfileName: v.union(v.string(), v.null()),
      currentProfileSlug: v.union(v.string(), v.null()),
      requestedAt: v.number(),
      hasLiveCardConflict: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const { account } = await requireAdministrator(ctx);
    const requests = await ctx.db
      .query("cardCorrectionRequests")
      .withIndex("by_scope_and_status", (q) => q.eq("scope", account.scope).eq("status", "open"))
      .take(100);
    const result = [];
    for (const request of requests) {
      const card = await ctx.db.get(request.cardId);
      const requester = await ctx.db.get(request.requesterId);
      const profile = await ctx.db.get(request.profileId);
      if (
        !card ||
        !requester ||
        !profile ||
        !sameScope(account, card) ||
        !sameScope(account, requester) ||
        !sameScope(account, profile)
      )
        continue;
      const currentProfile = card.profileId === undefined ? null : await ctx.db.get(card.profileId);
      const live = await ctx.db
        .query("cards")
        .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
        .take(100);
      result.push({
        requestId: request._id,
        cardId: card._id,
        cardUrl: card.cardUrl,
        token: card.token,
        requesterProfileId: profile._id,
        requesterProfileName: profile.draft.name,
        requesterProfileSlug: profile.slug,
        currentProfileId: card.profileId ?? null,
        currentProfileName: currentProfile?.draft.name ?? null,
        currentProfileSlug: currentProfile?.slug ?? null,
        requestedAt: request.createdAt,
        hasLiveCardConflict: live.some(
          (existing) =>
            existing._id !== card._id &&
            (existing.status === "active" || existing.status === "claimable"),
        ),
      });
    }
    return result;
  },
});

export const correctAssignment = mutation({
  args: { requestId: v.id("cardCorrectionRequests") },
  returns: v.object({ status: v.literal("corrected") }),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status !== "open" || !sameScope(account, request))
      throw new Error("Correction request not found.");
    const [card, requester, profile] = await Promise.all([
      ctx.db.get(request.cardId),
      ctx.db.get(request.requesterId),
      ctx.db.get(request.profileId),
    ]);
    if (
      !card ||
      !requester ||
      !profile ||
      !sameScope(account, card) ||
      !sameScope(account, requester) ||
      !sameScope(account, profile) ||
      profile.ownerId !== requester._id ||
      requester.profileId !== profile._id ||
      card.correctionRequestedAt === undefined ||
      (card.status !== "active" && card.status !== "claimable") ||
      card.claimCodeInvalidatedAt !== undefined ||
      card.claimCodeClaimedAt !== undefined
    )
      throw new Error("Correction request is no longer valid.");
    const [active, claimable] = await Promise.all([
      ctx.db
        .query("cards")
        .withIndex("by_profileId_and_status", (q) =>
          q.eq("profileId", profile._id).eq("status", "active"),
        )
        .take(1),
      ctx.db
        .query("cards")
        .withIndex("by_profileId_and_status", (q) =>
          q.eq("profileId", profile._id).eq("status", "claimable"),
        )
        .take(1),
    ]);
    if (
      active.some((existing) => existing._id !== card._id) ||
      claimable.some((existing) => existing._id !== card._id)
    )
      throw new Error("Requester profile already has an active or claimable card.");
    const now = Date.now();
    await ctx.db.patch(card._id, {
      profileId: profile._id,
      status: profile.status === "published" ? "active" : "claimable",
      correctionRequestedAt: undefined,
      assignedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(request._id, {
      status: "corrected",
      resolvedAt: now,
      resolvedByUserId: userId,
      resolvedProfileId: profile._id,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card.assignment_corrected",
      cardId: card._id,
      profileId: profile._id,
      accountId: requester._id,
      occurredAt: now,
      before: "correction_requested",
      after: profile.status === "published" ? "active" : "claimable",
    });
    return { status: "corrected" as const };
  },
});
