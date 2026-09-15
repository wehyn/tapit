import { getAuthUserId } from "@convex-dev/auth/server";

import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

type AuthContext = QueryCtx | MutationCtx;

export function isActiveCustomer(account: Doc<"customers"> | null | undefined): boolean {
  return account?.status === "active" && account.deletionStatus === "active";
}

export async function requireUser(ctx: AuthContext) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Authentication required.");
  }
  return userId;
}

export async function requireAdministrator(ctx: AuthContext) {
  const userId = await requireUser(ctx);
  const account = await ctx.db
    .query("customers")
    .withIndex("by_userId", (query) => query.eq("userId", userId))
    .unique();

  if (account === null || account.role !== "admin" || !isActiveCustomer(account)) {
    throw new Error("Administrator permission required.");
  }

  return { userId, account };
}

export const currentAccess = query({
  args: {},
  returns: v.object({
    authenticated: v.boolean(),
    role: v.union(v.literal("admin"), v.literal("customer"), v.null()),
    accountId: v.union(v.id("customers"), v.null()),
    profileId: v.union(v.id("profiles"), v.null()),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null)
      return { authenticated: false, role: null, accountId: null, profileId: null };

    const account = await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();

    const active = isActiveCustomer(account);
    return {
      authenticated: active,
      role: active ? (account?.role ?? null) : null,
      accountId: active ? (account?._id ?? null) : null,
      profileId: active ? (account?.profileId ?? null) : null,
    };
  },
});
