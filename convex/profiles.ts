import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import schema from "./schema";
import { isActiveCustomer, requireAdministrator, requireUser } from "./admin";
import { profileAccess } from "./profileAccess";
import { projectOwnedProfile, projectPublicProfile } from "./profileProjection";
import { assertOwnedProfileImage, removeIfUnreferenced } from "./profileImages";
import {
  profileContentValidator,
  profileStatusValidator,
  publicProfileValidator,
  profileThemeValidator,
  validateDraftSafety,
  validateProfileContent,
} from "./validators";
import { replaceProfileLinks } from "./links";

export const publicBySlug = query({
  args: { slug: v.string() },
  returns: v.union(v.null(), publicProfileValidator),
  handler: async (ctx, args) => {
    const slug = args.slug.trim().toLowerCase();
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_slug", (query) => query.eq("slug", slug))
      .unique();
    if (profile === null) return null;
    const account = await ctx.db.get(profile.ownerId);
    return isActiveCustomer(account) ? await projectPublicProfile(ctx, profile) : null;
  },
});

export const mine = query({
  args: {},
  returns: v.union(v.null(), schema.doc("profiles")),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();
    if (customer === null || !isActiveCustomer(customer) || customer.profileId === undefined)
      return null;
    const profile = await ctx.db.get(customer.profileId);
    return profile === null ? null : await projectOwnedProfile(ctx, profile);
  },
});

export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      account: schema.doc("customers"),
      profile: schema.doc("profiles"),
    }),
  ),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const account = await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();
    if (account === null || !isActiveCustomer(account) || account.profileId === undefined)
      return null;
    const profile = await ctx.db.get(account.profileId);
    return profile === null ? null : { account, profile: await projectOwnedProfile(ctx, profile) };
  },
});

export const adminList = query({
  args: {},
  returns: v.array(schema.doc("profiles")),
  handler: async (ctx) => {
    await requireAdministrator(ctx);
    return await ctx.db.query("profiles").withIndex("by_status").take(100);
  },
});

export const saveDraft = mutation({
  args: { profileId: v.id("profiles"), draft: profileContentValidator },
  returns: v.object({ updatedAt: v.number() }),
  handler: async (ctx, args) => {
    const { profile } = await profileAccess(ctx, args.profileId);
    const safetyErrors = validateDraftSafety(args.draft);
    if (safetyErrors.length > 0) throw new Error(safetyErrors.join(" "));
    if (profile.published !== undefined && profile.published.slug !== args.draft.slug) {
      throw new Error("The profile slug cannot change after first publication.");
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args.draft.slug))
      throw new Error("The profile slug is invalid.");
    const duplicate = await ctx.db
      .query("profiles")
      .withIndex("by_slug", (query) => query.eq("slug", args.draft.slug))
      .unique();
    if (duplicate !== null && duplicate._id !== profile._id)
      throw new Error("That profile slug is already in use.");
    const now = Date.now();
    const draft = { ...args.draft };
    delete draft.imageUrl;
    if (draft.imageStorageId !== undefined)
      await assertOwnedProfileImage(ctx, profile._id, profile.ownerId, draft.imageStorageId);
    await ctx.db.patch(profile._id, { slug: args.draft.slug, draft, updatedAt: now });
    await replaceProfileLinks(ctx, profile._id, args.draft.links, now);
    return { updatedAt: now };
  },
});

export const publish = mutation({
  args: { profileId: v.id("profiles") },
  returns: v.object({
    name: v.string(),
    slug: v.string(),
    bio: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    theme: v.optional(profileThemeValidator),
    links: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        destination: v.string(),
        enabled: v.boolean(),
        icon: v.optional(v.string()),
      }),
    ),
    publishedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const { profile, userId } = await profileAccess(ctx, args.profileId);
    const owner = await ctx.db.get(profile.ownerId);
    if (!isActiveCustomer(owner)) throw new Error("The profile owner account is not active.");
    if (profile.status === "suspended") throw new Error("A suspended profile cannot be published.");
    const errors = validateProfileContent(profile.draft);
    if (errors.length > 0) throw new Error(errors.join(" "));
    if (profile.published !== undefined && profile.published.slug !== profile.draft.slug)
      throw new Error("The profile slug cannot change after first publication.");
    const duplicate = await ctx.db
      .query("profiles")
      .withIndex("by_slug", (query) => query.eq("slug", profile.draft.slug))
      .unique();
    if (duplicate !== null && duplicate._id !== profile._id)
      throw new Error("That profile slug is already in use.");
    if (profile.draft.imageStorageId !== undefined)
      await assertOwnedProfileImage(
        ctx,
        profile._id,
        profile.ownerId,
        profile.draft.imageStorageId,
      );
    const now = Date.now();
    const publishedContent = { ...profile.draft };
    delete publishedContent.imageUrl;
    const published = { ...publishedContent, publishedAt: now };
    const oldPublishedStorageId = profile.published?.imageStorageId;
    await ctx.db.patch(profile._id, {
      slug: profile.draft.slug,
      status: "published",
      published,
      publishedAt: now,
      updatedAt: now,
    });
    if (oldPublishedStorageId !== undefined && oldPublishedStorageId !== published.imageStorageId)
      await removeIfUnreferenced(ctx, oldPublishedStorageId, profile._id);
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
  returns: v.object({ status: profileStatusValidator }),
  handler: async (ctx, args) => {
    const { userId, profile } = await profileAccess(ctx, args.profileId);
    const account = await requireAdministrator(ctx);
    if (args.status === "published") {
      const owner = await ctx.db.get(profile.ownerId);
      if (!isActiveCustomer(owner)) throw new Error("The profile owner account is not active.");
      if (profile.published === undefined)
        throw new Error(
          "A valid published snapshot and published content are required before publishing.",
        );
      const errors = validateProfileContent(profile.published);
      if (errors.length > 0)
        throw new Error(`A valid published snapshot is required. ${errors.join(" ")}`);
      if (profile.published.imageStorageId !== undefined)
        await assertOwnedProfileImage(
          ctx,
          profile._id,
          profile.ownerId,
          profile.published.imageStorageId,
        );
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
