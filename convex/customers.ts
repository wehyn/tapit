import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdministrator, requireUser } from "./admin";

const emptyProfile = (slug: string) => ({
  name: "",
  slug,
  links: [],
});

export const createCustomer = mutation({
  args: {
    email: v.string(),
    slug: v.string(),
    tokenHash: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireAdministrator(ctx);
    const email = args.email.trim().toLowerCase();
    const slug = args.slug.trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("A valid customer email is required.");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("The profile slug is invalid.");

    const duplicateEmail = await ctx.db
      .query("customers")
      .withIndex("by_email", (query) => query.eq("email", email))
      .unique();
    if (duplicateEmail !== null) throw new Error("That customer email is already registered.");

    const duplicateSlug = await ctx.db
      .query("profiles")
      .withIndex("by_slug", (query) => query.eq("slug", slug))
      .unique();
    if (duplicateSlug !== null) throw new Error("That profile slug is already registered.");

    const now = Date.now();
    const customerId = await ctx.db.insert("customers", {
      email,
      role: "customer",
      status: "invited",
      deletionStatus: "active",
      createdAt: now,
      updatedAt: now,
    });
    const profileId = await ctx.db.insert("profiles", {
      ownerId: customerId,
      slug,
      status: "draft",
      draft: emptyProfile(slug),
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(customerId, { profileId, updatedAt: now });
    const invitationId = await ctx.db.insert("invitations", {
      customerId,
      email,
      tokenHash: args.tokenHash,
      expiresAt: args.expiresAt,
      createdByUserId: userId,
      createdAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "customer.created",
      accountId: customerId,
      profileId,
      occurredAt: now,
      after: JSON.stringify({ email, slug, status: "invited" }),
    });

    return { customerId, profileId, invitationId };
  },
});

export const completeSetup = mutation({
  args: {
    customerId: v.id("customers"),
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (query) => query.eq("tokenHash", args.tokenHash))
      .unique();
    if (
      invitation === null ||
      invitation.customerId !== args.customerId ||
      invitation.usedAt !== undefined ||
      invitation.invalidatedAt !== undefined ||
      invitation.expiresAt <= Date.now()
    ) {
      throw new Error("This setup link is invalid or has expired.");
    }

    const customer = await ctx.db.get(args.customerId);
    if (customer === null || customer.status === "deleted")
      throw new Error("Customer account unavailable.");
    if (customer.userId !== undefined && customer.userId !== userId) {
      throw new Error("This setup link has already been used.");
    }

    const now = Date.now();
    await ctx.db.patch(invitation._id, { usedAt: now });
    await ctx.db.patch(args.customerId, { userId, status: "active", updatedAt: now });
    return { profileId: customer.profileId };
  },
});

export const myAccount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();
  },
});

export const requestDeletion = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();
    if (
      customer === null ||
      customer.role !== "customer" ||
      customer.status !== "active" ||
      customer.deletionStatus !== "active"
    ) {
      throw new Error("Only an active customer can request deletion.");
    }
    if (customer.profileId === undefined) throw new Error("Customer profile not found.");

    const profile = await ctx.db.get(customer.profileId);
    if (profile === null) throw new Error("Customer profile not found.");
    const now = Date.now();
    await ctx.db.patch(customer._id, {
      deletionStatus: "requested",
      deletionRequestedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(profile._id, {
      status: "unpublished",
      unpublishedAt: now,
      updatedAt: now,
    });
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_profileId", (query) => query.eq("profileId", profile._id))
      .collect();
    await Promise.all(
      cards
        .filter((card) => card.status === "active" || card.status === "registered")
        .map((card) =>
          ctx.db.patch(card._id, { status: "inactive", deactivatedAt: now, updatedAt: now }),
        ),
    );
    const requestId = await ctx.db.insert("deletionRequests", {
      customerId: customer._id,
      requestedAt: now,
      status: "requested",
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      actorLabel: customer.email,
      action: "account.deletion_requested",
      accountId: customer._id,
      profileId: profile._id,
      occurredAt: now,
      before: "active",
      after: "requested; profile unpublished; cards inactive",
    });
    return { requestId };
  },
});

export const listDeletionRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireAdministrator(ctx);
    const requests = await ctx.db
      .query("deletionRequests")
      .withIndex("by_customerId")
      .order("desc")
      .collect();
    return await Promise.all(
      requests.map(async (request) => ({
        request,
        customer: await ctx.db.get(request.customerId),
      })),
    );
  },
});

export const approveDeletion = mutation({
  args: { requestId: v.id("deletionRequests") },
  handler: async (ctx, args) => {
    const { userId } = await requireAdministrator(ctx);
    const request = await ctx.db.get(args.requestId);
    if (request === null || request.status !== "requested")
      throw new Error("Deletion request is not pending.");
    const customer = await ctx.db.get(request.customerId);
    if (customer === null || customer.profileId === undefined)
      throw new Error("Customer account or profile not found.");
    const profile = await ctx.db.get(customer.profileId);
    if (profile === null) throw new Error("Customer profile not found.");

    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: "approved",
      processedAt: now,
      processedByUserId: userId,
    });
    await ctx.db.patch(customer._id, {
      status: "deleted",
      deletionStatus: "deleted",
      updatedAt: now,
    });
    await ctx.db.patch(profile._id, {
      status: "unpublished",
      unpublishedAt: profile.unpublishedAt ?? now,
      updatedAt: now,
    });
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_profileId", (query) => query.eq("profileId", profile._id))
      .collect();
    await Promise.all(
      cards
        .filter((card) => card.status === "active" || card.status === "registered")
        .map((card) =>
          ctx.db.patch(card._id, { status: "inactive", deactivatedAt: now, updatedAt: now }),
        ),
    );
    await ctx.db.insert("auditLogs", {
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "account.deletion_approved",
      accountId: customer._id,
      profileId: profile._id,
      occurredAt: now,
      before: "requested",
      after: "deleted; profile unpublished; cards inactive",
    });
    return { status: "deleted" as const };
  },
});
