import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export type GoogleIdentityProfile = {
  provider: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  displayName?: string;
};

export type ApplicationAccountState = {
  customerId: Doc<"customers">["_id"];
  role: "customer" | "admin";
  status: "pending" | "invited" | "active" | "deleted";
  profileId: Doc<"profiles">["_id"] | null;
};

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseAdminEmails(value: string | undefined): string[] {
  if (value === undefined) return [];
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map(normalizeAuthEmail)
        .filter((email) => emailPattern.test(email)),
    ),
  ];
}

type EnsureArgs = GoogleIdentityProfile & {
  userId: Doc<"users">["_id"];
  adminEmails: readonly string[];
};

function accountState(customer: Doc<"customers">): ApplicationAccountState {
  return {
    customerId: customer._id,
    role: customer.role,
    status: customer.status,
    profileId: customer.profileId ?? null,
  };
}

export async function ensureGoogleApplicationAccount(
  ctx: MutationCtx,
  args: EnsureArgs,
): Promise<ApplicationAccountState> {
  if (args.provider !== "google") throw new Error("Google authentication is required.");
  if (args.emailVerified !== true) throw new Error("A verified Google email is required.");
  const displayName = (args.displayName ?? args.name)?.trim().slice(0, 120);

  const email = normalizeAuthEmail(args.email ?? "");
  if (!emailPattern.test(email)) throw new Error("A valid authenticated email is required.");
  const user = await ctx.db.get(args.userId);
  if (user === null || normalizeAuthEmail(user.email ?? "") !== email) {
    throw new Error("Authenticated Google user ownership could not be verified.");
  }
  if (user.emailVerificationTime === undefined) {
    throw new Error("A server-verified Google email is required.");
  }

  const linked = await ctx.db
    .query("customers")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .take(2);
  if (linked.length > 1)
    throw new Error("Authenticated user is linked to multiple customer accounts.");
  const existing = linked[0] ?? null;

  const byEmail = await ctx.db
    .query("customers")
    .withIndex("by_email", (q) => q.eq("email", email))
    .take(2);
  if (byEmail.length > 1) {
    throw new Error("That email is already linked to another customer account.");
  }
  const emailAccount = byEmail[0] ?? null;
  if (
    emailAccount !== null &&
    existing === null &&
    emailAccount.userId === undefined &&
    emailAccount.status === "invited"
  ) {
    return accountState(emailAccount);
  }
  if (emailAccount !== null && emailAccount._id !== existing?._id) {
    throw new Error("That email is already linked to another customer account.");
  }

  if (existing !== null) {
    if (existing.status === "deleted" && existing.role === "customer") {
      const now = Date.now();
      await ctx.db.patch(existing._id, {
        email,
        status: "pending",
        deletionStatus: "active",
        updatedAt: now,
        ...(existing.onboardingName === undefined && displayName
          ? { onboardingName: displayName }
          : {}),
      });
      await ctx.db.insert("auditLogs", {
        actorUserId: args.userId,
        actorLabel: email,
        action: "auth.google_account_restarted",
        accountId: existing._id,
        occurredAt: now,
        before: JSON.stringify({ status: "deleted", deletionStatus: existing.deletionStatus }),
        after: JSON.stringify({ status: "pending", deletionStatus: "active" }),
      });
      return accountState({ ...existing, status: "pending", deletionStatus: "active", email });
    }
    return accountState(existing);
  }

  const now = Date.now();
  const isAdmin = args.adminEmails.map(normalizeAuthEmail).includes(email);
  const customerId = await ctx.db.insert("customers", {
    userId: args.userId,
    email,
    role: isAdmin ? "admin" : "customer",
    status: isAdmin ? "active" : "pending",
    deletionStatus: "active",
    ...(!isAdmin && displayName ? { onboardingName: displayName } : {}),
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("auditLogs", {
    actorUserId: args.userId,
    actorLabel: email,
    action: "auth.google_account_provisioned",
    accountId: customerId,
    occurredAt: now,
    after: JSON.stringify({
      role: isAdmin ? "admin" : "customer",
      status: isAdmin ? "active" : "pending",
    }),
  });
  return {
    customerId,
    role: isAdmin ? "admin" : "customer",
    status: isAdmin ? "active" : "pending",
    profileId: null,
  };
}
