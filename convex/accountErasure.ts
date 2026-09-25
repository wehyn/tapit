import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";

const BATCH = 25;

async function deleteStoredFile(
  ctx: MutationCtx,
  id: Id<"_storage"> | undefined,
  excluded?: {
    mappingId?: Id<"profileImages">;
    jobId?: Id<"profileImageUploadJobs">;
    assetId?: Id<"uploadAssets">;
    variantId?: Id<"uploadAssetVariants">;
  },
) {
  if (id === undefined || (await ctx.db.system.get("_storage", id)) === null) return;
  const [
    largeMappings,
    smallMappings,
    largeJobs,
    smallJobs,
    sourceAssets,
    quarantineAssets,
    variants,
  ] = await Promise.all([
    ctx.db
      .query("profileImages")
      .withIndex("by_storageId", (q) => q.eq("storageId", id))
      .take(2),
    ctx.db
      .query("profileImages")
      .withIndex("by_smallStorageId", (q) => q.eq("smallStorageId", id))
      .take(2),
    ctx.db
      .query("profileImageUploadJobs")
      .withIndex("by_largeStorageId", (q) => q.eq("largeStorageId", id))
      .take(2),
    ctx.db
      .query("profileImageUploadJobs")
      .withIndex("by_smallStorageId", (q) => q.eq("smallStorageId", id))
      .take(2),
    ctx.db
      .query("uploadAssets")
      .withIndex("by_sourceStorageId", (q) => q.eq("sourceStorageId", id))
      .take(2),
    ctx.db
      .query("uploadAssets")
      .withIndex("by_quarantineStorageId", (q) => q.eq("quarantineStorageId", id))
      .take(2),
    ctx.db
      .query("uploadAssetVariants")
      .withIndex("by_storageId", (q) => q.eq("storageId", id))
      .take(2),
  ]);
  if (
    [...largeMappings, ...smallMappings].some((row) => row._id !== excluded?.mappingId) ||
    [...largeJobs, ...smallJobs].some((row) => row._id !== excluded?.jobId) ||
    [...sourceAssets, ...quarantineAssets].some((row) => row._id !== excluded?.assetId) ||
    variants.some((row) => row._id !== excluded?.variantId)
  )
    return;
  await ctx.storage.delete(id);
}

async function eraseProfilePass(ctx: MutationCtx, profileId: Id<"profiles">): Promise<boolean> {
  const card = await ctx.db
    .query("cards")
    .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
    .first();
  if (card !== null) {
    const challenges = await ctx.db
      .query("cardClaimChallenges")
      .withIndex("by_cardId", (q) => q.eq("cardId", card._id))
      .take(BATCH);
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_cardId", (q) => q.eq("cardId", card._id))
      .take(BATCH);
    for (const row of challenges) await ctx.db.delete(row._id);
    for (const row of logs) await ctx.db.delete(row._id);
    if (challenges.length === 0 && logs.length === 0)
      await ctx.db.patch(card._id, {
        status: "inactive",
        profileId: undefined,
        assignmentReason: undefined,
        assignedAt: undefined,
        claimCodeHash: undefined,
        claimCodeGeneratedAt: undefined,
        claimCodeExpiresAt: undefined,
        claimCodeInvalidatedAt: Date.now(),
        claimCodeClaimedAt: undefined,
        deactivatedAt: card.deactivatedAt ?? Date.now(),
        updatedAt: Date.now(),
      });
    return true;
  }

  const [links, analytics, sessions, designs, logs] = await Promise.all([
    ctx.db
      .query("links")
      .withIndex("by_profile_position", (q) => q.eq("profileId", profileId))
      .take(BATCH),
    ctx.db
      .query("analytics")
      .withIndex("by_profile_bucket", (q) => q.eq("profileId", profileId))
      .take(BATCH),
    ctx.db
      .query("analyticsSessions")
      .withIndex("by_profile_session", (q) => q.eq("profileId", profileId))
      .take(BATCH),
    ctx.db
      .query("cardDesigns")
      .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
      .take(BATCH),
    ctx.db
      .query("auditLogs")
      .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
      .take(BATCH),
  ]);
  for (const row of links) await ctx.db.delete(row._id);
  for (const row of analytics) await ctx.db.delete(row._id);
  for (const row of sessions) await ctx.db.delete(row._id);
  for (const row of designs) await ctx.db.delete(row._id);
  for (const row of logs) await ctx.db.delete(row._id);
  if ([links, analytics, sessions, designs, logs].some((rows) => rows.length > 0)) return true;

  const image = await ctx.db
    .query("profileImages")
    .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
    .first();
  if (image !== null) {
    await deleteStoredFile(ctx, image.storageId, { mappingId: image._id });
    await deleteStoredFile(ctx, image.smallStorageId, { mappingId: image._id });
    await ctx.db.delete(image._id);
    return true;
  }
  const job = await ctx.db
    .query("profileImageUploadJobs")
    .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
    .first();
  if (job !== null) {
    await deleteStoredFile(ctx, job.largeStorageId, { jobId: job._id });
    await deleteStoredFile(ctx, job.smallStorageId, { jobId: job._id });
    await ctx.db.delete(job._id);
    return true;
  }
  await ctx.db.delete(profileId);
  return true;
}

async function eraseAssetPass(ctx: MutationCtx, customerId: Id<"customers">): Promise<boolean> {
  const asset = await ctx.db
    .query("uploadAssets")
    .withIndex("by_ownerId_and_status", (q) => q.eq("ownerId", customerId))
    .first();
  if (asset === null) return false;
  const variants = await ctx.db
    .query("uploadAssetVariants")
    .withIndex("by_assetId_and_purpose", (q) => q.eq("assetId", asset._id))
    .take(BATCH);
  const references = await ctx.db
    .query("uploadAssetReferences")
    .withIndex("by_assetId", (q) => q.eq("assetId", asset._id))
    .take(BATCH);
  for (const row of variants) {
    await deleteStoredFile(ctx, row.storageId, { variantId: row._id });
    await ctx.db.delete(row._id);
  }
  for (const row of references) await ctx.db.delete(row._id);
  if (variants.length === 0 && references.length === 0) {
    await deleteStoredFile(ctx, asset.quarantineStorageId, { assetId: asset._id });
    if (asset.sourceStorageId !== asset.quarantineStorageId)
      await deleteStoredFile(ctx, asset.sourceStorageId, { assetId: asset._id });
    await ctx.db.delete(asset._id);
  }
  return true;
}

async function eraseAuthPass(ctx: MutationCtx, userId: Id<"users">): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (user === null) return false;
  const session = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .first();
  if (session !== null) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
      .take(BATCH);
    const verifiers = await ctx.db
      .query("authVerifiers")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
      .take(BATCH);
    for (const row of tokens) await ctx.db.delete(row._id);
    for (const row of verifiers) await ctx.db.delete(row._id);
    if (tokens.length === 0 && verifiers.length === 0) await ctx.db.delete(session._id);
    return true;
  }
  const account = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .first();
  if (account !== null) {
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .take(BATCH);
    for (const row of codes) await ctx.db.delete(row._id);
    if (codes.length === 0) {
      const rateLimit = await ctx.db
        .query("authRateLimits")
        .withIndex("identifier", (q) => q.eq("identifier", account._id))
        .first();
      if (rateLimit !== null) await ctx.db.delete(rateLimit._id);
      await ctx.db.delete(account._id);
    }
    return true;
  }
  for (const identifier of [user.email, user.phone]) {
    if (identifier === undefined) continue;
    const rateLimit = await ctx.db
      .query("authRateLimits")
      .withIndex("identifier", (q) => q.eq("identifier", identifier))
      .first();
    if (rateLimit !== null) await ctx.db.delete(rateLimit._id);
  }
  await ctx.db.delete(userId);
  return true;
}

async function eraseCustomerPass(ctx: MutationCtx, customerId: Id<"customers">): Promise<boolean> {
  const customer = await ctx.db.get(customerId);
  if (customer === null) return false;
  if (
    customer.role !== "customer" ||
    customer.status !== "deleted" ||
    customer.deletionStatus !== "deleted" ||
    customer.deletionRequestedAt === undefined
  )
    throw new Error("Only a verified customer deletion request may be erased.");
  const approvedRequest = await ctx.db
    .query("deletionRequests")
    .withIndex("by_customerId_and_status", (q) =>
      q.eq("customerId", customerId).eq("status", "approved"),
    )
    .first();
  if (approvedRequest === null)
    throw new Error("Administrator approval is required before account erasure.");

  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", customerId))
    .first();
  if (profile !== null) return await eraseProfilePass(ctx, profile._id);
  if (await eraseAssetPass(ctx, customerId)) return true;

  const [invitations, requests, designs, accountLogs, actorLogs] = await Promise.all([
    ctx.db
      .query("invitations")
      .withIndex("by_customerId", (q) => q.eq("customerId", customerId))
      .take(BATCH),
    ctx.db
      .query("deletionRequests")
      .withIndex("by_customerId", (q) => q.eq("customerId", customerId))
      .take(BATCH),
    ctx.db
      .query("cardDesigns")
      .withIndex("by_customerId", (q) => q.eq("customerId", customerId))
      .take(BATCH),
    ctx.db
      .query("auditLogs")
      .withIndex("by_accountId", (q) => q.eq("accountId", customerId))
      .take(BATCH),
    customer.userId === undefined
      ? Promise.resolve([])
      : ctx.db
          .query("auditLogs")
          .withIndex("by_actorUserId", (q) => q.eq("actorUserId", customer.userId!))
          .take(BATCH),
  ]);
  for (const row of invitations) await ctx.db.delete(row._id);
  for (const row of requests) if (row._id !== approvedRequest._id) await ctx.db.delete(row._id);
  for (const row of designs) await ctx.db.delete(row._id);
  for (const row of accountLogs) await ctx.db.delete(row._id);
  for (const row of actorLogs)
    if (!accountLogs.some((accountLog) => accountLog._id === row._id)) await ctx.db.delete(row._id);
  if (
    [invitations, designs, accountLogs, actorLogs].some((rows) => rows.length > 0) ||
    requests.some((row) => row._id !== approvedRequest._id)
  )
    return true;

  if (customer.userId !== undefined) {
    const otherLinks = await ctx.db
      .query("customers")
      .withIndex("by_userId", (q) => q.eq("userId", customer.userId!))
      .take(2);
    if (otherLinks.some((linked) => linked._id !== customerId))
      throw new Error("Auth user is linked to another account.");
    if (await ctx.db.get(customer.userId)) return await eraseAuthPass(ctx, customer.userId);
  }
  await ctx.db.delete(approvedRequest._id);
  await ctx.db.delete(customerId);
  await ctx.db.insert("auditLogs", {
    actorLabel: "System",
    action: "account.erased",
    occurredAt: Date.now(),
  });
  return true;
}

export const eraseAccountPass = internalMutation({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    if ((await ctx.db.get(args.customerId)) === null) return;
    await eraseCustomerPass(ctx, args.customerId);
    if ((await ctx.db.get(args.customerId)) !== null)
      await ctx.scheduler.runAfter(0, internal.accountErasure.eraseAccountPass, args);
  },
});

export const eraseDueAccounts = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const due = await ctx.db
      .query("customers")
      .withIndex("by_deletionStatus_and_deletionRequestedAt", (q) =>
        q
          .eq("deletionStatus", "deleted")
          .gt("deletionRequestedAt", 0)
          .lte("deletionRequestedAt", Date.now()),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: BATCH });
    for (const customer of due.page) {
      if (customer.role !== "customer") continue;
      await ctx.scheduler.runAfter(0, internal.accountErasure.eraseAccountPass, {
        customerId: customer._id,
      });
    }
    if (!due.isDone)
      await ctx.scheduler.runAfter(0, internal.accountErasure.eraseDueAccounts, {
        cursor: due.continueCursor,
      });
  },
});
