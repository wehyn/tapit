import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

type ProfileMedia = Doc<"profiles">["draft"]["media"];

export type StorageExclusion =
  | { kind: "none" }
  | { kind: "profileImage"; id: Id<"profileImages"> }
  | { kind: "profileImageJob"; id: Id<"profileImageUploadJobs"> }
  | { kind: "uploadAsset"; id: Id<"uploadAssets"> }
  | { kind: "uploadAssetVariant"; id: Id<"uploadAssetVariants"> };

export type StorageInspectionIntent =
  | { kind: "cardOrderDesignUpload" }
  | { kind: "profileImageCleanup"; currentJobId: Id<"profileImageUploadJobs"> }
  | {
      kind: "profileImageRelease";
      mappingId: Id<"profileImages">;
      ignoredProfileId?: Id<"profiles">;
    }
  | { kind: "profileMediaCleanup"; currentJobId: Id<"profileMediaUploadJobs"> }
  | { kind: "profileMediaAssetRelease"; assetId: Id<"profileMediaAssets"> }
  | { kind: "accountErasure"; excluded: StorageExclusion }
  | {
      kind: "profileErasure";
      profileId: Id<"profiles">;
      excluded: StorageExclusion;
    };

export type StorageInspection =
  | { kind: "referenced"; staleMediaAssetIds: Id<"profileMediaAssets">[] }
  | { kind: "uncertain"; staleMediaAssetIds: Id<"profileMediaAssets">[] }
  | { kind: "unreferenced"; staleMediaAssetIds: Id<"profileMediaAssets">[] };

export function profileMediaAssetIds(media: ProfileMedia): Id<"profileMediaAssets">[] {
  if (media === undefined) return [];
  const ids = [media.background?.assetId, ...media.slideshow.map((item) => item.assetId)].filter(
    (id): id is Id<"profileMediaAssets"> => id !== undefined,
  );
  return ids.filter((id, index) => ids.indexOf(id) === index);
}

function exclusionFor(intent: StorageInspectionIntent): StorageExclusion {
  if (intent.kind === "profileImageRelease") return { kind: "profileImage", id: intent.mappingId };
  return intent.kind === "accountErasure" || intent.kind === "profileErasure"
    ? intent.excluded
    : { kind: "none" };
}

function ignoredProfileId(intent: StorageInspectionIntent) {
  if (intent.kind === "profileErasure") return intent.profileId;
  return intent.kind === "profileImageRelease" ? intent.ignoredProfileId : undefined;
}

function mediaAssetIsReferenced(
  profile: Doc<"profiles"> | null,
  assetId: Id<"profileMediaAssets">,
) {
  return (
    profile !== null &&
    (profileMediaAssetIds(profile.draft.media).includes(assetId) ||
      profileMediaAssetIds(profile.published?.media).includes(assetId))
  );
}

export async function inspectProfileStorage(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  intent: StorageInspectionIntent,
): Promise<StorageInspection> {
  const exclusion = exclusionFor(intent);
  const ignoredProfile = ignoredProfileId(intent);
  const mediaAssetToIgnore =
    intent.kind === "profileMediaAssetRelease" ? intent.assetId : undefined;
  const mediaJobToIgnore = intent.kind === "profileMediaCleanup" ? intent.currentJobId : undefined;
  const imageJobToIgnore =
    intent.kind === "profileImageCleanup"
      ? intent.currentJobId
      : exclusion.kind === "profileImageJob"
        ? exclusion.id
        : undefined;
  const mappingToIgnore = exclusion.kind === "profileImage" ? exclusion.id : undefined;
  const uploadAssetToIgnore = exclusion.kind === "uploadAsset" ? exclusion.id : undefined;
  const variantToIgnore = exclusion.kind === "uploadAssetVariant" ? exclusion.id : undefined;
  const isMediaCleanup = intent.kind === "profileMediaCleanup";

  const [sourceMediaAssets, previewMediaAssets] = await Promise.all([
    ctx.db
      .query("profileMediaAssets")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .take(isMediaCleanup || mediaAssetToIgnore !== undefined ? 2 : 1),
    ctx.db
      .query("profileMediaAssets")
      .withIndex("by_previewStorageId", (q) => q.eq("previewStorageId", storageId))
      .take(isMediaCleanup || mediaAssetToIgnore !== undefined ? 2 : 1),
  ]);
  const mediaAssets = new Map<Id<"profileMediaAssets">, Doc<"profileMediaAssets">>();
  for (const asset of [...sourceMediaAssets, ...previewMediaAssets])
    mediaAssets.set(asset._id, asset);

  const staleMediaAssetIds: Id<"profileMediaAssets">[] = [];
  let hasReferencedMediaAsset = false;
  if (isMediaCleanup) {
    for (const asset of mediaAssets.values()) {
      const profile = await ctx.db.get(asset.profileId);
      if (mediaAssetIsReferenced(profile, asset._id)) hasReferencedMediaAsset = true;
      else staleMediaAssetIds.push(asset._id);
    }
    if (hasReferencedMediaAsset) return { kind: "referenced", staleMediaAssetIds };
    if (sourceMediaAssets.length === 2 || previewMediaAssets.length === 2)
      return { kind: "uncertain", staleMediaAssetIds };
  } else if ([...mediaAssets.values()].some((asset) => asset._id !== mediaAssetToIgnore)) {
    return { kind: "referenced", staleMediaAssetIds };
  }

  const mappingLimit = mappingToIgnore === undefined ? 1 : 2;
  const imageJobLimit = imageJobToIgnore === undefined ? 1 : 2;
  const mediaJobLimit = mediaJobToIgnore === undefined ? 1 : 2;
  const profileLimit = ignoredProfile === undefined ? 1 : 2;
  const uploadAssetLimit = uploadAssetToIgnore === undefined ? 1 : 2;
  const variantLimit = variantToIgnore === undefined ? 1 : 2;

  const [
    largeMappings,
    smallMappings,
    largeImageJobs,
    smallImageJobs,
    largeImageCandidates,
    smallImageCandidates,
    mediaJobs,
    previewMediaJobs,
    sourceMediaCandidates,
    previewMediaCandidates,
    sourceAssets,
    quarantineAssets,
    variants,
    draftProfiles,
    publishedProfiles,
  ] = await Promise.all([
    ctx.db
      .query("profileImages")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .take(mappingLimit),
    ctx.db
      .query("profileImages")
      .withIndex("by_smallStorageId", (q) => q.eq("smallStorageId", storageId))
      .take(mappingLimit),
    ctx.db
      .query("profileImageUploadJobs")
      .withIndex("by_largeStorageId", (q) => q.eq("largeStorageId", storageId))
      .take(imageJobLimit),
    ctx.db
      .query("profileImageUploadJobs")
      .withIndex("by_smallStorageId", (q) => q.eq("smallStorageId", storageId))
      .take(imageJobLimit),
    ctx.db
      .query("profileImageUploadJobs")
      .withIndex("by_scanLargeCandidateId", (q) => q.eq("scanLargeCandidateId", storageId))
      .take(imageJobLimit),
    ctx.db
      .query("profileImageUploadJobs")
      .withIndex("by_scanSmallCandidateId", (q) => q.eq("scanSmallCandidateId", storageId))
      .take(imageJobLimit),
    ctx.db
      .query("profileMediaUploadJobs")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .take(mediaJobLimit),
    ctx.db
      .query("profileMediaUploadJobs")
      .withIndex("by_previewStorageId", (q) => q.eq("previewStorageId", storageId))
      .take(mediaJobLimit),
    ctx.db
      .query("profileMediaUploadJobs")
      .withIndex("by_scanSourceCandidateId", (q) => q.eq("scanSourceCandidateId", storageId))
      .take(mediaJobLimit),
    ctx.db
      .query("profileMediaUploadJobs")
      .withIndex("by_scanPreviewCandidateId", (q) => q.eq("scanPreviewCandidateId", storageId))
      .take(mediaJobLimit),
    ctx.db
      .query("uploadAssets")
      .withIndex("by_sourceStorageId", (q) => q.eq("sourceStorageId", storageId))
      .take(uploadAssetLimit),
    ctx.db
      .query("uploadAssets")
      .withIndex("by_quarantineStorageId", (q) => q.eq("quarantineStorageId", storageId))
      .take(uploadAssetLimit),
    ctx.db
      .query("uploadAssetVariants")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .take(variantLimit),
    ctx.db
      .query("profiles")
      .withIndex("by_draft_imageStorageId", (q) => q.eq("draft.imageStorageId", storageId))
      .take(profileLimit),
    ctx.db
      .query("profiles")
      .withIndex("by_published_imageStorageId", (q) => q.eq("published.imageStorageId", storageId))
      .take(profileLimit),
  ]);

  if (
    [...largeMappings, ...smallMappings].some((row) => row._id !== mappingToIgnore) ||
    [...largeImageJobs, ...smallImageJobs, ...largeImageCandidates, ...smallImageCandidates].some(
      (row) => row._id !== imageJobToIgnore,
    ) ||
    [...mediaJobs, ...previewMediaJobs, ...sourceMediaCandidates, ...previewMediaCandidates].some(
      (row) => row._id !== mediaJobToIgnore,
    ) ||
    [...sourceAssets, ...quarantineAssets].some((row) => row._id !== uploadAssetToIgnore) ||
    variants.some((row) => row._id !== variantToIgnore) ||
    [...draftProfiles, ...publishedProfiles].some((row) => row._id !== ignoredProfile)
  )
    return { kind: "referenced", staleMediaAssetIds };

  return { kind: "unreferenced", staleMediaAssetIds };
}
