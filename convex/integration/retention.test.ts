/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");
const day = 24 * 60 * 60 * 1000;

describe("retention cleanup", () => {
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

  it("erases an overdue deletion request and its linked sign-in and profile data", async () => {
    const t = convexTest(schema, modules);
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
      const customerId = await ctx.db.insert("customers", {
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
        claimCodeHash: "old",
        challengeHash: "old",
        expiresAt: now - 31 * day,
        createdAt: 1,
      });
      const current = await ctx.db.insert("cardClaimChallenges", {
        cardId,
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
