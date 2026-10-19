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
  job: Doc<"profileMediaUploadJobs">,
  dryRun: boolean,
  now: number,
): Promise<Counts> {
  const counts: Counts = { scanned: 0, deleted: 0, retained: 0, skipped: 0 };
  const profile = await ctx.db.get(job.profileId);
  if (profile !== null && profile.ownerId !== job.ownerId) {
    counts.skipped += 1;
    return counts;
  }

  let sourceCandidate = job.scanSourceCandidateId;
  let previewCandidate = job.scanPreviewCandidateId;
  let sourceAmbiguous = job.scanSourceAmbiguous;
  let previewAmbiguous = job.scanPreviewAmbiguous;
  if (job.status !== "attached") {
    const page = await ctx.db.system
      .query("_storage")
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", job.createdAt).lte("_creationTime", job.uploadWindowEndsAt),
      )
      .paginate({ cursor: job.scanCursor ?? null, numItems: STORAGE_PAGE_SIZE });
    counts.scanned += page.page.length;
    for (const metadata of page.page) {
      if (metadata._id === job.storageId || metadata._id === job.previewStorageId) continue;
      if (metadata.sha256 === job.sha256) {
        const remembered = rememberCandidate(sourceCandidate, sourceAmbiguous, metadata._id);
        sourceCandidate = remembered.candidate;
        sourceAmbiguous = remembered.ambiguous;
      }
      if (job.previewSha256 !== undefined && metadata.sha256 === job.previewSha256) {
        const remembered = rememberCandidate(previewCandidate, previewAmbiguous, metadata._id);
        previewCandidate = remembered.candidate;
        previewAmbiguous = remembered.ambiguous;
      }
    }
    if (!page.isDone) {
      if (!dryRun) {
        await ctx.db.patch(job._id, {
          scanCursor: page.continueCursor,
          scanSourceCandidateId: sourceCandidate,
          scanPreviewCandidateId: previewCandidate,
          scanSourceAmbiguous: sourceAmbiguous,
          scanPreviewAmbiguous: previewAmbiguous,
        });
        await ctx.scheduler.runAfter(0, internal.profileMediaCleanup.reconcileOneJob, {
          jobId: job._id,
          now,
          dryRun,
        });
      }
      return counts;
    }
  }

  const candidates = new Map<Id<"_storage">, string | null>();
  let unresolved = false;
  if (job.storageId !== undefined) candidates.set(job.storageId, null);
  if (job.previewStorageId !== undefined) candidates.set(job.previewStorageId, null);
  if (job.status !== "attached" && sourceAmbiguous) {
    counts.skipped += 1;
    unresolved = true;
  } else if (job.status !== "attached" && sourceCandidate !== undefined)
    candidates.set(sourceCandidate, job.sha256);
  if (job.status !== "attached" && previewAmbiguous) {
    counts.skipped += 1;
    unresolved = true;
  } else if (
    job.status !== "attached" &&
    previewCandidate !== undefined &&
    job.previewSha256 !== undefined
  )
    candidates.set(previewCandidate, job.previewSha256);

  for (const [storageId, expectedSha256] of candidates) {
    const metadata = await ctx.db.system.get("_storage", storageId);
    if (metadata === null) continue;
    if (
      expectedSha256 !== null &&
      (metadata.sha256 !== expectedSha256 ||
        metadata._creationTime < job.createdAt ||
        metadata._creationTime > job.uploadWindowEndsAt)
    ) {
      counts.skipped += 1;
      unresolved = true;
      continue;
    }
    const inspection = await inspectProfileStorage(ctx, storageId, {
      kind: "profileMediaCleanup",
      currentJobId: job._id,
    });
    if (!dryRun) {
      for (const assetId of new Set(inspection.staleMediaAssetIds)) {
        const asset = await ctx.db.get(assetId);
        if (asset === null) continue;
        if (!candidates.has(asset.storageId)) candidates.set(asset.storageId, null);
        if (asset.previewStorageId !== undefined && !candidates.has(asset.previewStorageId))
          candidates.set(asset.previewStorageId, null);
        await ctx.db.delete(assetId);
      }
    }
    if (inspection.kind === "referenced") {
      counts.retained += 1;
      continue;
    }
    if (inspection.kind === "uncertain") {
      counts.skipped += 1;
      unresolved = true;
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
      scanSourceCandidateId: sourceCandidate,
      scanPreviewCandidateId: previewCandidate,
      scanSourceAmbiguous: sourceAmbiguous,
      scanPreviewAmbiguous: previewAmbiguous,
    });
  } else if (!dryRun) await ctx.db.delete(job._id);
  return counts;
}

const jobStatusValidator = v.union(
  v.literal("pending"),
  v.literal("failed"),
  v.literal("attached"),
);

export const pageExpiredJobs = internalQuery({
  args: {
    status: jobStatusValidator,
    now: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) =>
    await ctx.db
      .query("profileMediaUploadJobs")
      .withIndex("by_status_and_createdAt", (q) =>
        q.eq("status", args.status).lte("createdAt", args.now - ORPHAN_GRACE_MS),
      )
      .paginate(args.paginationOpts),
});

export const reconcileOneJob = internalMutation({
  args: { jobId: v.id("profileMediaUploadJobs"), now: v.number(), dryRun: v.boolean() },
  returns: v.object({
    scanned: v.number(),
    deleted: v.number(),
    retained: v.number(),
    skipped: v.number(),
  }),
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
      .query("profileMediaUploadJobs")
      .withIndex("by_profileId", (q) => q.eq("profileId", args.profileId))
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
        internal.profileMediaCleanup.reconcileOneJob,
        {
          jobId: job._id,
          now: Math.max(now, job.uploadWindowEndsAt),
          dryRun: false,
        },
      );
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.profileMediaCleanup.prepareProfileForErasure, {
        profileId: args.profileId,
        cursor: page.continueCursor,
      });
  },
});

export const reconcileStatusPage = internalMutation({
  args: {
    status: jobStatusValidator,
    cursor: v.union(v.string(), v.null()),
    now: v.number(),
    dryRun: v.boolean(),
    batchSize: v.number(),
  },
  returns: v.object({
    scanned: v.number(),
    deleted: v.number(),
    retained: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.runQuery(internal.profileMediaCleanup.pageExpiredJobs, {
      status: args.status,
      now: args.now,
      paginationOpts: { cursor: args.cursor, numItems: args.batchSize },
    });
    const totals: Counts = { scanned: 0, deleted: 0, retained: 0, skipped: 0 };
    for (const job of page.page) {
      const result: Counts = await ctx.runMutation(internal.profileMediaCleanup.reconcileOneJob, {
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
      await ctx.scheduler.runAfter(0, internal.profileMediaCleanup.reconcileStatusPage, {
        ...args,
        cursor: page.continueCursor,
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
  returns: v.object({
    scanned: v.number(),
    deleted: v.number(),
    retained: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const dryRun = args.dryRun ?? false;
    const batchSize = Math.max(1, Math.min(Math.floor(args.jobBatchSize ?? DEFAULT_JOB_BATCH), 32));
    const totals: Counts = { scanned: 0, deleted: 0, retained: 0, skipped: 0 };
    for (const status of ["pending", "failed", "attached"] as const) {
      const result: Counts = await ctx.runMutation(
        internal.profileMediaCleanup.reconcileStatusPage,
        {
          status,
          cursor: null,
          now,
          dryRun,
          batchSize,
        },
      );
      totals.scanned += result.scanned;
      totals.deleted += result.deleted;
      totals.retained += result.retained;
      totals.skipped += result.skipped;
    }
    console.info("profile media orphan reconciliation", totals);
    return totals;
  },
});
