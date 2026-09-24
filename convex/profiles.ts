import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

import { mutation, query } from "./_generated/server";
import schema from "./schema";
import { isActiveCustomer, requireAdministrator, requireUser } from "./admin";
import { profileAccess } from "./profileAccess";
import { projectOwnedProfile, projectPublicProfile } from "./profileProjection";
import { assertOwnedProfileImage, removeIfUnreferenced } from "./profileImages";
import {
  assertOwnedProfileMediaSet,
  MEDIA_REVISION_CONFLICT,
  MEDIA_UPLOAD_PENDING,
  profileMediaAssetIds,
  removeIfMediaUnreferenced,
} from "./profileMedia";
import {
  profileContentValidator,
  profileRedirectValidator,
  profileStatusValidator,
  publicProfileValidator,
  profileThemeValidator,
  profileCustomizationValidator,
  profileMediaValidator,
  saveDraftContentValidator,
  validateDraftSafety,
  validateProfileContent,
  normalizeProfileSlug,
  validateProfileSlugValue,
} from "./validators";
import { replaceProfileLinks } from "./links";
import { IMAGE_REVISION_CONFLICT, IMAGE_UPLOAD_PENDING } from "./storage";

const ownedProfileValidator = schema
  .doc("profiles")
  .omit("draft", "published")
  .extend({
    draft: profileContentValidator,
    published: v.optional(
      profileContentValidator.extend({
        publishedAt: v.number(),
      }),
    ),
  });

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

export const checkSlugAvailability = query({
  args: { slug: v.string() },
  returns: v.object({
    available: v.boolean(),
    normalizedSlug: v.string(),
    error: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const normalizedSlug = normalizeProfileSlug(args.slug);
    const validationError = validateProfileSlugValue(normalizedSlug);
    if (validationError !== null)
      return { available: false, normalizedSlug, error: validationError };
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_slug", (q) => q.eq("slug", normalizedSlug))
      .unique();
    return profile === null
      ? { available: true, normalizedSlug, error: null }
      : { available: false, normalizedSlug, error: "That profile slug is already in use." };
  },
});

export const mine = query({
  args: {},
  returns: v.union(v.null(), ownedProfileValidator),
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
      profile: ownedProfileValidator,
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
    const { account } = await requireAdministrator(ctx);
    return await ctx.db
      .query("profiles")
      .withIndex("by_scope_and_status", (query) => query.eq("scope", account.scope))
      .take(100);
  },
});

export const saveDraft = mutation({
  args: {
    profileId: v.id("profiles"),
    draft: saveDraftContentValidator,
    expectedImageRevision: v.optional(v.number()),
    expectedMediaRevision: v.optional(v.number()),
  },
  returns: v.object({
    updatedAt: v.number(),
    imageRevision: v.number(),
    customization: v.optional(profileCustomizationValidator),
    mediaRevision: v.number(),
  }),
  handler: async (ctx, args) => {
    const { profile } = await profileAccess(ctx, args.profileId);
    const imageRevision = profile.imageRevision ?? 0;
    const mediaRevision = profile.mediaRevision ?? 0;
    if (args.expectedImageRevision !== undefined && args.expectedImageRevision !== imageRevision)
      throw new Error(IMAGE_REVISION_CONFLICT);
    if (
      args.draft.media !== undefined &&
      (args.expectedMediaRevision === undefined || args.expectedMediaRevision !== mediaRevision)
    )
      throw new Error(MEDIA_REVISION_CONFLICT);
    const normalizedSlug = normalizeProfileSlug(args.draft.slug);
    const draft = { ...args.draft, slug: normalizedSlug };
    const oldDraftMediaIds = profileMediaAssetIds(profile.draft.media);
    if (args.draft.media === undefined) {
      if (profile.draft.media === undefined) delete draft.media;
      else draft.media = profile.draft.media;
    } else if (args.draft.media === null) {
      delete draft.media;
    }
    if (profile.published !== undefined && profile.published.slug !== normalizedSlug) {
      throw new Error("The profile slug cannot change after first publication.");
    }
    const slugError = validateProfileSlugValue(args.draft.slug, {
      immutableSlug: profile.published?.slug,
    });
    if (slugError !== null) throw new Error(slugError);
    const safetyErrors = validateDraftSafety(draft);
    if (safetyErrors.length > 0) throw new Error(safetyErrors.join(" "));
    const duplicate = await ctx.db
      .query("profiles")
      .withIndex("by_slug", (query) => query.eq("slug", normalizedSlug))
      .unique();
    if (duplicate !== null && duplicate._id !== profile._id)
      throw new Error("That profile slug is already in use.");
    await assertOwnedProfileMediaSet(
      ctx,
      profile._id,
      profile.ownerId,
      draft.media as Doc<"profiles">["draft"]["media"],
    );
    const now = Date.now();
    delete draft.imageUrl;
    if (
      args.draft.imageStorageId !== undefined &&
      args.draft.imageStorageId !== profile.draft.imageStorageId
    )
      await assertOwnedProfileImage(ctx, profile._id, profile.ownerId, args.draft.imageStorageId);
    draft.imageStorageId = profile.draft.imageStorageId;
    if (draft.media !== undefined) {
      draft.media = {
        ...draft.media,
        ...(draft.media.background === undefined
          ? {}
          : {
              background: {
                assetId: draft.media.background.assetId as Id<"profileMediaAssets">,
                altText: draft.media.background.altText,
                positionX: draft.media.background.positionX,
                positionY: draft.media.background.positionY,
              },
            }),
        slideshow: draft.media.slideshow.map(({ assetId, altText }) => ({ assetId, altText })),
      };
    }
    await ctx.db.patch(profile._id, {
      slug: normalizedSlug,
      draft: draft as Doc<"profiles">["draft"],
      updatedAt: now,
    });
    await replaceProfileLinks(ctx, profile._id, draft.links, now);
    const nextDraftMediaIds = profileMediaAssetIds((draft as Doc<"profiles">["draft"]).media);
    for (const assetId of oldDraftMediaIds)
      if (!nextDraftMediaIds.includes(assetId))
        await removeIfMediaUnreferenced(ctx, profile._id, assetId);
    return {
      updatedAt: now,
      imageRevision,
      mediaRevision,
      ...(draft.customization === undefined ? {} : { customization: draft.customization }),
    };
  },
});

export const publish = mutation({
  args: {
    profileId: v.id("profiles"),
    expectedImageRevision: v.optional(v.number()),
    expectedMediaRevision: v.optional(v.number()),
  },
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
    customization: v.optional(profileCustomizationValidator),
    media: v.optional(profileMediaValidator),
    redirect: v.optional(profileRedirectValidator),
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
    const imageRevision = profile.imageRevision ?? 0;
    const mediaRevision = profile.mediaRevision ?? 0;
    if (args.expectedImageRevision !== undefined && args.expectedImageRevision !== imageRevision)
      throw new Error(IMAGE_REVISION_CONFLICT);
    if (
      (profile.draft.media !== undefined || mediaRevision !== 0) &&
      (args.expectedMediaRevision === undefined || args.expectedMediaRevision !== mediaRevision)
    )
      throw new Error(MEDIA_REVISION_CONFLICT);
    const pendingUpload = await ctx.db
      .query("profileImageUploadJobs")
      .withIndex("by_profileId_and_status_and_uploadWindowEndsAt", (query) =>
        query
          .eq("profileId", profile._id)
          .eq("status", "pending")
          .gt("uploadWindowEndsAt", Date.now()),
      )
      .first();
    if (pendingUpload !== null) throw new Error(IMAGE_UPLOAD_PENDING);
    const pendingMediaUpload = await ctx.db
      .query("profileMediaUploadJobs")
      .withIndex("by_profileId_and_status_and_uploadWindowEndsAt", (query) =>
        query
          .eq("profileId", profile._id)
          .eq("status", "pending")
          .gt("uploadWindowEndsAt", Date.now()),
      )
      .first();
    if (pendingMediaUpload !== null) throw new Error(MEDIA_UPLOAD_PENDING);
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
    await assertOwnedProfileMediaSet(ctx, profile._id, profile.ownerId, profile.draft.media);
    const attachedCards = await ctx.db
      .query("cards")
      .withIndex("by_profileId", (query) => query.eq("profileId", profile._id))
      .take(1001);
    if (attachedCards.length > 1000)
      throw new Error("Too many cards are assigned to this profile.");
    if (
      attachedCards.some(
        (card) => card.status === "claimable" && card.claimCodeClaimedAt === undefined,
      )
    ) {
      throw new Error("Claim the attached card before publishing this profile.");
    }
    const now = Date.now();
    const publishedContent = { ...profile.draft };
    delete publishedContent.imageUrl;
    if (publishedContent.media !== undefined) {
      publishedContent.media = {
        ...publishedContent.media,
        ...(publishedContent.media.background === undefined
          ? {}
          : {
              background: {
                assetId: publishedContent.media.background.assetId as Id<"profileMediaAssets">,
                altText: publishedContent.media.background.altText,
                positionX: publishedContent.media.background.positionX,
                positionY: publishedContent.media.background.positionY,
              },
            }),
        slideshow: publishedContent.media.slideshow.map(({ assetId, altText }) => ({
          assetId,
          altText,
        })),
      };
    }
    const published = { ...publishedContent, publishedAt: now };
    const oldPublishedStorageId = profile.published?.imageStorageId;
    const oldPublishedMediaIds = profileMediaAssetIds(profile.published?.media);
    await ctx.db.patch(profile._id, {
      slug: profile.draft.slug,
      status: "published",
      published,
      publishedAt: now,
      updatedAt: now,
    });
    await Promise.all(
      attachedCards
        .filter((card) => card.status === "claimable" && card.claimCodeClaimedAt !== undefined)
        .map((card) => ctx.db.patch(card._id, { status: "active", updatedAt: now })),
    );
    if (oldPublishedStorageId !== undefined && oldPublishedStorageId !== published.imageStorageId)
      await removeIfUnreferenced(ctx, oldPublishedStorageId, profile._id);
    for (const assetId of oldPublishedMediaIds)
      if (!profileMediaAssetIds(published.media).includes(assetId))
        await removeIfMediaUnreferenced(ctx, profile._id, assetId);
    await ctx.db.insert("auditLogs", {
      scope: profile.scope,
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
      const pendingMediaUpload = await ctx.db
        .query("profileMediaUploadJobs")
        .withIndex("by_profileId_and_status_and_uploadWindowEndsAt", (query) =>
          query
            .eq("profileId", profile._id)
            .eq("status", "pending")
            .gt("uploadWindowEndsAt", Date.now()),
        )
        .first();
      if (pendingMediaUpload !== null) throw new Error(MEDIA_UPLOAD_PENDING);
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
      await assertOwnedProfileMediaSet(ctx, profile._id, profile.ownerId, profile.published.media);
      const attachedCards = await ctx.db
        .query("cards")
        .withIndex("by_profileId", (query) => query.eq("profileId", profile._id))
        .take(1001);
      if (attachedCards.length > 1000)
        throw new Error("Too many cards are assigned to this profile.");
      if (
        attachedCards.some(
          (card) => card.status === "claimable" && card.claimCodeClaimedAt === undefined,
        )
      ) {
        throw new Error("Claim the attached card before publishing this profile.");
      }
      const now = Date.now();
      await ctx.db.patch(profile._id, {
        status: args.status,
        updatedAt: now,
      });
      await Promise.all(
        attachedCards
          .filter((card) => card.status === "claimable" && card.claimCodeClaimedAt !== undefined)
          .map((card) => ctx.db.patch(card._id, { status: "active", updatedAt: now })),
      );
      await ctx.db.insert("auditLogs", {
        scope: profile.scope,
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
    }
    const now = Date.now();
    await ctx.db.patch(profile._id, {
      status: args.status,
      updatedAt: now,
      ...(args.status === "unpublished" ? { unpublishedAt: now } : {}),
      ...(args.status === "suspended" ? { suspendedAt: now } : {}),
    });
    await ctx.db.insert("auditLogs", {
      scope: profile.scope,
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
