import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { getProfileImageMapping } from "./profileImages";

const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_JOB_BATCH = 8;
const STORAGE_PAGE_SIZE = 64;

type Counts = { scanned: number; deleted: number; retained: number; skipped: number };
const countsValidator = v.object({
  scanned: v.number(),
  deleted: v.number(),
  retained: v.number(),
  skipped: v.number(),
});

async function isReferenced(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  currentJobId: Id<"profileImageUploadJobs">,
) {
  if ((await getProfileImageMapping(ctx, storageId)) !== null) return true;
  const largeJobs = await ctx.db
    .query("profileImageUploadJobs")
    .withIndex("by_largeStorageId", (query) => query.eq("largeStorageId", storageId))
    .take(2);
  const smallJobs = await ctx.db
    .query("profileImageUploadJobs")
    .withIndex("by_smallStorageId", (query) => query.eq("smallStorageId", storageId))
    .take(2);
  const largeCandidates = await ctx.db
    .query("profileImageUploadJobs")
    .withIndex("by_scanLargeCandidateId", (query) => query.eq("scanLargeCandidateId", storageId))
    .take(2);
  const smallCandidates = await ctx.db
    .query("profileImageUploadJobs")
    .withIndex("by_scanSmallCandidateId", (query) => query.eq("scanSmallCandidateId", storageId))
    .take(2);
  if (
    [...largeJobs, ...smallJobs, ...largeCandidates, ...smallCandidates].some(
      (job) => job._id !== currentJobId,
    )
  )
    return true;
  const [
    mediaAssets,
    mediaPreviews,
    mediaJobs,
    mediaJobPreviews,
    mediaCandidates,
    previewCandidates,
    uploadSources,
    uploadQuarantines,
    variants,
  ] = await Promise.all([
    ctx.db
      .query("profileMediaAssets")
      .withIndex("by_storageId", (query) => query.eq("storageId", storageId))
      .take(1),
    ctx.db
      .query("profileMediaAssets")
      .withIndex("by_previewStorageId", (query) => query.eq("previewStorageId", storageId))
      .take(1),
    ctx.db
      .query("profileMediaUploadJobs")
      .withIndex("by_storageId", (query) => query.eq("storageId", storageId))
      .take(1),
    ctx.db
      .query("profileMediaUploadJobs")
      .withIndex("by_previewStorageId", (query) => query.eq("previewStorageId", storageId))
      .take(1),
    ctx.db
      .query("profileMediaUploadJobs")
      .withIndex("by_scanSourceCandidateId", (query) =>
        query.eq("scanSourceCandidateId", storageId),
      )
      .take(1),
    ctx.db
      .query("profileMediaUploadJobs")
      .withIndex("by_scanPreviewCandidateId", (query) =>
        query.eq("scanPreviewCandidateId", storageId),
      )
      .take(1),
    ctx.db
      .query("uploadAssets")
      .withIndex("by_sourceStorageId", (query) => query.eq("sourceStorageId", storageId))
      .take(1),
    ctx.db
      .query("uploadAssets")
      .withIndex("by_quarantineStorageId", (query) => query.eq("quarantineStorageId", storageId))
      .take(1),
    ctx.db
      .query("uploadAssetVariants")
      .withIndex("by_storageId", (query) => query.eq("storageId", storageId))
      .take(1),
  ]);
  if (
    mediaAssets.length > 0 ||
    mediaPreviews.length > 0 ||
    mediaJobs.length > 0 ||
    mediaJobPreviews.length > 0 ||
    mediaCandidates.length > 0 ||
    previewCandidates.length > 0 ||
    uploadSources.length > 0 ||
    uploadQuarantines.length > 0 ||
    variants.length > 0
  )
    return true;
  const draftProfiles = await ctx.db
    .query("profiles")
    .withIndex("by_draft_imageStorageId", (query) => query.eq("draft.imageStorageId", storageId))
    .take(1);
  if (draftProfiles.length > 0) return true;
  const publishedProfiles = await ctx.db
    .query("profiles")
    .withIndex("by_published_imageStorageId", (query) =>
      query.eq("published.imageStorageId", storageId),
    )
    .take(1);
  return publishedProfiles.length > 0;
}

async function reconcileJob(
  ctx: MutationCtx,
  job: Doc<"profileImageUploadJobs">,
  dryRun: boolean,
  now: number,
): Promise<Counts> {
  const counts: Counts = { scanned: 0, deleted: 0, retained: 0, skipped: 0 };
  const owner = await ctx.db.get(job.ownerId);
  const profile = await ctx.db.get(job.profileId);
  if (
    ((owner === null || profile === null) && job.status !== "failed") ||
    (profile !== null && profile.ownerId !== job.ownerId)
  ) {
    counts.skipped += 1;
    return counts;
  }

  const restartScan = job.scanLargeAmbiguous === true || job.scanSmallAmbiguous === true;
  const page = await ctx.db.system
    .query("_storage")
    .withIndex("by_creation_time", (query) =>
      query.gte("_creationTime", job.createdAt).lte("_creationTime", job.uploadWindowEndsAt),
    )
    .paginate({
      cursor: restartScan ? null : (job.scanCursor ?? null),
      numItems: STORAGE_PAGE_SIZE,
    });
  counts.scanned += page.page.length;

  for (const metadata of page.page) {
    if (metadata._id === job.largeStorageId || metadata._id === job.smallStorageId) continue;
    if (
      metadata._creationTime < job.createdAt ||
      metadata._creationTime > job.uploadWindowEndsAt ||
      (metadata.sha256 !== job.largeSha256 && metadata.sha256 !== job.smallSha256)
    )
      continue;
    if (await isReferenced(ctx, metadata._id, job._id)) counts.retained += 1;
    else if (dryRun) counts.retained += 1;
    else {
      await ctx.storage.delete(metadata._id);
      counts.deleted += 1;
    }
  }

  if (!page.isDone) {
    if (!dryRun) {
      await ctx.db.patch(job._id, {
        scanCursor: page.continueCursor,
        scanLargeCandidateId: undefined,
        scanSmallCandidateId: undefined,
        scanLargeAmbiguous: undefined,
        scanSmallAmbiguous: undefined,
      });
      await ctx.scheduler.runAfter(0, internal.profileImageCleanup.reconcileOneJob, {
        jobId: job._id,
        now,
        dryRun,
      });
    }
    return counts;
  }

  const candidates = new Map<Id<"_storage">, string>();
  let unresolved = false;
  if (job.largeStorageId !== undefined) candidates.set(job.largeStorageId, job.largeSha256);
  if (job.smallStorageId !== undefined && job.smallSha256 !== undefined)
    candidates.set(job.smallStorageId, job.smallSha256);
  if (!restartScan && job.scanLargeCandidateId !== undefined && !job.scanLargeAmbiguous)
    candidates.set(job.scanLargeCandidateId, job.largeSha256);
  if (
    !restartScan &&
    job.scanSmallCandidateId !== undefined &&
    !job.scanSmallAmbiguous &&
    job.smallSha256 !== undefined
  )
    candidates.set(job.scanSmallCandidateId, job.smallSha256);

  for (const [storageId, expectedSha256] of candidates) {
    const metadata = await ctx.db.system.get("_storage", storageId);
    if (metadata === null) continue;
    if (
      metadata.sha256 !== expectedSha256 ||
      metadata._creationTime < job.createdAt ||
      metadata._creationTime > job.uploadWindowEndsAt
    ) {
      counts.skipped += 1;
      unresolved = true;
      continue;
    }
    const referenced = await isReferenced(ctx, storageId, job._id);
    if (referenced) {
      counts.retained += 1;
      continue;
    }
    if (dryRun) counts.retained += 1;
    else {
      await ctx.storage.delete(storageId);
      counts.deleted += 1;
    }
  }

  if (!dryRun && unresolved) {
    await ctx.db.patch(job._id, {
      scanCursor: undefined,
      scanLargeCandidateId: undefined,
      scanSmallCandidateId: undefined,
      scanLargeAmbiguous: undefined,
      scanSmallAmbiguous: undefined,
    });
  } else if (!dryRun) await ctx.db.delete(job._id);
  return counts;
}

export const reconcileOneJob = internalMutation({
  args: {
    jobId: v.id("profileImageUploadJobs"),
    now: v.number(),
    dryRun: v.boolean(),
  },
  returns: countsValidator,
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job === null || job.uploadWindowEndsAt > args.now)
      return { scanned: 0, deleted: 0, retained: 0, skipped: 0 };
    return await reconcileJob(ctx, job, args.dryRun, args.now);
  },
});

export const reconcileExpired = internalMutation({
  args: {
    now: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    jobBatchSize: v.optional(v.number()),
  },
  returns: countsValidator,
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const dryRun = args.dryRun ?? false;
    const requestedBatch = Math.floor(args.jobBatchSize ?? DEFAULT_JOB_BATCH);
    const batchSize = Math.max(1, Math.min(requestedBatch, 32));
    const cutoff = now - ORPHAN_GRACE_MS;
    const totals: Counts = { scanned: 0, deleted: 0, retained: 0, skipped: 0 };
    for (const status of ["pending", "failed", "attached"] as const) {
      const jobs = await ctx.db
        .query("profileImageUploadJobs")
        .withIndex("by_status_and_createdAt", (query) =>
          query.eq("status", status).lte("createdAt", cutoff),
        )
        .take(batchSize);
      for (const job of jobs) {
        if (job.uploadWindowEndsAt > now) continue;
        const result: Counts = await ctx.runMutation(internal.profileImageCleanup.reconcileOneJob, {
          jobId: job._id,
          now,
          dryRun,
        });
        totals.scanned += result.scanned;
        totals.deleted += result.deleted;
        totals.retained += result.retained;
        totals.skipped += result.skipped;
      }
    }
    console.info("profile image orphan reconciliation", totals);
    return totals;
  },
});
