import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

const emailArg = v.string();

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) throw new Error("A valid email is required.");
  return normalized;
}

function validateSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized))
    throw new Error("The bootstrap profile slug is invalid.");
  return normalized;
}

export const promoteUser = internalMutation({
  args: { userId: v.id("users"), email: emailArg },
  returns: v.id("customers"),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if ((await ctx.db.get(args.userId)) === null)
      throw new Error("The administrator user does not exist.");
    const now = Date.now();
    const existing = await ctx.db
      .query("customers")
      .withIndex("by_email", (query) => query.eq("email", email))
      .unique();
    if (existing !== null && existing.userId !== undefined && existing.userId !== args.userId)
      throw new Error("That email is already linked to another authenticated user.");
    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        userId: args.userId,
        role: "admin",
        status: "active",
        deletionStatus: "active",
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("customers", {
      userId: args.userId,
      email,
      role: "admin",
      status: "active",
      deletionStatus: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const bootstrap = internalMutation({
  args: {
    adminUserId: v.id("users"),
    customerUserId: v.id("users"),
    adminEmail: emailArg,
    customerEmail: emailArg,
    customerSlug: v.string(),
    cardUrl: v.string(),
    cardToken: v.string(),
  },
  returns: v.object({
    adminCustomerId: v.id("customers"),
    customerId: v.id("customers"),
    profileId: v.id("profiles"),
    cardId: v.id("cards"),
  }),
  handler: async (ctx, args) => {
    const adminEmail = normalizeEmail(args.adminEmail);
    const customerEmail = normalizeEmail(args.customerEmail);
    if (adminEmail === customerEmail)
      throw new Error("Bootstrap accounts must use different emails.");
    if (args.adminUserId === args.customerUserId)
      throw new Error("Bootstrap accounts must use different authenticated users.");
    if (
      (await ctx.db.get(args.adminUserId)) === null ||
      (await ctx.db.get(args.customerUserId)) === null
    )
      throw new Error("Bootstrap users must exist in Convex Auth.");
    const slug = validateSlug(args.customerSlug);
    if (
      !/^[A-Za-z0-9_-]+$/.test(args.cardToken) ||
      !/^https?:\/\/[^\s]+\/c\/[A-Za-z0-9_-]+$/.test(args.cardUrl) ||
      !args.cardUrl.endsWith(`/c/${args.cardToken}`)
    )
      throw new Error("The bootstrap card URL and token do not match.");

    const now = Date.now();
    const findCustomer = async (email: string) =>
      await ctx.db
        .query("customers")
        .withIndex("by_email", (query) => query.eq("email", email))
        .unique();

    const adminExisting = await findCustomer(adminEmail);
    if (
      adminExisting !== null &&
      adminExisting.userId !== undefined &&
      adminExisting.userId !== args.adminUserId
    )
      throw new Error("The bootstrap administrator email is linked to another user.");
    const adminCustomerId =
      adminExisting?._id ??
      (await ctx.db.insert("customers", {
        userId: args.adminUserId,
        email: adminEmail,
        role: "admin",
        status: "active",
        deletionStatus: "active",
        createdAt: now,
        updatedAt: now,
      }));
    if (adminExisting !== null)
      await ctx.db.patch(adminExisting._id, {
        userId: args.adminUserId,
        role: "admin",
        status: "active",
        deletionStatus: "active",
        updatedAt: now,
      });

    const customerExisting = await findCustomer(customerEmail);
    if (
      customerExisting !== null &&
      customerExisting.userId !== undefined &&
      customerExisting.userId !== args.customerUserId
    )
      throw new Error("The bootstrap customer email is linked to another user.");
    const customerId =
      customerExisting?._id ??
      (await ctx.db.insert("customers", {
        userId: args.customerUserId,
        email: customerEmail,
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: now,
        updatedAt: now,
      }));
    if (customerExisting !== null)
      await ctx.db.patch(customerExisting._id, {
        userId: args.customerUserId,
        role: "customer",
        status: "active",
        deletionStatus: "active",
        updatedAt: now,
      });

    const slugProfile = await ctx.db
      .query("profiles")
      .withIndex("by_slug", (query) => query.eq("slug", slug))
      .unique();
    if (slugProfile !== null && slugProfile.ownerId !== customerId)
      throw new Error("The bootstrap profile slug is already owned by another customer.");
    const existingProfile =
      customerExisting?.profileId === undefined
        ? slugProfile
        : await ctx.db.get(customerExisting.profileId);
    if (existingProfile !== null && slugProfile !== null && existingProfile._id !== slugProfile._id)
      throw new Error("The bootstrap customer has conflicting profiles for the requested slug.");
    if (existingProfile?.published !== undefined && existingProfile.published.slug !== slug)
      throw new Error("A published profile slug cannot be changed during bootstrap.");
    const publishedAt = now;
    const draft = {
      name: "Tapit Test Customer",
      slug,
      bio: "A Tapit test profile.",
      website: "https://example.com",
      links: [
        {
          id: "bootstrap-link",
          label: "Website",
          destination: "https://example.com",
          enabled: true,
        },
      ],
    };
    const published = { ...draft, publishedAt };
    const profileId =
      existingProfile?._id ??
      (await ctx.db.insert("profiles", {
        ownerId: customerId,
        slug,
        status: "published",
        draft,
        published,
        createdAt: now,
        updatedAt: now,
        publishedAt,
      }));
    if (existingProfile !== null)
      await ctx.db.patch(existingProfile._id, {
        ownerId: customerId,
        slug,
        status: "published",
        draft,
        published,
        publishedAt,
        updatedAt: now,
      });
    await ctx.db.patch(customerId, { profileId, updatedAt: now });

    const existingCard = await ctx.db
      .query("cards")
      .withIndex("by_token", (query) => query.eq("token", args.cardToken))
      .unique();
    if (existingCard !== null && existingCard.cardUrl !== args.cardUrl)
      throw new Error("The bootstrap card token is already registered for another URL.");
    const cardId =
      existingCard?._id ??
      (await ctx.db.insert("cards", {
        cardUrl: args.cardUrl,
        token: args.cardToken,
        profileId,
        status: "active",
        createdAt: now,
        updatedAt: now,
        assignedAt: now,
      }));
    if (existingCard !== null)
      await ctx.db.patch(existingCard._id, {
        profileId,
        status: "active",
        assignedAt: existingCard.assignedAt ?? now,
        updatedAt: now,
      });
    return { adminCustomerId, customerId, profileId, cardId };
  },
});
