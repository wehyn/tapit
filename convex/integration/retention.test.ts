/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");
const day = 24 * 60 * 60 * 1000;

describe("retention cleanup", () => {
  it("erases requester corrections in bounded passes and resumes routing after the last request", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        email: "erased-requester@example.test",
        role: "customer",
        status: "deleted",
        deletionStatus: "deleted",
        deletionRequestedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("deletionRequests", {
        customerId,
        requestedAt: 1,
        status: "approved",
      });
      const ownerId = await ctx.db.insert("customers", {
        email: "surviving-owner@example.test",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId,
        slug: "surviving-profile",
        status: "published",
        draft: { name: "Surviving", slug: "surviving-profile", links: [] },
        published: { name: "Surviving", slug: "surviving-profile", links: [], publishedAt: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
      const cardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/surviving-card",
        token: "surviving-card",
        profileId,
        status: "active",
        claimCodeClaimedAt: 1,
        correctionRequestedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      for (let index = 0; index < 26; index++)
        await ctx.db.insert("cardCorrectionRequests", {
          cardId,
          requesterId: customerId,
          profileId,
          status: "open",
          createdAt: index + 1,
          updatedAt: index + 1,
        });
      return { customerId, cardId };
    });

    await t.mutation(internal.accountErasure.eraseAccountPass, { customerId: ids.customerId });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.cardId)).toMatchObject({ correctionRequestedAt: 1 });
      expect(
        await ctx.db
          .query("cardCorrectionRequests")
          .withIndex("by_cardId_and_status", (q) => q.eq("cardId", ids.cardId).eq("status", "open"))
          .collect(),
      ).toHaveLength(1);
    });
    vi.useFakeTimers();
    try {
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.cardId)).toMatchObject({ status: "active" });
      expect(await ctx.db.get(ids.cardId)).not.toHaveProperty("correctionRequestedAt");
      expect(
        await ctx.db
          .query("cardCorrectionRequests")
          .withIndex("by_cardId_and_status", (q) => q.eq("cardId", ids.cardId).eq("status", "open"))
          .collect(),
      ).toEqual([]);
    });
    await expect(t.query(api.cards.resolve, { token: "surviving-card" })).resolves.toMatchObject({
      status: "active",
      profile: { slug: "surviving-profile" },
    });
  });

  it("refreshes the overdue deletion warning when its supplied time crosses 30 days", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const requestedAt = now - 30 * day;
    const adminUserId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "admin@example.com" });
      await ctx.db.insert("customers", {
        userId,
        email: "admin@example.com",
        role: "admin",
        status: "active",
        deletionStatus: "active",
        createdAt: now,
        updatedAt: now,
      });
      const ownerUserId = await ctx.db.insert("users", { email: "owner@example.com" });
      const ownerId = await ctx.db.insert("customers", {
        userId: ownerUserId,
        email: "owner@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "requested",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("deletionRequests", {
        customerId: ownerId,
        requestedAt,
        status: "requested",
      });
      return userId;
    });
    const admin = t.withIdentity({
      issuer: "https://tapit.test",
      subject: adminUserId,
      tokenIdentifier: `https://tapit.test|${adminUserId}`,
    });

    await expect(admin.query(api.customers.hasOverdueDeletionRequests, { now })).resolves.toBe(
      false,
    );
    await expect(
      admin.query(api.customers.hasOverdueDeletionRequests, { now: requestedAt + 30 * day + 1 }),
    ).resolves.toBe(true);
  });

  it("removes expired analytics and audit records while preserving newer records", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const analyticsCutoff = new Date(now);
    analyticsCutoff.setUTCMonth(analyticsCutoff.getUTCMonth() - 13);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "owner@example.com" });
      const customerId = await ctx.db.insert("customers", {
        userId,
        email: "owner@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: now,
        updatedAt: now,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId: customerId,
        slug: "owner",
        status: "published",
        draft: { name: "Owner", slug: "owner", links: [] },
        createdAt: now,
        updatedAt: now,
      });
      const oldSession = await ctx.db.insert("analyticsSessions", {
        profileId,
        sessionKey: "old",
        firstSeenAt: now - 91 * day,
      });
      const newSession = await ctx.db.insert("analyticsSessions", {
        profileId,
        sessionKey: "new",
        firstSeenAt: now - 89 * day,
      });
      const oldAnalytics = await ctx.db.insert("analytics", {
        profileId,
        eventType: "profile_view",
        bucketStart: analyticsCutoff.getTime() - day,
        total: 1,
        uniqueCount: 1,
      });
      const newAnalytics = await ctx.db.insert("analytics", {
        profileId,
        eventType: "profile_view",
        bucketStart: analyticsCutoff.getTime() + day,
        total: 1,
        uniqueCount: 1,
      });
      const oldAudit = await ctx.db.insert("auditLogs", {
        actorLabel: "Owner",
        action: "profile.updated",
        occurredAt: now - 366 * day,
      });
      const newAudit = await ctx.db.insert("auditLogs", {
        actorLabel: "Owner",
        action: "profile.updated",
        occurredAt: now - 364 * day,
      });
      return { oldSession, newSession, oldAnalytics, newAnalytics, oldAudit, newAudit };
    });

    await t.mutation(internal.retention.prune, {});

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.oldSession)).toBeNull();
      expect(await ctx.db.get(ids.oldAnalytics)).toBeNull();
      expect(await ctx.db.get(ids.oldAudit)).toBeNull();
      expect(await ctx.db.get(ids.newSession)).not.toBeNull();
      expect(await ctx.db.get(ids.newAnalytics)).not.toBeNull();
      expect(await ctx.db.get(ids.newAudit)).not.toBeNull();
    });
  });

  it("prunes inactive analytics rate limit keys while preserving recently used keys", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "owner@example.com" });
      const customerId = await ctx.db.insert("customers", {
        userId,
        email: "owner@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: now,
        updatedAt: now,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId: customerId,
        slug: "owner",
        status: "published",
        draft: { name: "Owner", slug: "owner", links: [] },
        createdAt: now,
        updatedAt: now,
      });
      const oldKey = await ctx.db.insert("analyticsRateLimitKeys", {
        profileId,
        eventType: "profile_view",
        networkHash: "expired-network-hash",
        lastSeenAt: now - 25 * 60 * 60 * 1000,
      });
      const recentKey = await ctx.db.insert("analyticsRateLimitKeys", {
        profileId,
        eventType: "link_click",
        networkHash: "recent-network-hash",
        lastSeenAt: now - 23 * 60 * 60 * 1000,
      });
      return { oldKey, recentKey };
    });

    await t.mutation(internal.retention.prune, {});

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.oldKey)).toBeNull();
      expect(await ctx.db.get(ids.recentKey)).not.toBeNull();
    });
  });

  it("erases an overdue deletion request and its linked sign-in and profile data", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "erase@example.com" });
      const otherUserId = await ctx.db.insert("users", { email: "keep@example.com" });
      const authAccountId = await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "erase-google",
      });
      const rateLimitId = await ctx.db.insert("authRateLimits", {
        identifier: "erase@example.com",
        attemptsLeft: 1,
        lastAttemptTime: now,
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: now + day,
      });
      const tokenId = await ctx.db.insert("authRefreshTokens", {
        sessionId,
        expirationTime: now + day,
      });
      const customerId = await ctx.db.insert("customers", {
        userId,
        email: "erase@example.com",
        role: "customer",
        status: "deleted",
        deletionStatus: "deleted",
        deletionRequestedAt: now - 31 * day,
        createdAt: 1,
        updatedAt: now - 31 * day,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId: customerId,
        slug: "erase",
        status: "unpublished",
        draft: { name: "Erase", slug: "erase", email: "erase@example.com", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(customerId, { profileId });
      const cardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/erase",
        token: "erase",
        profileId,
        status: "inactive",
        createdAt: 1,
        updatedAt: 1,
      });
      const analyticsId = await ctx.db.insert("analytics", {
        profileId,
        eventType: "profile_view",
        bucketStart: now,
        total: 1,
        uniqueCount: 1,
      });
      const analyticsRateLimitKeyId = await ctx.db.insert("analyticsRateLimitKeys", {
        profileId,
        eventType: "profile_view",
        networkHash: "missing-ip",
        lastSeenAt: now,
      });
      const requestId = await ctx.db.insert("deletionRequests", {
        customerId,
        requestedAt: now - 31 * day,
        status: "approved",
      });
      return {
        userId,
        otherUserId,
        authAccountId,
        rateLimitId,
        sessionId,
        tokenId,
        customerId,
        profileId,
        cardId,
        analyticsId,
        analyticsRateLimitKeyId,
        requestId,
      };
    });

    await t.mutation(internal.accountErasure.eraseDueAccounts, {});
    vi.useFakeTimers();
    try {
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    await t.run(async (ctx) => {
      for (const id of [
        ids.userId,
        ids.authAccountId,
        ids.rateLimitId,
        ids.sessionId,
        ids.tokenId,
        ids.customerId,
        ids.profileId,
        ids.analyticsId,
        ids.analyticsRateLimitKeyId,
        ids.requestId,
      ])
        expect(await ctx.db.get(id)).toBeNull();
      expect(await ctx.db.get(ids.otherUserId)).not.toBeNull();
      const card = await ctx.db.get(ids.cardId);
      expect(card?.status).toBe("inactive");
      expect(card?.profileId).toBeUndefined();
    });
  });

  it("does not erase a request that still awaits administrator approval", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "pending@example.com" });
      const customerId = await ctx.db.insert("customers", {
        userId,
        email: "pending@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "requested",
        deletionRequestedAt: now - 31 * day,
        createdAt: 1,
        updatedAt: now - 31 * day,
      });
      const requestId = await ctx.db.insert("deletionRequests", {
        customerId,
        requestedAt: now - 31 * day,
        status: "requested",
      });
      return { userId, customerId, requestId };
    });
    await t.mutation(internal.accountErasure.eraseDueAccounts, {});
    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.userId)).not.toBeNull();
      expect(await ctx.db.get(ids.customerId)).not.toBeNull();
      expect(await ctx.db.get(ids.requestId)).not.toBeNull();
    });
  });

  it("refuses erasure if a deleted status lacks an approved request", async () => {
    const t = convexTest(schema, modules);
    const customerId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("customers", {
        email: "unapproved@example.com",
        role: "customer",
        status: "deleted",
        deletionStatus: "deleted",
        deletionRequestedAt: Date.now() - 31 * day,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("deletionRequests", {
        customerId: id,
        requestedAt: Date.now() - 31 * day,
        status: "requested",
      });
      return id;
    });
    await expect(
      t.mutation(internal.accountErasure.eraseAccountPass, { customerId }),
    ).rejects.toThrow("Administrator approval is required");
    await t.run(async (ctx) => {
      expect(await ctx.db.get(customerId)).not.toBeNull();
    });
  });

  it("erases an approved request without waiting for day 30", async () => {
    const t = convexTest(schema, modules);
    const customerId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("customers", {
        email: "approved@example.com",
        role: "customer",
        status: "deleted",
        deletionStatus: "deleted",
        deletionRequestedAt: Date.now() - day,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("deletionRequests", {
        customerId: id,
        requestedAt: Date.now() - day,
        status: "approved",
      });
      return id;
    });
    await t.mutation(internal.accountErasure.eraseDueAccounts, {});
    vi.useFakeTimers();
    try {
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    await t.run(async (ctx) => {
      expect(await ctx.db.get(customerId)).toBeNull();
    });
  });

  it("removes profile media created after deletion approval during account erasure", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        email: "media-erasure@example.com",
        role: "customer",
        status: "deleted",
        deletionStatus: "deleted",
        deletionRequestedAt: now,
        createdAt: 1,
        updatedAt: now,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId: customerId,
        slug: "media-erasure",
        status: "unpublished",
        draft: { name: "Media erasure", slug: "media-erasure", links: [] },
        createdAt: 1,
        updatedAt: now,
      });
      await ctx.db.insert("deletionRequests", {
        customerId,
        requestedAt: now,
        status: "approved",
      });
      const storageId = await ctx.storage.store(new Blob(["media source"]));
      const previewStorageId = await ctx.storage.store(new Blob(["media preview"]));
      const assetId = await ctx.db.insert("profileMediaAssets", {
        storageId,
        previewStorageId,
        profileId,
        ownerId: customerId,
        contentType: "image/png",
        size: 12,
        width: 100,
        height: 100,
        createdAt: now,
      });
      const jobId = await ctx.db.insert("profileMediaUploadJobs", {
        profileId,
        ownerId: customerId,
        sha256: "a".repeat(64),
        storageId,
        previewStorageId,
        expectedMediaRevision: 0,
        status: "attached",
        createdAt: now,
        uploadWindowEndsAt: now + 10 * 60 * 1000,
      });
      return { customerId, profileId, assetId, jobId, storageId, previewStorageId };
    });

    await t.mutation(internal.accountErasure.eraseAccountPass, { customerId: ids.customerId });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.profileId)).toBeNull();
      expect(await ctx.db.get(ids.assetId)).toBeNull();
      expect(await ctx.db.get(ids.jobId)).toBeNull();
      expect(await ctx.storage.getUrl(ids.storageId)).toBeNull();
      expect(await ctx.storage.getUrl(ids.previewStorageId)).toBeNull();
    });
  });

  it("preserves an incomplete media scan until account erasure cleanup resumes it", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        email: "media-scan-erasure@example.com",
        role: "customer",
        status: "deleted",
        deletionStatus: "deleted",
        deletionRequestedAt: now,
        createdAt: 1,
        updatedAt: now,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId: customerId,
        slug: "media-scan-erasure",
        status: "unpublished",
        draft: { name: "Media scan erasure", slug: "media-scan-erasure", links: [] },
        createdAt: 1,
        updatedAt: now,
      });
      await ctx.db.insert("deletionRequests", {
        customerId,
        requestedAt: now,
        status: "approved",
      });
      const jobId = await ctx.db.insert("profileMediaUploadJobs", {
        profileId,
        ownerId: customerId,
        sha256: "placeholder",
        expectedMediaRevision: 0,
        status: "failed",
        createdAt: now,
        uploadWindowEndsAt: now + 1,
      });
      for (let index = 0; index < 64; index++)
        await ctx.storage.store(new Blob([`media-scan-filler-${index}`]));
      const storageId = await ctx.storage.store(new Blob(["media-scan-candidate"]));
      const metadata = (await ctx.db.system.get("_storage", storageId))!;
      const page = await ctx.db.system
        .query("_storage")
        .withIndex("by_creation_time")
        .paginate({ cursor: null, numItems: 64 });
      await ctx.db.patch(jobId, {
        sha256: metadata.sha256,
        createdAt: metadata._creationTime - 1,
        uploadWindowEndsAt: metadata._creationTime + 1,
        scanCursor: page.continueCursor,
      });
      return {
        customerId,
        profileId,
        jobId,
        storageId,
        cleanupAt: metadata._creationTime + 2,
      };
    });

    await t.mutation(internal.accountErasure.eraseAccountPass, { customerId: ids.customerId });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.profileId)).toBeNull();
      expect(await ctx.db.get(ids.jobId)).not.toBeNull();
      expect(await ctx.storage.getUrl(ids.storageId)).not.toBeNull();
    });

    await t.mutation(internal.profileMediaCleanup.reconcileOneJob, {
      jobId: ids.jobId,
      now: ids.cleanupAt,
      dryRun: false,
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.jobId)).toBeNull();
      expect(await ctx.storage.getUrl(ids.storageId)).toBeNull();
    });
  });

  it("retains ambiguous media recovery after account erasure", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        email: "media-ambiguous-erasure@example.com",
        role: "customer",
        status: "deleted",
        deletionStatus: "deleted",
        deletionRequestedAt: now,
        createdAt: 1,
        updatedAt: now,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId: customerId,
        slug: "media-ambiguous-erasure",
        status: "unpublished",
        draft: { name: "Media ambiguous erasure", slug: "media-ambiguous-erasure", links: [] },
        createdAt: 1,
        updatedAt: now,
      });
      await ctx.db.insert("deletionRequests", {
        customerId,
        requestedAt: now,
        status: "approved",
      });
      const firstStorageId = await ctx.storage.store(new Blob(["ambiguous-media"]));
      const secondStorageId = await ctx.storage.store(new Blob(["ambiguous-media"]));
      const metadata = (await ctx.db.system.get("_storage", firstStorageId))!;
      const jobId = await ctx.db.insert("profileMediaUploadJobs", {
        profileId,
        ownerId: customerId,
        sha256: metadata.sha256,
        scanSourceCandidateId: firstStorageId,
        scanSourceAmbiguous: true,
        expectedMediaRevision: 0,
        status: "failed",
        createdAt: metadata._creationTime - 1,
        uploadWindowEndsAt: metadata._creationTime + 1,
      });
      return { customerId, profileId, jobId, firstStorageId, secondStorageId };
    });

    await t.mutation(internal.accountErasure.eraseAccountPass, { customerId: ids.customerId });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.profileId)).toBeNull();
      expect(await ctx.db.get(ids.jobId)).not.toBeNull();
    });

    await t.mutation(internal.profileMediaCleanup.reconcileOneJob, {
      jobId: ids.jobId,
      now: now + 10_000,
      dryRun: false,
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.jobId)).not.toBeNull();
      expect(await ctx.storage.getUrl(ids.firstStorageId)).not.toBeNull();
      expect(await ctx.storage.getUrl(ids.secondStorageId)).not.toBeNull();
    });
  });

  it("keeps image candidates recoverable after account erasure", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        email: "image-candidate-erasure@example.com",
        role: "customer",
        status: "deleted",
        deletionStatus: "deleted",
        deletionRequestedAt: now,
        createdAt: 1,
        updatedAt: now,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId: customerId,
        slug: "image-candidate-erasure",
        status: "unpublished",
        draft: { name: "Image candidate erasure", slug: "image-candidate-erasure", links: [] },
        createdAt: 1,
        updatedAt: now,
      });
      await ctx.db.insert("deletionRequests", {
        customerId,
        requestedAt: now,
        status: "approved",
      });
      const storageId = await ctx.storage.store(new Blob(["image-scan-candidate"]));
      const metadata = (await ctx.db.system.get("_storage", storageId))!;
      const jobId = await ctx.db.insert("profileImageUploadJobs", {
        profileId,
        ownerId: customerId,
        largeSha256: metadata.sha256,
        scanLargeCandidateId: storageId,
        status: "failed",
        createdAt: metadata._creationTime - 1,
        uploadWindowEndsAt: metadata._creationTime + 1,
      });
      return { customerId, profileId, jobId, storageId, cleanupAt: metadata._creationTime + 2 };
    });

    await t.mutation(internal.accountErasure.eraseAccountPass, { customerId: ids.customerId });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.profileId)).toBeNull();
      expect(await ctx.db.get(ids.jobId)).not.toBeNull();
      expect(await ctx.storage.getUrl(ids.storageId)).not.toBeNull();
    });

    await t.mutation(internal.profileImageCleanup.reconcileOneJob, {
      jobId: ids.jobId,
      now: ids.cleanupAt,
      dryRun: false,
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.jobId)).toBeNull();
      expect(await ctx.storage.getUrl(ids.storageId)).toBeNull();
    });
  });

  it("continues erasing another account when one due record is invalid", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const invalidId = await ctx.db.insert("customers", {
        email: "admin@example.com",
        role: "admin",
        status: "deleted",
        deletionStatus: "deleted",
        deletionRequestedAt: now - 40 * day,
        createdAt: 1,
        updatedAt: 1,
      });
      const validId = await ctx.db.insert("customers", {
        email: "customer@example.com",
        role: "customer",
        status: "deleted",
        deletionStatus: "deleted",
        deletionRequestedAt: now - 31 * day,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("deletionRequests", {
        customerId: validId,
        requestedAt: now - 31 * day,
        status: "approved",
      });
      return { invalidId, validId };
    });
    await t.mutation(internal.accountErasure.eraseDueAccounts, {});
    vi.useFakeTimers();
    try {
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.invalidId)).not.toBeNull();
      expect(await ctx.db.get(ids.validId)).toBeNull();
    });
  });

  it("keeps an image blob that another profile still references", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const imageId = await ctx.storage.store(new Blob(["image"], { type: "image/png" }));
      const removedCustomerId = await ctx.db.insert("customers", {
        email: "removed@example.com",
        role: "customer",
        status: "deleted",
        deletionStatus: "deleted",
        deletionRequestedAt: now - 31 * day,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("deletionRequests", {
        customerId: removedCustomerId,
        requestedAt: now - 31 * day,
        status: "approved",
      });
      const keptCustomerId = await ctx.db.insert("customers", {
        email: "kept@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const removedProfileId = await ctx.db.insert("profiles", {
        ownerId: removedCustomerId,
        slug: "removed",
        status: "unpublished",
        draft: { name: "Removed", slug: "removed", links: [], imageStorageId: imageId },
        createdAt: 1,
        updatedAt: 1,
      });
      const keptProfileId = await ctx.db.insert("profiles", {
        ownerId: keptCustomerId,
        slug: "kept",
        status: "published",
        draft: { name: "Kept", slug: "kept", links: [], imageStorageId: imageId },
        createdAt: 1,
        updatedAt: 1,
      });
      const removedMappingId = await ctx.db.insert("profileImages", {
        storageId: imageId,
        profileId: removedProfileId,
        ownerId: removedCustomerId,
        contentType: "image/png",
        size: 5,
        createdAt: 1,
      });
      const keptMappingId = await ctx.db.insert("profileImages", {
        storageId: imageId,
        profileId: keptProfileId,
        ownerId: keptCustomerId,
        contentType: "image/png",
        size: 5,
        createdAt: 1,
      });
      return { imageId, removedMappingId, keptMappingId };
    });
    await t.mutation(internal.accountErasure.eraseDueAccounts, {});
    vi.useFakeTimers();
    try {
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.removedMappingId)).toBeNull();
      expect(await ctx.db.get(ids.keptMappingId)).not.toBeNull();
      expect(await ctx.db.system.get("_storage", ids.imageId)).not.toBeNull();
    });
  });

  it("removes invitations 30 days after they expire or are accepted", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", { email: "admin@example.com" });
      const customerId = await ctx.db.insert("customers", {
        email: "invite@example.com",
        role: "customer",
        status: "invited",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const old = await ctx.db.insert("invitations", {
        customerId,
        email: "invite@example.com",
        tokenHash: "old",
        createdByUserId: adminId,
        createdAt: 1,
        expiresAt: now - 31 * day,
      });
      const accepted = await ctx.db.insert("invitations", {
        customerId,
        email: "invite@example.com",
        tokenHash: "accepted",
        createdByUserId: adminId,
        createdAt: 1,
        acceptedAt: now - 31 * day,
      });
      const current = await ctx.db.insert("invitations", {
        customerId,
        email: "invite@example.com",
        tokenHash: "current",
        createdByUserId: adminId,
        createdAt: 1,
        expiresAt: now + day,
      });
      return { old, accepted, current };
    });

    await t.mutation(internal.retention.prune, {});

    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.old)).toBeNull();
      expect(await ctx.db.get(ids.accepted)).toBeNull();
      expect(await ctx.db.get(ids.current)).not.toBeNull();
    });
  });

  it("removes expired card claim challenges after 30 days", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "owner@example.com" });
      const customerId = await ctx.db.insert("customers", {
        userId,
        email: "owner@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId: customerId,
        slug: "owner",
        status: "published",
        draft: { name: "Owner", slug: "owner", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      const cardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/owner",
        token: "owner",
        profileId,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const old = await ctx.db.insert("cardClaimChallenges", {
        cardId,
        userId,
        claimCodeHash: "old",
        challengeHash: "old",
        expiresAt: now - 31 * day,
        createdAt: 1,
      });
      const current = await ctx.db.insert("cardClaimChallenges", {
        cardId,
        userId,
        claimCodeHash: "new",
        challengeHash: "new",
        expiresAt: now + day,
        createdAt: 1,
      });
      return { old, current };
    });
    await t.mutation(internal.retention.prune, {});
    await t.run(async (ctx) => {
      expect(await ctx.db.get(ids.old)).toBeNull();
      expect(await ctx.db.get(ids.current)).not.toBeNull();
    });
  });
});
