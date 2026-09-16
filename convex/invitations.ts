import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdministrator, sameScope } from "./admin";

export const invalidate = mutation({
  args: { invitationId: v.id("invitations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const invitation = await ctx.db.get(args.invitationId);
    if (invitation === null || !sameScope(account, invitation))
      throw new Error("Invitation not found.");
    const now = Date.now();
    await ctx.db.patch(args.invitationId, { invalidatedAt: now });
    await ctx.db.insert("auditLogs", {
      scope: invitation.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "invitation.invalidated",
      accountId: invitation.customerId,
      occurredAt: now,
      before: JSON.stringify({
        usedAt: invitation.usedAt,
        invalidatedAt: invitation.invalidatedAt,
      }),
      after: JSON.stringify({ invalidatedAt: now }),
    });
    return null;
  },
});

export const status = query({
  args: { tokenHash: v.string(), now: v.number() },
  returns: v.object({ valid: v.boolean(), email: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (query) => query.eq("tokenHash", args.tokenHash))
      .unique();
    if (
      invitation === null ||
      invitation.usedAt !== undefined ||
      invitation.invalidatedAt !== undefined ||
      invitation.expiresAt <= args.now
    ) {
      return { valid: false };
    }
    return { valid: true, email: invitation.email };
  },
});
