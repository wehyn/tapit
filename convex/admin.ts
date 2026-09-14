import { getAuthUserId } from "@convex-dev/auth/server";

import { query, type MutationCtx, type QueryCtx } from "./_generated/server";

type AuthContext = QueryCtx | MutationCtx;

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

  if (account === null || account.role !== "admin" || account.status === "deleted") {
    throw new Error("Administrator permission required.");
  }

  return { userId, account };
}

export const currentAccess = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { authenticated: false, role: null as "admin" | "customer" | null };

    const account = await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();

    return {
      authenticated: true,
      role: account?.role ?? null,
      accountId: account?._id,
      profileId: account?.profileId,
    };
  },
});
