import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { isActiveCustomer, requireAdministrator } from "./admin";
import { cardStatusValidator, publicProfileValidator } from "./validators";
import { validateProfileContent } from "./validators";
import { projectPublicProfile } from "./profileProjection";
import { components } from "./components";

const resolveResultValidator = v.union(
  v.object({ status: v.literal("missing") }),
  v.object({ status: v.literal("inactive") }),
  v.object({ status: v.literal("unavailable") }),
  v.object({ status: v.literal("onboarding") }),
  v.object({ status: v.literal("active"), profile: publicProfileValidator }),
);

function tokenFromCardUrl(cardUrl: string): string | null {
  try {
    const parsed = new URL(cardUrl);
    if (
      !/^https?:$/.test(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    )
      return null;
    if (parsed.search || parsed.hash) return null;
    const match = parsed.pathname.match(/^\/c\/([A-Za-z0-9_-]{1,160})$/);
    const token = match?.[1];
    return token !== undefined && /^[A-Za-z0-9_-]+$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

export const resolve = query({
  args: { token: v.string() },
  returns: resolveResultValidator,
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(args.token)) return { status: "missing" as const };
    const card = await ctx.db
      .query("cards")
      .withIndex("by_token", (query) => query.eq("token", args.token))
      .unique();
    if (card === null) return { status: "missing" as const };
    if (card.profileId === undefined)
      return {
        status: card.status === "active" ? ("unavailable" as const) : ("inactive" as const),
      };
    if (card.status === "claimable") {
      const profile = await ctx.db.get(card.profileId);
      return profile === null
        ? { status: "unavailable" as const }
        : { status: "onboarding" as const };
    }
    if (card.status !== "active") return { status: "inactive" as const };
    const profile = await ctx.db.get(card.profileId);
    const owner = profile === null ? null : await ctx.db.get(profile.ownerId);
    const projection = profile === null ? null : await projectPublicProfile(ctx, profile);
    if (profile === null || !isActiveCustomer(owner) || projection === null)
      return { status: "unavailable" as const };
    return { status: "active" as const, profile: projection };
  },
});

export const adminList = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("cards"),
      _creationTime: v.number(),
      cardUrl: v.string(),
      token: v.string(),
      profileId: v.optional(v.id("profiles")),
      status: cardStatusValidator,
      replacedByCardId: v.optional(v.id("cards")),
      assignmentReason: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
      assignedAt: v.optional(v.number()),
      deactivatedAt: v.optional(v.number()),
      claimCodeGeneratedAt: v.optional(v.number()),
      claimCodeExpiresAt: v.optional(v.number()),
      claimCodeInvalidatedAt: v.optional(v.number()),
      claimCodeClaimedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    await requireAdministrator(ctx);
    const cards = await ctx.db.query("cards").withIndex("by_status").take(100);
    return cards.map((card) => {
      const safeCard = { ...card };
      delete safeCard.claimCodeHash;
      return safeCard;
    });
  },
});

const CLAIM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CARD_TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const claimCodeLimiter = new RateLimiter(components.rateLimiter, {
  claimCodeGeneration: { kind: "fixed window", rate: 10, period: HOUR },
});

function randomCardToken(): string {
  const token: string[] = [];
  const bucketSize = 256 - (256 % CARD_TOKEN_ALPHABET.length);
  while (token.length < 8) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= bucketSize) continue;
      token.push(CARD_TOKEN_ALPHABET[byte % CARD_TOKEN_ALPHABET.length]!);
      if (token.length === 8) break;
    }
  }
  return `card-${token.join("")}`;
}

function randomCode(): string {
  const code: string[] = [];
  const bucketSize = 256 - (256 % CLAIM_ALPHABET.length);
  while (code.length < 8) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= bucketSize) continue;
      code.push(CLAIM_ALPHABET[byte % CLAIM_ALPHABET.length]!);
      if (code.length === 8) break;
    }
  }
  return code.join("");
}
async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const generateCardToken = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireAdministrator(ctx);

    // This only creates a candidate for the registration form. The register
    // mutation performs the authoritative uniqueness check before insertion.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const token = randomCardToken();
      const existing = await ctx.db
        .query("cards")
        .withIndex("by_token", (query) => query.eq("token", token))
        .unique();
      if (existing === null) return token;
    }

    throw new Error("Unable to generate an available card token. Try again.");
  },
});

export const attach = mutation({
  args: { cardId: v.id("cards"), profileId: v.id("profiles") },
  returns: v.object({ status: v.literal("claimable") }),
  handler: async (ctx, args) => {
    const { userId } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    const profile = await ctx.db.get(args.profileId);
    if (card === null || profile === null) throw new Error("Card or profile not found.");
    if (card.status !== "registered") throw new Error("Only a registered card can be attached.");
    const owner = await ctx.db.get(profile.ownerId);
    if (
      owner === null ||
      owner.role !== "customer" ||
      owner.status === "deleted" ||
      owner.deletionStatus !== "active"
    )
      throw new Error("The profile owner account is not available.");
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
    if (activeCards.length > 0 || claimableCards.length > 0)
      throw new Error("That profile already has an attached card.");
    if (profile.status === "published") {
      if (!isActiveCustomer(owner)) throw new Error("The profile owner account is not active.");
      if (profile.published === undefined || validateProfileContent(profile.published).length > 0)
        throw new Error("A valid published profile is required.");
    }
    const status = "claimable" as const;
    const now = Date.now();
    await ctx.db.patch(card._id, {
      profileId: profile._id,
      status,
      assignedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card.attached",
      cardId: card._id,
      profileId: profile._id,
      accountId: profile.ownerId,
      occurredAt: now,
      before: "registered",
      after: status,
    });
    return { status };
  },
});

export const generateClaimCode = mutation({
  args: { cardId: v.id("cards") },
  returns: v.object({ code: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const { userId } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    if (
      card === null ||
      card.profileId === undefined ||
      card.status !== "claimable" ||
      card.claimCodeClaimedAt !== undefined
    )
      throw new Error("Claim code unavailable.");
    const limit = await claimCodeLimiter.limit(ctx, "claimCodeGeneration", { key: args.cardId });
    if (!limit.ok) throw new Error("Too many claim code attempts. Try again later.");
    const code = randomCode();
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000;
    await ctx.db.patch(card._id, {
      claimCodeHash: await digest(code),
      claimCodeGeneratedAt: now,
      claimCodeExpiresAt: expiresAt,
      claimCodeInvalidatedAt: undefined,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card.claim_code_generated",
      cardId: card._id,
      profileId: card.profileId,
      occurredAt: now,
      after: "generated",
    });
    return { code, expiresAt };
  },
});

export const invalidateClaimCode = mutation({
  args: { cardId: v.id("cards") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    if (card === null) throw new Error("Card not found.");
    const now = Date.now();
    await ctx.db.patch(card._id, { claimCodeInvalidatedAt: now, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card.claim_code_invalidated",
      cardId: card._id,
      profileId: card.profileId,
      occurredAt: now,
      after: "invalidated",
    });
    return null;
  },
});

export const claimStatus = query({
  args: { cardId: v.id("cards") },
  returns: v.object({
    status: cardStatusValidator,
    hasClaimCode: v.boolean(),
    expiresAt: v.union(v.number(), v.null()),
    claimedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    if (card === null) throw new Error("Card not found.");
    return {
      status: card.status,
      hasClaimCode:
        card.claimCodeHash !== undefined &&
        card.claimCodeInvalidatedAt === undefined &&
        card.claimCodeClaimedAt === undefined,
      expiresAt: card.claimCodeExpiresAt ?? null,
      claimedAt: card.claimCodeClaimedAt ?? null,
    };
  },
});

export { digest };

export const register = mutation({
  args: { cardUrl: v.string(), token: v.string() },
  returns: v.id("cards"),
  handler: async (ctx, args) => {
    const { userId } = await requireAdministrator(ctx);
    if (tokenFromCardUrl(args.cardUrl) !== args.token)
      throw new Error("Card URL must use the /c/<token> format and match its token.");
    const duplicateUrl = await ctx.db
      .query("cards")
      .withIndex("by_cardUrl", (query) => query.eq("cardUrl", args.cardUrl))
      .unique();
    if (duplicateUrl !== null) throw new Error("That card URL is already registered.");
    const duplicateToken = await ctx.db
      .query("cards")
      .withIndex("by_token", (query) => query.eq("token", args.token))
      .unique();
    if (duplicateToken !== null) throw new Error("That card token is already registered.");
    const now = Date.now();
    const cardId = await ctx.db.insert("cards", {
      cardUrl: args.cardUrl,
      token: args.token,
      status: "registered",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card.registered",
      cardId,
      occurredAt: now,
      after: "registered",
    });
    return cardId;
  },
});

export const assign = mutation({
  args: { cardId: v.id("cards"), profileId: v.id("profiles") },
  returns: v.object({ status: v.literal("claimable") }),
  handler: async (ctx, args) => {
    const { userId } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    const profile = await ctx.db.get(args.profileId);
    if (card === null || profile === null) throw new Error("Card or profile not found.");
    if (card.status !== "registered") throw new Error("Only a registered card can be assigned.");
    if (profile.status !== "published")
      throw new Error("A card can only become active for a published profile.");
    if (profile.published === undefined || validateProfileContent(profile.published).length > 0)
      throw new Error(
        "A card can only become active for a published profile with valid published content.",
      );
    const [activeCards, claimableCards] = await Promise.all([
      ctx.db
        .query("cards")
        .withIndex("by_profileId_and_status", (query) =>
          query.eq("profileId", profile._id).eq("status", "active"),
        )
        .take(1),
      ctx.db
        .query("cards")
        .withIndex("by_profileId_and_status", (query) =>
          query.eq("profileId", profile._id).eq("status", "claimable"),
        )
        .take(1),
    ]);
    if (activeCards.length > 0 || claimableCards.length > 0)
      throw new Error("That profile already has an attached card.");
    const owner = await ctx.db.get(profile.ownerId);
    if (!isActiveCustomer(owner)) throw new Error("The profile owner account is not active.");
    const now = Date.now();
    await ctx.db.patch(card._id, {
      profileId: profile._id,
      status: "claimable",
      assignedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card.assigned",
      cardId: card._id,
      profileId: profile._id,
      accountId: profile.ownerId,
      occurredAt: now,
      before: "registered",
      after: "claimable",
    });
    return { status: "claimable" as const };
  },
});

export const deactivate = mutation({
  args: { cardId: v.id("cards") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    if (card === null) throw new Error("Card not found.");
    if (card.status !== "active") throw new Error("Only an active card can be deactivated.");
    const now = Date.now();
    await ctx.db.patch(card._id, { status: "inactive", deactivatedAt: now, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card.deactivated",
      cardId: card._id,
      profileId: card.profileId,
      occurredAt: now,
      before: "active",
      after: "inactive",
    });
    return null;
  },
});

export const replace = mutation({
  args: { oldCardId: v.id("cards"), newCardUrl: v.string(), newToken: v.string() },
  returns: v.id("cards"),
  handler: async (ctx, args) => {
    const { userId } = await requireAdministrator(ctx);
    const oldCard = await ctx.db.get(args.oldCardId);
    if (oldCard === null || oldCard.status !== "active" || oldCard.profileId === undefined)
      throw new Error("Only an active assigned card can be replaced.");
    if (tokenFromCardUrl(args.newCardUrl) !== args.newToken)
      throw new Error("Card URL must use the /c/<token> format and match its token.");
    const profile = await ctx.db.get(oldCard.profileId);
    const owner = profile === null ? null : await ctx.db.get(profile.ownerId);
    if (profile === null || !isActiveCustomer(owner))
      throw new Error("The profile owner account is not active.");
    const duplicateUrl = await ctx.db
      .query("cards")
      .withIndex("by_cardUrl", (query) => query.eq("cardUrl", args.newCardUrl))
      .unique();
    const duplicateToken = await ctx.db
      .query("cards")
      .withIndex("by_token", (query) => query.eq("token", args.newToken))
      .unique();
    if (duplicateUrl !== null || duplicateToken !== null)
      throw new Error("The replacement card URL or token is already registered.");
    const now = Date.now();
    const newCardId = await ctx.db.insert("cards", {
      cardUrl: args.newCardUrl,
      token: args.newToken,
      profileId: oldCard.profileId,
      status: "active",
      assignmentReason: "replacement",
      createdAt: now,
      updatedAt: now,
      assignedAt: now,
    });
    await ctx.db.patch(oldCard._id, {
      status: "replaced",
      replacedByCardId: newCardId,
      updatedAt: now,
      deactivatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card.replaced",
      cardId: oldCard._id,
      profileId: oldCard.profileId,
      occurredAt: now,
      before: "active",
      after: `replaced by ${newCardId}`,
    });
    return newCardId;
  },
});
