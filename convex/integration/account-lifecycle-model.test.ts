import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";

// Regression test for the counterexample that verification/account-lifecycle found
// for DeletedHasNoSetup: claim a prepared setup link, request deletion, have an
// administrator approve it. See .claude/skills/verify-account-lifecycle.
const modules = import.meta.glob("../**/*.{ts,js}");
const identity = (userId: string) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});
const content = (slug: string) => ({
  name: "Prepared",
  slug,
  bio: "",
  links: [],
});

describe("account lifecycle model replay", () => {
  it("clears setupState when approving deletion of a claimed prepared account", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
      const userId = await ctx.db.insert("users", { email: "prepared@example.com" });
      await ctx.db.insert("customers", {
        userId: adminUserId,
        email: "admin@example.com",
        role: "admin",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      // The account after ClaimSetupLink and RequestDeletion.
      const customerId = await ctx.db.insert("customers", {
        userId,
        email: "prepared@example.com",
        role: "customer",
        status: "active",
        setupState: "active",
        deletionStatus: "requested",
        deletionRequestedAt: 2,
        createdAt: 1,
        updatedAt: 2,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId: customerId,
        slug: "prepared",
        status: "unpublished",
        draft: content("prepared"),
        createdAt: 1,
        updatedAt: 2,
      });
      await ctx.db.patch(customerId, { profileId });
      await ctx.db.insert("invitations", {
        customerId,
        kind: "prepared_setup",
        tokenHash: "a".repeat(64),
        expiresAt: Date.now() + 60_000,
        usedAt: 2,
        createdByUserId: adminUserId,
        createdAt: 1,
      });
      const requestId = await ctx.db.insert("deletionRequests", {
        customerId,
        requestedAt: 2,
        status: "requested",
      });
      return { adminUserId, customerId, requestId };
    });

    await t
      .withIdentity(identity(seeded.adminUserId))
      .mutation(api.customers.approveDeletion, { requestId: seeded.requestId });

    const customer = await t.run((ctx) => ctx.db.get(seeded.customerId));
    expect(customer).toMatchObject({
      status: "deleted",
      deletionStatus: "deleted",
      setupState: null,
    });
  });
});
