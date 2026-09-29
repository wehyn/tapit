import { v } from "convex/values";

import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { isActiveCustomer, requireAdministrator, requireUser, sameScope } from "./admin";

type DbContext = QueryCtx | MutationCtx;

/** Resolves the authenticated account and verifies access to one profile. */
export async function profileAccess(ctx: DbContext, profileId: Id<"profiles">) {
  const userId = await requireUser(ctx);
  const account = await ctx.db
    .query("customers")
    .withIndex("by_userId", (query) => query.eq("userId", userId))
    .unique();
  const profile = await ctx.db.get(profileId);
  if (
    account === null ||
    !isActiveCustomer(account) ||
    profile === null ||
    !sameScope(account, profile) ||
    (profile.ownerId !== account._id && account.role !== "admin")
  ) {
    throw new Error("Profile access denied.");
  }
  return { account, profile, userId };
}

/** Resolves an active profile owner; customer photo operations must use this boundary. */
export async function profileOwnerAccess(ctx: DbContext, profileId: Id<"profiles">) {
  const userId = await requireUser(ctx);
  const account = await ctx.db
    .query("customers")
    .withIndex("by_userId", (query) => query.eq("userId", userId))
    .unique();
  const profile = await ctx.db.get(profileId);
  if (
    account === null ||
    !isActiveCustomer(account) ||
    profile === null ||
    !sameScope(account, profile) ||
    profile.ownerId !== account._id
  ) {
    throw new Error("Profile access denied.");
  }
  return { account, profile, userId };
}

/** Resolves an active administrator and a profile within that administrator's scope. */
export async function profileAdministratorAccess(ctx: DbContext, profileId: Id<"profiles">) {
  const { userId, account } = await requireAdministrator(ctx);
  const profile = await ctx.db.get(profileId);
  const owner = profile === null ? null : await ctx.db.get(profile.ownerId);
  if (
    profile === null ||
    owner === null ||
    !sameScope(account, profile) ||
    !sameScope(account, owner) ||
    !sameScope(owner, profile)
  ) {
    throw new Error("Profile access denied.");
  }
  return { account, profile, userId };
}

/** Internal bridge for customer actions that must preserve the caller's identity. */
export const getOwnerAccess = internalQuery({
  args: { profileId: v.id("profiles") },
  returns: v.object({
    profileId: v.id("profiles"),
    ownerId: v.id("customers"),
    userId: v.id("users"),
  }),
  handler: async (ctx, args) => {
    const { profile, userId } = await profileOwnerAccess(ctx, args.profileId);
    return { profileId: profile._id, ownerId: profile.ownerId, userId };
  },
});

/** Internal bridge for administrator actions limited to profiles in the same scope. */
export const getAdminAccess = internalQuery({
  args: { profileId: v.id("profiles") },
  returns: v.object({
    profileId: v.id("profiles"),
    ownerId: v.id("customers"),
    userId: v.id("users"),
  }),
  handler: async (ctx, args) => {
    const { profile, userId } = await profileAdministratorAccess(ctx, args.profileId);
    return { profileId: profile._id, ownerId: profile.ownerId, userId };
  },
});
