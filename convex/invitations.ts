import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdministrator } from "./admin";

export const invalidate = mutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    const { userId } = await requireAdministrator(ctx);
    const invitation = await ctx.db.get(args.invitationId);
    if (invitation === null) throw new Error("Invitation not found.");
    const now = Date.now();
    await ctx.db.patch(args.invitationId, { invalidatedAt: now });
    await ctx.db.insert("auditLogs", {
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
  },
});

export const status = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (query) => query.eq("tokenHash", args.tokenHash))
      .unique();
    if (
      invitation === null ||
      invitation.usedAt !== undefined ||
      invitation.invalidatedAt !== undefined ||
      invitation.expiresAt <= Date.now()
    ) {
      return { valid: false };
    }
    return { valid: true, email: invitation.email, customerId: invitation.customerId };
  },
});
