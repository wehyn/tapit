import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAdministrator, sameScope } from "./admin";
import { deriveSetupState } from "./preparedSetup";

const BACKFILL_KEY = "customerSetupStateBackfill";
const PAGE_SIZE = 50;
const STALE_AFTER_MS = 5 * 60 * 1000;
export const status = query({
  args: {},
  returns: v.object({
    state: v.union(
      v.literal("not_started"),
      v.literal("running"),
      v.literal("stalled"),
      v.literal("ready"),
    ),
  }),
  handler: async (ctx) => {
    const { account } = await requireAdministrator(ctx);
    const marker = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (q) =>
        q.eq("scope", account.scope).eq("key", BACKFILL_KEY),
      )
      .first();
    if (marker?.value === "completed") return { state: "ready" as const };
    if (marker?.value === "running") {
      return {
        state:
          Date.now() - marker.updatedAt > STALE_AFTER_MS
            ? ("stalled" as const)
            : ("running" as const),
      };
    }
    return { state: "not_started" as const };
  },
});

export const start = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { userId, account } = await requireAdministrator(ctx);
    const marker = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (q) =>
        q.eq("scope", account.scope).eq("key", BACKFILL_KEY),
      )
      .first();
    const now = Date.now();
    if (marker?.value === "completed") return null;
    if (marker?.value === "running" && now - marker.updatedAt <= STALE_AFTER_MS) return null;

    if (marker === null) {
      await ctx.db.insert("settings", {
        ...(account.scope === undefined ? {} : { scope: account.scope }),
        key: BACKFILL_KEY,
        value: "running",
        updatedAt: now,
        updatedByUserId: userId,
      });
    } else {
      await ctx.db.patch(marker._id, { value: "running", updatedAt: now, updatedByUserId: userId });
    }
    await ctx.scheduler.runAfter(0, internal.customerSetupStateBackfill.runBatch, {
      ...(account.scope === undefined ? {} : { scope: account.scope }),
      cursor: null,
    });
    return null;
  },
});

export const runBatch = internalMutation({
  args: {
    scope: v.optional(v.literal("demo")),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const marker = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (q) => q.eq("scope", args.scope).eq("key", BACKFILL_KEY))
      .first();
    if (marker?.value !== "running") return null;

    const page = await ctx.db
      .query("customers")
      .withIndex("by_scope", (q) => q.eq("scope", args.scope))
      .paginate({ cursor: args.cursor, numItems: PAGE_SIZE });
    const now = Date.now();
    for (const customer of page.page) {
      const invitations = await ctx.db
        .query("invitations")
        .withIndex("by_customerId", (q) => q.eq("customerId", customer._id))
        .take(1000);
      const safeInvitations = invitations.filter((invitation) => sameScope(customer, invitation));
      for (const invitation of safeInvitations) {
        if (
          invitation.kind === "prepared_setup" &&
          invitation.scope === customer.scope &&
          invitation.usedAt === undefined &&
          invitation.acceptedAt === undefined &&
          invitation.invalidatedAt === undefined &&
          invitation.expiresAt !== undefined &&
          invitation.expiresAt > now
        ) {
          await ctx.scheduler.runAt(invitation.expiresAt, internal.customers.expirePreparedSetup, {
            customerId: customer._id,
            invitationId: invitation._id,
          });
        }
      }
      await ctx.db.patch(customer._id, {
        setupState: deriveSetupState(customer, safeInvitations, now),
      });
    }

    if (page.isDone) {
      await ctx.db.patch(marker._id, { value: "completed", updatedAt: now });
    } else {
      await ctx.db.patch(marker._id, { updatedAt: now });
      await ctx.scheduler.runAfter(0, internal.customerSetupStateBackfill.runBatch, {
        ...(args.scope === undefined ? {} : { scope: args.scope }),
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});
