import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";

import { mutation, query } from "./_generated/server";
import schema from "./schema";
import { isActiveCustomer, requireAdministrator, requireUser, sameScope } from "./admin";
import { profileAccess } from "./profileAccess";
import {
  projectOwnedProfile,
  projectPublicProfile,
  resolvePublishedRedirectDestination,
} from "./profileProjection";
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
    if (!isActiveCustomer(account)) return null;
    const publicProfile = await projectPublicProfile(ctx, profile);
    if (publicProfile === null) return null;
    const redirectDestination = resolvePublishedRedirectDestination(profile.published?.redirect);
    return redirectDestination === undefined
      ? publicProfile
      : { ...publicProfile, redirectDestination };
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
    if (profile === null || profile.ownerId !== customer._id || profile.scope !== customer.scope)
      return null;
    return await projectOwnedProfile(ctx, profile);
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
    if (profile === null || profile.ownerId !== account._id || profile.scope !== account.scope)
      return null;
    return { account, profile: await projectOwnedProfile(ctx, profile) };
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

export const adminListPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("profiles")),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    return await ctx.db
      .query("profiles")
      .withIndex("by_scope_and_status", (query) => query.eq("scope", account.scope))
      .paginate(args.paginationOpts);
  },
});

export const adminDetails = query({
  args: { profileId: v.id("profiles") },
  returns: v.object({
    profile: schema.doc("profiles"),
    customerEmail: v.union(v.string(), v.null()),
    assignedCardCount: v.number(),
    assignedCardCountIsCapped: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (profile === null || profile.scope !== account.scope) throw new Error("Profile not found.");
    const owner = await ctx.db.get(profile.ownerId);
    if (owner === null || owner.scope !== account.scope) throw new Error("Profile not found.");
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_profileId", (query) => query.eq("profileId", profile._id))
      .take(1001);
    return {
      profile: await projectOwnedProfile(ctx, profile),
      customerEmail: owner.email,
      assignedCardCount: Math.min(cards.length, 1000),
      assignedCardCountIsCapped: cards.length > 1000,
    };
  },
});

export const changeSlug = mutation({
  args: { profileId: v.id("profiles"), slug: v.string() },
  returns: v.object({ slug: v.string(), updatedAt: v.number() }),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (profile === null || profile.scope !== account.scope) throw new Error("Profile not found.");
    const normalizedSlug = normalizeProfileSlug(args.slug);
    if (normalizedSlug === profile.slug)
      return { slug: profile.slug, updatedAt: profile.updatedAt };
    const slugError = validateProfileSlugValue(normalizedSlug);
    if (slugError !== null) throw new Error(slugError);
    const duplicate = await ctx.db
      .query("profiles")
      .withIndex("by_slug", (query) => query.eq("slug", normalizedSlug))
      .unique();
    if (duplicate !== null && duplicate._id !== profile._id)
      throw new Error("That profile slug is already in use.");
    const now = Date.now();
    await ctx.db.patch(profile._id, {
      slug: normalizedSlug,
      draft: { ...profile.draft, slug: normalizedSlug },
      ...(profile.published === undefined
        ? {}
        : { published: { ...profile.published, slug: normalizedSlug } }),
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: profile.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "profile.slug_changed",
      profileId: profile._id,
      accountId: profile.ownerId,
      occurredAt: now,
      before: profile.slug,
      after: normalizedSlug,
    });
    return { slug: normalizedSlug, updatedAt: now };
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
    const { account, profile, userId } = await profileAccess(ctx, args.profileId);
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
    if (normalizedSlug !== profile.slug)
      throw new Error("The assigned profile slug cannot change except through an administrator.");
    const draft = { ...args.draft, slug: profile.slug };
    const oldDraftMediaIds = profileMediaAssetIds(profile.draft.media);
    if (args.draft.media === undefined) {
      if (profile.draft.media === undefined) delete draft.media;
      else draft.media = profile.draft.media;
    } else if (args.draft.media === null) {
      delete draft.media;
    }
    const slugError = validateProfileSlugValue(profile.slug);
    if (slugError !== null) throw new Error(slugError);
    const safetyErrors = validateDraftSafety(draft);
    if (safetyErrors.length > 0) throw new Error(safetyErrors.join(" "));
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
    if (account.role === "admin") {
      await ctx.db.insert("auditLogs", {
        scope: profile.scope,
        actorUserId: userId,
        actorLabel: "Administrator",
        action: "profile.draft_updated",
        profileId: profile._id,
        accountId: profile.ownerId,
        occurredAt: now,
      });
    }
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
    if (
      profile.draft.slug !== profile.slug ||
      (profile.published !== undefined && profile.published.slug !== profile.slug)
    )
      throw new Error("The saved profile slug snapshots do not match the assigned slug.");
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

export const unpublishMine = mutation({
  args: {},
  returns: v.object({ status: profileStatusValidator }),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();
    if (
      customer === null ||
      customer.role !== "customer" ||
      !isActiveCustomer(customer) ||
      customer.profileId === undefined
    ) {
      throw new Error("Customer profile not found.");
    }
    const profile = await ctx.db.get(customer.profileId);
    if (profile === null || profile.ownerId !== customer._id || !sameScope(customer, profile)) {
      throw new Error("Customer profile not found.");
    }
    if (profile.status !== "published") throw new Error("Profile is not currently published.");

    const now = Date.now();
    await ctx.db.patch(profile._id, {
      status: "unpublished",
      unpublishedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: profile.scope,
      actorUserId: userId,
      actorLabel: customer.email,
      action: "profile.unpublished",
      profileId: profile._id,
      accountId: customer._id,
      occurredAt: now,
      before: "published",
      after: "unpublished",
    });
    return { status: "unpublished" as const };
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
