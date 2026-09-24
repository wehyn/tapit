import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdministrator, sameScope } from "./admin";

export const status = query({
  args: { tokenHash: v.string(), now: v.optional(v.number()) },
  returns: v.object({
    state: v.union(
      v.literal("missing"),
      v.literal("revoked"),
      v.literal("expired"),
      v.literal("valid"),
    ),
    email: v.union(v.string(), v.null()),
    profileName: v.union(v.string(), v.null()),
    acceptedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (invitation === null)
      return { state: "missing" as const, email: null, profileName: null, acceptedAt: null };
    const customer = await ctx.db.get(invitation.customerId);
    const profile = customer?.profileId === undefined ? null : await ctx.db.get(customer.profileId);
    const base = {
      email: invitation.email,
      profileName: profile?.draft.name ?? null,
      acceptedAt: invitation.acceptedAt ?? null,
    };
    if (invitation.invalidatedAt !== undefined) return { state: "revoked" as const, ...base };
    if (invitation.expiresAt !== undefined && invitation.expiresAt <= Date.now())
      return { state: "expired" as const, ...base };
    return { state: "valid" as const, ...base };
  },
});

export const listForAdmin = query({
  args: {},
  returns: v.array(
    v.object({
      invitationId: v.id("invitations"),
      customerId: v.id("customers"),
      email: v.string(),
      profileName: v.union(v.string(), v.null()),
      slug: v.union(v.string(), v.null()),
      expiresAt: v.union(v.number(), v.null()),
      acceptedAt: v.union(v.number(), v.null()),
      invalidatedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const { account } = await requireAdministrator(ctx);
    const rows = await ctx.db
      .query("invitations")
      .withIndex("by_scope", (q) => q.eq("scope", account.scope))
      .collect();
    return await Promise.all(
      rows.map(async (row) => {
        const customer = await ctx.db.get(row.customerId);
        const profile =
          customer?.profileId === undefined ? null : await ctx.db.get(customer.profileId);
        return {
          invitationId: row._id,
          customerId: row.customerId,
          email: row.email,
          profileName: profile?.draft.name ?? null,
          slug: profile?.slug ?? null,
          expiresAt: row.expiresAt ?? null,
          acceptedAt: row.acceptedAt ?? null,
          invalidatedAt: row.invalidatedAt ?? null,
        };
      }),
    );
  },
});

export const revoke = mutation({
  args: { invitationId: v.id("invitations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const invitation = await ctx.db.get(args.invitationId);
    if (invitation === null || !sameScope(account, invitation))
      throw new Error("Invitation not found.");
    if (invitation.invalidatedAt === undefined) {
      const now = Date.now();
      await ctx.db.patch(invitation._id, { invalidatedAt: now });
      await ctx.db.insert("auditLogs", {
        scope: invitation.scope,
        actorUserId: userId,
        actorLabel: "Administrator",
        action: "invitation.revoked",
        accountId: invitation.customerId,
        occurredAt: now,
        after: JSON.stringify({ invalidatedAt: now }),
      });
    }
    return null;
  },
});

export const replace = mutation({
  args: { customerId: v.id("customers"), tokenHash: v.string() },
  returns: v.object({ invitationId: v.id("invitations") }),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const customer = await ctx.db.get(args.customerId);
    if (customer === null || !sameScope(account, customer) || customer.userId !== undefined)
      throw new Error("Customer account unavailable.");
    const duplicate = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (duplicate !== null) throw new Error("That invitation token is already registered.");
    const now = Date.now();
    const existing = await ctx.db
      .query("invitations")
      .withIndex("by_customerId", (q) => q.eq("customerId", customer._id))
      .collect();
    for (const invitation of existing)
      if (invitation.invalidatedAt === undefined)
        await ctx.db.patch(invitation._id, { invalidatedAt: now });
    const invitationId = await ctx.db.insert("invitations", {
      ...(customer.scope !== undefined ? { scope: customer.scope } : {}),
      customerId: customer._id,
      email: customer.email,
      tokenHash: args.tokenHash,
      createdByUserId: userId,
      createdAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: customer.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "invitation.replaced",
      accountId: customer._id,
      occurredAt: now,
      after: JSON.stringify({ invitationId }),
    });
    return { invitationId };
  },
});

export const invalidate = revoke;
