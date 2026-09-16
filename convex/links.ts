import { v } from "convex/values";

import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { isActiveCustomer, requireAdministrator, requireUser } from "./admin";
import schema from "./schema";
import {
  isSafeDestination,
  linkValidator,
  MAX_PROFILE_LINKS,
  validateDraftSafety,
} from "./validators";

type AuthContext = QueryCtx | MutationCtx;

export async function replaceProfileLinks(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  links: Array<{
    id: string;
    label: string;
    destination: string;
    enabled: boolean;
    icon?: string;
  }>,
  now: number,
) {
  const profile = await ctx.db.get(profileId);
  const existing = await ctx.db
    .query("links")
    .withIndex("by_profile_position", (query) => query.eq("profileId", profileId))
    .take(MAX_PROFILE_LINKS + 1);
  if (existing.length > MAX_PROFILE_LINKS)
    throw new Error("This profile has too many stored links to replace.");
  await Promise.all(existing.map((link) => ctx.db.delete(link._id)));
  await Promise.all(
    links.map((link, position) =>
      ctx.db.insert("links", {
        scope: profile?.scope,
        profileId,
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
}

async function accessibleProfile(ctx: AuthContext, profileId: Id<"profiles">) {
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
    (account.role !== "admin" && profile.ownerId !== account._id)
  )
    throw new Error("Profile access denied.");
  return { account, profile, userId };
}

export const listForProfile = query({
  args: { profileId: v.id("profiles") },
  returns: v.array(schema.doc("links")),
  handler: async (ctx, args) => {
    await accessibleProfile(ctx, args.profileId);
    return await ctx.db
      .query("links")
      .withIndex("by_profile_position", (query) => query.eq("profileId", args.profileId))
      .take(100);
  },
});

export const replaceDraft = mutation({
  args: { profileId: v.id("profiles"), links: v.array(linkValidator) },
  returns: v.object({ updatedAt: v.number() }),
  handler: async (ctx, args) => {
    if (args.links.length > MAX_PROFILE_LINKS)
      throw new Error("A profile cannot contain more than 100 links.");
    const { profile, userId } = await accessibleProfile(ctx, args.profileId);
    const safetyErrors = validateDraftSafety({ ...profile.draft, links: args.links });
    if (safetyErrors.length > 0) throw new Error(safetyErrors.join(" "));
    const seen = new Set<string>();
    for (const link of args.links) {
      if (!link.enabled) continue;
      const normalized = link.destination.trim().toLowerCase();
      if (!link.label.trim() || !isSafeDestination(link.destination))
        throw new Error("Every enabled link needs a label and safe destination.");
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
      .take(MAX_PROFILE_LINKS + 1);
    await replaceProfileLinks(ctx, profile._id, args.links, now);
    await ctx.db.insert("auditLogs", {
      scope: profile.scope,
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
  returns: v.array(schema.doc("links")),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const profile = await ctx.db.get(args.profileId);
    if (profile === null || profile.scope !== account.scope)
      throw new Error("Profile access denied.");
    return await ctx.db
      .query("links")
      .withIndex("by_profile_position", (query) => query.eq("profileId", args.profileId))
      .take(100);
  },
});
