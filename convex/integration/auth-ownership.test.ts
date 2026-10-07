import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { ensureGoogleApplicationAccount } from "../authIdentity";
import schema from "../schema";
import { DEFAULT_WARM_STUDIO_CUSTOMIZATION } from "../../src/lib/profile-customization";

const modules = import.meta.glob("../**/*.{ts,js}");

const testConvex = () => {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
};

const identity = (userId: Id<"users">) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});

const draft = (slug: string, name: string) => ({
  name,
  slug,
  bio: `${name} bio`,
  website: "https://example.com",
  links: [
    {
      id: `${slug}-link`,
      label: "Website",
      destination: "https://example.com",
      enabled: true,
    },
  ],
});

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const adminUserId = await ctx.db.insert("users", {
      email: "admin@example.com",
      emailVerificationTime: 1,
    });
    const ownerUserId = await ctx.db.insert("users", {
      email: "owner@example.com",
      emailVerificationTime: 1,
    });
    const otherUserId = await ctx.db.insert("users", {
      email: "other@example.com",
      emailVerificationTime: 1,
    });
    const adminCustomerId = await ctx.db.insert("customers", {
      userId: adminUserId,
      email: "admin@example.com",
      role: "admin",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const ownerCustomerId = await ctx.db.insert("customers", {
      userId: ownerUserId,
      email: "owner@example.com",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherCustomerId = await ctx.db.insert("customers", {
      userId: otherUserId,
      email: "other@example.com",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const ownerProfileId = await ctx.db.insert("profiles", {
      ownerId: ownerCustomerId,
      slug: "owner",
      status: "published",
      draft: draft("owner", "Owner Draft"),
      published: { ...draft("owner", "Owner Published"), publishedAt: 1 },
      createdAt: 1,
      updatedAt: 1,
      publishedAt: 1,
    });
    const otherProfileId = await ctx.db.insert("profiles", {
      ownerId: otherCustomerId,
      slug: "other",
      status: "draft",
      draft: draft("other", "Private Draft"),
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(ownerCustomerId, { profileId: ownerProfileId });
    await ctx.db.patch(otherCustomerId, { profileId: otherProfileId });
    const invitationId = await ctx.db.insert("invitations", {
      customerId: ownerCustomerId,
      email: "owner@example.com",
      tokenHash: "owner-token",
      createdByUserId: adminUserId,
      createdAt: 1,
    });
    return {
      adminUserId,
      ownerUserId,
      otherUserId,
      adminCustomerId,
      ownerCustomerId,
      otherCustomerId,
      ownerProfileId,
      otherProfileId,
      invitationId,
    };
  });
}

describe("Convex authentication and ownership", () => {
  it("requires a server-verified email for live onboarding", async () => {
    const t = testConvex();
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "unverified@example.com" }),
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("customers", {
        userId,
        email: "unverified@example.com",
        role: "customer",
        status: "pending",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await expect(
      t.withIdentity(identity(userId)).mutation(api.customers.completeSelfServiceOnboarding, {
        name: "Unverified",
      }),
    ).rejects.toThrow("verified");
  });

  it("deletes pending accounts without deleting the Auth identity", async () => {
    const t = testConvex();
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "delete-me@example.com", emailVerificationTime: 1 }),
    );
    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", {
        userId,
        email: "delete-me@example.com",
        role: "customer",
        status: "pending",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const user = t.withIdentity(identity(userId));
    await user.mutation(api.customers.deletePendingAccount, {});
    await expect(user.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      authenticated: false,
      accountStatus: "deleted",
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(userId)).not.toBeNull();
      expect(await ctx.db.get(customerId)).toMatchObject({
        status: "deleted",
        deletionStatus: "deleted",
      });
      expect(
        await ctx.db
          .query("auditLogs")
          .withIndex("by_accountId", (q) => q.eq("accountId", customerId))
          .collect(),
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: "account.pending_deleted" })]),
      );
    });
  });

  it("keeps an approved deleted customer deleted when Google signs in again", async () => {
    const t = testConvex();
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const admin = t.withIdentity(identity(data.adminUserId));

    const { requestId } = await owner.mutation(api.customers.requestDeletion, {});
    await expect(owner.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      authenticated: false,
      accountStatus: "deleted",
    });
    await admin.mutation(api.customers.approveDeletion, { requestId });

    await expect(owner.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      authenticated: false,
      accountStatus: "deleted",
    });
    const callbackResult = await t.run((ctx) =>
      ensureGoogleApplicationAccount(ctx, {
        userId: data.ownerUserId,
        provider: "google",
        email: "owner@example.com",
        emailVerified: true,
        adminEmails: [],
      }),
    );

    expect(callbackResult.status).toBe("deleted");
    await expect(owner.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      authenticated: false,
      accountStatus: "deleted",
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(data.ownerCustomerId)).toMatchObject({
        status: "deleted",
        deletionStatus: "deleted",
        profileId: data.ownerProfileId,
      });
      expect(
        await ctx.db
          .query("auditLogs")
          .withIndex("by_accountId", (q) => q.eq("accountId", data.ownerCustomerId))
          .filter((q) => q.eq(q.field("action"), "auth.google_account_restarted"))
          .take(10),
      ).toHaveLength(0);
    });
  });

  it("allocates deterministic onboarding slugs with bounded suffixes", async () => {
    const t = testConvex();
    const users = await t.run(async (ctx) =>
      Promise.all(
        [1, 2, 3].map((index) =>
          ctx.db.insert("users", { email: `slug-${index}@example.com`, emailVerificationTime: 1 }),
        ),
      ),
    );
    await t.run(async (ctx) =>
      Promise.all(
        users.map((userId) =>
          ctx.db.insert("customers", {
            userId,
            email: `slug-${userId}@example.com`,
            role: "customer",
            status: "pending",
            deletionStatus: "active",
            createdAt: 1,
            updatedAt: 1,
          }),
        ),
      ),
    );
    const results = await Promise.all(
      users.map((userId) =>
        t.withIdentity(identity(userId)).mutation(api.customers.completeSelfServiceOnboarding, {
          name: "Same Display Name",
        }),
      ),
    );
    expect(results.map((result) => result.slug).sort()).toEqual([
      "same-display-name",
      "same-display-name-2",
      "same-display-name-3",
    ]);
  });

  it("rejects invitation claims for an administrator target", async () => {
    const t = testConvex();
    const data = await seed(t);
    const adminTarget = await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        email: "admin-target@example.com",
        role: "admin",
        status: "invited",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("invitations", {
        customerId,
        email: "claimant@example.com",
        tokenHash: "admin-target-token",
        createdByUserId: data.adminUserId,
        createdAt: 1,
      });
      return customerId;
    });
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "claimant@example.com", emailVerificationTime: 1 }),
    );
    await expect(
      t.withIdentity(identity(userId)).mutation(api.customers.acceptInvitation, {
        tokenHash: "admin-target-token",
      }),
    ).rejects.toThrow("unavailable");
    const unchanged = await t.run(async (ctx) => ctx.db.get(adminTarget));
    expect(unchanged).toMatchObject({ role: "admin", status: "invited" });
  });

  it("creates reusable no-expiry invitations and replacement revokes the prior link", async () => {
    const t = testConvex();
    const data = await seed(t);
    const admin = t.withIdentity(identity(data.adminUserId));
    const created = await admin.mutation(api.customers.createCustomer, {
      email: "new-invite@example.com",
      tokenHash: "new-invite-hash",
      name: "New Invite",
    });
    await t.run(async (ctx) => {
      const invitation = await ctx.db.get(created.invitationId);
      expect(invitation).toMatchObject({ tokenHash: "new-invite-hash" });
      expect(invitation?.expiresAt).toBeUndefined();
    });
    await admin.mutation(api.invitations.revoke, { invitationId: created.invitationId });
    const replacement = await admin.mutation(api.invitations.replace, {
      customerId: created.customerId,
      tokenHash: "replacement-hash",
    });
    await expect(
      t.query(api.invitations.status, { tokenHash: "new-invite-hash" }),
    ).resolves.toMatchObject({ state: "revoked" });
    await expect(
      t.query(api.invitations.status, { tokenHash: "replacement-hash" }),
    ).resolves.toMatchObject({ state: "valid", acceptedAt: null });
    expect(replacement.invitationId).not.toBe(created.invitationId);
  });

  it("revokes an active invitation beyond the former replacement read limit", async () => {
    const t = testConvex();
    const data = await seed(t);
    const admin = t.withIdentity(identity(data.adminUserId));
    const created = await admin.mutation(api.customers.createCustomer, {
      email: "many-links@example.com",
      tokenHash: "initial-many-links-hash",
      name: "Many Links",
    });
    await t.run(async (ctx) => {
      for (let index = 0; index < 201; index += 1) {
        await ctx.db.insert("invitations", {
          customerId: created.customerId,
          email: "many-links@example.com",
          tokenHash: `history-${index}`,
          createdByUserId: data.adminUserId,
          createdAt: index + 1,
          ...(index < 200 ? { invalidatedAt: 1 } : {}),
        });
      }
    });

    await admin.mutation(api.invitations.replace, {
      customerId: created.customerId,
      tokenHash: "after-history-hash",
    });

    await expect(
      t.query(api.invitations.status, { tokenHash: "history-200" }),
    ).resolves.toMatchObject({
      state: "revoked",
    });
  });

  it("paginates sanitized invitation management results without exposing token hashes", async () => {
    const t = testConvex();
    const data = await seed(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < 201; index += 1) {
        await ctx.db.insert("invitations", {
          customerId: data.ownerCustomerId,
          email: "owner@example.com",
          tokenHash: `listed-${index}`,
          createdByUserId: data.adminUserId,
          createdAt: index + 1,
        });
      }
    });

    const admin = t.withIdentity(identity(data.adminUserId));
    const first = await admin.query(api.invitations.listForAdmin, {
      paginationOpts: { numItems: 200, cursor: null },
    });
    const second = await admin.query(api.invitations.listForAdmin, {
      paginationOpts: { numItems: 200, cursor: first.continueCursor },
    });

    expect(first.page).toHaveLength(200);
    expect(first.isDone).toBe(false);
    expect(second.page).toHaveLength(2);
    expect(second.isDone).toBe(true);
    expect(JSON.stringify([...first.page, ...second.page])).not.toContain("tokenHash");
  });

  it("accepts an invitation repeatedly for the same verified identity and records acceptedAt once", async () => {
    const t = testConvex();
    const data = await seed(t);
    const claimantId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "claim@example.com", emailVerificationTime: 1 }),
    );
    const invitationId = await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        email: "claim@example.com",
        role: "customer",
        status: "invited",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      return await ctx.db.insert("invitations", {
        customerId,
        email: "claim@example.com",
        tokenHash: "claim-replay",
        createdByUserId: data.adminUserId,
        createdAt: 1,
      });
    });
    const user = t.withIdentity(identity(claimantId));
    const first = await user.mutation(api.customers.acceptInvitation, {
      tokenHash: "claim-replay",
    });
    const acceptedAt = await t.run(async (ctx) => (await ctx.db.get(invitationId))?.acceptedAt);
    const second = await user.mutation(api.customers.acceptInvitation, {
      tokenHash: "claim-replay",
    });
    expect(second).toEqual(first);
    await t.run(async (ctx) => {
      expect((await ctx.db.get(invitationId))?.acceptedAt).toBe(acceptedAt);
    });
  });

  it("rejects mismatched, revoked, expired, and already-linked invitation claims", async () => {
    const t = testConvex();
    const data = await seed(t);
    const wrongId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "wrong@example.com", emailVerificationTime: 1 }),
    );
    await expect(
      t
        .withIdentity(identity(wrongId))
        .mutation(api.customers.acceptInvitation, { tokenHash: "owner-token" }),
    ).rejects.toThrow("does not match");
    await t.withIdentity(identity(data.adminUserId)).mutation(api.invitations.revoke, {
      invitationId: data.invitationId,
    });
    const owner = t.withIdentity(identity(data.ownerUserId));
    await expect(
      owner.mutation(api.customers.acceptInvitation, { tokenHash: "owner-token" }),
    ).rejects.toThrow("invalid");
    const expiredId = await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        email: "expired@example.com",
        role: "customer",
        status: "invited",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      return await ctx.db.insert("invitations", {
        customerId,
        email: "expired@example.com",
        tokenHash: "expired-token",
        expiresAt: 1,
        createdByUserId: data.adminUserId,
        createdAt: 1,
      });
    });
    const expiredUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "expired@example.com", emailVerificationTime: 1 }),
    );
    await expect(
      t
        .withIdentity(identity(expiredUserId))
        .mutation(api.customers.acceptInvitation, { tokenHash: "expired-token" }),
    ).rejects.toThrow("invalid");
    expect(expiredId).toBeDefined();
    const linkedId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "linked@example.com", emailVerificationTime: 1 }),
    );
    await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        userId: linkedId,
        email: "other-linked@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const targetId = await ctx.db.insert("customers", {
        email: "linked@example.com",
        role: "customer",
        status: "invited",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("invitations", {
        customerId: targetId,
        email: "linked@example.com",
        tokenHash: "already-linked-token",
        createdByUserId: data.adminUserId,
        createdAt: 1,
      });
      expect(customerId).toBeDefined();
    });
    await expect(
      t
        .withIdentity(identity(linkedId))
        .mutation(api.customers.acceptInvitation, { tokenHash: "already-linked-token" }),
    ).rejects.toThrow("already linked");
  });

  it("audits manual role changes and protects the last administrator", async () => {
    const t = testConvex();
    const data = await seed(t);
    const admin = t.withIdentity(identity(data.adminUserId));
    await admin.mutation(api.customers.setRole, {
      customerId: data.ownerCustomerId,
      role: "admin",
    });
    await admin.mutation(api.customers.setRole, {
      customerId: data.ownerCustomerId,
      role: "customer",
    });
    await expect(
      admin.mutation(api.customers.setRole, { customerId: data.adminCustomerId, role: "customer" }),
    ).rejects.toThrow("last active administrator");
    const roleChangeEntries = await admin.query(api.audit.list, {});
    expect(roleChangeEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "customer.role_changed",
          targetAccountEmail: "owner@example.com",
        }),
      ]),
    );
    await t.run(async (ctx) => {
      expect(
        await ctx.db
          .query("auditLogs")
          .withIndex("by_accountId", (q) => q.eq("accountId", data.ownerCustomerId))
          .take(10),
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ action: "customer.role_changed" })]),
      );
    });
  });

  it("rate-limits the fourth invitation claim attempt for one identity and token", async () => {
    const t = testConvex();
    const data = await seed(t);
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "rate@example.com",
        emailVerificationTime: 1,
      });
      const customerId = await ctx.db.insert("customers", {
        email: "rate@example.com",
        role: "customer",
        status: "invited",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("invitations", {
        customerId,
        email: "rate@example.com",
        tokenHash: "rate-token",
        createdByUserId: data.adminUserId,
        createdAt: 1,
      });
      return userId;
    });
    const user = t.withIdentity(identity(userId));
    for (let attempt = 0; attempt < 3; attempt += 1)
      await user.mutation(api.customers.acceptInvitation, { tokenHash: "rate-token" });
    await expect(
      user.mutation(api.customers.acceptInvitation, { tokenHash: "rate-token" }),
    ).rejects.toThrow("Too many");
    expect(data.ownerCustomerId).toBeDefined();
  });

  it("exposes pending access and completes onboarding from the server identity", async () => {
    const t = testConvex();
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        email: "Pending@Example.COM",
        emailVerificationTime: 1,
      }),
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("customers", {
        userId,
        email: "pending@example.com",
        role: "customer",
        status: "pending",
        onboardingName: "Google Name",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const user = t.withIdentity(identity(userId));

    await expect(user.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      authenticated: false,
      accountStatus: "pending",
      email: null,
      role: null,
      profileId: null,
      onboardingName: "Google Name",
    });

    const completed = await user.mutation(api.customers.completeSelfServiceOnboarding, {
      name: "  Pending Person  ",
    });
    expect(completed.slug).toBe("pending-person");
    await expect(user.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      authenticated: true,
      accountStatus: "active",
      email: "pending@example.com",
      role: "customer",
      accountId: completed.customerId,
      profileId: completed.profileId,
    });
  });

  it("keeps invitation status reusable after acceptance and reports explicit states", async () => {
    const t = testConvex();
    const data = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(data.invitationId, { acceptedAt: 10 });
    });

    await expect(t.query(api.invitations.status, { tokenHash: "owner-token" })).resolves.toEqual({
      state: "valid",
      email: "owner@example.com",
      profileName: "Owner Draft",
      acceptedAt: 10,
    });
  });

  it("rejects unauthenticated private reads and writes", async () => {
    const t = testConvex();
    const data = await seed(t);

    await expect(t.query(api.profiles.mine, {})).rejects.toThrow("Authentication required.");
    await expect(t.query(api.profiles.current, {})).rejects.toThrow("Authentication required.");
    await expect(
      t.mutation(api.profiles.saveDraft, {
        profileId: data.ownerProfileId,
        draft: draft("owner", "Nope"),
      }),
    ).rejects.toThrow("Authentication required.");
    await expect(
      t.mutation(api.customers.createSelfServiceAccount, { name: "New User", slug: "new-user" }),
    ).rejects.toThrow("Authentication required.");
  });

  it("provisions an authenticated self-service customer and is idempotent", async () => {
    const previousMode = process.env.TAPIT_DEMO_AUTH_MODE;
    process.env.TAPIT_DEMO_AUTH_MODE = "hosted-demo";
    try {
      const t = testConvex();
      const userId = await t.run(
        async (ctx) =>
          await ctx.db.insert("users", {
            email: " New@Example.COM ",
            emailVerificationTime: 1,
          }),
      );
      const user = t.withIdentity(identity(userId));

      const first = await user.mutation(api.customers.createSelfServiceAccount, {
        name: " Ada Lovelace ",
        slug: " Ada-Lovelace ",
      });
      const second = await user.mutation(api.customers.createSelfServiceAccount, {
        name: "Changed Name",
        slug: "changed-name",
      });
      expect(second).toEqual(first);
      await t.run(async (ctx) => {
        const customer = await ctx.db.get(first.customerId);
        const profile = await ctx.db.get(first.profileId);
        expect(customer).toMatchObject({
          email: "new@example.com",
          userId,
          role: "customer",
          status: "active",
          deletionStatus: "active",
          profileId: first.profileId,
        });
        expect(profile).toMatchObject({
          ownerId: first.customerId,
          slug: "ada-lovelace",
          status: "draft",
          draft: {
            name: "Ada Lovelace",
            slug: "ada-lovelace",
            email: "new@example.com",
            links: [],
          },
        });
        expect(profile?.draft.customization).toBeUndefined();
        expect(profile?.published).toBeUndefined();
      });
    } finally {
      if (previousMode === undefined) delete process.env.TAPIT_DEMO_AUTH_MODE;
      else process.env.TAPIT_DEMO_AUTH_MODE = previousMode;
    }
  });

  it("initializes invited profile drafts from the normalized customer email", async () => {
    const t = testConvex();
    const data = await seed(t);
    const admin = t.withIdentity(identity(data.adminUserId));

    const created = await admin.mutation(api.customers.createCustomer, {
      email: " Invited@Example.COM ",
      slug: "invited-customer",
      tokenHash: "invited-token",
      name: " Invited Customer ",
    });

    await t.run(async (ctx) => {
      const customer = await ctx.db.get(created.customerId);
      const profile = await ctx.db.get(created.profileId);
      expect(customer?.email).toBe("invited@example.com");
      expect(profile?.draft).toMatchObject({
        name: "Invited Customer",
        slug: "invited-customer",
        email: "invited@example.com",
      });
      expect(profile?.draft.customization).toBeUndefined();
    });
  });

  it("allows the owner to read, save, and publish their profile", async () => {
    const t = testConvex();
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));

    expect(await owner.query(api.profiles.mine, {})).toMatchObject({ _id: data.ownerProfileId });
    await owner.mutation(api.profiles.saveDraft, {
      profileId: data.ownerProfileId,
      draft: draft("owner", "Updated Owner"),
    });
    const published = await owner.mutation(api.profiles.publish, {
      profileId: data.ownerProfileId,
    });
    expect(published).toMatchObject({ name: "Updated Owner", slug: "owner" });
    expect(await owner.query(api.profiles.current, {})).toMatchObject({
      profile: { status: "published", published: { name: "Updated Owner" } },
    });
  });

  it("keeps a saved draft theme private until publishing", async () => {
    const t = testConvex();
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", {
        cardUrl: "https://cards.example/c/owner-card",
        token: "owner-card",
        profileId: data.ownerProfileId,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
        assignedAt: 1,
      });
    });

    await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.toMatchObject({
      theme: "paper",
    });
    await expect(t.query(api.cards.resolve, { token: "owner-card" })).resolves.toMatchObject({
      status: "active",
      profile: { theme: "paper" },
    });
    await owner.mutation(api.profiles.saveDraft, {
      profileId: data.ownerProfileId,
      draft: {
        ...draft("owner", "Owner Draft"),
        theme: "night",
        customization: {
          preset: "warm-studio",
          accent: "jade",
          typeScale: "editorial",
          linkTreatment: "outlined",
          contentOrder: "section-first",
        },
      },
    });
    await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.toMatchObject({
      theme: "paper",
    });
    await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.not.toHaveProperty(
      "customization",
    );
    await expect(t.query(api.cards.resolve, { token: "owner-card" })).resolves.toMatchObject({
      status: "active",
      profile: { theme: "paper" },
    });

    await owner.mutation(api.profiles.publish, { profileId: data.ownerProfileId });
    await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.toMatchObject({
      theme: "night",
      customization: { accent: "jade" },
    });
    await expect(t.query(api.cards.resolve, { token: "owner-card" })).resolves.toMatchObject({
      status: "active",
      profile: { theme: "night" },
    });
  });

  it("denies cross-customer access and keeps drafts out of the public projection", async () => {
    const t = testConvex();
    const data = await seed(t);
    const other = t.withIdentity(identity(data.otherUserId));

    await expect(other.query(api.profiles.mine, {})).resolves.toMatchObject({
      _id: data.otherProfileId,
    });
    await expect(
      other.mutation(api.profiles.saveDraft, {
        profileId: data.ownerProfileId,
        draft: draft("owner", "Tampered"),
      }),
    ).rejects.toThrow("Profile access denied.");
    await expect(
      other.mutation(api.profiles.publish, { profileId: data.ownerProfileId }),
    ).rejects.toThrow("Profile access denied.");
    await expect(t.query(api.profiles.publicBySlug, { slug: "other" })).resolves.toBeNull();
    await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.toMatchObject({
      name: "Owner Published",
      slug: "owner",
    });
  });

  it("bootstraps the same accounts and profile idempotently", async () => {
    const t = testConvex();
    const data = await seed(t);
    const args = {
      adminUserId: data.adminUserId,
      customerUserId: data.ownerUserId,
      adminEmail: "admin@example.com",
      customerEmail: "owner@example.com",
      customerSlug: "owner",
      publishedBio: "Owner bootstrap bio",
      cardUrl: "https://tapit.test/c/bootstrap-token",
      cardToken: "bootstrap-token",
    };
    const first = await t.mutation(internal.bootstrap.bootstrap, args);
    const second = await t.mutation(internal.bootstrap.bootstrap, args);
    expect(second).toEqual(first);
    const adminCustomer = await t.run(async (ctx) => await ctx.db.get(first.adminCustomerId));
    expect(adminCustomer?.profileId).toBeDefined();
    const adminProfileId = adminCustomer?.profileId;
    expect(adminProfileId).toBeDefined();
    await t.run(async (ctx) => {
      const profile = await ctx.db.get(adminProfileId!);
      expect(profile).toMatchObject({
        ownerId: first.adminCustomerId,
        status: "draft",
        draft: { email: "admin@example.com", links: [] },
      });
      expect(profile?.published).toBeUndefined();
      await ctx.db.patch(adminProfileId!, {
        draft: { ...profile!.draft, name: "Edited Bootstrap Admin" },
      });
    });
    await t.mutation(internal.bootstrap.bootstrap, args);
    await t.run(async (ctx) => {
      expect(await ctx.db.get(adminProfileId!)).toMatchObject({
        status: "draft",
        draft: { name: "Edited Bootstrap Admin" },
      });
    });
    const counts = await t.run(async (ctx) => ({
      customers: (await ctx.db.query("customers").collect()).length,
      profiles: (await ctx.db.query("profiles").collect()).length,
      cards: (await ctx.db.query("cards").collect()).length,
    }));
    expect(counts).toEqual({ customers: 3, profiles: 3, cards: 1 });
  });

  it("seeds the configured published bio during bootstrap", async () => {
    const t = testConvex();
    const data = await seed(t);
    const result = await t.mutation(internal.bootstrap.bootstrap, {
      adminUserId: data.adminUserId,
      customerUserId: data.ownerUserId,
      adminEmail: "admin@example.com",
      customerEmail: "owner@example.com",
      customerSlug: "owner",
      publishedBio: "Configured live bio",
      cardUrl: "https://tapit.test/c/configured-bio-token",
      cardToken: "configured-bio-token",
    });
    const profile = await t.run(async (ctx) => await ctx.db.get(result.profileId));
    expect(profile).toMatchObject({
      draft: { bio: "Configured live bio" },
      published: { bio: "Configured live bio" },
    });
  });

  it("defaults a new bootstrap profile to Paper in both snapshots", async () => {
    const t = testConvex();
    const ids = await t.run(async (ctx) => ({
      adminUserId: await ctx.db.insert("users", {
        email: "new-admin@example.com",
        emailVerificationTime: 1,
      }),
      customerUserId: await ctx.db.insert("users", {
        email: "new-customer@example.com",
        emailVerificationTime: 1,
      }),
    }));

    const result = await t.mutation(internal.bootstrap.bootstrap, {
      adminUserId: ids.adminUserId,
      customerUserId: ids.customerUserId,
      adminEmail: "new-admin@example.com",
      customerEmail: "new-customer@example.com",
      customerSlug: "new-bootstrap",
      publishedBio: "New bootstrap profile",
      cardUrl: "https://tapit.test/c/new-bootstrap-token",
      cardToken: "new-bootstrap-token",
    });
    const profile = await t.run(async (ctx) => await ctx.db.get(result.profileId));
    expect(profile?.draft.theme).toBe("paper");
    expect(profile?.draft.customization).toBeUndefined();
    expect(profile?.published?.theme).toBe("paper");
    expect(profile?.published?.customization).toBeUndefined();
  });

  it("round-trips an existing theme-only profile without adding customization", async () => {
    const t = testConvex();
    const data = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(data.ownerProfileId, {
        draft: { ...draft("owner", "Legacy Draft"), theme: "moss" },
        published: { ...draft("owner", "Legacy Published"), theme: "moss", publishedAt: 1 },
      });
    });

    const result = await t.mutation(internal.bootstrap.bootstrap, {
      adminUserId: data.adminUserId,
      customerUserId: data.ownerUserId,
      adminEmail: "admin@example.com",
      customerEmail: "owner@example.com",
      customerSlug: "owner",
      publishedBio: "Legacy theme profile",
      cardUrl: "https://tapit.test/c/legacy-theme-token",
      cardToken: "legacy-theme-token",
    });
    const profile = await t.run(async (ctx) => await ctx.db.get(result.profileId));
    expect(profile?.draft).toMatchObject({ theme: "moss" });
    expect(profile?.published).toMatchObject({ theme: "moss" });
    expect(profile?.draft.customization).toBeUndefined();
    expect(profile?.published?.customization).toBeUndefined();
  });

  it("does not promote draft-only customization during bootstrap", async () => {
    const t = testConvex();
    const data = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(data.ownerProfileId, {
        draft: {
          ...draft("owner", "Draft Customization"),
          customization: { ...DEFAULT_WARM_STUDIO_CUSTOMIZATION, accent: "jade" },
        },
        published: { ...draft("owner", "Published Legacy"), publishedAt: 1 },
      });
    });

    await t.mutation(internal.bootstrap.bootstrap, {
      adminUserId: data.adminUserId,
      customerUserId: data.ownerUserId,
      adminEmail: "admin@example.com",
      customerEmail: "owner@example.com",
      customerSlug: "owner",
      publishedBio: "Published legacy bio",
      cardUrl: "https://tapit.test/c/draft-customization-token",
      cardToken: "draft-customization-token",
    });
    const profile = await t.run(async (ctx) => await ctx.db.get(data.ownerProfileId));
    expect(profile?.draft.customization?.accent).toBe("jade");
    expect(profile?.published?.customization).toBeUndefined();
    await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.not.toHaveProperty(
      "customization",
    );
  });

  it("keeps a divergent draft theme private during bootstrap", async () => {
    const t = testConvex();
    const data = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(data.ownerProfileId, {
        draft: { ...draft("owner", "Draft Theme"), theme: "night" },
        published: { ...draft("owner", "Published Theme"), theme: "moss", publishedAt: 1 },
      });
    });

    await t.mutation(internal.bootstrap.bootstrap, {
      adminUserId: data.adminUserId,
      customerUserId: data.ownerUserId,
      adminEmail: "admin@example.com",
      customerEmail: "owner@example.com",
      customerSlug: "owner",
      publishedBio: "Published theme bio",
      cardUrl: "https://tapit.test/c/divergent-theme-token",
      cardToken: "divergent-theme-token",
    });
    const profile = await t.run(async (ctx) => await ctx.db.get(data.ownerProfileId));
    expect(profile?.draft.theme).toBe("night");
    expect(profile?.published?.theme).toBe("moss");
    await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.toMatchObject({
      theme: "moss",
    });
  });

  it("exposes an active admin profile only when it is owned in the same scope", async () => {
    const t = testConvex();
    const data = await seed(t);
    const admin = t.withIdentity(identity(data.adminUserId));
    await expect(admin.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      role: "admin",
      profileId: null,
    });
    const ownProfileId = await t.run(async (ctx) => {
      const profileId = await ctx.db.insert("profiles", {
        ownerId: data.adminCustomerId,
        slug: "admin-own",
        status: "draft",
        draft: draft("admin-own", "Admin"),
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(data.adminCustomerId, { profileId });
      return profileId;
    });
    await expect(admin.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      role: "admin",
      profileId: ownProfileId,
    });
    await expect(admin.mutation(api.customers.requestDeletion, {})).rejects.toThrow(
      "Only an active customer can request deletion.",
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(data.adminCustomerId, { profileId: data.ownerProfileId });
    });
    await expect(admin.query(api.profiles.mine, {})).resolves.toBeNull();
    await expect(admin.query(api.profiles.current, {})).resolves.toBeNull();
    await expect(admin.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      role: "admin",
      profileId: null,
    });
  });

  it("rejects bootstrap when an Auth user is already linked to another customer", async () => {
    const t = testConvex();
    const data = await seed(t);
    await expect(
      t.mutation(internal.bootstrap.bootstrap, {
        adminUserId: data.otherUserId,
        customerUserId: data.ownerUserId,
        adminEmail: "new-admin@example.com",
        customerEmail: "owner@example.com",
        customerSlug: "owner",
        publishedBio: "Owner bootstrap bio",
        cardUrl: "https://tapit.test/c/bootstrap-token",
        cardToken: "bootstrap-token",
      }),
    ).rejects.toThrow("already linked to another customer");
  });
});
