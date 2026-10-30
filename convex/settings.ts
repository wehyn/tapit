import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { isActiveCustomer, requireAdministrator, requireUser } from "./admin";
import { DEFAULT_SUPPORT_URL } from "../src/lib/support";

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
      .withIndex("by_scope_and_key", (query) =>
        query.eq("scope", account.scope).eq("key", "supportUrl"),
      )
      .take(1);
    const setting = settings[0];
    return setting?.value ?? DEFAULT_SUPPORT_URL;
  },
});

export const returnInstructions = query({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const { account } = await requireAdministrator(ctx);
    const rows = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (query) =>
        query.eq("scope", account.scope).eq("key", "lostCardReturnInstructions"),
      )
      .take(1);
    return rows[0]?.value ?? "";
  },
});

export const setReturnInstructions = mutation({
  args: { value: v.string() },
  returns: v.object({ value: v.string() }),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    if (args.value.length > 4000)
      throw new Error("Return instructions must be 4,000 characters or fewer.");
    const value = args.value.trim();
    const rows = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (query) =>
        query.eq("scope", account.scope).eq("key", "lostCardReturnInstructions"),
      )
      .take(1);
    const existing = rows[0];
    const now = Date.now();
    if (existing === undefined)
      await ctx.db.insert("settings", {
        scope: account.scope,
        key: "lostCardReturnInstructions",
        value,
        updatedAt: now,
        updatedByUserId: userId,
      });
    else await ctx.db.patch(existing._id, { value, updatedAt: now, updatedByUserId: userId });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "settings.lost_card_return_instructions_updated",
      accountId: account._id,
      occurredAt: now,
      before: existing?.value,
      after: value,
    });
    return { value };
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
    if (
      (parsed.protocol === "https:" &&
        (!parsed.hostname || parsed.username.length > 0 || parsed.password.length > 0)) ||
      (parsed.protocol === "mailto:" && (!parsed.pathname || /[\s<>]/.test(parsed.pathname)))
    )
      throw new Error("Support destination must not contain credentials or an invalid address.");
    const now = Date.now();
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (query) =>
        query.eq("scope", account.scope).eq("key", "supportUrl"),
      )
      .take(1);
    const existing = settings[0];
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
