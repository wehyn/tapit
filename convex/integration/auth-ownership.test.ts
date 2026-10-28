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

async function draftRevision(t: ReturnType<typeof convexTest>, profileId: Id<"profiles">) {
  return await t.run(async (ctx) => (await ctx.db.get(profileId))?.draftRevision ?? 0);
}

async function createPendingOnboardingUser(t: ReturnType<typeof convexTest>, email: string) {
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email, emailVerificationTime: 1 }),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("customers", {
      userId,
      email,
      role: "customer",
      status: "pending",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
  });
  return { userId, user: t.withIdentity(identity(userId)) };
}

describe("Convex authentication and ownership", () => {
  it("grants and revokes owner access without changing card claims", async () => {
    const t = testConvex();
    const data = await seed(t);
    const admin = t.withIdentity(identity(data.adminUserId));
    const owner = t.withIdentity(identity(data.ownerUserId));
    await expect(owner.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      hasCardOwnerFeatures: false,
    });
    await admin.mutation(api.customers.setCardOwnerAccessOverride, {
      customerId: data.ownerCustomerId,
      enabled: true,
    });
    await expect(owner.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      hasCardOwnerFeatures: true,
    });
    await admin.mutation(api.customers.setCardOwnerAccessOverride, {
      customerId: data.ownerCustomerId,
      enabled: true,
    });
    await admin.mutation(api.customers.setCardOwnerAccessOverride, {
      customerId: data.ownerCustomerId,
      enabled: false,
    });
    await expect(owner.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      hasCardOwnerFeatures: false,
    });
    const logs = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_accountId", (q) => q.eq("accountId", data.ownerCustomerId))
        .collect(),
    );
    expect(
      logs.filter((log) => log.action === "customer.card_owner_access_override_changed"),
    ).toHaveLength(2);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: data.adminUserId,
          actorLabel: "admin@example.com",
          accountId: data.ownerCustomerId,
          profileId: data.ownerProfileId,
          occurredAt: expect.any(Number),
          before: "false",
          after: "true",
        }),
        expect.objectContaining({
          actorUserId: data.adminUserId,
          actorLabel: "admin@example.com",
          accountId: data.ownerCustomerId,
          profileId: data.ownerProfileId,
          occurredAt: expect.any(Number),
          before: "true",
          after: "false",
        }),
      ]),
    );
    expect(await t.run((ctx) => ctx.db.query("cards").collect())).toHaveLength(0);
  });

  it("preserves owner access from a claimed card after override revocation", async () => {
    const t = testConvex();
    const data = await seed(t);
    const admin = t.withIdentity(identity(data.adminUserId));
    const owner = t.withIdentity(identity(data.ownerUserId));
    const claimedCardId = await t.run((ctx) =>
      ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/claimed-owner-card",
        token: "claimed-owner-card",
        profileId: data.ownerProfileId,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
        assignedAt: 1,
        claimCodeClaimedAt: 1,
      }),
    );
    const before = await t.run((ctx) => ctx.db.get(claimedCardId));
    await admin.mutation(api.customers.setCardOwnerAccessOverride, {
      customerId: data.ownerCustomerId,
      enabled: true,
    });
    await admin.mutation(api.customers.setCardOwnerAccessOverride, {
      customerId: data.ownerCustomerId,
      enabled: false,
    });
    await expect(owner.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      hasCardOwnerFeatures: true,
    });
    expect(await t.run((ctx) => ctx.db.get(claimedCardId))).toEqual(before);
  });

  it("rejects invalid override targets and allows revocation after profile mismatch", async () => {
    const t = testConvex();
    const data = await seed(t);
    const admin = t.withIdentity(identity(data.adminUserId));
    const owner = t.withIdentity(identity(data.ownerUserId));
    await expect(
      owner.mutation(api.customers.setCardOwnerAccessOverride, {
        customerId: data.ownerCustomerId,
        enabled: true,
      }),
    ).rejects.toThrow("Administrator permission required.");

    const set = (customerId: Id<"customers">, enabled = true) =>
      admin.mutation(api.customers.setCardOwnerAccessOverride, { customerId, enabled });
    await expect(set(data.adminCustomerId)).rejects.toThrow("Customer account unavailable.");
    await t.run((ctx) => ctx.db.patch(data.ownerCustomerId, { scope: "demo" }));
    await expect(set(data.ownerCustomerId)).rejects.toThrow("Customer account unavailable.");
    await t.run((ctx) =>
      ctx.db.patch(data.ownerCustomerId, { scope: undefined, status: "pending" }),
    );
    await expect(set(data.ownerCustomerId)).rejects.toThrow("Customer account unavailable.");
    await t.run((ctx) => ctx.db.patch(data.ownerCustomerId, { status: "invited" }));
    await expect(set(data.ownerCustomerId)).rejects.toThrow("Customer account unavailable.");
    await t.run((ctx) => ctx.db.patch(data.ownerCustomerId, { status: "deleted" }));
    await expect(set(data.ownerCustomerId)).rejects.toThrow("Customer account unavailable.");
    await t.run((ctx) =>
      ctx.db.patch(data.ownerCustomerId, { status: "active", deletionStatus: "requested" }),
    );
    await expect(set(data.ownerCustomerId)).rejects.toThrow("Customer account unavailable.");
    await t.run((ctx) =>
      ctx.db.patch(data.ownerCustomerId, { deletionStatus: "active", role: "admin" }),
    );
    await expect(set(data.ownerCustomerId)).rejects.toThrow("Customer account unavailable.");
    await t.run((ctx) =>
      ctx.db.patch(data.ownerCustomerId, { role: "customer", profileId: undefined }),
    );
    await expect(set(data.ownerCustomerId)).rejects.toThrow("Customer profile not found.");
    await t.run((ctx) => ctx.db.patch(data.ownerCustomerId, { profileId: data.ownerProfileId }));
    await t.run((ctx) => ctx.db.patch(data.ownerProfileId, { scope: "demo" }));
    await expect(set(data.ownerCustomerId)).rejects.toThrow("Customer profile not found.");
    await t.run((ctx) => ctx.db.patch(data.ownerProfileId, { scope: undefined }));
    await t.run((ctx) => ctx.db.patch(data.ownerProfileId, { ownerId: data.otherCustomerId }));
    await expect(set(data.ownerCustomerId)).rejects.toThrow("Customer profile not found.");
    await t.run((ctx) => ctx.db.patch(data.ownerCustomerId, { cardOwnerAccessOverride: true }));
    await expect(set(data.ownerCustomerId, false)).resolves.toBeNull();
    await expect(set(data.ownerCustomerId, false)).resolves.toBeNull();

    await t.run(async (ctx) => {
      await ctx.db.patch(data.ownerCustomerId, {
        cardOwnerAccessOverride: true,
        profileId: undefined,
      });
    });
    await expect(set(data.ownerCustomerId, false)).resolves.toBeNull();
    await t.run(async (ctx) => {
      const target = await ctx.db.get(data.ownerCustomerId);
      expect(target?.cardOwnerAccessOverride).toBeUndefined();
      expect(target?.profileId).toBeUndefined();
      const overrideLogs = await ctx.db
        .query("auditLogs")
        .withIndex("by_accountId", (q) => q.eq("accountId", data.ownerCustomerId))
        .filter((q) => q.eq(q.field("action"), "customer.card_owner_access_override_changed"))
        .collect();
      expect(overrideLogs).toHaveLength(2);
      expect(overrideLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            before: "true",
            after: "false",
            accountId: data.ownerCustomerId,
          }),
        ]),
      );
    });
  });

  it("persists onboarding bio and website in the private profile draft", async () => {
    const t = testConvex();
    const { user } = await createPendingOnboardingUser(t, "details@example.com");

    const completed = await user.mutation(api.customers.completeSelfServiceOnboarding, {
      name: "Details Person",
      bio: "  A short introduction  ",
      website: "  https://details.example.com  ",
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.get(completed.profileId)).toMatchObject({
        status: "draft",
        draft: {
          name: "Details Person",
          bio: "A short introduction",
          website: "https://details.example.com",
          links: [],
        },
      });
    });
  });

  it.each([
    "http://insecure.example.com",
    "javascript:alert(1)",
    "https://user:password@example.com",
  ])("rejects unsafe onboarding website %s", async (website) => {
    const t = testConvex();
    const { userId, user } = await createPendingOnboardingUser(t, "unsafe@example.com");

    await expect(
      user.mutation(api.customers.completeSelfServiceOnboarding, {
        name: "Unsafe Website",
        website,
      }),
    ).rejects.toThrow("valid HTTPS URL without credentials");

    await t.run(async (ctx) => {
      const customer = await ctx.db
        .query("customers")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      expect(customer).toMatchObject({ status: "pending" });
      expect(customer?.profileId).toBeUndefined();
    });
  });

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
      t.withIdentity(identity(userId)).action(api.customers.acceptInvitation, {
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
    ).resolves.toMatchObject({ state: "valid", expiresAt: null });
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
    const first = await user.action(api.customers.acceptInvitation, {
      tokenHash: "claim-replay",
    });
    const acceptedAt = await t.run(async (ctx) => (await ctx.db.get(invitationId))?.acceptedAt);
    for (let retry = 0; retry < 5; retry += 1) {
      const result = await user.action(api.customers.acceptInvitation, {
        tokenHash: "claim-replay",
      });
      expect(result).toEqual(first);
    }
    await t.run(async (ctx) => {
      expect((await ctx.db.get(invitationId))?.acceptedAt).toBe(acceptedAt);
      const invitation = await ctx.db.get(invitationId);
      expect(
        await ctx.db
          .query("auditLogs")
          .withIndex("by_accountId", (q) => q.eq("accountId", invitation!.customerId))
          .take(10),
      ).toHaveLength(1);
    });
  });

  it("rate-limits the fourth verified-email mismatch for one identity and invitation", async () => {
    const t = testConvex();
    const data = await seed(t);
    const { userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "wrong-email@example.com",
        emailVerificationTime: 1,
      });
      const customerId = await ctx.db.insert("customers", {
        email: "invited-email@example.com",
        role: "customer",
        status: "invited",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("invitations", {
        customerId,
        email: "invited-email@example.com",
        tokenHash: "mismatch-rate-token",
        createdByUserId: data.adminUserId,
        createdAt: 1,
      });
      return { userId };
    });
    const user = t.withIdentity(identity(userId));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        user.action(api.customers.acceptInvitation, { tokenHash: "mismatch-rate-token" }),
      ).rejects.toThrow("does not match");
    }
    await expect(
      user.action(api.customers.acceptInvitation, { tokenHash: "mismatch-rate-token" }),
    ).rejects.toThrow("Too many invitation attempts.");
  });

  it("rate-limits invalid invitation attempts across distinct token hashes for one identity", async () => {
    const t = testConvex();
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "claimant@example.com", emailVerificationTime: 1 }),
    );
    const user = t.withIdentity(identity(userId));

    for (const tokenHash of ["bogus-1", "bogus-2", "bogus-3"]) {
      await expect(user.action(api.customers.acceptInvitation, { tokenHash })).rejects.toThrow(
        "invalid or expired",
      );
    }
    await expect(
      user.action(api.customers.acceptInvitation, { tokenHash: "bogus-4" }),
    ).rejects.toThrow("Too many invitation attempts.");
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
        .action(api.customers.acceptInvitation, { tokenHash: "owner-token" }),
    ).rejects.toThrow("does not match");
    await t.withIdentity(identity(data.adminUserId)).mutation(api.invitations.revoke, {
      invitationId: data.invitationId,
    });
    const owner = t.withIdentity(identity(data.ownerUserId));
    await expect(
      owner.action(api.customers.acceptInvitation, { tokenHash: "owner-token" }),
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
        .action(api.customers.acceptInvitation, { tokenHash: "expired-token" }),
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
        .action(api.customers.acceptInvitation, { tokenHash: "already-linked-token" }),
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

  it("allows onboarding retries after completion without consuming the attempt limit or adding audits", async () => {
    const t = testConvex();
    const { userId, user } = await createPendingOnboardingUser(t, "onboarding-retry@example.com");
    const completed = await user.mutation(api.customers.completeSelfServiceOnboarding, {
      name: "Retry Person",
    });
    for (let retry = 0; retry < 5; retry += 1) {
      await expect(
        user.mutation(api.customers.completeSelfServiceOnboarding, { name: "Ignored Retry" }),
      ).resolves.toEqual(completed);
    }
    await t.run(async (ctx) => {
      const audits = await ctx.db
        .query("auditLogs")
        .withIndex("by_accountId", (q) => q.eq("accountId", completed.customerId))
        .take(10);
      expect(
        audits.filter((entry) => entry.action === "customer.onboarding_completed"),
      ).toHaveLength(1);
      expect(await ctx.db.get(userId)).not.toBeNull();
    });
  });

  it("does not let promoteUser attach an Auth user to a second customer", async () => {
    const t = testConvex();
    const data = await seed(t);
    await expect(
      t.mutation(internal.bootstrap.promoteUser, {
        userId: data.ownerUserId,
        email: "new-address@example.com",
      }),
    ).rejects.toThrow("already linked to another customer");
  });

  it("uses shared slug rules when bootstrapping", async () => {
    const t = testConvex();
    const data = await seed(t);
    await expect(
      t.mutation(internal.bootstrap.bootstrap, {
        adminUserId: data.adminUserId,
        customerUserId: data.ownerUserId,
        adminEmail: "admin@example.com",
        customerEmail: "owner@example.com",
        customerSlug: "admin",
        publishedBio: "Owner bootstrap bio",
        cardUrl: "https://tapit.test/c/bootstrap-reserved-token",
        cardToken: "bootstrap-reserved-token",
      }),
    ).rejects.toThrow("reserved");
  });

  it("keeps invitation status reusable after acceptance and reports explicit states", async () => {
    const t = testConvex();
    const data = await seed(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(data.invitationId, { acceptedAt: 10 });
    });

    await expect(t.query(api.invitations.status, { tokenHash: "owner-token" })).resolves.toEqual({
      state: "valid",
      expiresAt: null,
    });
  });

  it("returns invitation expiry metadata without a database write", async () => {
    const t = testConvex();
    const data = await seed(t);
    await t.run(async (ctx) => ctx.db.patch(data.invitationId, { expiresAt: 100 }));

    await expect(t.query(api.invitations.status, { tokenHash: "owner-token" })).resolves.toEqual({
      state: "valid",
      expiresAt: 100,
    });
  });

  it("does not let a client clock make an expired invitation appear valid", async () => {
    const t = testConvex();
    const data = await seed(t);
    await t.run(async (ctx) => ctx.db.patch(data.invitationId, { expiresAt: 100 }));

    await expect(
      t.query(api.invitations.status, { tokenHash: "owner-token", now: 99 } as never),
    ).rejects.toThrow();
  });

  it("keeps invitation email and profile name private for valid, expired, and revoked links", async () => {
    const t = testConvex();
    const data = await seed(t);
    await t.run(async (ctx) => ctx.db.patch(data.invitationId, { expiresAt: 100 }));

    const valid = await t.query(api.invitations.status, { tokenHash: "owner-token" });
    const expired = await t.query(api.invitations.status, { tokenHash: "owner-token" });
    await t.run(async (ctx) => ctx.db.patch(data.invitationId, { invalidatedAt: 50 }));
    const revoked = await t.query(api.invitations.status, { tokenHash: "owner-token" });

    expect([valid, expired, revoked]).toEqual([
      { state: "valid", expiresAt: 100 },
      { state: "valid", expiresAt: 100 },
      { state: "revoked", expiresAt: 100 },
    ]);
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
        expectedDraftRevision: await draftRevision(t, data.ownerProfileId),
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
      const third = await user.mutation(api.customers.createSelfServiceAccount, {
        name: "Changed Name",
        slug: "changed-name",
      });
      const fourth = await user.mutation(api.customers.createSelfServiceAccount, {
        name: "Changed Name",
        slug: "changed-name",
      });
      expect([second, third, fourth]).toEqual([first, first, first]);
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
      expectedDraftRevision: await draftRevision(t, data.ownerProfileId),
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
        claimCodeClaimedAt: 1,
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
      expectedDraftRevision: await draftRevision(t, data.ownerProfileId),
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
        expectedDraftRevision: await draftRevision(t, data.ownerProfileId),
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
