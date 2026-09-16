import { getAuthUserId } from "@convex-dev/auth/server";
import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { customerForAuthUser, isActiveCustomer } from "./admin";
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
  returns: v.object({ challenge: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Authentication required.");
    const code = normalizeClaimCode(args.code);
    if (code === null) throw new Error("The claim code is invalid or unavailable.");
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(args.token)) failure();
    const cardLimit = await verifyLimiter.limit(ctx, "cardClaimVerificationPerCard", {
      key: args.token,
    });
    const userLimit = await verifyLimiter.limit(ctx, "cardClaimVerificationPerUser", {
      key: `${args.token}:${userId}`,
    });
    if (!cardLimit.ok || !userLimit.ok) failure();
    const card = await ctx.db
      .query("cards")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    const now = Date.now();
    if (card === null) {
      throw new Error("The claim code is invalid or unavailable.");
    }
    if (card.status !== "claimable" || card.profileId === undefined) failure();
    const claimCodeHash = card.claimCodeHash;
    if (claimCodeHash === undefined) {
      throw new Error("The claim code is invalid or unavailable.");
    }
    if (card.claimCodeInvalidatedAt !== undefined || card.claimCodeClaimedAt !== undefined) {
      throw new Error("The claim code is invalid or unavailable.");
    }
    if (card.claimCodeExpiresAt === undefined || card.claimCodeExpiresAt <= now) failure();
    if ((await digest(code)) !== claimCodeHash) failure();
    const challenge = challengeValue();
    const expiresAt = now + 10 * 60 * 1000;
    await ctx.db.insert("cardClaimChallenges", {
      cardId: card._id,
      claimCodeHash,
      challengeHash: await digest(challenge),
      expiresAt,
      createdAt: now,
    });
    return { challenge, expiresAt };
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
    const card = await ctx.db.get(challenge.cardId);
    const customer = await customerForAuthUser(ctx, userId);
    if (card === null) {
      throw new Error("The claim code is invalid or unavailable.");
    }
    if (customer === null || !isActiveCustomer(customer)) {
      throw new Error("The claim code is invalid or unavailable.");
    }
    if (
      card.status !== "claimable" ||
      card.claimCodeInvalidatedAt !== undefined ||
      card.claimCodeClaimedAt !== undefined ||
      card.claimCodeHash !== challenge.claimCodeHash
    ) {
      throw new Error("The claim code is invalid or unavailable.");
    }
    const profileId = card.profileId;
    if (profileId === undefined) {
      throw new Error("The claim code is invalid or unavailable.");
    }
    const profile = await ctx.db.get(profileId);
    if (profile === null) {
      throw new Error("The claim code is invalid or unavailable.");
    }
    if (profile.ownerId !== customer._id) {
      throw new Error("The claim code is invalid or unavailable.");
    }
    const now = Date.now();
    await ctx.db.patch(challenge._id, { usedAt: now });
    await ctx.db.patch(card._id, { claimCodeClaimedAt: now, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      actorLabel: customer.email,
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
