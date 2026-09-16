import { v } from "convex/values";

import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { isActiveCustomer, requireUser, sameScope } from "./admin";

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

/** Internal bridge for actions that must preserve the caller's identity. */
export const get = internalQuery({
  args: { profileId: v.id("profiles") },
  returns: v.object({
    profileId: v.id("profiles"),
    ownerId: v.id("customers"),
  }),
  handler: async (ctx, args) => {
    const { profile } = await profileAccess(ctx, args.profileId);
    return { profileId: profile._id, ownerId: profile.ownerId };
  },
});
