import { convexTest } from "convex-test";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";

import schema from "../schema";
import type { AdminProfileRepairResult } from "../adminProfileRepair";

const modules = import.meta.glob("../**/*.{ts,js}");
const testConvex = () => convexTest(schema, modules);
const repair = makeFunctionReference<"mutation", Record<string, never>>(
  "adminProfileRepair:repair",
) as unknown as FunctionReference<
  "mutation",
  "internal",
  Record<string, never>,
  AdminProfileRepairResult
>;

const draft = (slug: string, name: string) => ({
  name,
  slug,
  links: [],
});

async function seedAdmin(t: ReturnType<typeof testConvex>, email: string) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email });
    const customerId = await ctx.db.insert("customers", {
      userId,
      email,
      role: "admin",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    return { userId, customerId };
  });
}

describe("admin personal profile repair", () => {
  it("creates only missing profiles and reports inconsistent references per account", async () => {
    const t = testConvex();
    const missing = await seedAdmin(t, "missing@example.test");
    const valid = await seedAdmin(t, "valid@example.test");
    const broken = await seedAdmin(t, "broken@example.test");
    const orphan = await seedAdmin(t, "orphan@example.test");
    const { existingProfileId, orphanProfileId } = await t.run(async (ctx) => {
      const existingProfileId = await ctx.db.insert("profiles", {
        ownerId: valid.customerId,
        slug: "valid-admin",
        status: "draft",
        draft: draft("valid-admin", "Valid Admin"),
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(valid.customerId, { profileId: existingProfileId });
      const orphanProfileId = await ctx.db.insert("profiles", {
        ownerId: orphan.customerId,
        slug: "orphan-admin",
        status: "draft",
        draft: draft("orphan-admin", "Orphan Admin"),
        createdAt: 1,
        updatedAt: 1,
      });
      const danglingProfileId = await ctx.db.insert("profiles", {
        ownerId: broken.customerId,
        slug: "deleted-admin-profile",
        status: "draft",
        draft: draft("deleted-admin-profile", "Deleted Admin"),
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(broken.customerId, { profileId: danglingProfileId });
      await ctx.db.delete(danglingProfileId);
      return { existingProfileId, orphanProfileId };
    });

    const result = await t.mutation(repair, {});
    expect(result.created).toHaveLength(1);
    expect(result.created[0]?.customerId).toBe(missing.customerId);
    expect(result.skipped).toEqual([
      { customerId: valid.customerId, reason: "profile_exists" },
      { customerId: orphan.customerId, reason: "profile_exists" },
    ]);
    expect(result.failed.map(({ customerId }) => customerId)).toContain(broken.customerId);
    const firstProfileId = result.created[0]?.profileId;
    expect(firstProfileId).toBeDefined();
    await t.run(async (ctx) => {
      expect(await ctx.db.get(firstProfileId!)).toMatchObject({
        ownerId: missing.customerId,
        status: "draft",
        draft: { email: "missing@example.test", links: [] },
      });
      expect(await ctx.db.get(existingProfileId)).toMatchObject({ slug: "valid-admin" });
      expect(await ctx.db.get(orphan.customerId)).toMatchObject({ profileId: orphanProfileId });
      expect(await ctx.db.get(orphanProfileId)).toMatchObject({ slug: "orphan-admin" });
      expect(
        await ctx.db
          .query("auditLogs")
          .withIndex("by_accountId", (q) => q.eq("accountId", missing.customerId))
          .filter((q) => q.eq(q.field("action"), "admin.profile_provisioned"))
          .collect(),
      ).toHaveLength(1);
    });

    const repeated = await t.mutation(repair, {});
    expect(repeated.created).toEqual([]);
    expect(repeated.skipped).toEqual([
      { customerId: missing.customerId, reason: "profile_exists" },
      { customerId: valid.customerId, reason: "profile_exists" },
      { customerId: orphan.customerId, reason: "profile_exists" },
    ]);
    expect(repeated.failed.map(({ customerId }) => customerId)).toContain(broken.customerId);
    await t.run(async (ctx) => {
      expect(
        await ctx.db
          .query("auditLogs")
          .withIndex("by_accountId", (q) => q.eq("accountId", broken.customerId))
          .filter((q) => q.eq(q.field("action"), "admin.profile_provisioning_failed"))
          .collect(),
      ).toHaveLength(2);
    });
  });
});
