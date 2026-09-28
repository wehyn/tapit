import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { isActiveCustomer, requireAdministrator, requireUser, sameScope } from "./admin";
import { profileMediaValidator } from "./validators";

export const MAX_PROFILE_MEDIA_SIZE = 5 * 1024 * 1024;
export const MEDIA_REVISION_CONFLICT = "Media changed elsewhere. Reload and try again.";
export const MEDIA_UPLOAD_PENDING =
  "Media upload in progress. Wait for it to finish and try again.";
export const mediaContentTypeValidator = v.union(
  v.literal("image/jpeg"),
  v.literal("image/png"),
  v.literal("image/webp"),
);
type DbContext = Pick<QueryCtx | MutationCtx, "db" | "storage">;
type Media = Doc<"profiles">["draft"]["media"];
type UploadAccessMode = "owner" | "admin";

function canUploadMediaForProfile(
  actor: Doc<"customers"> | null,
  actorUserId: Id<"users"> | undefined,
  accessMode: UploadAccessMode | undefined,
  owner: Doc<"customers">,
  profile: Doc<"profiles">,
): boolean {
  if (actorUserId === undefined && accessMode === undefined) return isActiveCustomer(owner);
  if (actor === null || !isActiveCustomer(actor)) return false;
  if (accessMode === "owner")
    return actor._id === owner._id && isActiveCustomer(owner) && sameScope(actor, profile);
  if (accessMode === "admin")
    return actor.role === "admin" && sameScope(actor, profile) && sameScope(actor, owner);
  return false;
}

/** Resolves the authenticated account and verifies ownership of one profile. */
export async function profileOwnerAccess(ctx: QueryCtx | MutationCtx, profileId: Id<"profiles">) {
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
    !sameScope(account, profile) ||
    profile.ownerId !== account._id
  ) {
    throw new Error("Profile access denied.");
  }
  return { account, profile, userId };
}

/** Internal bridge for the customer upload action; only the profile owner can use it. */
export const getOwnerAccess = internalQuery({
  args: { profileId: v.id("profiles") },
  returns: v.object({
    profileId: v.id("profiles"),
    ownerId: v.id("customers"),
    userId: v.id("users"),
  }),
  handler: async (ctx, args) => {
    const { profile, userId } = await profileOwnerAccess(ctx, args.profileId);
    return { profileId: profile._id, ownerId: profile.ownerId, userId };
  },
});

/** Internal bridge for the administrator upload action; access is limited to the admin scope. */
export const getAdminAccess = internalQuery({
  args: { profileId: v.id("profiles") },
  returns: v.object({
    profileId: v.id("profiles"),
    ownerId: v.id("customers"),
    userId: v.id("users"),
  }),
  handler: async (ctx, args) => {
    const { account, userId } = await requireAdministrator(ctx);
    const profile = await ctx.db.get(args.profileId);
    const owner = profile === null ? null : await ctx.db.get(profile.ownerId);
    if (
      profile === null ||
      profile.scope !== account.scope ||
      owner === null ||
      owner.scope !== account.scope
    ) {
      throw new Error("Profile access denied.");
    }
    return { profileId: profile._id, ownerId: profile.ownerId, userId };
  },
});

export async function getProfileMediaAsset(ctx: DbContext, assetId: Id<"profileMediaAssets">) {
  return await ctx.db.get(assetId);
}

export async function assertOwnedProfileMedia(
  ctx: DbContext,
  profileId: Id<"profiles">,
  ownerId: Id<"customers">,
  assetId: Id<"profileMediaAssets">,
) {
  const asset = await getProfileMediaAsset(ctx, assetId);
  const metadata = asset === null ? null : await ctx.db.system.get("_storage", asset.storageId);
  if (
    asset === null ||
    asset.profileId !== profileId ||
    asset.ownerId !== ownerId ||
    metadata === null ||
    (asset.previewStorageId !== undefined &&
      (await ctx.db.system.get("_storage", asset.previewStorageId)) === null)
  ) {
    throw new Error("This media asset does not belong to this profile.");
  }
  return asset;
}

export function profileMediaAssetIds(media: Media): Id<"profileMediaAssets">[] {
  if (media === undefined) return [];
  const ids = [media.background?.assetId, ...media.slideshow.map((item) => item.assetId)].filter(
    (id): id is Id<"profileMediaAssets"> => id !== undefined,
  );
  return ids.filter((id, index) => ids.indexOf(id) === index);
}

export async function assertOwnedProfileMediaSet(
  ctx: DbContext,
  profileId: Id<"profiles">,
  ownerId: Id<"customers">,
  media: Media,
) {
  for (const assetId of profileMediaAssetIds(media))
    await assertOwnedProfileMedia(ctx, profileId, ownerId, assetId);
}

async function resolveImage(ctx: DbContext, asset: Doc<"profileMediaAssets">) {
  const url = await ctx.storage.getUrl(asset.storageId);
  const previewUrl =
    asset.previewStorageId === undefined ? null : await ctx.storage.getUrl(asset.previewStorageId);
  return { url, previewUrl };
}

export async function resolveOwnedProfileMedia(
  ctx: DbContext,
  profile: Doc<"profiles">,
  media: Media,
) {
  if (media === undefined) return undefined;
  const resolve = async <T extends { assetId: Id<"profileMediaAssets">; altText: string }>(
    item: T,
  ) => {
    try {
      const asset = await assertOwnedProfileMedia(ctx, profile._id, profile.ownerId, item.assetId);
      const urls = await resolveImage(ctx, asset);
      return urls.url === null && urls.previewUrl === null
        ? undefined
        : {
            ...item,
            ...(urls.url === null ? {} : { url: urls.url }),
            ...(urls.previewUrl === null ? {} : { previewUrl: urls.previewUrl }),
          };
    } catch {
      return undefined;
    }
  };
  const background = media.background === undefined ? undefined : await resolve(media.background);
  const slideshow = (await Promise.all(media.slideshow.map(resolve))).filter(
    (item): item is NonNullable<typeof item> => item !== undefined,
  );
  const hadMediaRegions = media.background !== undefined || media.slideshow.length > 0;
  if (hadMediaRegions && background === undefined && slideshow.length === 0) return undefined;
  return {
    ...(background === undefined ? {} : { background }),
    heroHeight: media.heroHeight,
    slideshow,
    autoplay: media.autoplay,
  };
}

export async function resolvePublishedProfileMedia(
  ctx: DbContext,
  profile: Doc<"profiles">,
  media: Media,
) {
  const owner = await resolveOwnedProfileMedia(ctx, profile, media);
  if (owner === undefined) return undefined;
  const project = (image: { altText: string; url?: string; previewUrl?: string }) => {
    const src = image.previewUrl ?? image.url;
    return src === undefined ? undefined : { src, alt: image.altText };
  };
  const slideshow = owner.slideshow.flatMap((item) => {
    const projected = project(item);
    return projected === undefined ? [] : [projected];
  });
  const background = owner.background === undefined ? undefined : project(owner.background);
  if (background === undefined && slideshow.length === 0) return undefined;
  return {
    ...(background === undefined
      ? {}
      : {
          background: {
            ...background,
            positionX: owner.background!.positionX,
            positionY: owner.background!.positionY,
          },
        }),
    heroHeight: owner.heroHeight,
    slideshow,
    autoplay: owner.autoplay,
  };
}

function referenced(profile: Doc<"profiles">, assetId: Id<"profileMediaAssets">) {
  return (
    profileMediaAssetIds(profile.draft.media).includes(assetId) ||
    profileMediaAssetIds(profile.published?.media).includes(assetId)
  );
}

export async function removeIfMediaUnreferenced(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  assetId: Id<"profileMediaAssets">,
) {
  const profile = await ctx.db.get(profileId);
  const asset = await ctx.db.get(assetId);
  if (profile === null || asset === null || referenced(profile, assetId)) return;
  await ctx.db.delete(assetId);
  await ctx.storage.delete(asset.storageId);
  if (asset.previewStorageId !== undefined) await ctx.storage.delete(asset.previewStorageId);
}

export async function deleteProfileMedia(ctx: MutationCtx, profileId: Id<"profiles">) {
  const jobs = await ctx.db
    .query("profileMediaUploadJobs")
    .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
    .take(1001);
  if (jobs.length > 1000)
    throw new Error("Too many profile media upload jobs are assigned to this profile.");
  const jobStorageIds = jobs
    .flatMap((job) => [job.storageId, job.previewStorageId])
    .filter((id): id is Id<"_storage"> => id !== undefined);
  const scanCandidates = jobs.flatMap((job) =>
    [
      job.scanSourceCandidateId === undefined
        ? undefined
        : {
            id: job.scanSourceCandidateId,
            sha256: job.sha256,
            createdAt: job.createdAt,
            uploadWindowEndsAt: job.uploadWindowEndsAt,
          },
      job.scanPreviewCandidateId === undefined || job.previewSha256 === undefined
        ? undefined
        : {
            id: job.scanPreviewCandidateId,
            sha256: job.previewSha256,
            createdAt: job.createdAt,
            uploadWindowEndsAt: job.uploadWindowEndsAt,
          },
    ].filter(
      (
        candidate,
      ): candidate is {
        id: Id<"_storage">;
        sha256: string;
        createdAt: number;
        uploadWindowEndsAt: number;
      } => candidate !== undefined,
    ),
  );
  for (const job of jobs) await ctx.db.delete(job._id);
  const assets = await ctx.db
    .query("profileMediaAssets")
    .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
    .take(1001);
  if (assets.length > 1000)
    throw new Error("Too many profile media assets are assigned to this profile.");
  for (const asset of assets) {
    await ctx.db.delete(asset._id);
    await ctx.storage.delete(asset.storageId);
    if (asset.previewStorageId !== undefined) await ctx.storage.delete(asset.previewStorageId);
  }
  for (const storageId of new Set(jobStorageIds)) await ctx.storage.delete(storageId);
  const remainingJobs = await ctx.db.query("profileMediaUploadJobs").take(1001);
  const profileImageMappings = await ctx.db.query("profileImages").take(1001);
  const profileImageJobs = await ctx.db.query("profileImageUploadJobs").take(1001);
  const profiles = await ctx.db.query("profiles").take(1001);
  if (remainingJobs.length <= 1000) {
    for (const candidate of scanCandidates) {
      const metadata = await ctx.db.system.get("_storage", candidate.id);
      if (
        metadata === null ||
        metadata.sha256 !== candidate.sha256 ||
        metadata._creationTime < candidate.createdAt ||
        metadata._creationTime > candidate.uploadWindowEndsAt
      )
        continue;
      const sourceAsset = await ctx.db
        .query("profileMediaAssets")
        .withIndex("by_storageId", (q) => q.eq("storageId", candidate.id))
        .unique();
      const previewAsset = await ctx.db
        .query("profileMediaAssets")
        .withIndex("by_previewStorageId", (q) => q.eq("previewStorageId", candidate.id))
        .unique();
      if (sourceAsset !== null || previewAsset !== null) continue;
      if (
        profileImageMappings.length > 1000 ||
        profileImageMappings.some(
          (mapping) =>
            mapping.storageId === candidate.id || mapping.smallStorageId === candidate.id,
        )
      )
        continue;
      if (
        profileImageJobs.length > 1000 ||
        profileImageJobs.some(
          (job) => job.largeStorageId === candidate.id || job.smallStorageId === candidate.id,
        )
      )
        continue;
      if (
        profiles.length > 1000 ||
        profiles.some(
          (profile) =>
            profile.draft.imageStorageId === candidate.id ||
            profile.published?.imageStorageId === candidate.id,
        )
      )
        continue;
      if (
        remainingJobs.some(
          (job) =>
            job.storageId === candidate.id ||
            job.previewStorageId === candidate.id ||
            job.scanSourceCandidateId === candidate.id ||
            job.scanPreviewCandidateId === candidate.id,
        )
      )
        continue;
      await ctx.storage.delete(candidate.id);
    }
  }
}

export const createUploadJob = internalMutation({
  args: {
    profileId: v.id("profiles"),
    ownerId: v.id("customers"),
    actorUserId: v.optional(v.id("users")),
    accessMode: v.optional(v.union(v.literal("owner"), v.literal("admin"))),
    sha256: v.string(),
    expectedMediaRevision: v.number(),
  },
  returns: v.id("profileMediaUploadJobs"),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    const owner = await ctx.db.get(args.ownerId);
    if (
      profile === null ||
      owner === null ||
      profile.ownerId !== args.ownerId ||
      !sameScope(owner, profile)
    )
      throw new Error("Profile access denied.");
    const actor =
      args.actorUserId === undefined
        ? null
        : await ctx.db
            .query("customers")
            .withIndex("by_userId", (query) => query.eq("userId", args.actorUserId!))
            .unique();
    if (!canUploadMediaForProfile(actor, args.actorUserId, args.accessMode, owner, profile))
      throw new Error("Profile access denied.");
    if (args.expectedMediaRevision !== (profile.mediaRevision ?? 0))
      throw new Error(MEDIA_REVISION_CONFLICT);
    const now = Date.now();
    return await ctx.db.insert("profileMediaUploadJobs", {
      ...args,
      status: "pending",
      createdAt: now,
      uploadWindowEndsAt: now + 10 * 60 * 1000,
    });
  },
});

export const getUploadJob = internalQuery({
  args: { jobId: v.id("profileMediaUploadJobs") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("profileMediaUploadJobs"),
      _creationTime: v.number(),
      profileId: v.id("profiles"),
      ownerId: v.id("customers"),
      actorUserId: v.optional(v.id("users")),
      accessMode: v.optional(v.union(v.literal("owner"), v.literal("admin"))),
      sha256: v.string(),
      previewSha256: v.optional(v.string()),
      storageId: v.optional(v.id("_storage")),
      previewStorageId: v.optional(v.id("_storage")),
      expectedMediaRevision: v.number(),
      status: v.union(v.literal("pending"), v.literal("attached"), v.literal("failed")),
      createdAt: v.number(),
      uploadWindowEndsAt: v.number(),
      scanCursor: v.optional(v.string()),
      scanSourceCandidateId: v.optional(v.id("_storage")),
      scanPreviewCandidateId: v.optional(v.id("_storage")),
      scanSourceAmbiguous: v.optional(v.boolean()),
      scanPreviewAmbiguous: v.optional(v.boolean()),
    }),
  ),
  handler: async (ctx, args) => await ctx.db.get(args.jobId),
});

export const markUploadJob = internalMutation({
  args: {
    jobId: v.id("profileMediaUploadJobs"),
    previewSha256: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    previewStorageId: v.optional(v.id("_storage")),
    status: v.optional(v.union(v.literal("pending"), v.literal("attached"), v.literal("failed"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job === null || job.status !== "pending")
      throw new Error("Upload job is no longer pending.");
    await ctx.db.patch(args.jobId, {
      ...(args.storageId === undefined ? {} : { storageId: args.storageId }),
      ...(args.previewSha256 === undefined ? {} : { previewSha256: args.previewSha256 }),
      ...(args.previewStorageId === undefined ? {} : { previewStorageId: args.previewStorageId }),
      ...(args.status === undefined ? {} : { status: args.status }),
    });
    return null;
  },
});

export const attach = internalMutation({
  args: {
    jobId: v.id("profileMediaUploadJobs"),
    storageId: v.id("_storage"),
    previewStorageId: v.id("_storage"),
    contentType: mediaContentTypeValidator,
    size: v.number(),
    width: v.number(),
    height: v.number(),
  },
  returns: v.object({
    assetId: v.id("profileMediaAssets"),
    url: v.string(),
    previewUrl: v.string(),
    mediaRevision: v.number(),
  }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    const profile = job === null ? null : await ctx.db.get(job.profileId);
    const owner = job === null ? null : await ctx.db.get(job.ownerId);
    if (
      job === null ||
      profile === null ||
      owner === null ||
      job.status !== "pending" ||
      job.storageId !== args.storageId ||
      job.previewStorageId !== args.previewStorageId ||
      profile.ownerId !== job.ownerId ||
      !sameScope(owner, profile)
    )
      throw new Error("Upload job does not match this media set.");
    const actorUserId = job.actorUserId;
    const actor =
      actorUserId === undefined
        ? null
        : await ctx.db
            .query("customers")
            .withIndex("by_userId", (query) => query.eq("userId", actorUserId))
            .unique();
    if (!canUploadMediaForProfile(actor, actorUserId, job.accessMode, owner, profile))
      throw new Error("Upload job does not match this media set.");
    if ((profile.mediaRevision ?? 0) !== job.expectedMediaRevision)
      throw new Error(MEDIA_REVISION_CONFLICT);
    const source = await ctx.db.system.get("_storage", args.storageId);
    const preview = await ctx.db.system.get("_storage", args.previewStorageId);
    if (source === null || preview === null || source.size !== args.size)
      throw new Error("The uploaded media was not found.");
    const assetId = await ctx.db.insert("profileMediaAssets", {
      scope: profile.scope,
      storageId: args.storageId,
      previewStorageId: args.previewStorageId,
      profileId: profile._id,
      ownerId: owner._id,
      contentType: args.contentType,
      size: args.size,
      width: args.width,
      height: args.height,
      createdAt: Date.now(),
    });
    await ctx.db.patch(profile._id, {
      mediaRevision: (profile.mediaRevision ?? 0) + 1,
      updatedAt: Date.now(),
    });
    if (actor?.role === "admin")
      await ctx.db.insert("auditLogs", {
        scope: profile.scope,
        actorUserId: actor.userId,
        actorLabel: "Administrator",
        action: "profile.media_uploaded",
        profileId: profile._id,
        accountId: profile.ownerId,
        occurredAt: Date.now(),
      });
    await ctx.db.patch(job._id, { status: "attached" });
    const url = await ctx.storage.getUrl(args.storageId);
    const previewUrl = await ctx.storage.getUrl(args.previewStorageId);
    if (url === null || previewUrl === null) throw new Error("The uploaded media was not found.");
    return { assetId, url, previewUrl, mediaRevision: (profile.mediaRevision ?? 0) + 1 };
  },
});

export const compensateUpload = internalMutation({
  args: {
    jobId: v.id("profileMediaUploadJobs"),
    storageId: v.optional(v.id("_storage")),
    previewStorageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job !== null && job.status !== "pending") return null;
    for (const id of [
      job?.storageId ?? args.storageId,
      job?.previewStorageId ?? args.previewStorageId,
    ])
      if (id !== undefined) await ctx.storage.delete(id);
    if (job !== null) await ctx.db.patch(job._id, { status: "failed" });
    return null;
  },
});

export const remove = mutation({
  args: {
    profileId: v.id("profiles"),
    assetId: v.id("profileMediaAssets"),
    expectedMediaRevision: v.number(),
  },
  returns: v.object({ mediaRevision: v.number() }),
  handler: async (ctx, args) => {
    const { profile } = await profileOwnerAccess(ctx, args.profileId);
    const revision = profile.mediaRevision ?? 0;
    if (args.expectedMediaRevision !== revision) throw new Error(MEDIA_REVISION_CONFLICT);
    await assertOwnedProfileMedia(ctx, profile._id, profile.ownerId, args.assetId);
    if (referenced(profile, args.assetId))
      throw new Error("This media asset is still referenced by the profile.");
    await removeIfMediaUnreferenced(ctx, profile._id, args.assetId);
    const next = revision + 1;
    await ctx.db.patch(profile._id, { mediaRevision: next, updatedAt: Date.now() });
    return { mediaRevision: next };
  },
});

export { profileMediaValidator };
