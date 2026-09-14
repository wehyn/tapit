import { v } from "convex/values";

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { isActiveCustomer, requireAdministrator, requireUser } from "./admin";
import {
  profileContentValidator,
  profileStatusValidator,
  validateProfileContent,
} from "./validators";

type AuthContext = QueryCtx | MutationCtx;

async function profileAccess(ctx: AuthContext, profileId: Id<"profiles">) {
  const userId = await requireUser(ctx);
  const account = await ctx.db
    .query("customers")
    .withIndex("by_userId", (query) => query.eq("userId", userId))
    .unique();
  const profile = await ctx.db.get(profileId);
  if (
    account === null ||
    !isActiveCustomer(account) ||
    profile === null ||
    (profile.ownerId !== account._id && account.role !== "admin")
  ) {
    throw new Error("Profile access denied.");
  }
  return { account, profile, userId };
}

function publicProjection(profile: Doc<"profiles">) {
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

export const publicBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_slug", (query) => query.eq("slug", args.slug))
      .unique();
    if (profile === null) return null;
    const account = await ctx.db.get(profile.ownerId);
    return isActiveCustomer(account) ? publicProjection(profile) : null;
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();
    if (customer === null || !isActiveCustomer(customer) || customer.profileId === undefined)
      return null;
    return await ctx.db.get(customer.profileId);
  },
});

export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireAdministrator(ctx);
    return await ctx.db.query("profiles").withIndex("by_status").collect();
  },
});

export const saveDraft = mutation({
  args: { profileId: v.id("profiles"), draft: profileContentValidator },
  handler: async (ctx, args) => {
    const { profile } = await profileAccess(ctx, args.profileId);
    if (profile.published !== undefined && profile.published.slug !== args.draft.slug) {
      throw new Error("The profile slug cannot change after first publication.");
    }
    const duplicate = await ctx.db
      .query("profiles")
      .withIndex("by_slug", (query) => query.eq("slug", args.draft.slug))
      .unique();
    if (duplicate !== null && duplicate._id !== profile._id)
      throw new Error("That profile slug is already in use.");
    const now = Date.now();
    await ctx.db.patch(profile._id, { slug: args.draft.slug, draft: args.draft, updatedAt: now });
    return { updatedAt: now };
  },
});

export const publish = mutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    const { profile, userId } = await profileAccess(ctx, args.profileId);
    const owner = await ctx.db.get(profile.ownerId);
    if (!isActiveCustomer(owner)) throw new Error("The profile owner account is not active.");
    if (profile.status === "suspended") throw new Error("A suspended profile cannot be published.");
    const errors = validateProfileContent(profile.draft);
    if (errors.length > 0) throw new Error(errors.join(" "));
    const duplicate = await ctx.db
      .query("profiles")
      .withIndex("by_slug", (query) => query.eq("slug", profile.draft.slug))
      .unique();
    if (duplicate !== null && duplicate._id !== profile._id)
      throw new Error("That profile slug is already in use.");
    const now = Date.now();
    const published = { ...profile.draft, publishedAt: now };
    await ctx.db.patch(profile._id, {
      slug: profile.draft.slug,
      status: "published",
      published,
      publishedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      actorLabel: "Profile publisher",
      action: "profile.published",
      profileId: profile._id,
      accountId: profile.ownerId,
      occurredAt: now,
      after: "published",
    });
    return published;
  },
});

export const setStatus = mutation({
  args: { profileId: v.id("profiles"), status: profileStatusValidator },
  handler: async (ctx, args) => {
    const { userId, profile } = await profileAccess(ctx, args.profileId);
    const account = await requireAdministrator(ctx);
    if (args.status === "published") {
      const owner = await ctx.db.get(profile.ownerId);
      if (!isActiveCustomer(owner)) throw new Error("The profile owner account is not active.");
    }
    const now = Date.now();
    await ctx.db.patch(profile._id, {
      status: args.status,
      updatedAt: now,
      ...(args.status === "unpublished" ? { unpublishedAt: now } : {}),
      ...(args.status === "suspended" ? { suspendedAt: now } : {}),
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      actorLabel: "Administrator",
      action: `profile.${args.status}`,
      profileId: profile._id,
      accountId: account.account._id,
      occurredAt: now,
      before: profile.status,
      after: args.status,
    });
    return { status: args.status };
  },
});
