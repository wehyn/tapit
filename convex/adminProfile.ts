import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { env } from "./_generated/server";
import { allocateProfileSlug } from "./profileSlug";

export type EnsureAdminPersonalProfileArgs = {
  customerId: Id<"customers">;
  actorUserId?: Id<"users">;
  actorLabel: string;
  initialName?: string;
  email: string;
};

export type EnsureAdminPersonalProfileResult = {
  customerId: Id<"customers">;
  profileId: Id<"profiles">;
  created: boolean;
};

export class AdminProfileInconsistentError extends Error {}

export async function ensureAdminPersonalProfile(
  ctx: MutationCtx,
  args: EnsureAdminPersonalProfileArgs,
): Promise<EnsureAdminPersonalProfileResult> {
  const customer = await ctx.db.get(args.customerId);
  if (
    customer === null ||
    customer.role !== "admin" ||
    customer.status !== "active" ||
    customer.deletionStatus !== "active"
  ) {
    throw new Error(`Active administrator ${args.customerId} is required.`);
  }

  if (customer.profileId !== undefined) {
    const existing = await ctx.db.get(customer.profileId);
    if (
      existing === null ||
      existing.ownerId !== customer._id ||
      existing.scope !== customer.scope
    ) {
      throw new AdminProfileInconsistentError(
        `Administrator profile reference is inconsistent for ${args.customerId}.`,
      );
    }
    return { customerId: customer._id, profileId: existing._id, created: false };
  }

  const orphaned = await ctx.db
    .query("profiles")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", customer._id))
    .take(2);
  if (orphaned.length > 1 || orphaned.some((profile) => profile.scope !== customer.scope)) {
    throw new AdminProfileInconsistentError(
      `Administrator profile ownership is inconsistent for ${args.customerId}.`,
    );
  }
  if (orphaned.length === 1) {
    const profile = orphaned[0]!;
    const now = Date.now();
    await ctx.db.patch(customer._id, { profileId: profile._id, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      scope: customer.scope,
      ...(args.actorUserId === undefined ? {} : { actorUserId: args.actorUserId }),
      actorLabel: args.actorLabel,
      action: "admin.profile_reference_repaired",
      accountId: customer._id,
      profileId: profile._id,
      occurredAt: now,
    });
    return { customerId: customer._id, profileId: profile._id, created: false };
  }

  const email = args.email.trim().toLowerCase();
  const emailName = email.split("@")[0] ?? "";
  const name = (args.initialName?.trim() || emailName).slice(0, 120) || "Administrator";
  const slug = await allocateProfileSlug(ctx, name || email);
  const now = Date.now();
  const scope = env.TAPIT_DEMO_AUTH_MODE === "hosted-demo" ? ("demo" as const) : undefined;
  if (scope !== customer.scope) {
    throw new Error(`Administrator scope is inconsistent for ${args.customerId}.`);
  }
  const profileId = await ctx.db.insert("profiles", {
    scope,
    ownerId: customer._id,
    slug,
    status: "draft",
    draft: { name, slug, email, links: [] },
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(customer._id, { profileId, updatedAt: now });
  await ctx.db.insert("auditLogs", {
    scope,
    ...(args.actorUserId === undefined ? {} : { actorUserId: args.actorUserId }),
    actorLabel: args.actorLabel,
    action: "admin.profile_provisioned",
    accountId: customer._id,
    profileId,
    occurredAt: now,
    after: JSON.stringify({ slug, status: "draft" }),
  });
  return { customerId: customer._id, profileId, created: true };
}
