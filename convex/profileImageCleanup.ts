import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { getProfileImageMapping } from "./profileImages";

const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_JOB_BATCH = 8;
const STORAGE_PAGE_SIZE = 64;

type Counts = { scanned: number; deleted: number; retained: number; skipped: number };

async function isReferenced(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  currentJobId: Id<"profileImageUploadJobs">,
) {
  if ((await getProfileImageMapping(ctx, storageId)) !== null) return true;
  const uploadJobs = await ctx.db.query("profileImageUploadJobs").take(1001);
  if (uploadJobs.length > 1000) return null;
  if (
    uploadJobs.some(
      (job) =>
        job._id !== currentJobId &&
        (job.largeStorageId === storageId || job.smallStorageId === storageId),
    )
  )
    return true;
  const profiles = await ctx.db.query("profiles").take(1001);
  if (profiles.length > 1000) return null;
  return profiles.some(
    (profile) =>
      profile.draft.imageStorageId === storageId || profile.published?.imageStorageId === storageId,
  );
}

function rememberCandidate(
  current: Id<"_storage"> | undefined,
  ambiguous: boolean | undefined,
  candidate: Id<"_storage">,
) {
  if (ambiguous || (current !== undefined && current !== candidate))
    return { candidate: current, ambiguous: true };
  return { candidate: current ?? candidate, ambiguous: false };
}

async function reconcileJob(
  ctx: MutationCtx,
  job: Doc<"profileImageUploadJobs">,
  dryRun: boolean,
): Promise<Counts> {
  const counts: Counts = { scanned: 0, deleted: 0, retained: 0, skipped: 0 };
  const owner = await ctx.db.get(job.ownerId);
  const profile = await ctx.db.get(job.profileId);
  if (owner === null || profile === null || profile.ownerId !== job.ownerId) {
    counts.skipped += 1;
    return counts;
  }

  const page = await ctx.db.system
    .query("_storage")
    .withIndex("by_creation_time", (query) =>
      query.gte("_creationTime", job.createdAt).lte("_creationTime", job.uploadWindowEndsAt),
    )
    .paginate({ cursor: job.scanCursor ?? null, numItems: STORAGE_PAGE_SIZE });
  counts.scanned += page.page.length;

  let largeCandidate = job.scanLargeCandidateId;
  let smallCandidate = job.scanSmallCandidateId;
  let largeAmbiguous = job.scanLargeAmbiguous;
  let smallAmbiguous = job.scanSmallAmbiguous;
  for (const metadata of page.page) {
    if (metadata._id === job.largeStorageId || metadata._id === job.smallStorageId) continue;
    if (metadata.sha256 === job.largeSha256) {
      const remembered = rememberCandidate(largeCandidate, largeAmbiguous, metadata._id);
      largeCandidate = remembered.candidate;
      largeAmbiguous = remembered.ambiguous;
    }
    if (job.smallSha256 !== undefined && metadata.sha256 === job.smallSha256) {
      const remembered = rememberCandidate(smallCandidate, smallAmbiguous, metadata._id);
      smallCandidate = remembered.candidate;
      smallAmbiguous = remembered.ambiguous;
    }
  }

  if (!page.isDone) {
    await ctx.db.patch(job._id, {
      scanCursor: page.continueCursor,
      scanLargeCandidateId: largeCandidate,
      scanSmallCandidateId: smallCandidate,
      scanLargeAmbiguous: largeAmbiguous,
      scanSmallAmbiguous: smallAmbiguous,
    });
    return counts;
  }

  const candidates = new Map<Id<"_storage">, string>();
  let unresolved = false;
  if (job.largeStorageId !== undefined) candidates.set(job.largeStorageId, job.largeSha256);
  if (job.smallStorageId !== undefined && job.smallSha256 !== undefined)
    candidates.set(job.smallStorageId, job.smallSha256);
  if (largeAmbiguous) {
    counts.skipped += 1;
    unresolved = true;
  } else if (largeCandidate !== undefined) candidates.set(largeCandidate, job.largeSha256);
  if (smallAmbiguous) {
    counts.skipped += 1;
    unresolved = true;
  } else if (smallCandidate !== undefined && job.smallSha256 !== undefined)
    candidates.set(smallCandidate, job.smallSha256);

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
    if (referenced === null) {
      counts.skipped += 1;
      unresolved = true;
      continue;
    }
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

  if (!dryRun && !unresolved) await ctx.db.delete(job._id);
  return counts;
}

export const reconcileExpired = internalMutation({
  args: {
    now: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
    jobBatchSize: v.optional(v.number()),
  },
  returns: v.object({
    scanned: v.number(),
    deleted: v.number(),
    retained: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const dryRun = args.dryRun ?? false;
    const requestedBatch = Math.floor(args.jobBatchSize ?? DEFAULT_JOB_BATCH);
    const batchSize = Math.max(1, Math.min(requestedBatch, 32));
    const cutoff = now - ORPHAN_GRACE_MS;
    const pending = await ctx.db
      .query("profileImageUploadJobs")
      .withIndex("by_status_and_createdAt", (query) =>
        query.eq("status", "pending").lte("createdAt", cutoff),
      )
      .take(batchSize);
    const failed = await ctx.db
      .query("profileImageUploadJobs")
      .withIndex("by_status_and_createdAt", (query) =>
        query.eq("status", "failed").lte("createdAt", cutoff),
      )
      .take(batchSize);
    const attached = await ctx.db
      .query("profileImageUploadJobs")
      .withIndex("by_status_and_createdAt", (query) =>
        query.eq("status", "attached").lte("createdAt", cutoff),
      )
      .take(batchSize);
    const jobs = [...pending, ...failed]
      .filter((job) => job.uploadWindowEndsAt <= now)
      .sort((left, right) => left.createdAt - right.createdAt)
      .slice(0, batchSize);
    const totals: Counts = { scanned: 0, deleted: 0, retained: 0, skipped: 0 };
    for (const job of jobs) {
      const result = await reconcileJob(ctx, job, dryRun);
      totals.scanned += result.scanned;
      totals.deleted += result.deleted;
      totals.retained += result.retained;
      totals.skipped += result.skipped;
    }
    if (!dryRun) {
      for (const job of attached) await ctx.db.delete(job._id);
    }
    console.info("profile image orphan reconciliation", totals);
    return totals;
  },
});
