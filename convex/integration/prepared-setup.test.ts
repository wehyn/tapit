/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { describe, expect, it } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");
const identity = (userId: Id<"users">) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});
const hash = (character: string) => character.repeat(64);
const profile = (slug = "prepared-person") => ({
  name: "Prepared Person",
  slug,
  bio: "A prepared profile",
  contactEmail: "contact@example.com",
  phone: "+1 555 0100",
  website: "https://example.com",
  links: [{ label: "Portfolio", url: "https://portfolio.example" }],
});

function testConvex() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
}

async function seedAdmin(t: ReturnType<typeof testConvex>, scope?: "demo") {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "admin@example.com",
      emailVerificationTime: 1,
    });
    const customerId = await ctx.db.insert("customers", {
      ...(scope === undefined ? {} : { scope }),
      userId,
      email: "admin@example.com",
      role: "admin",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    return { userId, customerId };
  });
}

async function createPrepared(
  t: ReturnType<typeof testConvex>,
  adminUserId: Id<"users">,
  slug = "prepared-person",
  tokenHash = hash("a"),
) {
  return await t.withIdentity(identity(adminUserId)).mutation(api.customers.createPrepared, {
    profile: profile(slug),
    tokenHash,
  });
}

async function seedGoogleUser(t: ReturnType<typeof testConvex>, email: string) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email, emailVerificationTime: 1 });
    await ctx.db.insert("authAccounts", {
      userId,
      provider: "google",
      providerAccountId: email,
    });
    return userId;
  });
}

describe("prepared customer setup", () => {
  it("fills filtered pages with matches that occur after the underlying page", async () => {
    const t = testConvex();
    const admin = await seedAdmin(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < 5; index += 1) {
        await ctx.db.insert("customers", {
          email: `legacy-${index}@example.com`,
          role: "customer",
          status: "invited",
          deletionStatus: "active",
          createdAt: index,
          updatedAt: index,
        });
      }
    });
    await createPrepared(t, admin.userId, "prepared-one", hash("a"));
    await createPrepared(t, admin.userId, "prepared-two", hash("b"));
    await createPrepared(t, admin.userId, "prepared-three", hash("c"));

    const first = await t.withIdentity(identity(admin.userId)).query(api.customers.list, {
      setupState: "waiting",
      paginationOpts: { numItems: 2, cursor: null },
    });
    const second = await t.withIdentity(identity(admin.userId)).query(api.customers.list, {
      setupState: "waiting",
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });

    expect(first.page).toHaveLength(2);
    expect(first.page.every((customer) => customer.setupState === "waiting")).toBe(true);
    expect(first.isDone).toBe(false);
    expect(second.page).toHaveLength(1);
    expect(second.page[0]?.profileSlug).toBe("prepared-three");
    expect(second.isDone).toBe(true);
  });

  it("keeps setup states limited to prepared accounts while including all active accounts", async () => {
    const t = testConvex();
    const admin = await seedAdmin(t);
    const prepared = await createPrepared(t, admin.userId);
    await t.withIdentity(identity(admin.userId)).mutation(api.invitations.revoke, {
      invitationId: prepared.invitationId,
    });
    const legacyIds = await t.run(async (ctx) => {
      const ids = [];
      for (const [index, status] of (["invited", "pending", "deleted"] as const).entries()) {
        ids.push(
          await ctx.db.insert("customers", {
            email: `legacy-${index}@example.com`,
            role: "customer",
            status,
            deletionStatus: status === "deleted" ? "deleted" : "active",
            createdAt: index,
            updatedAt: index,
          }),
        );
      }
      const activeUserId = await ctx.db.insert("users", { email: "active@example.com" });
      const activeId = await ctx.db.insert("customers", {
        userId: activeUserId,
        email: "active@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 4,
        updatedAt: 4,
      });
      return { ids, activeId };
    });
    const adminApi = t.withIdentity(identity(admin.userId));
    const legacy = await adminApi.query(api.customers.list, {
      setupState: null,
      paginationOpts: { numItems: 20, cursor: null },
    });
    const drafts = await adminApi.query(api.customers.list, {
      setupState: "draft",
      paginationOpts: { numItems: 20, cursor: null },
    });
    const active = await adminApi.query(api.customers.list, {
      setupState: "active",
      paginationOpts: { numItems: 20, cursor: null },
    });

    expect(legacy.page.map((row) => row._id)).toEqual(expect.arrayContaining(legacyIds.ids));
    expect(legacy.page.every((row) => row.setupState === null)).toBe(true);
    expect(drafts.page.map((row) => row._id)).toEqual([prepared.customerId]);
    expect(active.page.map((row) => row._id)).toContain(legacyIds.activeId);
    expect(active.page.map((row) => row._id)).toContain(admin.customerId);
  });

  it("creates an email-free draft with a hashed token and an audit entry", async () => {
    const t = testConvex();
    const admin = await seedAdmin(t);
    const result = await createPrepared(t, admin.userId);
    const records = await t.run(async (ctx) => ({
      customer: await ctx.db.get(result.customerId),
      invitation: await ctx.db.get(result.invitationId),
      profile: await ctx.db.get((await ctx.db.get(result.customerId))!.profileId!),
      audits: await ctx.db.query("auditLogs").collect(),
    }));
    expect(records.customer?.email).toBeUndefined();
    expect(records.customer?.status).toBe("invited");
    expect(records.invitation).toMatchObject({
      kind: "prepared_setup",
      tokenHash: hash("a"),
      expiresAt: result.expiresAt,
    });
    expect(records.invitation).not.toHaveProperty("token", hash("a"));
    expect(records.profile?.status).toBe("draft");
    expect(records.profile?.draft).toMatchObject({
      name: "Prepared Person",
      email: "contact@example.com",
      links: [{ label: "Portfolio", destination: "https://portfolio.example" }],
    });
    expect(records.audits).toContainEqual(
      expect.objectContaining({
        action: "customer.prepared_created",
        accountId: result.customerId,
      }),
    );
    const listed = await t.withIdentity(identity(admin.userId)).query(api.customers.list, {
      setupState: "waiting",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(listed.page).toContainEqual(
      expect.objectContaining({
        _id: result.customerId,
        setupState: "waiting",
        linkExpiresAt: result.expiresAt,
        profileName: "Prepared Person",
        profileSlug: "prepared-person",
      }),
    );
  });

  it("rejects invalid slug, non-HTTPS URLs, and duplicate slugs", async () => {
    const t = testConvex();
    const admin = await seedAdmin(t);
    const invalidProfiles: Array<[ReturnType<typeof profile>, string]> = [
      [{ ...profile(), slug: "Upper Case" }, "lowercase"],
      [{ ...profile(), website: "http://example.com" }, "HTTPS"],
      [{ ...profile(), links: [{ label: "Bad", url: "mailto:a@example.com" }] }, "HTTPS"],
    ];
    for (const [input, message] of invalidProfiles) {
      await expect(
        t.withIdentity(identity(admin.userId)).mutation(api.customers.createPrepared, {
          profile: input,
          tokenHash: hash("b"),
        }),
      ).rejects.toThrow(message);
    }
    await createPrepared(t, admin.userId);
    await expect(createPrepared(t, admin.userId, "prepared-person", hash("c"))).rejects.toThrow(
      "already in use",
    );
  });

  it("enforces administrator status and same-scope access", async () => {
    const t = testConvex();
    const admin = await seedAdmin(t);
    const prepared = await createPrepared(t, admin.userId);
    const { customerUserId, inactiveAdminUserId, crossScopeId } = await t.run(async (ctx) => {
      const customerUserId = await ctx.db.insert("users", { email: "customer@example.com" });
      await ctx.db.insert("customers", {
        userId: customerUserId,
        email: "customer@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const inactiveAdminUserId = await ctx.db.insert("users", { email: "inactive@example.com" });
      await ctx.db.insert("customers", {
        userId: inactiveAdminUserId,
        email: "inactive@example.com",
        role: "admin",
        status: "deleted",
        deletionStatus: "deleted",
        createdAt: 1,
        updatedAt: 1,
      });
      const crossScopeId = await ctx.db.insert("customers", {
        scope: "demo",
        role: "customer",
        status: "invited",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      return { customerUserId, inactiveAdminUserId, crossScopeId };
    });
    await expect(
      t.mutation(api.customers.createPrepared, {
        profile: profile("no-auth"),
        tokenHash: hash("d"),
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      t.withIdentity(identity(customerUserId)).mutation(api.customers.createPrepared, {
        profile: profile("customer-denied"),
        tokenHash: hash("e"),
      }),
    ).rejects.toThrow("Administrator permission required");
    await expect(
      t.withIdentity(identity(inactiveAdminUserId)).mutation(api.customers.updatePrepared, {
        customerId: prepared.customerId,
        profile: profile(),
      }),
    ).rejects.toThrow("Administrator permission required");
    await expect(
      t.withIdentity(identity(admin.userId)).mutation(api.invitations.generate, {
        customerId: crossScopeId,
        tokenHash: hash("f"),
      }),
    ).rejects.toThrow("Prepared customer unavailable");
  });

  it("returns identical null previews for missing, expired, revoked, regenerated, and used links", async () => {
    const t = testConvex();
    const admin = await seedAdmin(t);
    expect(await t.query(api.invitations.setupPreview, { tokenHash: hash("0") })).toBeNull();
    const first = await createPrepared(t, admin.userId);
    expect(await t.query(api.invitations.setupPreview, { tokenHash: hash("a") })).toMatchObject({
      name: "Prepared Person",
      slug: "prepared-person",
      contactEmail: "contact@example.com",
    });
    expect(await t.query(api.invitations.status, { tokenHash: hash("a") })).toEqual({
      state: "missing",
      expiresAt: null,
    });
    await t.withIdentity(identity(admin.userId)).mutation(api.invitations.revoke, {
      invitationId: first.invitationId,
    });
    expect(await t.query(api.invitations.setupPreview, { tokenHash: hash("a") })).toBeNull();
    expect(await t.query(api.invitations.status, { tokenHash: hash("a") })).toEqual({
      state: "missing",
      expiresAt: null,
    });
    const draftRows = await t.withIdentity(identity(admin.userId)).query(api.customers.list, {
      setupState: "draft",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(draftRows.page.some((row) => row._id === first.customerId)).toBe(true);
    const regenerated = await t
      .withIdentity(identity(admin.userId))
      .mutation(api.invitations.generate, {
        customerId: first.customerId,
        tokenHash: hash("b"),
      });
    expect(await t.query(api.invitations.setupPreview, { tokenHash: hash("a") })).toBeNull();
    expect(await t.query(api.invitations.status, { tokenHash: hash("a") })).toEqual({
      state: "missing",
      expiresAt: null,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(regenerated.invitationId, { expiresAt: Date.now() - 1 });
    });
    expect(await t.query(api.invitations.setupPreview, { tokenHash: hash("b") })).toBeNull();
    expect(await t.query(api.invitations.status, { tokenHash: hash("b") })).toEqual({
      state: "missing",
      expiresAt: null,
    });
    const third = await t.withIdentity(identity(admin.userId)).mutation(api.invitations.generate, {
      customerId: first.customerId,
      tokenHash: hash("c"),
    });
    const claimant = await seedGoogleUser(t, "claimant@example.net");
    const claim = await t.withIdentity(identity(claimant)).mutation(api.invitations.claim, {
      tokenHash: hash("c"),
    });
    expect(claim).toEqual({ ok: true });
    expect(await t.query(api.invitations.setupPreview, { tokenHash: hash("c") })).toBeNull();
    expect(await t.query(api.invitations.status, { tokenHash: hash("c") })).toEqual({
      state: "missing",
      expiresAt: null,
    });
    expect((await t.run((ctx) => ctx.db.get(third.invitationId)))?.usedAt).toBeDefined();

    const legacyCustomerId = await t.run((ctx) =>
      ctx.db.insert("customers", {
        email: "legacy@example.net",
        role: "customer",
        status: "invited",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const legacyInvitation = await t
      .withIdentity(identity(admin.userId))
      .mutation(api.invitations.replace, {
        customerId: legacyCustomerId,
        tokenHash: hash("d"),
      });
    await t.withIdentity(identity(admin.userId)).mutation(api.invitations.revoke, {
      invitationId: legacyInvitation.invitationId,
    });
    expect(await t.query(api.invitations.status, { tokenHash: hash("d") })).toMatchObject({
      state: "revoked",
    });
  });

  it("claims once, preserves prepared content, and rejects replay and a competing user", async () => {
    const t = testConvex();
    const admin = await seedAdmin(t);
    const prepared = await createPrepared(t, admin.userId);
    const firstUser = await seedGoogleUser(t, "first@example.net");
    const secondUser = await seedGoogleUser(t, "second@example.net");
    const results = await Promise.all([
      t.withIdentity(identity(firstUser)).mutation(api.invitations.claim, { tokenHash: hash("a") }),
      t
        .withIdentity(identity(secondUser))
        .mutation(api.invitations.claim, { tokenHash: hash("a") }),
    ]);
    expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
    const successUser = results[0].ok ? firstUser : secondUser;
    expect(
      await t.withIdentity(identity(successUser)).mutation(api.invitations.claim, {
        tokenHash: hash("a"),
      }),
    ).toEqual({ ok: false });
    const record = await t.run(async (ctx) => {
      const customer = await ctx.db.get(prepared.customerId);
      return { customer, profile: await ctx.db.get(customer!.profileId!) };
    });
    expect(record.customer).toMatchObject({
      userId: successUser,
      email: successUser === firstUser ? "first@example.net" : "second@example.net",
      status: "active",
    });
    expect(record.profile?.draft).toMatchObject({
      name: "Prepared Person",
      slug: "prepared-person",
      email: "contact@example.com",
      links: [{ destination: "https://portfolio.example" }],
    });
  });

  it.each([
    ["an invited legacy customer", "invited" as const],
    ["an active customer", "active" as const],
  ])(
    "leaves the prepared invitation untouched when the claim email belongs to %s",
    async (_, status) => {
      const t = testConvex();
      const admin = await seedAdmin(t);
      const prepared = await createPrepared(t, admin.userId);
      const claimant = await seedGoogleUser(t, "collision@example.net");
      await t.run(async (ctx) => {
        const ownerUserId =
          status === "active"
            ? await ctx.db.insert("users", { email: "collision@example.net" })
            : undefined;
        await ctx.db.insert("customers", {
          ...(ownerUserId === undefined ? {} : { userId: ownerUserId }),
          email: "collision@example.net",
          role: "customer",
          status,
          deletionStatus: "active",
          createdAt: 1,
          updatedAt: 1,
        });
      });
      const before = await t.run(async (ctx) => ({
        customers: await ctx.db.query("customers").collect(),
        invitation: await ctx.db.get(prepared.invitationId),
        audits: await ctx.db.query("auditLogs").collect(),
      }));

      expect(
        await t.withIdentity(identity(claimant)).mutation(api.invitations.claim, {
          tokenHash: hash("a"),
        }),
      ).toEqual({ ok: false });

      const after = await t.run(async (ctx) => ({
        customers: await ctx.db.query("customers").collect(),
        invitation: await ctx.db.get(prepared.invitationId),
        audits: await ctx.db.query("auditLogs").collect(),
      }));
      expect(after).toEqual(before);
    },
  );

  it("allows edits before claim, rejects edits after claim, and supports revoke/generate/expiry/delete", async () => {
    const t = testConvex();
    const admin = await seedAdmin(t);
    const prepared = await createPrepared(t, admin.userId);
    await t.withIdentity(identity(admin.userId)).mutation(api.customers.updatePrepared, {
      customerId: prepared.customerId,
      profile: { ...profile(), name: "Edited Name" },
    });
    const edited = await t.run(async (ctx) =>
      ctx.db.get((await ctx.db.get(prepared.customerId))!.profileId!),
    );
    expect(edited?.draft.name).toBe("Edited Name");
    await t.withIdentity(identity(admin.userId)).mutation(api.invitations.revoke, {
      invitationId: prepared.invitationId,
    });
    const regenerated = await t
      .withIdentity(identity(admin.userId))
      .mutation(api.invitations.generate, {
        customerId: prepared.customerId,
        tokenHash: hash("b"),
      });
    const storedRegenerated = await t.run((ctx) => ctx.db.get(regenerated.invitationId));
    expect(regenerated.expiresAt - storedRegenerated!.createdAt).toBe(7 * 24 * 60 * 60 * 1000);
    await t.run(async (ctx) =>
      ctx.db.patch(regenerated.invitationId, { expiresAt: Date.now() - 1 }),
    );
    const afterExpiry = await t
      .withIdentity(identity(admin.userId))
      .mutation(api.invitations.generate, {
        customerId: prepared.customerId,
        tokenHash: hash("c"),
      });
    expect(afterExpiry.expiresAt).toBeGreaterThan(Date.now());
    const claimant = await seedGoogleUser(t, "new@example.net");
    await t
      .withIdentity(identity(claimant))
      .mutation(api.invitations.claim, { tokenHash: hash("c") });
    await expect(
      t.withIdentity(identity(admin.userId)).mutation(api.customers.updatePrepared, {
        customerId: prepared.customerId,
        profile: profile(),
      }),
    ).rejects.toThrow("Prepared customer unavailable");
    await expect(
      t.withIdentity(identity(admin.userId)).mutation(api.customers.deletePreparedDraft, {
        customerId: prepared.customerId,
      }),
    ).rejects.toThrow("Prepared customer unavailable");
    const another = await createPrepared(t, admin.userId, "to-delete", hash("d"));
    await t.withIdentity(identity(admin.userId)).mutation(api.customers.deletePreparedDraft, {
      customerId: another.customerId,
    });
    expect(await t.run((ctx) => ctx.db.get(another.customerId))).toBeNull();
  });

  it("replaces only an auth-created pending shell before the claim", async () => {
    const t = testConvex();
    const admin = await seedAdmin(t);
    const prepared = await createPrepared(t, admin.userId);
    const claimant = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "claimant@example.net",
        emailVerificationTime: 1,
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "claimant@example.net",
      });
      await ctx.db.insert("customers", {
        userId,
        email: "claimant@example.net",
        role: "customer",
        status: "pending",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      return userId;
    });
    expect(
      await t.withIdentity(identity(claimant)).mutation(api.invitations.claim, {
        tokenHash: hash("a"),
      }),
    ).toEqual({ ok: true });
    const linked = await t.run(async (ctx) =>
      ctx.db
        .query("customers")
        .withIndex("by_userId", (q) => q.eq("userId", claimant))
        .unique(),
    );
    expect(linked?._id).toBe(prepared.customerId);
  });

  it("keeps Google self-service onboarding available", async () => {
    const t = testConvex();
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "self-service@example.com",
        emailVerificationTime: 1,
      });
      await ctx.db.insert("customers", {
        userId,
        email: "self-service@example.com",
        role: "customer",
        status: "pending",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      return userId;
    });
    const result = await t
      .withIdentity(identity(userId))
      .mutation(api.customers.completeSelfServiceOnboarding, {
        name: "Self Service",
        website: "https://self.example",
      });
    expect(result.slug).toBeTruthy();
    expect(await t.run((ctx) => ctx.db.get(result.customerId))).toMatchObject({
      email: "self-service@example.com",
      status: "active",
    });
  });
});
