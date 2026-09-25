import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ensureAdminPersonalProfile } from "./adminProfile";
import { env } from "./_generated/server";

const createdItem = v.object({ customerId: v.id("customers"), profileId: v.id("profiles") });
const skippedItem = v.object({
  customerId: v.id("customers"),
  reason: v.literal("profile_exists"),
});
const failedItem = v.object({ customerId: v.id("customers"), error: v.string() });

export type AdminProfileRepairResult = {
  created: Array<{ customerId: Id<"customers">; profileId: Id<"profiles"> }>;
  skipped: Array<{ customerId: Id<"customers">; reason: "profile_exists" }>;
  failed: Array<{ customerId: Id<"customers">; error: string }>;
};

export const repair = internalMutation({
  args: {},
  returns: v.object({
    created: v.array(createdItem),
    skipped: v.array(skippedItem),
    failed: v.array(failedItem),
  }),
  handler: async (ctx): Promise<AdminProfileRepairResult> => {
    const admins = await ctx.db
      .query("customers")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .collect();
    const result: AdminProfileRepairResult = { created: [], skipped: [], failed: [] };
    for (const customer of admins) {
      if (customer.status !== "active" || customer.deletionStatus !== "active") continue;
      try {
        const ensured = await ensureAdminPersonalProfile(ctx, {
          customerId: customer._id,
          actorLabel: "admin-profile-repair",
          email: customer.email,
        });
        if (ensured.created) {
          result.created.push({ customerId: ensured.customerId, profileId: ensured.profileId });
        } else {
          result.skipped.push({ customerId: ensured.customerId, reason: "profile_exists" });
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown repair failure.";
        const safeError = detail.slice(0, 240);
        result.failed.push({ customerId: customer._id, error: safeError });
        await ctx.db.insert("auditLogs", {
          scope: env.TAPIT_DEMO_AUTH_MODE === "hosted-demo" ? "demo" : undefined,
          actorLabel: "admin-profile-repair",
          action: "admin.profile_provisioning_failed",
          accountId: customer._id,
          occurredAt: Date.now(),
          after: JSON.stringify({ error: safeError }),
        });
      }
    }
    result.created.sort((a, b) => String(a.customerId).localeCompare(String(b.customerId)));
    result.skipped.sort((a, b) => String(a.customerId).localeCompare(String(b.customerId)));
    result.failed.sort((a, b) => String(a.customerId).localeCompare(String(b.customerId)));
    return result;
  },
});
