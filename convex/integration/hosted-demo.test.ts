import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");
const identity = (userId: Id<"users">) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});

describe("hosted-demo scope boundaries", () => {
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
