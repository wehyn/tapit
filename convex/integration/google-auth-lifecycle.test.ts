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

  it("provisions an allowlisted admin with a private owned draft profile", async () => {
    const t = testConvex();
    const userId = await seedUser(t, { email: "Admin@Example.test", emailVerificationTime: 1 });

    const result = await t.run((ctx) =>
      ensureGoogleApplicationAccount(ctx, {
        userId,
        provider: "google",
        email: "Admin@Example.test",
        emailVerified: true,
        displayName: "Admin Example",
        adminEmails: parseAdminEmails(" Admin@Example.test,second@example.test "),
      }),
    );

    expect(result).toMatchObject({ role: "admin", status: "active" });
    expect(result.profileId).not.toBeNull();
    await t.run(async (ctx) => {
      const customer = await ctx.db.get(result.customerId);
      const profile = result.profileId === null ? null : await ctx.db.get(result.profileId);
      expect(customer).toMatchObject({
        userId,
        email: "admin@example.test",
        role: "admin",
        status: "active",
        deletionStatus: "active",
      });
      expect(customer?.profileId).toBe(result.profileId);
      expect(profile).toMatchObject({
        ownerId: result.customerId,
        status: "draft",
        draft: {
          name: "Admin Example",
          email: "admin@example.test",
          links: [],
        },
      });
      expect(profile?.published).toBeUndefined();
      expect(await ctx.db.query("profiles").collect()).toHaveLength(1);
      expect(
        await ctx.db
          .query("auditLogs")
          .withIndex("by_accountId", (q) => q.eq("accountId", result.customerId))
          .filter((q) => q.eq(q.field("action"), "admin.profile_provisioned"))
          .collect(),
      ).toHaveLength(1);
    });
  });

  it("reuses an admin profile without overwriting later edits on sign-in", async () => {
    const t = testConvex();
    const userId = await seedUser(t, { email: "admin@example.test", emailVerificationTime: 1 });
    const args = {
      userId,
      provider: "google",
      email: "admin@example.test",
      emailVerified: true,
      displayName: "Initial Admin",
      adminEmails: ["admin@example.test"],
    };
    const first = await t.run((ctx) => ensureGoogleApplicationAccount(ctx, args));
    if (first.profileId === null) throw new Error("Expected admin profile provisioning.");
    await t.run(async (ctx) => {
      await ctx.db.patch(first.profileId!, {
        slug: "edited-admin",
        draft: {
          name: "Edited Admin",
          slug: "edited-admin",
          email: "admin@example.test",
          imageUrl: "https://example.test/avatar.png",
          links: [
            { id: "custom", label: "Custom", destination: "https://example.test", enabled: true },
          ],
        },
      });
    });
    const second = await t.run((ctx) =>
      ensureGoogleApplicationAccount(ctx, { ...args, displayName: "Changed Google Name" }),
    );
    expect(second).toEqual(first);
    await t.run(async (ctx) => {
      expect(await ctx.db.get(first.profileId!)).toMatchObject({
        slug: "edited-admin",
        status: "draft",
        draft: {
          name: "Edited Admin",
          slug: "edited-admin",
          imageUrl: "https://example.test/avatar.png",
        },
      });
      expect(await ctx.db.query("profiles").collect()).toHaveLength(1);
    });
  });

  it("keeps an inconsistent existing administrator signed in without exposing a foreign profile", async () => {
    const t = testConvex();
    const userId = await seedUser(t, {
      email: "broken-admin@example.test",
      emailVerificationTime: 1,
    });
    const customerId = await t.run(async (ctx) => {
      const other = await ctx.db.insert("customers", {
        email: "other@example.test",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const foreignProfileId = await ctx.db.insert("profiles", {
        ownerId: other,
        slug: "other",
        status: "draft",
        draft: { name: "Other", slug: "other", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      return await ctx.db.insert("customers", {
        userId,
        email: "broken-admin@example.test",
        role: "admin",
        status: "active",
        deletionStatus: "active",
        profileId: foreignProfileId,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const result = await t.run((ctx) =>
      ensureGoogleApplicationAccount(ctx, {
        userId,
        provider: "google",
        email: "broken-admin@example.test",
        emailVerified: true,
        adminEmails: ["broken-admin@example.test"],
      }),
    );
    expect(result).toMatchObject({ customerId, role: "admin", status: "active", profileId: null });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(customerId))?.profileId).not.toBeUndefined();
      const failures = await ctx.db
        .query("auditLogs")
        .withIndex("by_accountId", (q) => q.eq("accountId", customerId))
        .collect();
      expect(failures.some((event) => event.action === "admin.profile_provisioning_failed")).toBe(
        true,
      );
    });
  });

  it.each([
    { description: "allowlisted", adminEmails: ["invitee@example.com"] },
    { description: "not allowlisted", adminEmails: [] },
  ])(
    "preserves an unlinked invitation for an $description email without creating another account",
    async ({ adminEmails }) => {
      const t = testConvex();
      const userId = await seedUser(t, { email: "Invitee@Example.COM", emailVerificationTime: 1 });
      const { customerId, invitationId } = await t.run(async (ctx) => {
        const customerId = await ctx.db.insert("customers", {
          email: "invitee@example.com",
          role: "customer",
          status: "invited",
          deletionStatus: "active",
          createdAt: 1,
          updatedAt: 1,
        });
        const invitationId = await ctx.db.insert("invitations", {
          customerId,
          email: "invitee@example.com",
          tokenHash: "invite",
          expiresAt: Date.now() + 10_000,
          createdByUserId: userId,
          createdAt: 1,
        });
        return { customerId, invitationId };
      });

      const result = await t.run((ctx) =>
        ensureGoogleApplicationAccount(ctx, {
          userId,
          provider: "google",
          email: "Invitee@Example.COM",
          emailVerified: true,
          adminEmails,
        }),
      );

      expect(result).toMatchObject({ customerId, role: "customer", status: "invited" });
      await t.run(async (ctx) => {
        expect(await ctx.db.get(customerId)).toMatchObject({
          email: "invitee@example.com",
          role: "customer",
          status: "invited",
          deletionStatus: "active",
        });
        expect((await ctx.db.get(customerId))?.userId).toBeUndefined();
        expect((await ctx.db.get(invitationId))?.acceptedAt).toBeUndefined();
        expect(
          await ctx.db
            .query("customers")
            .withIndex("by_email", (q) => q.eq("email", "invitee@example.com"))
            .take(10),
        ).toHaveLength(1);
      });
    },
  );

  it("uses the Google profile name when no display-name alias is supplied", async () => {
    const t = testConvex();
    const userId = await seedUser(t, { email: "named@example.com", emailVerificationTime: 1 });

    const result = await t.run((ctx) =>
      ensureGoogleApplicationAccount(ctx, {
        userId,
        provider: "google",
        email: "named@example.com",
        emailVerified: true,
        name: "Google Profile Name",
        adminEmails: [],
      }),
    );

    await t.run(async (ctx) => {
      expect((await ctx.db.get(result.customerId))?.onboardingName).toBe("Google Profile Name");
    });
  });

  it.each([
    { status: "pending" as const, linked: true },
    { status: "invited" as const, linked: false },
    { status: "active" as const, linked: true },
  ])(
    "does not promote an existing $status account when its email is allowlisted",
    async ({ status, linked }) => {
      const t = testConvex();
      const userId = await seedUser(t, { email: "existing@example.com", emailVerificationTime: 1 });
      const customerId = await t.run((ctx) =>
        ctx.db.insert("customers", {
          ...(linked ? { userId } : {}),
          email: "existing@example.com",
          role: "customer",
          status,
          deletionStatus: "active",
          createdAt: 1,
          updatedAt: 1,
        }),
      );

      const result = await t.run((ctx) =>
        ensureGoogleApplicationAccount(ctx, {
          userId,
          provider: "google",
          email: "existing@example.com",
          emailVerified: true,
          adminEmails: ["existing@example.com"],
        }),
      );

      expect(result).toMatchObject({ customerId, role: "customer", status });
      await t.run(async (ctx) => {
        expect(await ctx.db.get(customerId)).toMatchObject({
          email: "existing@example.com",
          role: "customer",
          status,
        });
        expect(
          await ctx.db
            .query("customers")
            .withIndex("by_email", (q) => q.eq("email", "existing@example.com"))
            .take(10),
        ).toHaveLength(1);
      });
    },
  );

  it("restarts a deleted pending customer but preserves an active customer", async () => {
    const t = testConvex();
    const restartedUserId = await seedUser(t, {
      email: "restart@example.com",
      emailVerificationTime: 1,
    });
    const activeUserId = await seedUser(t, {
      email: "active@example.com",
      emailVerificationTime: 1,
    });
    const ids = await t.run(async (ctx) => {
      const deletedPendingId = await ctx.db.insert("customers", {
        userId: restartedUserId,
        email: "restart@example.com",
        role: "customer",
        status: "deleted",
        deletionStatus: "deleted",
        createdAt: 1,
        updatedAt: 1,
      });
      const activeCustomerId = await ctx.db.insert("customers", {
        userId: activeUserId,
        email: "active@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      return { deletedPendingId, activeCustomerId };
    });

    const restarted = await t.run((ctx) =>
      ensureGoogleApplicationAccount(ctx, {
        userId: restartedUserId,
        provider: "google",
        email: "restart@example.com",
        emailVerified: true,
        adminEmails: [],
      }),
    );
    const active = await t.run((ctx) =>
      ensureGoogleApplicationAccount(ctx, {
        userId: activeUserId,
        provider: "google",
        email: "active@example.com",
        emailVerified: true,
        adminEmails: ["active@example.com"],
      }),
    );

    expect(restarted).toMatchObject({
      customerId: ids.deletedPendingId,
      role: "customer",
      status: "pending",
    });
    expect(active).toMatchObject({
      customerId: ids.activeCustomerId,
      role: "customer",
      status: "active",
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

  it("rejects a missing email and a Google email that does not match the Auth user", async () => {
    const t = testConvex();
    const missingEmailUserId = await seedUser(t, { emailVerificationTime: 1 });
    const otherEmailUserId = await seedUser(t, {
      email: "owner@example.com",
      emailVerificationTime: 1,
    });

    await expect(
      t.run((ctx) =>
        ensureGoogleApplicationAccount(ctx, {
          userId: missingEmailUserId,
          provider: "google",
          emailVerified: true,
          adminEmails: [],
        }),
      ),
    ).rejects.toThrow("valid authenticated email");
    await expect(
      t.run((ctx) =>
        ensureGoogleApplicationAccount(ctx, {
          userId: otherEmailUserId,
          provider: "google",
          email: "attacker@example.com",
          emailVerified: true,
          adminEmails: [],
        }),
      ),
    ).rejects.toThrow("ownership");
  });

  it("rejects a Google user linked to multiple application customers", async () => {
    const t = testConvex();
    const userId = await seedUser(t, { email: "duplicate@example.com", emailVerificationTime: 1 });
    await t.run(async (ctx) => {
      for (const email of ["duplicate@example.com", "second@example.com"]) {
        await ctx.db.insert("customers", {
          userId,
          email,
          role: "customer",
          status: "pending",
          deletionStatus: "active",
          createdAt: 1,
          updatedAt: 1,
        });
      }
    });

    await expect(
      t.run((ctx) =>
        ensureGoogleApplicationAccount(ctx, {
          userId,
          provider: "google",
          email: "duplicate@example.com",
          emailVerified: true,
          adminEmails: [],
        }),
      ),
    ).rejects.toThrow("multiple customer accounts");
  });
});
