import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdministrator, requireUser } from "./admin";
import schema from "./schema";
import { deleteProfileImages } from "./profileImages";

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
  returns: v.object({
    customerId: v.id("customers"),
    profileId: v.id("profiles"),
    invitationId: v.id("invitations"),
  }),
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
    if (args.expiresAt <= Date.now())
      throw new Error("The invitation expiry must be in the future.");
    const duplicateToken = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (query) => query.eq("tokenHash", args.tokenHash))
      .unique();
    if (duplicateToken !== null) throw new Error("That invitation token is already registered.");

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
    customerId: v.optional(v.id("customers")),
    tokenHash: v.string(),
  },
  returns: v.object({ profileId: v.union(v.id("profiles"), v.null()) }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
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
      throw new Error("This setup link is invalid or has expired.");
    }
    if (args.customerId !== undefined && invitation.customerId !== args.customerId)
      throw new Error("This setup link does not belong to that customer.");

    const customer = await ctx.db.get(invitation.customerId);
    if (customer === null || customer.role !== "customer" || customer.status === "deleted")
      throw new Error("Customer account unavailable.");
    const user = await ctx.db.get(userId);
    if (user?.email?.trim().toLowerCase() !== invitation.email.trim().toLowerCase())
      throw new Error("This authenticated account does not match the invitation email.");
    if (customer.userId !== undefined && customer.userId !== userId) {
      throw new Error("This setup link has already been used.");
    }
    const linkedAccount = await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();
    if (linkedAccount !== null && linkedAccount._id !== customer._id) {
      throw new Error("This authenticated account is already linked to another customer.");
    }

    const now = Date.now();
    await ctx.db.patch(invitation._id, { usedAt: now });
    await ctx.db.patch(customer._id, { userId, status: "active", updatedAt: now });
    return { profileId: customer.profileId ?? null };
  },
});

export const myAccount = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("customers"),
      _creationTime: v.number(),
      userId: v.optional(v.id("users")),
      email: v.string(),
      role: v.union(v.literal("customer"), v.literal("admin")),
      status: v.union(v.literal("invited"), v.literal("active"), v.literal("deleted")),
      profileId: v.optional(v.id("profiles")),
      deletionStatus: v.union(v.literal("active"), v.literal("requested"), v.literal("deleted")),
      deletionRequestedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();
  },
});

export const list = query({
  args: { search: v.optional(v.string()) },
  returns: v.array(schema.doc("customers")),
  handler: async (ctx, args) => {
    await requireAdministrator(ctx);
    const search = args.search?.trim().toLowerCase();
    const customers = await ctx.db
      .query("customers")
      .withIndex("by_role", (query) => query.eq("role", "customer"))
      .take(100);
    return search === undefined || search.length === 0
      ? customers
      : customers.filter((customer) => customer.email.includes(search));
  },
});

export const requestDeletion = mutation({
  args: {},
  returns: v.object({ requestId: v.id("deletionRequests") }),
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
      .take(1001);
    if (cards.length > 1000) throw new Error("Too many cards are assigned to this profile.");
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
  returns: v.array(
    v.object({
      request: v.object({
        _id: v.id("deletionRequests"),
        _creationTime: v.number(),
        customerId: v.id("customers"),
        requestedAt: v.number(),
        processedAt: v.optional(v.number()),
        processedByUserId: v.optional(v.id("users")),
        status: v.union(v.literal("requested"), v.literal("approved"), v.literal("rejected")),
      }),
      customer: v.union(
        v.null(),
        v.object({
          _id: v.id("customers"),
          _creationTime: v.number(),
          userId: v.optional(v.id("users")),
          email: v.string(),
          role: v.union(v.literal("customer"), v.literal("admin")),
          status: v.union(v.literal("invited"), v.literal("active"), v.literal("deleted")),
          profileId: v.optional(v.id("profiles")),
          deletionStatus: v.union(
            v.literal("active"),
            v.literal("requested"),
            v.literal("deleted"),
          ),
          deletionRequestedAt: v.optional(v.number()),
          createdAt: v.number(),
          updatedAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    await requireAdministrator(ctx);
    const requests = await ctx.db
      .query("deletionRequests")
      .withIndex("by_customerId")
      .order("desc")
      .take(100);
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
  returns: v.object({ status: v.literal("deleted") }),
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
      .take(1001);
    if (cards.length > 1000) throw new Error("Too many cards are assigned to this profile.");
    await Promise.all(
      cards
        .filter((card) => card.status === "active" || card.status === "registered")
        .map((card) =>
          ctx.db.patch(card._id, { status: "inactive", deactivatedAt: now, updatedAt: now }),
        ),
    );
    await deleteProfileImages(ctx, profile._id);
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
