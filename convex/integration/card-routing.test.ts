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
});
