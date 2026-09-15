import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { RateLimiter, HOUR } from "@convex-dev/rate-limiter";
import { action } from "./_generated/server";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import { normalizeAuthEmail, sendAuthEmail } from "./authEmail";

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
      reset: emailProvider(),
      verify: emailProvider(),
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
