import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { components } from "./components";
import { sameScope } from "./admin";

const invitationAttemptLimiter = new RateLimiter(components.rateLimiter, {
  selfServiceSignup: { kind: "fixed window", rate: 3, period: HOUR },
});
const authEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const consumeAttempt = internalMutation({
  args: { tokenHash: v.string(), userId: v.id("users") },
  returns: v.object({
    alreadyAccepted: v.boolean(),
    allowed: v.boolean(),
    profileId: v.union(v.id("profiles"), v.null()),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const email = user?.email?.trim().toLowerCase();
    if (user?.emailVerificationTime === undefined)
      throw new Error("A server-verified Google email is required.");
    if (email === undefined || !authEmailPattern.test(email))
      throw new Error("A valid authenticated email is required.");
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    const retryCustomer = invitation === null ? null : await ctx.db.get(invitation.customerId);
    const retryLinked = await ctx.db
      .query("customers")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (
      invitation !== null &&
      invitation.invalidatedAt === undefined &&
      invitation.acceptedAt !== undefined &&
      email === invitation.email.trim().toLowerCase() &&
      retryCustomer !== null &&
      retryCustomer.role === "customer" &&
      retryCustomer.deletionStatus === "active" &&
      sameScope(retryCustomer, invitation) &&
      retryCustomer.status === "active" &&
      retryCustomer.userId === args.userId &&
      (retryLinked === null || retryLinked._id === retryCustomer._id)
    )
      return {
        alreadyAccepted: true,
        allowed: true,
        profileId: retryCustomer.profileId ?? null,
      };
    const limit = await invitationAttemptLimiter.limit(ctx, "selfServiceSignup", {
      key: `invitation:${args.userId}`,
    });
    return { alreadyAccepted: false, allowed: limit.ok, profileId: null };
  },
});

export const finishAcceptance = internalMutation({
  args: { tokenHash: v.string(), userId: v.id("users") },
  returns: v.object({ profileId: v.union(v.id("profiles"), v.null()) }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const email = user?.email?.trim().toLowerCase();
    if (user?.emailVerificationTime === undefined)
      throw new Error("A server-verified Google email is required.");
    if (email === undefined || !authEmailPattern.test(email))
      throw new Error("A valid authenticated email is required.");
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (invitation !== null && invitation.acceptedAt !== undefined) {
      const acceptedCustomer = await ctx.db.get(invitation.customerId);
      const acceptedLink = await ctx.db
        .query("customers")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique();
      if (
        invitation.invalidatedAt === undefined &&
        email === invitation.email.trim().toLowerCase() &&
        acceptedCustomer !== null &&
        acceptedCustomer.role === "customer" &&
        acceptedCustomer.deletionStatus === "active" &&
        sameScope(acceptedCustomer, invitation) &&
        acceptedCustomer.status === "active" &&
        acceptedCustomer.userId === args.userId &&
        (acceptedLink === null || acceptedLink._id === acceptedCustomer._id)
      )
        return { profileId: acceptedCustomer.profileId ?? null };
    }
    if (invitation === null || invitation.invalidatedAt !== undefined)
      throw new Error("This invitation is invalid or expired.");
    if (email !== invitation.email.trim().toLowerCase())
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
    if (customer.userId !== undefined && customer.userId !== args.userId)
      throw new Error("This invitation is linked to another user.");
    const linked = await ctx.db
      .query("customers")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (linked !== null && linked._id !== customer._id)
      throw new Error("This authenticated account is already linked to another customer.");
    if (invitation.expiresAt !== undefined && invitation.expiresAt <= Date.now())
      throw new Error("This invitation is invalid or expired.");
    const now = Date.now();
    await ctx.db.patch(customer._id, {
      userId: args.userId,
      status: "active",
      updatedAt: now,
    });
    if (invitation.acceptedAt === undefined)
      await ctx.db.patch(invitation._id, { acceptedAt: now });
    await ctx.db.insert("auditLogs", {
      scope: customer.scope,
      actorUserId: args.userId,
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
