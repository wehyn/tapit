import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";

import { mutation, query } from "./_generated/server";
import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { customerForAuthUser, isActiveCustomer, requireAdministrator, sameScope } from "./admin";
import { cardStatusValidator, publicProfileValidator, validateProfileContent } from "./validators";
import { projectPublicProfile, resolvePublishedRedirectDestination } from "./profileProjection";
import { components } from "./components";
import schema from "./schema";
import { cardTokenFromUrl } from "../src/lib/card-url";

const resolveResultValidator = v.union(
  v.object({ status: v.literal("missing") }),
  v.object({ status: v.literal("inactive") }),
  v.object({ status: v.literal("unavailable") }),
  v.object({ status: v.literal("setup") }),
  v.object({ status: v.literal("ownerSetup") }),
  v.object({ status: v.literal("claim") }),
  v.object({
    status: v.literal("active"),
    profile: publicProfileValidator,
    redirectDestination: v.optional(v.string()),
  }),
);

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
    if (card.correctionRequestedAt !== undefined) return { status: "unavailable" as const };
    if (card.status === "inactive" || card.status === "replaced")
      return { status: "inactive" as const };
    if (card.status === "registered") return { status: "setup" as const };
    if (card.status === "claimable") {
      if (card.claimCodeInvalidatedAt !== undefined) return { status: "unavailable" as const };
      if (card.claimCodeClaimedAt === undefined) return { status: "claim" as const };
      const userId = await getAuthUserId(ctx);
      const customer = userId === null ? null : await customerForAuthUser(ctx, userId);
      const profile = card.profileId === undefined ? null : await ctx.db.get(card.profileId);
      if (
        !customer ||
        !isActiveCustomer(customer) ||
        customer.role !== "customer" ||
        customer.profileId !== card.profileId ||
        !sameScope(customer, card) ||
        profile === null ||
        profile.ownerId !== customer._id ||
        !sameScope(customer, profile)
      )
        return { status: "unavailable" as const };
      return { status: "ownerSetup" as const };
    }
    if (card.status !== "active" || card.profileId === undefined)
      return { status: "unavailable" as const };
    const profile = await ctx.db.get(card.profileId);
    const owner = profile === null ? null : await ctx.db.get(profile.ownerId);
    if (profile === null || !isActiveCustomer(owner)) return { status: "unavailable" as const };
    if (card.claimCodeInvalidatedAt !== undefined) return { status: "unavailable" as const };
    if (card.claimCodeClaimedAt === undefined) return { status: "claim" as const };
    const projection = await projectPublicProfile(ctx, profile);
    if (projection === null) return { status: "unavailable" as const };
    const redirectDestination = resolvePublishedRedirectDestination(profile.published?.redirect);
    return {
      status: "active" as const,
      profile: projection,
      ...(redirectDestination === undefined ? {} : { redirectDestination }),
    };
  },
});

export const adminList = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("cards"),
      _creationTime: v.number(),
      scope: v.optional(v.literal("demo")),
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
      archivedAt: v.optional(v.number()),
      claimCodeGeneratedAt: v.optional(v.number()),
      claimCodeInvalidatedAt: v.optional(v.number()),
      claimCodeClaimedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const { account } = await requireAdministrator(ctx);
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_scope", (query) => query.eq("scope", account.scope))
      .take(100);
    return cards.map((card) => {
      const safeCard = { ...card };
      delete safeCard.claimCodeHash;
      return safeCard;
    });
  },
});

export const adminListPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    schema.doc("cards").omit("claimCodeHash", "claimCodeExpiresAt"),
  ),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_scope", (query) => query.eq("scope", account.scope))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...cards,
      page: cards.page.map((card) => {
        const safeCard = { ...card };
        delete safeCard.claimCodeHash;
        delete safeCard.claimCodeExpiresAt;
        return safeCard;
      }),
    };
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
  returns: v.object({ status: v.union(v.literal("claimable"), v.literal("active")) }),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    const profile = await ctx.db.get(args.profileId);
    if (
      card === null ||
      profile === null ||
      !sameScope(account, card) ||
      !sameScope(account, profile)
    )
      throw new Error("Card or profile not found.");
    if (card.status !== "registered") throw new Error("Only a registered card can be attached.");
    const owner = await ctx.db.get(profile.ownerId);
    if (
      owner === null ||
      !sameScope(account, owner) ||
      !sameScope(owner, profile) ||
      owner.status === "deleted" ||
      owner.deletionStatus !== "active"
    )
      throw new Error("The profile owner account is not available.");
    if (profile.status === "published") {
      if (!isActiveCustomer(owner)) throw new Error("The profile owner account is not active.");
      if (profile.published === undefined || validateProfileContent(profile.published).length > 0)
        throw new Error("A valid published profile is required.");
    }
    const status = profile.status === "published" ? ("active" as const) : ("claimable" as const);
    const now = Date.now();
    await ctx.db.patch(card._id, {
      profileId: profile._id,
      status,
      assignedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
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

export const reassign = mutation({
  args: {
    cardId: v.id("cards"),
    expectedProfileId: v.id("profiles"),
    expectedStatus: v.union(v.literal("active"), v.literal("claimable")),
    profileId: v.id("profiles"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    const oldProfile = await ctx.db.get(args.expectedProfileId);
    const profile = await ctx.db.get(args.profileId);
    if (
      card === null ||
      oldProfile === null ||
      profile === null ||
      !sameScope(account, card) ||
      !sameScope(account, oldProfile) ||
      !sameScope(account, profile)
    )
      throw new Error("Card or profile not found.");
    if (
      card.status !== args.expectedStatus ||
      card.profileId !== args.expectedProfileId ||
      (card.status !== "active" && card.status !== "claimable")
    )
      throw new Error("The card assignment has changed. Refresh and try again.");
    if (args.profileId === args.expectedProfileId)
      throw new Error("The card is already assigned to that profile.");
    const oldOwner = await ctx.db.get(oldProfile.ownerId);
    const owner = await ctx.db.get(profile.ownerId);
    if (
      oldOwner === null ||
      !sameScope(account, oldOwner) ||
      !sameScope(oldOwner, oldProfile) ||
      owner === null ||
      !isActiveCustomer(owner) ||
      !sameScope(account, owner) ||
      !sameScope(owner, profile)
    )
      throw new Error("The profile owner account is not active.");
    if (profile.status === "published") {
      if (profile.published === undefined || validateProfileContent(profile.published).length > 0)
        throw new Error("A valid published profile is required.");
    } else if (profile.status !== "draft" && profile.status !== "unpublished") {
      throw new Error("The destination profile is not assignable.");
    }

    const now = Date.now();
    await ctx.db.patch(card._id, {
      profileId: profile._id,
      assignedAt: now,
      updatedAt: now,
      claimCodeHash: undefined,
      claimCodeGeneratedAt: undefined,
      claimCodeExpiresAt: undefined,
      claimCodeClaimedAt: undefined,
      claimCodeInvalidatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card.reassigned",
      cardId: card._id,
      profileId: profile._id,
      accountId: owner._id,
      occurredAt: now,
      before: JSON.stringify({
        profileId: oldProfile._id,
        accountId: oldOwner._id,
        status: card.status,
      }),
      after: JSON.stringify({ profileId: profile._id, accountId: owner._id, status: card.status }),
    });
    return null;
  },
});

export const generateClaimCode = mutation({
  args: { cardId: v.id("cards") },
  returns: v.object({ code: v.string() }),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    // Codes can be issued before assignment so the package can ship with setup instructions.
    const eligibleCard =
      card !== null &&
      ((card.status === "registered" && card.profileId === undefined) ||
        ((card.status === "claimable" || card.status === "active") &&
          card.profileId !== undefined));
    if (
      card === null ||
      !sameScope(account, card) ||
      !eligibleCard ||
      card.correctionRequestedAt !== undefined ||
      card.claimCodeClaimedAt !== undefined
    )
      throw new Error("Claim code unavailable.");
    const limit = await claimCodeLimiter.limit(ctx, "claimCodeGeneration", { key: args.cardId });
    if (!limit.ok) throw new Error("Too many claim code attempts. Try again later.");
    const code = randomCode();
    const now = Date.now();
    await ctx.db.patch(card._id, {
      claimCodeHash: await digest(code),
      claimCodeGeneratedAt: now,
      claimCodeExpiresAt: undefined,
      claimCodeInvalidatedAt: undefined,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card.claim_code_generated",
      cardId: card._id,
      profileId: card.profileId,
      occurredAt: now,
      after: "generated",
    });
    return { code };
  },
});

export const invalidateClaimCode = mutation({
  args: { cardId: v.id("cards") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    if (card === null || !sameScope(account, card)) throw new Error("Card not found.");
    if (card.correctionRequestedAt !== undefined)
      throw new Error("Resolve the pending assignment correction before invalidating its code.");
    const now = Date.now();
    await ctx.db.patch(card._id, { claimCodeInvalidatedAt: now, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
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
    claimedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    if (card === null || !sameScope(account, card)) throw new Error("Card not found.");
    return {
      status: card.status,
      hasClaimCode:
        card.claimCodeHash !== undefined &&
        card.claimCodeInvalidatedAt === undefined &&
        card.claimCodeClaimedAt === undefined,
      claimedAt: card.claimCodeClaimedAt ?? null,
    };
  },
});

export { digest };

export const register = mutation({
  args: { cardUrl: v.string(), token: v.string() },
  returns: v.id("cards"),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    if (cardTokenFromUrl(args.cardUrl) !== args.token)
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
      scope: account.scope,
      cardUrl: args.cardUrl,
      token: args.token,
      status: "registered",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
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
  returns: v.object({ status: v.union(v.literal("claimable"), v.literal("active")) }),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    const profile = await ctx.db.get(args.profileId);
    if (
      card === null ||
      profile === null ||
      !sameScope(account, card) ||
      !sameScope(account, profile)
    )
      throw new Error("Card or profile not found.");
    if (card.status !== "registered") throw new Error("Only a registered card can be assigned.");
    if (profile.status !== "published")
      throw new Error("A card can only become active for a published profile.");
    if (profile.published === undefined || validateProfileContent(profile.published).length > 0)
      throw new Error(
        "A card can only become active for a published profile with valid published content.",
      );
    const owner = await ctx.db.get(profile.ownerId);
    if (
      owner === null ||
      !isActiveCustomer(owner) ||
      !sameScope(account, owner) ||
      !sameScope(owner, profile)
    )
      throw new Error("The profile owner account is not active.");
    const now = Date.now();
    await ctx.db.patch(card._id, {
      profileId: profile._id,
      status: "active",
      assignedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card.assigned",
      cardId: card._id,
      profileId: profile._id,
      accountId: profile.ownerId,
      occurredAt: now,
      before: "registered",
      after: "active",
    });
    return { status: "active" as const };
  },
});

export const archive = mutation({
  args: { cardId: v.id("cards") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    if (card === null || !sameScope(account, card)) throw new Error("Card not found.");
    if (card.archivedAt !== undefined || (card.status !== "inactive" && card.status !== "replaced"))
      throw new Error("Only a visible inactive or replaced card can be archived.");
    if (card.correctionRequestedAt !== undefined)
      throw new Error("Resolve the pending assignment correction before archiving this card.");
    const now = Date.now();
    await ctx.db.patch(card._id, { archivedAt: now, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card.archived",
      cardId: card._id,
      profileId: card.profileId,
      occurredAt: now,
      before: card.status,
      after: "archived",
    });
    return null;
  },
});

export const restore = mutation({
  args: { cardId: v.id("cards") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    if (card === null || !sameScope(account, card)) throw new Error("Card not found.");
    if (card.archivedAt === undefined) throw new Error("Only an archived card can be restored.");
    const now = Date.now();
    await ctx.db.patch(card._id, { archivedAt: undefined, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card.restored",
      cardId: card._id,
      profileId: card.profileId,
      occurredAt: now,
      before: "archived",
      after: card.status,
    });
    return null;
  },
});

export const reactivate = mutation({
  args: { cardId: v.id("cards") },
  returns: v.object({ status: v.union(v.literal("claimable"), v.literal("active")) }),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    if (
      card === null ||
      !sameScope(account, card) ||
      card.archivedAt !== undefined ||
      (card.status !== "inactive" && card.status !== "replaced")
    )
      throw new Error("Only a visible inactive or replaced card can be reactivated.");
    if (card.correctionRequestedAt !== undefined)
      throw new Error("Resolve the pending assignment correction before reactivating this card.");
    if (card.profileId === undefined) throw new Error("The card profile is not available.");
    const profile = await ctx.db.get(card.profileId);
    const owner = profile === null ? null : await ctx.db.get(profile.ownerId);
    if (
      profile === null ||
      owner === null ||
      !sameScope(account, profile) ||
      !sameScope(account, owner) ||
      !sameScope(owner, profile) ||
      !isActiveCustomer(owner)
    )
      throw new Error("The profile owner account is not active.");
    if (
      profile.status === "published" &&
      (profile.published === undefined || validateProfileContent(profile.published).length > 0)
    )
      throw new Error("A valid published profile is required.");
    const status = profile.status === "published" ? ("active" as const) : ("claimable" as const);
    const now = Date.now();
    await ctx.db.patch(card._id, {
      status,
      claimCodeInvalidatedAt: now,
      claimCodeClaimedAt: undefined,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card.reactivated",
      cardId: card._id,
      profileId: profile._id,
      accountId: profile.ownerId,
      occurredAt: now,
      before: card.status,
      after: status,
    });
    return { status };
  },
});

export const deactivate = mutation({
  args: { cardId: v.id("cards") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    if (card === null || !sameScope(account, card)) throw new Error("Card not found.");
    if (card.status !== "active") throw new Error("Only an active card can be deactivated.");
    if (card.correctionRequestedAt !== undefined)
      throw new Error("Resolve the pending assignment correction before deactivating this card.");
    const now = Date.now();
    await ctx.db.patch(card._id, { status: "inactive", deactivatedAt: now, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
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
    const { userId, account } = await requireAdministrator(ctx);
    const oldCard = await ctx.db.get(args.oldCardId);
    if (
      oldCard === null ||
      !sameScope(account, oldCard) ||
      oldCard.status !== "active" ||
      oldCard.profileId === undefined
    )
      throw new Error("Only an active assigned card can be replaced.");
    if (oldCard.correctionRequestedAt !== undefined)
      throw new Error("Resolve the pending assignment correction before replacing this card.");
    if (cardTokenFromUrl(args.newCardUrl) !== args.newToken)
      throw new Error("Card URL must use the /c/<token> format and match its token.");
    const profile = await ctx.db.get(oldCard.profileId);
    const owner = profile === null ? null : await ctx.db.get(profile.ownerId);
    if (
      profile === null ||
      owner === null ||
      !isActiveCustomer(owner) ||
      !sameScope(account, profile) ||
      !sameScope(account, owner)
    )
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
      scope: oldCard.scope,
      cardUrl: args.newCardUrl,
      token: args.newToken,
      profileId: oldCard.profileId,
      status: "active",
      assignmentReason: "replacement",
      ...(oldCard.claimCodeClaimedAt === undefined
        ? {}
        : { claimCodeClaimedAt: oldCard.claimCodeClaimedAt }),
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
      scope: account.scope,
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
