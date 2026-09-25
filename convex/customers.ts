import { getAuthUserId } from "@convex-dev/auth/server";
import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import { internalQuery, mutation, query } from "./_generated/server";
import {
  isActiveCustomer,
  isHostedDemo,
  requireAdministrator,
  requireUser,
  sameScope,
} from "./admin";
import schema from "./schema";
import { deleteProfileImages } from "./profileImages";
import { deleteProfileMedia } from "./profileMedia";
import { internal } from "./_generated/api";
import {
  normalizeProfileSlug,
  profileThemeValidator,
  validateProfileSlugValue,
} from "./validators";
import { components } from "./components";
import { DEFAULT_WARM_STUDIO_CUSTOMIZATION } from "../src/lib/profile-customization";
import { allocateProfileSlug } from "./profileSlug";

const emptyProfile = (slug: string) => ({
  name: "",
  slug,
  links: [],
});

const signupLimiter = new RateLimiter(components.rateLimiter, {
  selfServiceSignup: { kind: "fixed window", rate: 3, period: HOUR },
});
const authEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const createCustomer = mutation({
  args: {
    email: v.string(),
    slug: v.optional(v.string()),
    tokenHash: v.string(),
    name: v.optional(v.string()),
    bio: v.optional(v.string()),
    theme: v.optional(profileThemeValidator),
  },
  returns: v.object({
    customerId: v.id("customers"),
    profileId: v.id("profiles"),
    invitationId: v.id("invitations"),
  }),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const scope = account.scope;
    const email = args.email.trim().toLowerCase();
    const slug = await allocateProfileSlug(ctx, email, args.slug);
    if (!email || !email.includes("@")) throw new Error("A valid customer email is required.");
    const slugError = validateProfileSlugValue(slug);
    if (slugError !== null) throw new Error(slugError);

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
    const duplicateToken = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (query) => query.eq("tokenHash", args.tokenHash))
      .unique();
    if (duplicateToken !== null) throw new Error("That invitation token is already registered.");

    const now = Date.now();
    const customerId = await ctx.db.insert("customers", {
      ...(scope !== undefined ? { scope } : {}),
      email,
      role: "customer",
      status: "invited",
      deletionStatus: "active",
      createdAt: now,
      updatedAt: now,
    });
    const profileId = await ctx.db.insert("profiles", {
      ...(scope !== undefined ? { scope } : {}),
      ownerId: customerId,
      slug,
      status: "draft",
      draft: {
        ...emptyProfile(slug),
        email,
        ...(args.name !== undefined ? { name: args.name.trim() } : {}),
        ...(args.bio !== undefined ? { bio: args.bio } : {}),
        ...(args.theme !== undefined
          ? { theme: args.theme }
          : { customization: DEFAULT_WARM_STUDIO_CUSTOMIZATION }),
      },
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(customerId, { profileId, updatedAt: now });
    const invitationId = await ctx.db.insert("invitations", {
      ...(scope !== undefined ? { scope } : {}),
      customerId,
      email,
      tokenHash: args.tokenHash,
      acceptedAt: undefined,
      createdByUserId: userId,
      createdAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope,
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

export const createSelfServiceAccount = mutation({
  args: { name: v.string(), slug: v.string() },
  returns: v.object({
    customerId: v.id("customers"),
    profileId: v.id("profiles"),
    slug: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    if (!isHostedDemo())
      throw new Error("Self-service account creation is available only in hosted demo.");
    const user = await ctx.db.get(userId);
    if (!isHostedDemo() && user?.emailVerificationTime === undefined)
      throw new Error("Email verification required.");
    const email = user?.email?.trim().toLowerCase();
    if (email === undefined || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("A valid authenticated email is required.");
    const signupLimit = await signupLimiter.limit(ctx, "selfServiceSignup", {
      key: email,
    });
    if (!signupLimit.ok) throw new Error("Too many account creation attempts. Try again later.");
    const linked = await ctx.db
      .query("customers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (linked !== null) {
      if (linked.role !== "customer")
        throw new Error("Administrator accounts cannot self-register.");
      if (linked.status !== "active" || linked.deletionStatus !== "active")
        throw new Error("This customer account is inactive.");
      if (linked.profileId === undefined) throw new Error("Customer profile not found.");
      const profile = await ctx.db.get(linked.profileId);
      if (profile === null) throw new Error("Customer profile not found.");
      return { customerId: linked._id, profileId: profile._id, slug: profile.slug };
    }
    const name = args.name.trim();
    if (name.length === 0) throw new Error("A nonblank profile name is required.");
    if (name.length > 120) throw new Error("The profile name is too long.");
    const slug = normalizeProfileSlug(args.slug);
    const slugError = validateProfileSlugValue(slug);
    if (slugError !== null) throw new Error(slugError);
    const duplicateEmail = await ctx.db
      .query("customers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (duplicateEmail !== null)
      throw new Error(
        "That email already has a Tapit account or invitation. Sign in or use the setup link.",
      );
    const duplicateSlug = await ctx.db
      .query("profiles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (duplicateSlug !== null) throw new Error("That profile slug is already in use.");
    const now = Date.now();
    const customerId = await ctx.db.insert("customers", {
      ...(isHostedDemo() ? { scope: "demo" as const } : {}),
      userId,
      email,
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: now,
      updatedAt: now,
    });
    const profileId = await ctx.db.insert("profiles", {
      ...(isHostedDemo() ? { scope: "demo" as const } : {}),
      ownerId: customerId,
      slug,
      status: "draft",
      draft: { name, slug, email, links: [], customization: DEFAULT_WARM_STUDIO_CUSTOMIZATION },
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(customerId, { profileId, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      scope: isHostedDemo() ? "demo" : undefined,
      actorUserId: userId,
      actorLabel: email,
      action: "customer.self_service_created",
      accountId: customerId,
      profileId,
      occurredAt: now,
      after: JSON.stringify({ email, slug }),
    });
    return { customerId, profileId, slug };
  },
});

export const completeSelfServiceOnboarding = mutation({
  args: { name: v.string() },
  returns: v.object({
    customerId: v.id("customers"),
    profileId: v.id("profiles"),
    slug: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    const email = user?.email?.trim().toLowerCase();
    if (user?.emailVerificationTime === undefined)
      throw new Error("A server-verified Google email is required.");
    if (email === undefined || !authEmailPattern.test(email))
      throw new Error("A valid authenticated email is required.");
    const limit = await signupLimiter.limit(ctx, "selfServiceSignup", {
      key: `onboarding:${userId}`,
    });
    if (!limit.ok) throw new Error("Too many account creation attempts. Try again later.");
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (customer === null || customer.role !== "customer")
      throw new Error("Pending customer account required.");
    if (customer.status === "active" && customer.profileId !== undefined) {
      const profile = await ctx.db.get(customer.profileId);
      if (profile !== null)
        return { customerId: customer._id, profileId: profile._id, slug: profile.slug };
    }
    if (customer.status !== "pending" || customer.profileId !== undefined)
      throw new Error("Pending customer account required.");
    const name = args.name.trim();
    if (name.length === 0) throw new Error("A nonblank profile name is required.");
    if (name.length > 120) throw new Error("The profile name is too long.");
    const slug = await allocateProfileSlug(ctx, name);
    const now = Date.now();
    const profileId = await ctx.db.insert("profiles", {
      ownerId: customer._id,
      slug,
      status: "draft",
      draft: { name, slug, email, links: [] },
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(customer._id, {
      profileId,
      status: "active",
      onboardingName: name,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: customer.scope,
      actorUserId: userId,
      actorLabel: email,
      action: "customer.onboarding_completed",
      accountId: customer._id,
      profileId,
      occurredAt: now,
      after: JSON.stringify({ slug }),
    });
    return { customerId: customer._id, profileId, slug };
  },
});

export const deletePendingAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (customer === null || customer.status !== "pending" || customer.profileId !== undefined)
      throw new Error("Pending account without a profile required.");
    const now = Date.now();
    await ctx.db.patch(customer._id, {
      status: "deleted",
      deletionStatus: "deleted",
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: customer.scope,
      actorUserId: userId,
      actorLabel: customer.email,
      action: "account.pending_deleted",
      accountId: customer._id,
      occurredAt: now,
      before: "pending",
      after: "deleted",
    });
    return null;
  },
});

export const acceptInvitation = mutation({
  args: { tokenHash: v.string() },
  returns: v.object({ profileId: v.union(v.id("profiles"), v.null()) }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    const email = user?.email?.trim().toLowerCase();
    if (user?.emailVerificationTime === undefined)
      throw new Error("A server-verified Google email is required.");
    if (email === undefined || !authEmailPattern.test(email))
      throw new Error("A valid authenticated email is required.");
    const limit = await signupLimiter.limit(ctx, "selfServiceSignup", {
      key: `invitation:${userId}:${args.tokenHash}`,
    });
    if (!limit.ok) throw new Error("Too many invitation attempts. Try again later.");
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (
      invitation === null ||
      invitation.invalidatedAt !== undefined ||
      (invitation.expiresAt !== undefined && invitation.expiresAt <= Date.now())
    )
      throw new Error("This invitation is invalid or expired.");
    if (email === undefined || email !== invitation.email.trim().toLowerCase())
      throw new Error("This authenticated account does not match the invitation email.");
    const customer = await ctx.db.get(invitation.customerId);
    if (
      customer === null ||
      customer.role !== "customer" ||
      customer.deletionStatus !== "active" ||
      !sameScope(customer, invitation)
    )
      throw new Error("Customer account unavailable.");
    if (customer.status !== "invited" && customer.status !== "active")
      throw new Error("Customer account unavailable.");
    if (customer.userId !== undefined && customer.userId !== userId)
      throw new Error("This invitation is linked to another user.");
    const linked = await ctx.db
      .query("customers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (linked !== null && linked._id !== customer._id)
      throw new Error("This authenticated account is already linked to another customer.");
    const now = Date.now();
    await ctx.db.patch(customer._id, { userId, status: "active", updatedAt: now });
    if (invitation.acceptedAt === undefined)
      await ctx.db.patch(invitation._id, { acceptedAt: now });
    await ctx.db.insert("auditLogs", {
      scope: customer.scope,
      actorUserId: userId,
      actorLabel: customer.email,
      action: "invitation.accepted",
      accountId: customer._id,
      profileId: customer.profileId,
      occurredAt: now,
      after: "active",
    });
    return { profileId: customer.profileId ?? null };
  },
});

export const setRole = mutation({
  args: { customerId: v.id("customers"), role: v.union(v.literal("customer"), v.literal("admin")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const target = await ctx.db.get(args.customerId);
    if (target === null || !sameScope(account, target) || !isActiveCustomer(target))
      throw new Error("Customer account unavailable.");
    if (target.role === args.role) return null;
    if (target.role === "admin" && args.role === "customer") {
      let anotherActiveAdministrator = false;
      for await (const admin of ctx.db
        .query("customers")
        .withIndex("by_scope_and_role", (q) => q.eq("scope", account.scope).eq("role", "admin"))) {
        if (admin._id !== target._id && isActiveCustomer(admin)) {
          anotherActiveAdministrator = true;
          break;
        }
      }
      if (!anotherActiveAdministrator)
        throw new Error("Cannot remove the last active administrator.");
    }
    const now = Date.now();
    await ctx.db.patch(target._id, { role: args.role, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      scope: target.scope,
      actorUserId: userId,
      actorLabel: account.email,
      action: "customer.role_changed",
      accountId: target._id,
      profileId: target.profileId,
      occurredAt: now,
      before: target.role,
      after: args.role,
    });
    return null;
  },
});

export const completeSetup = mutation({
  args: {
    customerId: v.optional(v.id("customers")),
    tokenHash: v.string(),
  },
  returns: v.object({ profileId: v.union(v.id("profiles"), v.null()) }),
  handler: async (ctx, args) => {
    if (!isHostedDemo()) throw new Error("Legacy setup is available only in hosted demo.");
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    if (!isHostedDemo() && user?.emailVerificationTime === undefined)
      throw new Error("Email verification required.");
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (query) => query.eq("tokenHash", args.tokenHash))
      .unique();
    if (
      invitation === null ||
      invitation.invalidatedAt !== undefined ||
      (invitation.expiresAt !== undefined && invitation.expiresAt <= Date.now())
    ) {
      throw new Error("This setup link is invalid or has expired.");
    }
    if (args.customerId !== undefined && invitation.customerId !== args.customerId)
      throw new Error("This setup link does not belong to that customer.");

    const customer = await ctx.db.get(invitation.customerId);
    if (customer === null || customer.role !== "customer" || customer.status === "deleted")
      throw new Error("Customer account unavailable.");
    if (user?.email?.trim().toLowerCase() !== invitation.email.trim().toLowerCase())
      throw new Error("This authenticated account does not match the invitation email.");
    if (customer.userId !== undefined && customer.userId !== userId) {
      throw new Error("This setup link has already been used.");
    }
    if (invitation.scope !== customer.scope)
      throw new Error("This setup link is not valid for this account.");
    const linkedAccount = await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();
    if (linkedAccount !== null && linkedAccount._id !== customer._id) {
      throw new Error("This authenticated account is already linked to another customer.");
    }

    const now = Date.now();
    const shouldRecordAcceptance = invitation.acceptedAt == null;
    const shouldRecordLink = customer.userId !== userId || customer.status !== "active";
    await ctx.db.patch(customer._id, {
      userId,
      scope: invitation.scope,
      status: "active",
      updatedAt: now,
    });
    if (shouldRecordAcceptance) {
      await ctx.db.patch(invitation._id, { acceptedAt: now });
    }
    if (shouldRecordLink || shouldRecordAcceptance) {
      await ctx.db.insert("auditLogs", {
        scope: customer.scope,
        actorUserId: userId,
        actorLabel: customer.email,
        action: "customer.setup_completed",
        accountId: customer._id,
        profileId: customer.profileId,
        occurredAt: now,
        after: "active",
      });
    }
    return { profileId: customer.profileId ?? null };
  },
});

export const myAccount = query({
  args: {},
  returns: v.union(v.null(), schema.doc("customers")),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();
  },
});

export const byIdForAdmin = internalQuery({
  args: { customerId: v.id("customers") },
  returns: v.union(v.null(), schema.doc("customers")),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const customer = await ctx.db.get(args.customerId);
    if (customer === null || !sameScope(account, customer))
      throw new Error("Customer account unavailable.");
    return customer;
  },
});

export const list = query({
  args: { search: v.optional(v.string()), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("customers")),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const search = args.search?.trim().toLowerCase();
    const customers = await ctx.db
      .query("customers")
      .withIndex("by_scope", (query) => query.eq("scope", account.scope))
      .paginate(args.paginationOpts);
    return {
      ...customers,
      page:
        search === undefined || search.length === 0
          ? customers.page
          : customers.page.filter((customer) => customer.email.includes(search)),
    };
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
    if (profile === null || !sameScope(customer, profile) || profile.ownerId !== customer._id)
      throw new Error("Customer profile not found.");
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
    if (cards.some((card) => !sameScope(customer, card)))
      throw new Error("Profile cards belong to another scope.");
    await Promise.all(
      cards
        .filter(
          (card) =>
            card.status === "active" || card.status === "claimable" || card.status === "registered",
        )
        .map((card) =>
          ctx.db.patch(card._id, { status: "inactive", deactivatedAt: now, updatedAt: now }),
        ),
    );
    const requestId = await ctx.db.insert("deletionRequests", {
      scope: customer.scope,
      customerId: customer._id,
      requestedAt: now,
      status: "requested",
    });
    await ctx.db.insert("auditLogs", {
      scope: customer.scope,
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
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      request: schema.doc("deletionRequests"),
      customer: v.union(v.null(), schema.doc("customers")),
      overdue: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const requests = await ctx.db
      .query("deletionRequests")
      .withIndex("by_scope", (query) => query.eq("scope", account.scope))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...requests,
      page: await Promise.all(
        requests.page.map(async (request) => ({
          request,
          customer: await ctx.db.get(request.customerId),
          overdue:
            request.status === "requested" &&
            request.requestedAt < Date.now() - 30 * 24 * 60 * 60 * 1000,
        })),
      ),
    };
  },
});

export const hasOverdueDeletionRequests = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const { account } = await requireAdministrator(ctx);
    const oldest = await ctx.db
      .query("deletionRequests")
      .withIndex("by_scope_and_status_and_requestedAt", (q) =>
        q
          .eq("scope", account.scope)
          .eq("status", "requested")
          .lt("requestedAt", Date.now() - 30 * 24 * 60 * 60 * 1000),
      )
      .first();
    return oldest !== null;
  },
});

export const approveDeletion = mutation({
  args: { requestId: v.id("deletionRequests") },
  returns: v.object({ status: v.literal("deleted") }),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const request = await ctx.db.get(args.requestId);
    if (request === null || request.status !== "requested" || !sameScope(account, request))
      throw new Error("Deletion request is not pending.");
    const customer = await ctx.db.get(request.customerId);
    if (customer === null || !sameScope(account, customer) || customer.profileId === undefined)
      throw new Error("Customer account or profile not found.");
    const profile = await ctx.db.get(customer.profileId);
    if (profile === null || !sameScope(account, profile) || profile.ownerId !== customer._id)
      throw new Error("Customer profile not found.");

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
    if (cards.some((card) => !sameScope(account, card)))
      throw new Error("Profile cards belong to another scope.");
    await Promise.all(
      cards
        .filter(
          (card) =>
            card.status === "active" || card.status === "claimable" || card.status === "registered",
        )
        .map((card) =>
          ctx.db.patch(card._id, { status: "inactive", deactivatedAt: now, updatedAt: now }),
        ),
    );
    await deleteProfileImages(ctx, profile._id);
    await deleteProfileMedia(ctx, profile._id);
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "account.deletion_approved",
      accountId: customer._id,
      profileId: profile._id,
      occurredAt: now,
      before: "requested",
      after: "deleted; profile unpublished; cards inactive",
    });
    await ctx.scheduler.runAfter(0, internal.accountErasure.eraseAccountPass, {
      customerId: customer._id,
    });
    return { status: "deleted" as const };
  },
});
