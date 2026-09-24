import Google, { type GoogleProfile } from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { action, env } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";

import { ensureGoogleApplicationAccount, parseAdminEmails } from "./authIdentity";

const hostedDemo = env.TAPIT_DEMO_AUTH_MODE === "hosted-demo";
const adminEmails = (env as typeof env & { TAPIT_ADMIN_EMAILS?: string }).TAPIT_ADMIN_EMAILS;

const googleProvider = Google<GoogleProfile>({
  allowDangerousEmailAccountLinking: false,
  profile(profile) {
    return {
      id: profile.sub,
      name: profile.name,
      email: profile.email,
      image: profile.picture,
      emailVerified: profile.email_verified === true,
    };
  },
});

const authConfig = convexAuth({
  providers: hostedDemo ? [googleProvider, Password()] : [googleProvider],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, args) {
      if (args.type !== "oauth" || args.provider.id !== "google") return;
      const profile = args.profile;
      await ensureGoogleApplicationAccount(ctx, {
        userId: args.userId,
        provider: args.provider.id,
        email: profile.email,
        emailVerified: profile.emailVerified,
        displayName: typeof profile.name === "string" ? profile.name : undefined,
        adminEmails: parseAdminEmails(adminEmails),
      });
    },
  },
  signIn: { maxFailedAttempsPerHour: 5 },
});

export const { auth, signOut, store, isAuthenticated } = authConfig;

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
  authConfig.signIn as unknown as {
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

export const signIn = action({
  args: authSignInArgs,
  handler: async (ctx, args) => {
    if (!hostedDemo && args.provider !== undefined && args.provider !== "google") {
      throw new Error("Only Google authentication is available.");
    }
    return await runAuthSignIn(ctx, args);
  },
});
