import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import {
  ensureGoogleApplicationAccount,
  normalizeAuthEmail,
  parseAdminEmails,
} from "../authIdentity";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");

const testConvex = () => convexTest(schema, modules);

async function seedUser(
  t: ReturnType<typeof testConvex>,
  input: { email?: string; emailVerificationTime?: number; name?: string },
) {
  return await t.run(async (ctx) => ctx.db.insert("users", input));
}

describe("Google application account provisioning", () => {
  it("normalizes emails and parses only valid exact admin addresses", () => {
    expect(normalizeAuthEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(parseAdminEmails(" Ada@Example.COM,not-an-email, grace@example.com ")).toEqual([
      "ada@example.com",
      "grace@example.com",
    ]);
  });

  it("provisions a verified Google customer once and preserves a pending name on retry", async () => {
    const t = testConvex();
    const userId = await seedUser(t, {
      email: "Customer@Example.COM",
      emailVerificationTime: 1,
      name: "Google Display Name",
    });

    const first = await t.run((ctx) =>
      ensureGoogleApplicationAccount(ctx, {
        userId,
        provider: "google",
        email: "Customer@Example.COM",
        emailVerified: true,
        displayName: "Google Display Name",
        adminEmails: [],
      }),
    );
    const second = await t.run((ctx) =>
      ensureGoogleApplicationAccount(ctx, {
        userId,
        provider: "google",
        email: "Customer@Example.COM",
        emailVerified: true,
        displayName: "Changed Display Name",
        adminEmails: [],
      }),
    );

    expect(second).toEqual(first);
    await t.run(async (ctx) => {
      const customer = await ctx.db.get(first.customerId);
      expect(customer).toMatchObject({
        userId,
        email: "customer@example.com",
        role: "customer",
        status: "pending",
        deletionStatus: "active",
        onboardingName: "Google Display Name",
      });
      expect(
        await ctx.db
          .query("auditLogs")
          .withIndex("by_accountId", (q) => q.eq("accountId", first.customerId))
          .collect(),
      ).toHaveLength(1);
    });
  });

  it("creates an allowlisted admin without a customer profile and never links an invitation by email", async () => {
    const t = testConvex();
    const userId = await seedUser(t, { email: "Admin@Example.COM", emailVerificationTime: 1 });
    const invitation = await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        email: "admin@example.com",
        role: "customer",
        status: "invited",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      return await ctx.db.insert("invitations", {
        customerId,
        email: "admin@example.com",
        tokenHash: "invite",
        expiresAt: Date.now() + 10_000,
        createdByUserId: userId,
        createdAt: 1,
      });
    });

    const result = await t.run((ctx) =>
      ensureGoogleApplicationAccount(ctx, {
        userId,
        provider: "google",
        email: "Admin@Example.COM",
        emailVerified: true,
        adminEmails: ["admin@example.com"],
      }),
    );
    expect(result.role).toBe("admin");
    expect(result.profileId).toBeNull();
    await t.run(async (ctx) => {
      expect((await ctx.db.get(result.customerId))?.status).toBe("active");
      expect((await ctx.db.get(invitation))?.acceptedAt).toBeUndefined();
    });
  });

  it("rejects unverified, non-Google, and conflicting identities", async () => {
    const t = testConvex();
    const userId = await seedUser(t, { email: "person@example.com", emailVerificationTime: 1 });
    await expect(
      t.run((ctx) =>
        ensureGoogleApplicationAccount(ctx, {
          userId,
          provider: "google",
          email: "person@example.com",
          emailVerified: false,
          adminEmails: [],
        }),
      ),
    ).rejects.toThrow("verified");
    await expect(
      t.run((ctx) =>
        ensureGoogleApplicationAccount(ctx, {
          userId,
          provider: "password",
          email: "person@example.com",
          emailVerified: true,
          adminEmails: [],
        }),
      ),
    ).rejects.toThrow("Google");
    const otherUserId = await seedUser(t, { email: "other@example.com", emailVerificationTime: 1 });
    await t.run(async (ctx) => {
      await ctx.db.insert("customers", {
        userId: otherUserId,
        email: "person@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await expect(
      t.run((ctx) =>
        ensureGoogleApplicationAccount(ctx, {
          userId,
          provider: "google",
          email: "person@example.com",
          emailVerified: true,
          adminEmails: [],
        }),
      ),
    ).rejects.toThrow("already");
  });
});
