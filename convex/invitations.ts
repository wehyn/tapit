import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAdministrator, sameScope } from "./admin";

export const status = query({
  args: { tokenHash: v.string() },
  returns: v.object({
    state: v.union(v.literal("missing"), v.literal("revoked"), v.literal("valid")),
    expiresAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (invitation === null) return { state: "missing" as const, expiresAt: null };
    if (invitation.kind === "prepared_setup") return { state: "missing" as const, expiresAt: null };
    if (invitation.invalidatedAt !== undefined)
      return { state: "revoked" as const, expiresAt: invitation.expiresAt ?? null };
    return { state: "valid" as const, expiresAt: invitation.expiresAt ?? null };
  },
});

export const listForAdmin = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      invitationId: v.id("invitations"),
      customerId: v.id("customers"),
      email: v.union(v.string(), v.null()),
      profileName: v.union(v.string(), v.null()),
      slug: v.union(v.string(), v.null()),
      expiresAt: v.union(v.number(), v.null()),
      acceptedAt: v.union(v.number(), v.null()),
      invalidatedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const rows = await ctx.db
      .query("invitations")
      .withIndex("by_scope", (q) => q.eq("scope", account.scope))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...rows,
      page: await Promise.all(
        rows.page.map(async (row) => {
          const customer = await ctx.db.get(row.customerId);
          const profile =
            customer?.profileId === undefined ? null : await ctx.db.get(customer.profileId);
          return {
            invitationId: row._id,
            customerId: row.customerId,
            email: row.email ?? null,
            profileName: profile?.draft.name ?? null,
            slug: profile?.slug ?? null,
            expiresAt: row.expiresAt ?? null,
            acceptedAt: row.acceptedAt ?? null,
            invalidatedAt: row.invalidatedAt ?? null,
          };
        }),
      ),
    };
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
    if (invitation.usedAt !== undefined || invitation.acceptedAt !== undefined)
      throw new Error("A used invitation cannot be revoked.");
    if (invitation.kind === "prepared_setup") {
      const customer = await ctx.db.get(invitation.customerId);
      if (customer === null || !sameScope(account, customer))
        throw new Error("Invitation not found.");
    }
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

const setupTokenHashValidator = v.string();
const invalidSetupResult = { ok: false as const };

async function findLiveSetupInvitation(ctx: QueryCtx | MutationCtx, tokenHash: string) {
  const invitation = await ctx.db
    .query("invitations")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (
    invitation === null ||
    invitation.kind !== "prepared_setup" ||
    invitation.usedAt !== undefined ||
    invitation.acceptedAt !== undefined ||
    invitation.invalidatedAt !== undefined ||
    invitation.expiresAt === undefined ||
    invitation.expiresAt <= Date.now()
  )
    return null;
  const customer = await ctx.db.get(invitation.customerId);
  if (
    customer === null ||
    customer.role !== "customer" ||
    customer.userId !== undefined ||
    customer.status !== "invited" ||
    customer.deletionStatus !== "active" ||
    !sameScope(customer, invitation) ||
    customer.profileId === undefined
  )
    return null;
  const profile = await ctx.db.get(customer.profileId);
  if (
    profile === null ||
    profile.ownerId !== customer._id ||
    !sameScope(customer, profile) ||
    profile.status !== "draft"
  )
    return null;
  return { invitation, customer, profile };
}

export const generate = mutation({
  args: { customerId: v.id("customers"), tokenHash: setupTokenHashValidator },
  returns: v.object({ invitationId: v.id("invitations"), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const customer = await ctx.db.get(args.customerId);
    if (
      customer === null ||
      !sameScope(account, customer) ||
      customer.role !== "customer" ||
      customer.status !== "invited" ||
      customer.userId !== undefined ||
      customer.deletionStatus !== "active"
    )
      throw new Error("Prepared customer unavailable.");
    const profile = customer.profileId === undefined ? null : await ctx.db.get(customer.profileId);
    if (
      profile === null ||
      profile.ownerId !== customer._id ||
      !sameScope(account, profile) ||
      profile.status !== "draft"
    )
      throw new Error("Prepared profile unavailable.");
    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_customerId", (q) => q.eq("customerId", customer._id))
      .take(1000);
    if (
      !invitations.some(
        (invitation) => invitation.kind === "prepared_setup" && sameScope(account, invitation),
      ) ||
      invitations.some((invitation) => !sameScope(account, invitation))
    )
      throw new Error("Prepared customer unavailable.");
    if (!/^[a-f0-9]{64}$/.test(args.tokenHash))
      throw new Error("A SHA-256 token hash is required.");
    const duplicate = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (duplicate !== null) throw new Error("That setup token is already registered.");
    const now = Date.now();
    for (const invitation of invitations) {
      if (
        invitation.kind === "prepared_setup" &&
        invitation.invalidatedAt === undefined &&
        invitation.usedAt === undefined
      )
        await ctx.db.patch(invitation._id, { invalidatedAt: now });
    }
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    const invitationId = await ctx.db.insert("invitations", {
      ...(customer.scope !== undefined ? { scope: customer.scope } : {}),
      customerId: customer._id,
      kind: "prepared_setup",
      tokenHash: args.tokenHash,
      expiresAt,
      createdByUserId: userId,
      createdAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: customer.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "invitation.setup_generated",
      accountId: customer._id,
      profileId: profile._id,
      occurredAt: now,
      after: JSON.stringify({ invitationId, expiresAt }),
    });
    return { invitationId, expiresAt };
  },
});

export const setupPreview = query({
  args: { tokenHash: setupTokenHashValidator },
  returns: v.union(
    v.null(),
    v.object({
      name: v.string(),
      slug: v.string(),
      bio: v.optional(v.string()),
      contactEmail: v.optional(v.string()),
      phone: v.optional(v.string()),
      website: v.optional(v.string()),
      links: v.array(v.object({ label: v.string(), url: v.string() })),
    }),
  ),
  handler: async (ctx, args) => {
    const setup = await findLiveSetupInvitation(ctx, args.tokenHash);
    if (setup === null) return null;
    const { draft } = setup.profile;
    return {
      name: draft.name,
      slug: draft.slug,
      ...(draft.bio === undefined ? {} : { bio: draft.bio }),
      ...(draft.email === undefined ? {} : { contactEmail: draft.email }),
      ...(draft.phone === undefined ? {} : { phone: draft.phone }),
      ...(draft.website === undefined ? {} : { website: draft.website }),
      links: draft.links.map(({ label, destination }) => ({ label, url: destination })),
    };
  },
});

export const claim = mutation({
  args: { tokenHash: setupTokenHashValidator },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Authentication required.");
    const user = await ctx.db.get(userId);
    const email = user?.email?.trim().toLowerCase();
    const googleAccount = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId).eq("provider", "google"))
      .first();
    if (
      user === null ||
      googleAccount === null ||
      user.emailVerificationTime === undefined ||
      email === undefined ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
      throw new Error("A verified Google email is required.");
    const setup = await findLiveSetupInvitation(ctx, args.tokenHash);
    if (setup === null) return invalidSetupResult;
    const linked = await ctx.db
      .query("customers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const { invitation, customer, profile } = setup;
    if (linked !== null) {
      if (
        linked.role !== "customer" ||
        linked.status !== "pending" ||
        linked.deletionStatus !== "active" ||
        linked.profileId !== undefined ||
        linked.email !== email
      )
        return invalidSetupResult;
    }
    const emailOwners = await ctx.db
      .query("customers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .take(3);
    if (emailOwners.some((owner) => owner._id !== linked?._id)) return invalidSetupResult;
    if (linked !== null) {
      const now = Date.now();
      await ctx.db.insert("auditLogs", {
        scope: linked.scope,
        actorUserId: userId,
        actorLabel: email,
        action: "customer.setup_provisioning_replaced",
        accountId: linked._id,
        occurredAt: now,
        before: "pending",
        after: "prepared setup account",
      });
      await ctx.db.delete(linked._id);
    }
    const now = Date.now();
    await ctx.db.patch(customer._id, {
      userId,
      email,
      status: "active",
      updatedAt: now,
    });
    await ctx.db.patch(invitation._id, { usedAt: now });
    await ctx.db.insert("auditLogs", {
      scope: customer.scope,
      actorUserId: userId,
      actorLabel: email,
      action: "customer.setup_claimed",
      accountId: customer._id,
      profileId: profile._id,
      occurredAt: now,
      after: "active",
    });
    return { ok: true };
  },
});

export const replace = mutation({
  args: { customerId: v.id("customers"), tokenHash: v.string() },
  returns: v.object({ invitationId: v.id("invitations") }),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const customer = await ctx.db.get(args.customerId);
    if (
      customer === null ||
      !sameScope(account, customer) ||
      customer.role !== "customer" ||
      customer.status !== "invited" ||
      customer.deletionStatus !== "active" ||
      customer.userId !== undefined ||
      customer.email === undefined
    )
      throw new Error("Customer account unavailable.");
    const duplicate = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (duplicate !== null) throw new Error("That invitation token is already registered.");
    const now = Date.now();
    const previous = await ctx.db
      .query("invitations")
      .withIndex("by_customerId", (q) => q.eq("customerId", customer._id))
      .take(1000);
    if (
      previous.some(
        (invitation) => invitation.kind === "prepared_setup" || !sameScope(account, invitation),
      )
    )
      throw new Error("Use prepared setup link generation for this customer.");
    for (const invitation of previous) {
      if (invitation.invalidatedAt === undefined)
        await ctx.db.patch(invitation._id, { invalidatedAt: now });
    }
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
