import { getAuthUserId } from "@convex-dev/auth/server";
import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import { action, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  isActiveCustomer,
  isHostedDemo,
  requireAdministrator,
  requireUser,
  sameScope,
} from "./admin";
import schema from "./schema";
import { deleteProfileMedia } from "./profileMedia";
import { internal } from "./_generated/api";
import {
  normalizeProfileSlug,
  profileThemeValidator,
  validateDraftSafety,
  validateProfileSlugValue,
} from "./validators";
import { components } from "./components";
import { allocateProfileSlug } from "./profileSlug";
import { deriveSetupState, latestSetupExpiry } from "./preparedSetup";
import { replaceProfileLinks } from "./links";

const emptyProfile = (slug: string) => ({
  name: "",
  slug,
  links: [],
});

const signupLimiter = new RateLimiter(components.rateLimiter, {
  selfServiceSignup: { kind: "fixed window", rate: 3, period: HOUR },
});
const authEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const preparedProfileValidator = v.object({
  name: v.string(),
  slug: v.string(),
  bio: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  links: v.array(v.object({ label: v.string(), url: v.string() })),
});

function prepareProfile(profile: {
  name: string;
  slug: string;
  bio?: string;
  contactEmail?: string;
  phone?: string;
  website?: string;
  links: Array<{ label: string; url: string }>;
}) {
  const slug = profile.slug.trim();
  if (slug !== profile.slug || normalizeProfileSlug(slug) !== slug)
    throw new Error("The profile slug must be lowercase.");
  const slugError = validateProfileSlugValue(slug);
  if (slugError !== null) throw new Error(slugError);
  if (!profile.name.trim()) throw new Error("A nonblank profile name is required.");
  const links = profile.links.map((link, index) => ({
    id: `${slug}-${index + 1}`,
    label: link.label.trim(),
    destination: link.url.trim(),
    enabled: true,
  }));
  for (const link of links) {
    if (!link.label) throw new Error("Every setup link needs a label.");
    try {
      const url = new URL(link.destination);
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password)
        throw new Error();
    } catch {
      throw new Error("Every setup link must be a valid HTTPS URL without credentials.");
    }
  }
  const draft = {
    name: profile.name.trim(),
    slug,
    ...(profile.bio?.trim() ? { bio: profile.bio.trim() } : {}),
    ...(profile.contactEmail?.trim() ? { email: profile.contactEmail.trim() } : {}),
    ...(profile.phone?.trim() ? { phone: profile.phone.trim() } : {}),
    ...(profile.website?.trim() ? { website: profile.website.trim() } : {}),
    links,
  };
  const errors = validateDraftSafety(draft);
  if (errors.length > 0) throw new Error(errors.join(" "));
  return draft;
}

async function assertUnusedTokenHash(ctx: MutationCtx, tokenHash: string) {
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) throw new Error("A SHA-256 token hash is required.");
  const duplicate = await ctx.db
    .query("invitations")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (duplicate !== null) throw new Error("That setup token is already registered.");
}

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
    if (!authEmailPattern.test(email)) throw new Error("A valid customer email is required.");
    const slug = await allocateProfileSlug(ctx, email, args.slug);
    const slugError = validateProfileSlugValue(slug);
    if (slugError !== null) throw new Error(slugError);
    const draft = {
      ...emptyProfile(slug),
      email,
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.bio !== undefined ? { bio: args.bio } : {}),
      theme: args.theme ?? "paper",
    };
    const safetyErrors = validateDraftSafety(draft);
    if (safetyErrors.length > 0) throw new Error(safetyErrors.join(" "));

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
      draft,
      draftRevision: 0,
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

export const createPrepared = mutation({
  args: { profile: preparedProfileValidator, tokenHash: v.string() },
  returns: v.object({
    customerId: v.id("customers"),
    invitationId: v.id("invitations"),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const draft = prepareProfile(args.profile);
    await assertUnusedTokenHash(ctx, args.tokenHash);
    const duplicate = await ctx.db
      .query("profiles")
      .withIndex("by_slug", (q) => q.eq("slug", draft.slug))
      .unique();
    if (duplicate !== null) throw new Error("That profile slug is already in use.");
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    const customerId = await ctx.db.insert("customers", {
      ...(account.scope !== undefined ? { scope: account.scope } : {}),
      role: "customer",
      status: "invited",
      deletionStatus: "active",
      createdAt: now,
      updatedAt: now,
    });
    const profileId = await ctx.db.insert("profiles", {
      ...(account.scope !== undefined ? { scope: account.scope } : {}),
      ownerId: customerId,
      slug: draft.slug,
      status: "draft",
      draft,
      draftRevision: 0,
      createdAt: now,
      updatedAt: now,
    });
    await replaceProfileLinks(ctx, profileId, draft.links, now);
    await ctx.db.patch(customerId, { profileId, updatedAt: now });
    const invitationId = await ctx.db.insert("invitations", {
      ...(account.scope !== undefined ? { scope: account.scope } : {}),
      customerId,
      kind: "prepared_setup",
      tokenHash: args.tokenHash,
      expiresAt,
      createdByUserId: userId,
      createdAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "customer.prepared_created",
      accountId: customerId,
      profileId,
      occurredAt: now,
      after: JSON.stringify({ slug: draft.slug, invitationId, expiresAt }),
    });
    return { customerId, invitationId, expiresAt };
  },
});

export const updatePrepared = mutation({
  args: { customerId: v.id("customers"), profile: preparedProfileValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const customer = await ctx.db.get(args.customerId);
    if (
      customer === null ||
      !sameScope(account, customer) ||
      customer.role !== "customer" ||
      customer.userId !== undefined ||
      customer.status !== "invited" ||
      customer.profileId === undefined
    )
      throw new Error("Prepared customer unavailable.");
    const profile = await ctx.db.get(customer.profileId);
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
    const draft = prepareProfile(args.profile);
    if (draft.slug !== profile.slug) throw new Error("The assigned profile slug cannot change.");
    const now = Date.now();
    await ctx.db.patch(profile._id, {
      draft,
      updatedAt: now,
      draftRevision: (profile.draftRevision ?? 0) + 1,
    });
    await replaceProfileLinks(ctx, profile._id, draft.links, now);
    await ctx.db.insert("auditLogs", {
      scope: customer.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "customer.prepared_updated",
      accountId: customer._id,
      profileId: profile._id,
      occurredAt: now,
      after: JSON.stringify({ slug: draft.slug }),
    });
    return null;
  },
});

export const deletePreparedDraft = mutation({
  args: { customerId: v.id("customers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const customer = await ctx.db.get(args.customerId);
    if (
      customer === null ||
      !sameScope(account, customer) ||
      customer.role !== "customer" ||
      customer.userId !== undefined ||
      customer.status !== "invited" ||
      customer.profileId === undefined
    )
      throw new Error("Prepared customer unavailable.");
    const profile = await ctx.db.get(customer.profileId);
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
    const now = Date.now();
    await ctx.db.insert("auditLogs", {
      scope: customer.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "customer.prepared_deleted",
      accountId: customer._id,
      profileId: profile._id,
      occurredAt: now,
      before: JSON.stringify({ slug: profile.slug }),
    });
    const storedLinks = await ctx.db
      .query("links")
      .withIndex("by_profile_position", (q) => q.eq("profileId", profile._id))
      .take(101);
    if (storedLinks.length > 100 || storedLinks.some((link) => !sameScope(account, link)))
      throw new Error("Prepared profile links are unavailable.");
    await Promise.all(storedLinks.map((link) => ctx.db.delete(link._id)));
    await Promise.all(invitations.map((invitation) => ctx.db.delete(invitation._id)));
    await ctx.db.delete(profile._id);
    await ctx.db.delete(customer._id);
    return null;
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
    const signupLimit = await signupLimiter.limit(ctx, "selfServiceSignup", {
      key: email,
    });
    if (!signupLimit.ok) throw new Error("Too many account creation attempts. Try again later.");
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
      draft: { name, slug, email, links: [], theme: "paper" },
      draftRevision: 0,
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
  args: {
    name: v.string(),
    bio: v.optional(v.string()),
    website: v.optional(v.string()),
  },
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
    const limit = await signupLimiter.limit(ctx, "selfServiceSignup", {
      key: `onboarding:${userId}`,
    });
    if (!limit.ok) throw new Error("Too many account creation attempts. Try again later.");
    const name = args.name.trim();
    if (name.length === 0) throw new Error("A nonblank profile name is required.");
    const bio = args.bio?.trim();
    const website = args.website?.trim();
    const slug = await allocateProfileSlug(ctx, name);
    const draft = {
      name,
      slug,
      email,
      ...(bio ? { bio } : {}),
      ...(website ? { website } : {}),
      links: [],
    };
    const [draftError] = validateDraftSafety(draft);
    if (draftError !== undefined) throw new Error(draftError);
    const now = Date.now();
    const profileId = await ctx.db.insert("profiles", {
      ownerId: customer._id,
      slug,
      status: "draft",
      draft,
      draftRevision: 0,
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
      actorLabel: customer.email ?? "Customer",
      action: "account.pending_deleted",
      accountId: customer._id,
      occurredAt: now,
      before: "pending",
      after: "deleted",
    });
    return null;
  },
});

export const acceptInvitation = action({
  args: { tokenHash: v.string() },
  returns: v.object({ profileId: v.union(v.id("profiles"), v.null()) }),
  handler: async (ctx, args): Promise<{ profileId: Id<"profiles"> | null }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Authentication required.");
    const attempt: {
      alreadyAccepted: boolean;
      allowed: boolean;
      profileId: Id<"profiles"> | null;
    } = await ctx.runMutation(internal.invitationAcceptance.consumeAttempt, {
      tokenHash: args.tokenHash,
      userId,
    });
    if (attempt.alreadyAccepted) return { profileId: attempt.profileId };
    if (!attempt.allowed) throw new Error("Too many invitation attempts. Try again later.");
    return await ctx.runMutation(internal.invitationAcceptance.finishAcceptance, {
      tokenHash: args.tokenHash,
      userId,
    });
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
      actorLabel: account.email ?? "Administrator",
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

export const setCardOwnerAccessOverride = mutation({
  args: { customerId: v.id("customers"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const target = await ctx.db.get(args.customerId);
    if (
      target === null ||
      !sameScope(account, target) ||
      !isActiveCustomer(target) ||
      target.role !== "customer"
    ) {
      throw new Error("Customer account unavailable.");
    }

    const before = target.cardOwnerAccessOverride === true;
    if (before === args.enabled) return null;
    if (args.enabled) {
      if (target.profileId === undefined) throw new Error("Customer profile not found.");
      const profile = await ctx.db.get(target.profileId);
      if (
        profile === null ||
        profile.ownerId !== target._id ||
        !sameScope(account, profile) ||
        !sameScope(target, profile)
      ) {
        throw new Error("Customer profile not found.");
      }
    }

    const now = Date.now();
    await ctx.db.patch(target._id, {
      cardOwnerAccessOverride: args.enabled ? true : undefined,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: account.email ?? "Administrator",
      action: "customer.card_owner_access_override_changed",
      accountId: target._id,
      ...(target.profileId === undefined ? {} : { profileId: target.profileId }),
      occurredAt: now,
      before: String(before),
      after: String(args.enabled),
    });
    return null;
  },
});

export const preflightSetupEmail = mutation({
  args: {
    email: v.string(),
    tokenHash: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!isHostedDemo()) return false;
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (query) => query.eq("tokenHash", args.tokenHash))
      .unique();
    const now = Date.now();
    if (
      invitation === null ||
      invitation.invalidatedAt !== undefined ||
      (invitation.expiresAt !== undefined && invitation.expiresAt <= now)
    )
      return false;
    const email = args.email.trim().toLowerCase();
    return (
      invitation.kind !== "prepared_setup" &&
      invitation.email !== undefined &&
      email.length > 0 &&
      email === invitation.email.trim().toLowerCase()
    );
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
      invitation.kind === "prepared_setup" ||
      invitation.email === undefined ||
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
    if (
      invitation.kind === "prepared_setup" ||
      invitation.email === undefined ||
      user?.email?.trim().toLowerCase() !== invitation.email.trim().toLowerCase()
    )
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
        actorLabel: customer.email ?? "Customer",
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
  returns: v.union(v.null(), schema.doc("customers").extend({ email: v.string() })),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const account = await ctx.db
      .query("customers")
      .withIndex("by_userId", (query) => query.eq("userId", userId))
      .unique();
    return account === null || account.email === undefined
      ? null
      : { ...account, email: account.email };
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
  args: {
    search: v.optional(v.string()),
    setupState: v.optional(
      v.union(v.null(), v.literal("waiting"), v.literal("draft"), v.literal("active")),
    ),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    schema.doc("customers").extend({
      setupState: v.union(v.null(), v.literal("waiting"), v.literal("draft"), v.literal("active")),
      linkExpiresAt: v.union(v.number(), v.null()),
      profileName: v.union(v.string(), v.null()),
      profileSlug: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const search = args.search?.trim().toLowerCase();
    const customerQuery = ctx.db
      .query("customers")
      .withIndex("by_scope", (query) => query.eq("scope", account.scope));
    const filteredCursorPrefix = `setup:${args.setupState ?? "null"}:`;
    const requestedOffset =
      args.setupState === undefined
        ? 0
        : args.paginationOpts.cursor?.startsWith(filteredCursorPrefix)
          ? Number(args.paginationOpts.cursor.slice(filteredCursorPrefix.length)) || 0
          : 0;
    const customers =
      args.setupState === undefined
        ? await customerQuery.paginate(args.paginationOpts)
        : {
            page: await customerQuery.collect(),
            isDone: true,
            continueCursor: "",
          };
    const now = Date.now();
    const annotated = await Promise.all(
      customers.page.map(async (customer) => {
        const [profile, invitations] = await Promise.all([
          customer.profileId === undefined ? null : ctx.db.get(customer.profileId),
          ctx.db
            .query("invitations")
            .withIndex("by_customerId", (q) => q.eq("customerId", customer._id))
            .take(1000),
        ]);
        const safeInvitations = invitations.filter((invitation) => sameScope(customer, invitation));
        const setupState = deriveSetupState(customer, safeInvitations, now);
        const safeProfile =
          profile !== null && profile.ownerId === customer._id && sameScope(customer, profile)
            ? profile
            : null;
        return {
          ...customer,
          setupState,
          linkExpiresAt: latestSetupExpiry(customer, safeInvitations, now),
          profileName: safeProfile?.draft.name ?? null,
          profileSlug: safeProfile?.slug ?? null,
        };
      }),
    );
    const filtered = annotated.filter((customer) => {
      if (args.setupState !== undefined && customer.setupState !== args.setupState) return false;
      return (
        search === undefined ||
        search.length === 0 ||
        (customer.email?.includes(search) ?? false) ||
        (customer.profileName?.toLowerCase().includes(search) ?? false) ||
        (customer.profileSlug?.includes(search) ?? false)
      );
    });
    if (args.setupState !== undefined) {
      const page = filtered.slice(requestedOffset, requestedOffset + args.paginationOpts.numItems);
      const nextOffset = requestedOffset + page.length;
      return {
        page,
        isDone: nextOffset >= filtered.length,
        continueCursor: `${filteredCursorPrefix}${nextOffset}`,
      };
    }
    return {
      ...customers,
      page: filtered,
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
      actorLabel: customer.email ?? "Customer",
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
        })),
      ),
    };
  },
});

export const hasOverdueDeletionRequests = query({
  args: { now: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const oldest = await ctx.db
      .query("deletionRequests")
      .withIndex("by_scope_and_status_and_requestedAt", (q) =>
        q
          .eq("scope", account.scope)
          .eq("status", "requested")
          .lt("requestedAt", args.now - 30 * 24 * 60 * 60 * 1000),
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
