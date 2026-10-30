import { getAuthUserId } from "@convex-dev/auth/server";
import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { customerForAuthUser, isActiveCustomer, sameScope } from "./admin";
import { digest } from "./cards";
import { components } from "./components";
const CLAIM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

function normalizeClaimCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return CLAIM_CODE_PATTERN.test(normalized) ? normalized : null;
}

const verifyLimiter = new RateLimiter(components.rateLimiter, {
  cardClaimVerificationPerUser: { kind: "fixed window", rate: 5, period: HOUR },
  cardClaimVerificationPerCard: { kind: "fixed window", rate: 20, period: HOUR },
});
const failure = (): never => {
  throw new Error("The claim code is invalid or unavailable.");
};

function challengeValue(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const verifyCode = mutation({
  args: { token: v.string(), code: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), challenge: v.string(), expiresAt: v.number() }),
    v.object({ ok: v.literal(false) }),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Authentication required.");
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(args.token)) return { ok: false as const };
    const cardLimit = await verifyLimiter.limit(ctx, "cardClaimVerificationPerCard", {
      key: args.token,
    });
    const userLimit = await verifyLimiter.limit(ctx, "cardClaimVerificationPerUser", {
      key: `${args.token}:${userId}`,
    });
    if (!cardLimit.ok || !userLimit.ok) return { ok: false as const };
    const code = normalizeClaimCode(args.code);
    if (code === null) return { ok: false as const };
    const card = await ctx.db
      .query("cards")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    const now = Date.now();
    if (card === null) return { ok: false as const };
    const customer = await customerForAuthUser(ctx, userId);
    if (!customer || !isActiveCustomer(customer) || !sameScope(customer, card))
      return { ok: false as const };
    if (
      card.correctionRequestedAt !== undefined ||
      (card.status !== "registered" && card.status !== "claimable" && card.status !== "active")
    )
      return { ok: false as const };
    const claimCodeHash = card.claimCodeHash;
    if (claimCodeHash === undefined) return { ok: false as const };
    if (card.claimCodeInvalidatedAt !== undefined || card.claimCodeClaimedAt !== undefined)
      return { ok: false as const };
    if ((await digest(code)) !== claimCodeHash) return { ok: false as const };
    const challenge = challengeValue();
    const expiresAt = now + 10 * 60 * 1000;
    await ctx.db.insert("cardClaimChallenges", {
      scope: card.scope,
      cardId: card._id,
      userId,
      claimCodeHash,
      challengeHash: await digest(challenge),
      expiresAt,
      createdAt: now,
    });
    return { ok: true as const, challenge, expiresAt };
  },
});

export const complete = mutation({
  args: { challenge: v.string() },
  returns: v.object({ cardId: v.id("cards"), profileId: v.id("profiles") }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Authentication required.");
    const challengeHash = await digest(args.challenge);
    const challenge = await ctx.db
      .query("cardClaimChallenges")
      .withIndex("by_challengeHash", (q) => q.eq("challengeHash", challengeHash))
      .unique();
    if (challenge === null) {
      throw new Error("The claim code is invalid or unavailable.");
    }
    if (challenge.usedAt !== undefined || challenge.expiresAt <= Date.now()) failure();
    if (challenge.userId !== userId) failure();
    const card = await ctx.db.get(challenge.cardId);
    const customer = await customerForAuthUser(ctx, userId);
    if (card === null) {
      throw new Error("The claim code is invalid or unavailable.");
    }
    if (customer === null || !isActiveCustomer(customer)) {
      throw new Error("The claim code is invalid or unavailable.");
    }
    if (
      (card.status !== "registered" && card.status !== "claimable" && card.status !== "active") ||
      card.correctionRequestedAt !== undefined ||
      card.claimCodeInvalidatedAt !== undefined ||
      card.claimCodeClaimedAt !== undefined ||
      card.claimCodeHash !== challenge.claimCodeHash
    ) {
      throw new Error("The claim code is invalid or unavailable.");
    }
    if (!sameScope(customer, card)) failure();
    const profileId = card.profileId ?? customer.profileId;
    if (profileId === undefined) throw new Error("The claim code is invalid or unavailable.");
    const profile = await ctx.db.get(profileId);
    if (profile === null) {
      throw new Error("The claim code is invalid or unavailable.");
    }
    if (profile.ownerId !== customer._id || !sameScope(customer, profile)) failure();
    if (profile.ownerId !== customer._id) {
      throw new Error("The claim code is invalid or unavailable.");
    }
    if (card.profileId === undefined) {
      const [activeCards, claimableCards] = await Promise.all([
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
      if (activeCards.length || claimableCards.length) failure();
    }
    const now = Date.now();
    await ctx.db.patch(challenge._id, { usedAt: now });
    await ctx.db.patch(card._id, {
      claimCodeClaimedAt: now,
      profileId: profile._id,
      status: profile.status === "published" ? "active" : "claimable",
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: customer.scope,
      actorUserId: userId,
      actorLabel: customer.email ?? "Customer",
      action: "card.claimed",
      cardId: card._id,
      profileId: profile._id,
      accountId: customer._id,
      occurredAt: now,
      after: "claimed",
    });
    return { cardId: card._id, profileId: profile._id };
  },
});
