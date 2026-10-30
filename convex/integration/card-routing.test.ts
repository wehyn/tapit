import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
const modules = import.meta.glob("../**/*.{ts,js}");
const identity = (id: string) => ({
  issuer: "https://tapit.test",
  subject: id,
  tokenIdentifier: `https://tapit.test|${id}`,
});

describe("card routing", () => {
  it("preserves query strings and enforces token and URL uniqueness", async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run(async (ctx) => {
      const user = await ctx.db.insert("users", { email: "admin@example.com" });
      await ctx.db.insert("customers", {
        userId: user,
        role: "admin",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      return user;
    });
    const admin = t.withIdentity(identity(adminId));
    const url = "https://tapit-eosin.vercel.app/c/router-1?batch=summer&source=qr";
    const id = await admin.mutation(api.cards.register, { cardUrl: url, token: "router-1" });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ cardUrl: url });
    await expect(t.query(api.cards.resolve, { token: "router-1" })).resolves.toEqual({
      status: "setup",
    });
    await expect(
      admin.mutation(api.cards.register, { cardUrl: url, token: "router-1" }),
    ).rejects.toThrow("already registered");
    await expect(
      admin.mutation(api.cards.register, {
        cardUrl: "https://tapit-eosin.vercel.app/c/router-1?other=1",
        token: "router-1",
      }),
    ).rejects.toThrow("already registered");
    await expect(
      admin.mutation(api.cards.register, {
        cardUrl: "https://tapit-eosin.vercel.app/c/router-2#frag",
        token: "router-2",
      }),
    ).rejects.toThrow();
    await expect(
      admin.mutation(api.cards.register, {
        cardUrl: "javascript://tapit-eosin.vercel.app/c/router-3",
        token: "router-3",
      }),
    ).rejects.toThrow();
  });

  it("keeps active unclaimed drafts private and hides invalidated codes", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "owner@example.com" });
      const ownerId = await ctx.db.insert("customers", {
        userId,
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId,
        slug: "private-owner",
        status: "draft",
        draft: {
          name: "Private Owner",
          slug: "private-owner",
          links: [],
        },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(ownerId, { profileId });
      const cardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit-eosin.vercel.app/c/private-card?claim=1",
        token: "private-card",
        profileId,
        status: "active",
        claimCodeHash: "unused-code-hash",
        createdAt: 1,
        updatedAt: 1,
      });
      return { cardId, ownerId };
    });

    const resolution = await t.query(api.cards.resolve, { token: "private-card" });
    expect(resolution).toEqual({ status: "claim" });
    expect(JSON.stringify(resolution)).not.toContain("Private Owner");

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.ownerId, { status: "deleted" });
    });
    await expect(t.query(api.cards.resolve, { token: "private-card" })).resolves.toEqual({
      status: "unavailable",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.ownerId, { status: "active" });
      await ctx.db.patch(ids.cardId, { claimCodeInvalidatedAt: 2 });
    });
    await expect(t.query(api.cards.resolve, { token: "private-card" })).resolves.toEqual({
      status: "unavailable",
    });
  });
});
