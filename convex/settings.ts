import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdministrator } from "./admin";

export const support = query({
  args: {},
  handler: async (ctx) => {
    const setting = await ctx.db
      .query("settings")
      .withIndex("by_key", (query) => query.eq("key", "supportUrl"))
      .unique();
    return setting?.value ?? "mailto:support@example.test";
  },
});

export const setSupport = mutation({
  args: { value: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireAdministrator(ctx);
    let parsed: URL;
    try {
      parsed = new URL(args.value.trim());
    } catch {
      throw new Error("Support destination must be a valid URL.");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "mailto:")
      throw new Error("Support destination must use HTTPS or mailto.");
    const now = Date.now();
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (query) => query.eq("key", "supportUrl"))
      .unique();
    if (existing === null)
      await ctx.db.insert("settings", {
        key: "supportUrl",
        value: args.value.trim(),
        updatedAt: now,
        updatedByUserId: userId,
      });
    else
      await ctx.db.patch(existing._id, {
        value: args.value.trim(),
        updatedAt: now,
        updatedByUserId: userId,
      });
    return { value: args.value.trim() };
  },
});
