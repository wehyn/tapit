import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { inspectProfileStorage } from "./profileStorageReferences";

const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_JOB_BATCH = 8;
const STORAGE_PAGE_SIZE = 64;

type Counts = { scanned: number; deleted: number; retained: number; skipped: number };
const jobStatusValidator = v.union(
  v.literal("pending"),
  v.literal("failed"),
  v.literal("attached"),
);
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
  const inspection = await inspectProfileStorage(ctx, storageId, {
    kind: "profileImageCleanup",
    currentJobId,
  });
  return inspection.kind !== "unreferenced";
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

  const restartScan =
    job.scanCursor === undefined &&
    (job.scanLargeAmbiguous === true || job.scanSmallAmbiguous === true);
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

  let largeCandidate = restartScan ? undefined : job.scanLargeCandidateId;
  let smallCandidate = restartScan ? undefined : job.scanSmallCandidateId;
  let largeAmbiguous = restartScan ? undefined : job.scanLargeAmbiguous;
  let smallAmbiguous = restartScan ? undefined : job.scanSmallAmbiguous;
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
    if (!dryRun) {
      await ctx.db.patch(job._id, {
        scanCursor: page.continueCursor,
        scanLargeCandidateId: largeCandidate,
        scanSmallCandidateId: smallCandidate,
        scanLargeAmbiguous: largeAmbiguous,
        scanSmallAmbiguous: smallAmbiguous,
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
  if (largeAmbiguous) {
    counts.skipped += 1;
    unresolved = true;
  } else if (largeCandidate !== undefined) candidates.set(largeCandidate, job.largeSha256);
  if (smallAmbiguous) {
    counts.skipped += 1;
    unresolved = true;
  } else if (smallCandidate !== undefined && job.smallSha256 !== undefined) {
    candidates.set(smallCandidate, job.smallSha256);
  }

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
      scanLargeAmbiguous: largeAmbiguous || undefined,
      scanSmallAmbiguous: smallAmbiguous || undefined,
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

export const prepareProfileForErasure = internalMutation({
  args: { profileId: v.id("profiles"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("profileImageUploadJobs")
      .withIndex("by_profileId", (query) => query.eq("profileId", args.profileId))
      .paginate({ cursor: args.cursor, numItems: 25 });
    const now = Date.now();
    for (const job of page.page) {
      if (job.status !== "failed" || job.actorUserId !== undefined || job.accessMode !== undefined)
        await ctx.db.patch(job._id, {
          status: "failed",
          actorUserId: undefined,
          accessMode: undefined,
        });
      await ctx.scheduler.runAfter(
        Math.max(0, job.uploadWindowEndsAt - now),
        internal.profileImageCleanup.reconcileOneJob,
        {
          jobId: job._id,
          now: Math.max(now, job.uploadWindowEndsAt),
          dryRun: false,
        },
      );
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.profileImageCleanup.prepareProfileForErasure, {
        profileId: args.profileId,
        cursor: page.continueCursor,
      });
  },
});

export const pageExpiredJobs = internalQuery({
  args: {
    status: jobStatusValidator,
    now: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) =>
    await ctx.db
      .query("profileImageUploadJobs")
      .withIndex("by_status_and_createdAt", (query) =>
        query.eq("status", args.status).lte("createdAt", args.now - ORPHAN_GRACE_MS),
      )
      .paginate(args.paginationOpts),
});

export const reconcileStatusPage = internalMutation({
  args: {
    status: jobStatusValidator,
    cursor: v.union(v.string(), v.null()),
    now: v.number(),
    dryRun: v.boolean(),
    batchSize: v.number(),
  },
  returns: countsValidator,
  handler: async (ctx, args) => {
    const batchSize = Math.max(1, Math.min(Math.floor(args.batchSize), 32));
    const page = await ctx.runQuery(internal.profileImageCleanup.pageExpiredJobs, {
      status: args.status,
      now: args.now,
      paginationOpts: { cursor: args.cursor, numItems: batchSize },
    });
    const totals: Counts = { scanned: 0, deleted: 0, retained: 0, skipped: 0 };
    for (const job of page.page) {
      if (job.uploadWindowEndsAt > args.now) continue;
      const result: Counts = await ctx.runMutation(internal.profileImageCleanup.reconcileOneJob, {
        jobId: job._id,
        now: args.now,
        dryRun: args.dryRun,
      });
      totals.scanned += result.scanned;
      totals.deleted += result.deleted;
      totals.retained += result.retained;
      totals.skipped += result.skipped;
    }
    if (!args.dryRun && !page.isDone)
      await ctx.scheduler.runAfter(0, internal.profileImageCleanup.reconcileStatusPage, {
        status: args.status,
        cursor: page.continueCursor,
        now: args.now,
        dryRun: args.dryRun,
        batchSize,
      });
    return totals;
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
    const totals: Counts = { scanned: 0, deleted: 0, retained: 0, skipped: 0 };
    for (const status of ["pending", "failed", "attached"] as const) {
      const result: Counts = await ctx.runMutation(
        internal.profileImageCleanup.reconcileStatusPage,
        { status, cursor: null, now, dryRun, batchSize },
      );
      totals.scanned += result.scanned;
      totals.deleted += result.deleted;
      totals.retained += result.retained;
      totals.skipped += result.skipped;
    }
    console.info("profile image orphan reconciliation", totals);
    return totals;
  },
});
