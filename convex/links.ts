import { v } from "convex/values";

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAdministrator, requireUser } from "./admin";
import { isSafeDestination, linkValidator } from "./validators";

type AuthContext = QueryCtx | MutationCtx;

async function accessibleProfile(ctx: AuthContext, profileId: Id<"profiles">) {
  const userId = await requireUser(ctx);
  const account = await ctx.db
    .query("customers")
    .withIndex("by_userId", (query) => query.eq("userId", userId))
    .unique();
  const profile = await ctx.db.get(profileId);
  if (
    account === null ||
    profile === null ||
    (account.role !== "admin" && profile.ownerId !== account._id)
  )
    throw new Error("Profile access denied.");
  return { account, profile, userId };
}

export const listForProfile = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    await accessibleProfile(ctx, args.profileId);
    return await ctx.db
      .query("links")
      .withIndex("by_profile_position", (query) => query.eq("profileId", args.profileId))
      .collect();
  },
});

export const replaceDraft = mutation({
  args: { profileId: v.id("profiles"), links: v.array(linkValidator) },
  handler: async (ctx, args) => {
    const { profile, userId } = await accessibleProfile(ctx, args.profileId);
    const seen = new Set<string>();
    for (const link of args.links) {
      const normalized = link.destination.trim().toLowerCase();
      if (!link.label.trim() || !isSafeDestination(link.destination))
        throw new Error("Every link needs a label and safe destination.");
      if (seen.has(normalized)) throw new Error("Duplicate link destinations are not allowed.");
      seen.add(normalized);
    }
    const now = Date.now();
    await ctx.db.patch(profile._id, {
      draft: { ...profile.draft, links: args.links },
      updatedAt: now,
    });
    const existing = await ctx.db
      .query("links")
      .withIndex("by_profile_position", (query) => query.eq("profileId", profile._id))
      .collect();
    await Promise.all(existing.map((link) => ctx.db.delete(link._id)));
    await Promise.all(
      args.links.map((link, position) =>
        ctx.db.insert("links", {
          profileId: profile._id,
          destination: link.destination,
          label: link.label,
          icon: link.icon,
          enabled: link.enabled,
          position,
          createdAt: now,
          updatedAt: now,
        }),
      ),
    );
    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      actorLabel: "Profile editor",
      action: "profile.links_updated",
      profileId: profile._id,
      accountId: profile.ownerId,
      occurredAt: now,
      before: `${existing.length} links`,
      after: `${args.links.length} links`,
    });
    return { updatedAt: now };
  },
});

export const adminList = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => {
    await requireAdministrator(ctx);
    return await ctx.db
      .query("links")
      .withIndex("by_profile_position", (query) => query.eq("profileId", args.profileId))
      .collect();
  },
});
