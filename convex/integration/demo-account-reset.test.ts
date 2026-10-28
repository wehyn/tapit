import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");
const testConvex = () => {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
};
const identity = (userId: Id<"users">) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});

afterEach(() => vi.useRealTimers());

describe("Demo account reset", () => {
  it("requires the authenticated Demo owner and preserves identity while bounded cleanup removes owned data", async () => {
    const t = testConvex();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "demo@example.test",
        emailVerificationTime: 1,
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "demo-google-id",
      });
      const otherUserId = await ctx.db.insert("users", { email: "other@example.test" });
      const customerId = await ctx.db.insert("customers", {
        userId,
        email: "demo@example.test",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        isDemo: true,
        cardOwnerAccessOverride: true,
        createdAt: 1,
        updatedAt: 1,
      });
      const otherCustomerId = await ctx.db.insert("customers", {
        userId: otherUserId,
        email: "other@example.test",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const sharedStorageId = await ctx.storage.store(new Blob(["shared profile image"]));
      const profileId = await ctx.db.insert("profiles", {
        ownerId: customerId,
        slug: "demo-profile",
        status: "published",
        draft: {
          name: "Demo Profile",
          slug: "demo-profile",
          imageStorageId: sharedStorageId,
          links: [],
        },
        published: {
          name: "Demo Profile",
          slug: "demo-profile",
          imageStorageId: sharedStorageId,
          links: [],
          publishedAt: 1,
        },
        createdAt: 1,
        updatedAt: 1,
      });
      const otherProfileId = await ctx.db.insert("profiles", {
        ownerId: otherCustomerId,
        slug: "other-profile",
        status: "draft",
        draft: {
          name: "Other Profile",
          slug: "other-profile",
          imageStorageId: sharedStorageId,
          links: [],
        },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(customerId, { profileId, onboardingName: "Demo Profile" });
      await ctx.db.patch(otherCustomerId, { profileId: otherProfileId });
      await ctx.db.insert("profileImages", {
        storageId: sharedStorageId,
        profileId,
        ownerId: customerId,
        contentType: "image/png",
        size: 20,
        createdAt: 1,
      });
      await ctx.db.insert("profileImages", {
        storageId: sharedStorageId,
        profileId: otherProfileId,
        ownerId: otherCustomerId,
        contentType: "image/png",
        size: 20,
        createdAt: 1,
      });
      const cardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/demo-card",
        token: "demo-card-token",
        profileId,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("cardClaimChallenges", {
        cardId,
        claimCodeHash: "claim-hash",
        challengeHash: "challenge-hash",
        expiresAt: Date.now() + 60_000,
        createdAt: 1,
      });
      await ctx.db.insert("links", {
        profileId,
        destination: "https://example.test",
        label: "Website",
        enabled: true,
        position: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("analytics", {
        profileId,
        eventType: "profile_view",
        bucketStart: 1,
        total: 1,
        uniqueCount: 1,
      });
      return {
        userId,
        customerId,
        otherCustomerId,
        profileId,
        otherProfileId,
        sharedStorageId,
        cardId,
      };
    });

    const owner = t.withIdentity(identity(ids.userId));
    await expect(
      owner.mutation(api.customers.resetDemoAccount, { customerId: ids.customerId } as never),
    ).rejects.toThrow();
    await expect(owner.mutation(api.customers.resetDemoAccount, {})).resolves.toBeNull();
    await expect(owner.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      authenticated: false,
      accountStatus: "pending",
      demoResetInProgress: true,
    });
    await expect(
      owner.mutation(api.customers.completeSelfServiceOnboarding, { name: "Too Soon" }),
    ).rejects.toThrow("Pending customer account required.");

    vi.useFakeTimers();
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await t.run(async (ctx) => {
      const customer = await ctx.db.get(ids.customerId);
      expect(customer).toMatchObject({
        userId: ids.userId,
        role: "customer",
        status: "pending",
        deletionStatus: "active",
        isDemo: true,
      });
      expect(customer?.profileId).toBeUndefined();
      expect(customer?.onboardingName).toBeUndefined();
      expect(customer?.cardOwnerAccessOverride).toBeUndefined();
      expect(customer?.demoResetInProgress).toBeUndefined();
      expect(await ctx.db.get(ids.userId)).not.toBeNull();
      expect(await ctx.db.query("authAccounts").collect()).toHaveLength(1);
      expect(await ctx.db.get(ids.profileId)).toBeNull();
      expect(await ctx.db.get(ids.cardId)).toBeNull();
      expect(await ctx.db.query("cardClaimChallenges").collect()).toHaveLength(0);
      expect(await ctx.db.query("links").collect()).toHaveLength(0);
      expect(await ctx.db.query("analytics").collect()).toHaveLength(0);
      expect(await ctx.db.get(ids.otherProfileId)).not.toBeNull();
      expect(await ctx.db.get(ids.otherCustomerId)).not.toBeNull();
      expect(await ctx.storage.get(ids.sharedStorageId)).not.toBeNull();
    });
    await expect(owner.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      authenticated: false,
      accountStatus: "pending",
      demoResetInProgress: false,
      isDemo: true,
    });
    await expect(
      owner.mutation(api.customers.completeSelfServiceOnboarding, { name: "Re-onboarded" }),
    ).resolves.toMatchObject({ customerId: ids.customerId });
  });

  it("does not treat hosted-demo scope as Demo classification", async () => {
    const t = testConvex();
    const userId = await t.run((ctx) => ctx.db.insert("users", { email: "hosted@example.test" }));
    await t.run(async (ctx) => {
      await ctx.db.insert("customers", {
        userId,
        scope: "demo",
        email: "hosted@example.test",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await expect(
      t.withIdentity(identity(userId)).mutation(api.customers.resetDemoAccount, {}),
    ).rejects.toThrow("Active Demo account required.");
  });
});
