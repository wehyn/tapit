import { getAuthUserId } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { action, env } from "./_generated/server";
import { internalAction, internalMutation } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { normalizeAuthEmail, sendAuthEmail } from "./authEmail";
import { components } from "./components";

const resetRequestLimiter = new RateLimiter(components.rateLimiter, {
  authResetRequest: { kind: "fixed window", rate: 3, period: HOUR },
});
const RESET_RESPONSE_FLOOR_MS = 250;

const emailProvider = () =>
  Email({
    maxAge: 60 * 60,
    authorize: async (params, account) => {
      const email = typeof params.email === "string" ? normalizeAuthEmail(params.email) : "";
      if (account.providerAccountId !== email) {
        throw new Error(
          "Short verification code requires a matching `email` in params of `signIn`.",
        );
      }
    },
    sendVerificationRequest: sendAuthEmail,
  });

const hostedDemo = env.TAPIT_DEMO_AUTH_MODE === "hosted-demo";

const authConfig = convexAuth({
  providers: [
    Password({
      profile(params) {
        return { email: normalizeAuthEmail(String(params.email ?? "")) };
      },
      validatePasswordRequirements(password) {
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters.");
        }
      },
      reset: hostedDemo ? undefined : emailProvider(),
      verify: hostedDemo ? undefined : emailProvider(),
    }),
  ],
  signIn: { maxFailedAttempsPerHour: 5 },
});

export const { auth, signOut, store, isAuthenticated } = authConfig;

const authSignIn = authConfig.signIn;

type AuthSignInArgs = {
  provider?: string;
  params?: Record<string, unknown>;
  verifier?: string;
  refreshToken?: string;
  calledBy?: string;
};

type AuthSignInResult = {
  redirect?: string;
  verifier?: string;
  tokens?: unknown;
  started?: boolean;
};

const runAuthSignIn = (
  authSignIn as unknown as {
    _handler: (ctx: ActionCtx, args: AuthSignInArgs) => Promise<AuthSignInResult>;
  }
)._handler;

const authSignInArgs = {
  provider: v.optional(v.string()),
  params: v.optional(v.any()),
  verifier: v.optional(v.string()),
  refreshToken: v.optional(v.string()),
  calledBy: v.optional(v.string()),
};

export const processPasswordReset = internalAction({
  args: authSignInArgs,
  handler: async (ctx, args) => {
    try {
      await runAuthSignIn(ctx, args);
    } catch {
      console.error("Tapit password reset processing failed", { status: "failed" });
    }
  },
});

export const recordPasswordResetRequested = internalMutation({
  args: { customerId: v.id("customers"), actorUserId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customerId);
    if (customer === null || customer.role !== "customer" || customer.deletionStatus !== "active") {
      throw new Error("Customer account unavailable.");
    }
    await ctx.db.insert("auditLogs", {
      scope: customer.scope,
      actorUserId: args.actorUserId,
      actorLabel: "Administrator",
      action: "customer.password_reset_requested",
      accountId: customer._id,
      profileId: customer.profileId,
      occurredAt: Date.now(),
      after: "accepted",
    });
    return null;
  },
});

export const signIn = action({
  args: authSignInArgs,
  handler: async (ctx, args) => {
    if (args.provider === "password" && args.params?.flow === "reset") {
      const startedAt = Date.now();
      try {
        const email =
          typeof args.params.email === "string" ? normalizeAuthEmail(args.params.email) : "";
        const rateLimit = await resetRequestLimiter.limit(ctx, "authResetRequest", {
          key: email,
        });
        if (rateLimit.ok) {
          // Queue both known and unknown reset work so provider latency is never part of this response.
          await ctx.scheduler.runAfter(0, internal.auth.processPasswordReset, args);
        }
      } catch {
        // Password reset must have the same public result for known and unknown emails.
      }
      const remaining = RESET_RESPONSE_FLOOR_MS - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      return {};
    }
    return await runAuthSignIn(ctx, args);
  },
});

export const adminRequestPasswordReset = action({
  args: { customerId: v.id("customers") },
  returns: v.object({ accepted: v.boolean() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Administrator permission required.");
    const admin = await ctx.runQuery(internal.admin.currentAccessInternal, {});
    if (!admin.authenticated || admin.role !== "admin")
      throw new Error("Administrator permission required.");
    const customer = await ctx.runQuery(internal.customers.byIdForAdmin, {
      customerId: args.customerId,
    });
    if (
      customer === null ||
      customer.role !== "customer" ||
      customer.status === "deleted" ||
      customer.deletionStatus !== "active"
    )
      throw new Error("Customer account unavailable.");
    await ctx.runMutation(internal.auth.recordPasswordResetRequested, {
      customerId: customer._id,
      actorUserId: userId,
    });
    await ctx.scheduler.runAfter(0, internal.auth.processPasswordReset, {
      provider: "password",
      params: { flow: "reset", email: customer.email },
    });
    return { accepted: true };
  },
});
