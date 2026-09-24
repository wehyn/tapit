import { generateKeyPairSync } from "node:crypto";

import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");
const testJWTPrivateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString()
  .replace(/\n/g, " ");
const identity = (userId: Id<"users">) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});

describe("hosted-demo scope boundaries", () => {
  it("rejects Google sign-in without provisioning an application account", async () => {
    const previous = process.env.TAPIT_DEMO_AUTH_MODE;
    process.env.TAPIT_DEMO_AUTH_MODE = "hosted-demo";
    const previousSiteUrl = process.env.SITE_URL;
    const previousConvexSiteUrl = process.env.CONVEX_SITE_URL;
    const previousJWTPrivateKey = process.env.JWT_PRIVATE_KEY;
    process.env.SITE_URL = "https://tapit.example.test";
    process.env.CONVEX_SITE_URL = "https://tapit.test";
    process.env.JWT_PRIVATE_KEY = testJWTPrivateKey;
    try {
      const authModule = (await import("../auth")) as unknown as {
        authProviders?: Array<{ id: string }>;
      };
      expect(authModule.authProviders?.map((provider) => provider.id)).toEqual(["password"]);

      const t = convexTest(schema, modules);
      rateLimiter.register(t);

      await expect(
        t.action(api.auth.signIn, {
          provider: "google",
        }),
      ).rejects.toThrow("Only password authentication is available.");

      await t.run(async (ctx) => {
        expect(await ctx.db.query("customers").take(10)).toHaveLength(0);
      });
    } finally {
      if (previous === undefined) delete process.env.TAPIT_DEMO_AUTH_MODE;
      else process.env.TAPIT_DEMO_AUTH_MODE = previous;
      if (previousSiteUrl === undefined) delete process.env.SITE_URL;
      else process.env.SITE_URL = previousSiteUrl;
      if (previousConvexSiteUrl === undefined) delete process.env.CONVEX_SITE_URL;
      else process.env.CONVEX_SITE_URL = previousConvexSiteUrl;
      if (previousJWTPrivateKey === undefined) delete process.env.JWT_PRIVATE_KEY;
      else process.env.JWT_PRIVATE_KEY = previousJWTPrivateKey;
    }
  });

  it("keeps hosted-demo password rules and normalized account email", async () => {
    const previous = process.env.TAPIT_DEMO_AUTH_MODE;
    const previousSiteUrl = process.env.SITE_URL;
    const previousConvexSiteUrl = process.env.CONVEX_SITE_URL;
    const previousJWTPrivateKey = process.env.JWT_PRIVATE_KEY;
    process.env.TAPIT_DEMO_AUTH_MODE = "hosted-demo";
    process.env.SITE_URL = "https://tapit.example.test";
    process.env.CONVEX_SITE_URL = "https://tapit.test";
    process.env.JWT_PRIVATE_KEY = testJWTPrivateKey;
    try {
      const t = convexTest(schema, modules);

      await expect(
        t.action(api.auth.signIn, {
          provider: "password",
          params: { flow: "signUp", email: "Mixed@Example.test", password: "short" },
        }),
      ).rejects.toThrow("Password must be at least 8 characters.");

      const result = await t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "signUp", email: "Mixed@Example.test", password: "safe-password" },
      });
      expect(result.tokens).toBeTypeOf("object");
      await t.run(async (ctx) => {
        expect(
          await ctx.db
            .query("users")
            .withIndex("email", (q) => q.eq("email", "mixed@example.test"))
            .unique(),
        ).not.toBeNull();
        expect(await ctx.db.query("customers").take(10)).toHaveLength(0);
      });
    } finally {
      if (previous === undefined) delete process.env.TAPIT_DEMO_AUTH_MODE;
      else process.env.TAPIT_DEMO_AUTH_MODE = previous;
      if (previousSiteUrl === undefined) delete process.env.SITE_URL;
      else process.env.SITE_URL = previousSiteUrl;
      if (previousConvexSiteUrl === undefined) delete process.env.CONVEX_SITE_URL;
      else process.env.CONVEX_SITE_URL = previousConvexSiteUrl;
      if (previousJWTPrivateKey === undefined) delete process.env.JWT_PRIVATE_KEY;
      else process.env.JWT_PRIVATE_KEY = previousJWTPrivateKey;
    }
  });

  it("initializes idempotently without returning or storing a plaintext claim code", async () => {
    const previous = process.env.TAPIT_DEMO_AUTH_MODE;
    process.env.TAPIT_DEMO_AUTH_MODE = "hosted-demo";
    try {
      const t = convexTest(schema, modules);
      rateLimiter.register(t);
      const operatorUserId = await t.run(async (ctx) =>
        ctx.db.insert("users", { email: "operator@example.test", emailVerificationTime: 1 }),
      );
      const first = await t.mutation(internal.demo.initialize, { operatorUserId });
      const second = await t.mutation(internal.demo.initialize, { operatorUserId });
      expect(second).toEqual(first);
      expect(JSON.stringify(first)).not.toContain("MARA2Q8K");
      await t.run(async (ctx) => {
        const card = await ctx.db.get(first.claimableCardId);
        expect(card?.claimCodeHash).toBeDefined();
        expect(card).not.toHaveProperty("claimCode");
      });
    } finally {
      if (previous === undefined) delete process.env.TAPIT_DEMO_AUTH_MODE;
      else process.env.TAPIT_DEMO_AUTH_MODE = previous;
    }
  });

  it("resets only demo records and is repeatable", async () => {
    const previous = process.env.TAPIT_DEMO_AUTH_MODE;
    process.env.TAPIT_DEMO_AUTH_MODE = "hosted-demo";
    try {
      const t = convexTest(schema, modules);
      rateLimiter.register(t);
      const ids = await t.run(async (ctx) => {
        const operatorUserId = await ctx.db.insert("users", { email: "operator@example.test" });
        const customerId = await ctx.db.insert("customers", {
          email: "sentinel@example.test",
          role: "customer",
          status: "active",
          deletionStatus: "active",
          createdAt: 1,
          updatedAt: 1,
        });
        const profileId = await ctx.db.insert("profiles", {
          ownerId: customerId,
          slug: "sentinel",
          status: "draft",
          draft: { name: "Sentinel", slug: "sentinel", links: [] },
          createdAt: 1,
          updatedAt: 1,
        });
        const cardId = await ctx.db.insert("cards", {
          cardUrl: "https://tapit.test/c/sentinel",
          token: "sentinel",
          status: "registered",
          createdAt: 1,
          updatedAt: 1,
        });
        return { operatorUserId, customerId, profileId, cardId };
      });
      const first = await t.mutation(internal.demo.initialize, {
        operatorUserId: ids.operatorUserId,
      });
      const reset = await t.mutation(internal.demo.reset, { operatorUserId: ids.operatorUserId });
      const resetAgain = await t.mutation(internal.demo.reset, {
        operatorUserId: ids.operatorUserId,
      });
      expect(reset.status).toBe("initialized");
      expect(resetAgain.status).toBe("initialized");
      await t.run(async (ctx) => {
        expect(await ctx.db.get(ids.customerId)).not.toBeNull();
        expect(await ctx.db.get(ids.profileId)).not.toBeNull();
        expect(await ctx.db.get(ids.cardId)).not.toBeNull();
        expect(await ctx.db.get(first.claimableCardId)).toBeNull();
      });
    } finally {
      if (previous === undefined) delete process.env.TAPIT_DEMO_AUTH_MODE;
      else process.env.TAPIT_DEMO_AUTH_MODE = previous;
    }
  });

  it("keeps scoped and legacy administrator lists separate", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const ids = await t.run(async (ctx) => {
      const liveUser = await ctx.db.insert("users", {
        email: "live@example.com",
        emailVerificationTime: 1,
      });
      const demoUser = await ctx.db.insert("users", {
        email: "demo@example.com",
        emailVerificationTime: 1,
      });
      const base = {
        role: "admin" as const,
        status: "active" as const,
        deletionStatus: "active" as const,
        createdAt: 1,
        updatedAt: 1,
      };
      const live = await ctx.db.insert("customers", {
        ...base,
        userId: liveUser,
        email: "live@example.com",
      });
      const demo = await ctx.db.insert("customers", {
        ...base,
        userId: demoUser,
        email: "demo@example.com",
        scope: "demo",
      });
      return { liveUser, demoUser, live, demo };
    });
    const live = t.withIdentity(identity(ids.liveUser));
    const demo = t.withIdentity(identity(ids.demoUser));
    expect((await live.query(api.customers.list, {})).map((row) => row._id)).not.toContain(
      ids.demo,
    );
    expect((await demo.query(api.customers.list, {})).map((row) => row._id)).not.toContain(
      ids.live,
    );
  });

  it("does not lose scoped rows when other scopes fill the read limit", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const ids = await t.run(async (ctx) => {
      const demoUser = await ctx.db.insert("users", { email: "scoped-admin@example.com" });
      const base = {
        role: "customer" as const,
        status: "active" as const,
        deletionStatus: "active" as const,
        createdAt: 1,
        updatedAt: 1,
      };
      for (let i = 0; i < 101; i += 1) {
        const customerId = await ctx.db.insert("customers", {
          ...base,
          scope: "demo",
          email: `scoped-${i}@example.com`,
        });
        const profileId = await ctx.db.insert("profiles", {
          scope: "demo",
          ownerId: customerId,
          slug: `scoped-${i}`,
          status: "draft",
          draft: { name: `Scoped ${i}`, slug: `scoped-${i}`, links: [] },
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.insert("cards", {
          scope: "demo",
          cardUrl: `https://example.com/c/scoped-${i}`,
          token: `scoped-${i}`,
          profileId,
          status: "registered",
          createdAt: 1,
          updatedAt: 1,
        });
      }
      for (let i = 0; i < 101; i += 1) {
        const customerId = await ctx.db.insert("customers", {
          ...base,
          email: `legacy-${i}@example.com`,
        });
        await ctx.db.insert("profiles", {
          ownerId: customerId,
          slug: `legacy-${i}`,
          status: "draft",
          draft: { name: `Legacy ${i}`, slug: `legacy-${i}`, links: [] },
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.insert("cards", {
          cardUrl: `https://example.com/c/legacy-${i}`,
          token: `legacy-${i}`,
          status: "registered",
          createdAt: 1,
          updatedAt: 1,
        });
      }
      await ctx.db.insert("customers", {
        role: "admin",
        status: "active",
        deletionStatus: "active",
        scope: "demo",
        userId: demoUser,
        email: "scoped-admin@example.com",
        createdAt: 1,
        updatedAt: 1,
      });
      return { demoUser };
    });
    const admin = t.withIdentity(identity(ids.demoUser));
    expect((await admin.query(api.customers.list, {})).length).toBe(100);
    expect((await admin.query(api.profiles.adminList, {})).length).toBe(100);
    expect((await admin.query(api.cards.adminList, {})).length).toBe(100);
  });
});
