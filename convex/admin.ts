import { getAuthUserId } from "@convex-dev/auth/server";

import { env, internalQuery, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

type AuthContext = QueryCtx | MutationCtx;
const authEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isActiveCustomer(account: Doc<"customers"> | null | undefined): boolean {
  return account?.status === "active" && account.deletionStatus === "active";
}

export function isHostedDemo(): boolean {
  return env.TAPIT_DEMO_AUTH_MODE === "hosted-demo";
}

/** A live account owns legacy unscoped data; a hosted-demo account owns demo data. */
export function sameScope(
  account: Pick<Doc<"customers">, "scope">,
  record: Pick<Doc<"customers">, "scope">,
): boolean {
  return account.scope === record.scope;
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

/** Resolves the authenticated account for claim completion; callers must still check its role/status. */
export async function customerForAuthUser(
  ctx: AuthContext,
  userId: Doc<"users">["_id"],
): Promise<Doc<"customers"> | null> {
  return await ctx.db
    .query("customers")
    .withIndex("by_userId", (query) => query.eq("userId", userId))
    .unique();
}

export const currentAccess = query({
  args: {},
  returns: v.object({
    authenticated: v.boolean(),
    accountStatus: v.union(
      v.literal("unauthenticated"),
      v.literal("unprovisioned"),
      v.literal("pending"),
      v.literal("invited"),
      v.literal("active"),
      v.literal("deleted"),
    ),
    role: v.union(v.literal("admin"), v.literal("customer"), v.null()),
    accountId: v.union(v.id("customers"), v.null()),
    profileId: v.union(v.id("profiles"), v.null()),
    onboardingName: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null)
      return {
        authenticated: false,
        accountStatus: "unauthenticated" as const,
        role: null,
        accountId: null,
        profileId: null,
        onboardingName: null,
      };

    const account = await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();

    const user = await ctx.db.get(userId);
    const verifiedEmail =
      user?.emailVerificationTime !== undefined &&
      user?.email &&
      authEmailPattern.test(user.email.trim().toLowerCase())
        ? user.email.trim().toLowerCase()
        : null;
    const invited =
      account === null && verifiedEmail
        ? await ctx.db
            .query("customers")
            .withIndex("by_email", (q) => q.eq("email", verifiedEmail))
            .filter((q) => q.eq(q.field("status"), "invited"))
            .first()
        : null;
    const status: "pending" | "invited" | "active" | "deleted" | "unprovisioned" =
      account?.status ?? (invited !== null ? "invited" : "unprovisioned");
    const active = isActiveCustomer(account);
    return {
      authenticated: active,
      accountStatus: status,
      role: active ? (account?.role ?? null) : null,
      accountId: active ? (account?._id ?? null) : null,
      profileId: active ? (account?.profileId ?? null) : null,
      onboardingName: account?.onboardingName ?? null,
    };
  },
});

export const currentAccessInternal = internalQuery({
  args: {},
  returns: v.object({
    authenticated: v.boolean(),
    accountStatus: v.union(
      v.literal("unauthenticated"),
      v.literal("unprovisioned"),
      v.literal("pending"),
      v.literal("invited"),
      v.literal("active"),
      v.literal("deleted"),
    ),
    role: v.union(v.literal("admin"), v.literal("customer"), v.null()),
    accountId: v.union(v.id("customers"), v.null()),
    profileId: v.union(v.id("profiles"), v.null()),
    onboardingName: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null)
      return {
        authenticated: false,
        accountStatus: "unauthenticated" as const,
        role: null,
        accountId: null,
        profileId: null,
        onboardingName: null,
      };
    const account = await customerForAuthUser(ctx, userId);
    const active = isActiveCustomer(account);
    const user = await ctx.db.get(userId);
    const verifiedEmail =
      user?.emailVerificationTime !== undefined &&
      user?.email &&
      authEmailPattern.test(user.email.trim().toLowerCase())
        ? user.email.trim().toLowerCase()
        : null;
    const invited =
      account === null && verifiedEmail
        ? await ctx.db
            .query("customers")
            .withIndex("by_email", (q) => q.eq("email", verifiedEmail))
            .filter((q) => q.eq(q.field("status"), "invited"))
            .first()
        : null;
    const accountStatus: "pending" | "invited" | "active" | "deleted" | "unprovisioned" =
      account?.status ?? (invited !== null ? "invited" : "unprovisioned");
    return {
      authenticated: active,
      accountStatus,
      role: active ? (account?.role ?? null) : null,
      accountId: active ? (account?._id ?? null) : null,
      profileId: active ? (account?.profileId ?? null) : null,
      onboardingName: account?.onboardingName ?? null,
    };
  },
});
