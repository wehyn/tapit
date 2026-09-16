import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { isActiveCustomer, requireAdministrator, requireUser } from "./admin";

export const support = query({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const account = await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();
    if (account === null || !isActiveCustomer(account)) throw new Error("Active account required.");
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_key", (query) => query.eq("key", "supportUrl"))
      .take(100);
    const setting = settings.find((row) => row.scope === account.scope);
    return setting?.value ?? "mailto:support@example.test";
  },
});

export const setSupport = mutation({
  args: { value: v.string() },
  returns: v.object({ value: v.string() }),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    let parsed: URL;
    try {
      parsed = new URL(args.value.trim());
    } catch {
      throw new Error("Support destination must be a valid URL.");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "mailto:")
      throw new Error("Support destination must use HTTPS or mailto.");
    const now = Date.now();
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_key", (query) => query.eq("key", "supportUrl"))
      .take(100);
    const existing = settings.find((row) => row.scope === account.scope);
    if (existing === undefined)
      await ctx.db.insert("settings", {
        scope: account.scope,
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
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "settings.support_updated",
      accountId: account._id,
      occurredAt: now,
      before: existing?.value,
      after: args.value.trim(),
    });
    return { value: args.value.trim() };
  },
});
