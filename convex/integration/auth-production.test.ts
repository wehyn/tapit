import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";

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

describe("production authentication boundaries", () => {
  it("allows only Google authentication outside hosted demo", async () => {
    const t = testConvex();
    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "reset", email: "person@example.com" },
      }),
    ).rejects.toThrow("Only Google authentication is available.");
  });

  it("returns explicit unprovisioned access for an unverified Auth identity", async () => {
    const t = testConvex();
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "person@example.com" }),
    );
    await expect(
      t.withIdentity(identity(userId)).query(api.admin.currentAccess, {}),
    ).resolves.toEqual({
      authenticated: false,
      accountStatus: "unprovisioned",
      role: null,
      accountId: null,
      profileId: null,
      onboardingName: null,
    });
  });

  it("does not let an email-only identity complete live onboarding", async () => {
    const t = testConvex();
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "person@example.com" }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("customers", {
        userId,
        email: "person@example.com",
        role: "customer",
        status: "pending",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await expect(
      t.withIdentity(identity(userId)).mutation(api.customers.completeSelfServiceOnboarding, {
        name: "Person",
      }),
    ).rejects.toThrow("verified");
  });

  it("reports a verified unlinked invitation without granting access", async () => {
    const t = testConvex();
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "invited@example.com",
        emailVerificationTime: 1,
      });
      const customerId = await ctx.db.insert("customers", {
        email: "invited@example.com",
        role: "customer",
        status: "invited",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("invitations", {
        customerId,
        email: "invited@example.com",
        tokenHash: "invited-status",
        createdByUserId: userId,
        createdAt: 1,
      });
      return userId;
    });
    await expect(
      t.withIdentity(identity(userId)).query(api.admin.currentAccess, {}),
    ).resolves.toMatchObject({
      authenticated: false,
      accountStatus: "invited",
      role: null,
      accountId: null,
      profileId: null,
    });
  });
});
