import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { isActiveCustomer, requireAdministrator } from "./admin";

function tokenFromCardUrl(cardUrl: string): string | null {
  try {
    const parsed = new URL(cardUrl, "https://tapit.local");
    const segments = parsed.pathname.split("/").filter(Boolean);
    const token = segments.length === 2 && segments[0] === "c" ? segments[1] : undefined;
    return token !== undefined && /^[A-Za-z0-9_-]+$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

function publicProjection(profile: {
  _id: Id<"profiles">;
  status: string;
  published?: {
    slug: string;
    name: string;
    bio?: string;
    imageUrl?: string;
    email?: string;
    phone?: string;
    website?: string;
    links: Array<{
      id: string;
      label: string;
      destination: string;
      enabled: boolean;
      icon?: string;
    }>;
  };
}) {
  if (profile.status !== "published" || profile.published === undefined) return null;
  return {
    id: profile._id,
    slug: profile.published.slug,
    name: profile.published.name,
    bio: profile.published.bio,
    imageUrl: profile.published.imageUrl,
    email: profile.published.email,
    phone: profile.published.phone,
    website: profile.published.website,
    links: profile.published.links.filter((link) => link.enabled),
  };
}

export const resolve = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const card = await ctx.db
      .query("cards")
      .withIndex("by_token", (query) => query.eq("token", args.token))
      .unique();
    if (card === null) return { status: "missing" as const };
    if (card.status !== "active" || card.profileId === undefined)
      return { status: "inactive" as const };
    const profile = await ctx.db.get(card.profileId);
    const owner = profile === null ? null : await ctx.db.get(profile.ownerId);
    if (profile === null || !isActiveCustomer(owner) || publicProjection(profile) === null)
      return { status: "unavailable" as const };
    return { status: "active" as const, profile: publicProjection(profile) };
  },
});

export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdministrator(ctx);
    return await ctx.db.query("cards").withIndex("by_status").collect();
  },
});

export const register = mutation({
  args: { cardUrl: v.string(), token: v.string() },
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
  handler: async (ctx, args) => {
    const { userId } = await requireAdministrator(ctx);
    const card = await ctx.db.get(args.cardId);
    const profile = await ctx.db.get(args.profileId);
    if (card === null || profile === null) throw new Error("Card or profile not found.");
    if (card.status !== "registered") throw new Error("Only a registered card can be assigned.");
    if (profile.status !== "published")
      throw new Error("A card can only become active for a published profile.");
    const owner = await ctx.db.get(profile.ownerId);
    if (!isActiveCustomer(owner)) throw new Error("The profile owner account is not active.");
    const now = Date.now();
    await ctx.db.patch(card._id, {
      profileId: profile._id,
      status: "active",
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
      after: "active",
    });
    return { status: "active" as const };
  },
});

export const deactivate = mutation({
  args: { cardId: v.id("cards") },
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
  },
});

export const replace = mutation({
  args: { oldCardId: v.id("cards"), newCardUrl: v.string(), newToken: v.string() },
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
