import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";

import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");
const identity = (userId: string) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});

async function reassignmentFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
    const oldUserId = await ctx.db.insert("users", { email: "old@example.com" });
    const destinationUserId = await ctx.db.insert("users", { email: "destination@example.com" });
    const otherUserId = await ctx.db.insert("users", { email: "other@example.com" });
    await ctx.db.insert("customers", {
      userId: adminUserId,
      email: "admin@example.com",
      role: "admin",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const oldOwnerId = await ctx.db.insert("customers", {
      userId: oldUserId,
      email: "old@example.com",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const destinationOwnerId = await ctx.db.insert("customers", {
      userId: destinationUserId,
      email: "destination@example.com",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("customers", {
      userId: otherUserId,
      email: "other@example.com",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const published = (name: string, slug: string) => ({
      name,
      slug,
      links: [{ id: "site", label: "Site", destination: "https://example.com", enabled: true }],
    });
    const oldProfileId = await ctx.db.insert("profiles", {
      ownerId: oldOwnerId,
      slug: "old",
      status: "published",
      draft: published("Old", "old"),
      published: { ...published("Old", "old"), publishedAt: 1 },
      createdAt: 1,
      updatedAt: 1,
      publishedAt: 1,
    });
    const destinationProfileId = await ctx.db.insert("profiles", {
      ownerId: destinationOwnerId,
      slug: "destination",
      status: "published",
      draft: published("Destination", "destination"),
      published: { ...published("Destination", "destination"), publishedAt: 1 },
      createdAt: 1,
      updatedAt: 1,
      publishedAt: 1,
    });
    await ctx.db.patch(oldOwnerId, { profileId: oldProfileId });
    await ctx.db.patch(destinationOwnerId, { profileId: destinationProfileId });
    const cardId = await ctx.db.insert("cards", {
      cardUrl: "https://tapit.test/c/reassign-card",
      token: "reassign-card",
      profileId: oldProfileId,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
      assignedAt: 1,
    });
    const extraCardId = await ctx.db.insert("cards", {
      cardUrl: "https://tapit.test/c/destination-card",
      token: "destination-card",
      profileId: destinationProfileId,
      status: "claimable",
      createdAt: 1,
      updatedAt: 1,
    });
    return {
      adminUserId,
      oldUserId,
      destinationUserId,
      otherUserId,
      oldOwnerId,
      destinationOwnerId,
      oldProfileId,
      destinationProfileId,
      cardId,
      extraCardId,
    };
  });
}

describe("card claiming contracts", () => {
  it("allows active admins and Demo customers to claim only their own assigned cards", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const ids = await t.run(async (ctx) => {
      const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
      const ownerUserId = await ctx.db.insert("users", { email: "owner@example.com" });
      const demoAdminUserId = await ctx.db.insert("users", { email: "demo-admin@example.com" });
      const demoUserId = await ctx.db.insert("users", { email: "demo@example.com" });
      const adminId = await ctx.db.insert("customers", {
        userId: adminUserId,
        email: "admin@example.com",
        role: "admin",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const ownerId = await ctx.db.insert("customers", {
        userId: ownerUserId,
        email: "owner@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("customers", {
        userId: demoAdminUserId,
        role: "admin",
        status: "active",
        deletionStatus: "active",
        scope: "demo",
        createdAt: 1,
        updatedAt: 1,
      });
      const demoId = await ctx.db.insert("customers", {
        userId: demoUserId,
        email: "demo@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        isDemo: true,
        scope: "demo",
        createdAt: 1,
        updatedAt: 1,
      });
      const ownProfileId = await ctx.db.insert("profiles", {
        ownerId: adminId,
        slug: "admin-owner",
        status: "draft",
        draft: { name: "Admin", slug: "admin-owner", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      const foreignProfileId = await ctx.db.insert("profiles", {
        ownerId,
        slug: "customer-owner",
        status: "draft",
        draft: { name: "Owner", slug: "customer-owner", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      const demoProfileId = await ctx.db.insert("profiles", {
        ownerId: demoId,
        scope: "demo",
        slug: "demo-owner",
        status: "draft",
        draft: { name: "Demo", slug: "demo-owner", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(adminId, { profileId: ownProfileId });
      await ctx.db.patch(ownerId, { profileId: foreignProfileId });
      await ctx.db.patch(demoId, { profileId: demoProfileId });
      const ownCardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/admin-own",
        token: "admin-own",
        profileId: ownProfileId,
        status: "claimable",
        createdAt: 1,
        updatedAt: 1,
      });
      const foreignCardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/admin-foreign",
        token: "admin-foreign",
        profileId: foreignProfileId,
        status: "claimable",
        createdAt: 1,
        updatedAt: 1,
      });
      const demoCardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/demo-customer",
        token: "demo-customer",
        profileId: demoProfileId,
        scope: "demo",
        status: "claimable",
        createdAt: 1,
        updatedAt: 1,
      });
      return {
        adminUserId,
        adminId,
        demoAdminUserId,
        demoUserId,
        ownProfileId,
        demoProfileId,
        ownCardId,
        foreignCardId,
        demoCardId,
      };
    });
    const admin = t.withIdentity(identity(ids.adminUserId));
    const demoAdmin = t.withIdentity(identity(ids.demoAdminUserId));
    const demoCustomer = t.withIdentity(identity(ids.demoUserId));
    const ownCode = await admin.mutation(api.cards.generateClaimCode, { cardId: ids.ownCardId });
    const ownVerification = await admin.mutation(api.cardClaims.verifyCode, {
      token: "admin-own",
      code: ownCode.code,
    });
    expect(ownVerification.ok).toBe(true);
    if (!ownVerification.ok) throw new Error("Expected the admin's own card code to verify.");
    await expect(
      admin.mutation(api.cardClaims.complete, { challenge: ownVerification.challenge }),
    ).resolves.toEqual({ cardId: ids.ownCardId, profileId: ids.ownProfileId });
    await expect(admin.query(api.cards.resolve, { token: "admin-own" })).resolves.toEqual({
      status: "ownerSetup",
    });
    await t.run((ctx) => ctx.db.patch(ids.adminId, { scope: "demo" }));
    await expect(admin.query(api.cards.resolve, { token: "admin-own" })).resolves.toEqual({
      status: "unavailable",
    });
    await t.run((ctx) => ctx.db.patch(ids.adminId, { scope: undefined }));
    await t.run((ctx) =>
      ctx.db.patch(ids.adminId, { status: "deleted", deletionStatus: "deleted" }),
    );
    await expect(admin.query(api.cards.resolve, { token: "admin-own" })).resolves.toEqual({
      status: "unavailable",
    });
    await t.run((ctx) => ctx.db.patch(ids.adminId, { status: "active", deletionStatus: "active" }));

    const foreignCode = await admin.mutation(api.cards.generateClaimCode, {
      cardId: ids.foreignCardId,
    });
    const foreignVerification = await admin.mutation(api.cardClaims.verifyCode, {
      token: "admin-foreign",
      code: foreignCode.code,
    });
    expect(foreignVerification.ok).toBe(true);
    if (!foreignVerification.ok)
      throw new Error("Expected the admin's foreign card code to verify.");
    await expect(
      admin.mutation(api.cardClaims.complete, { challenge: foreignVerification.challenge }),
    ).rejects.toThrow();

    const demoCode = await demoAdmin.mutation(api.cards.generateClaimCode, {
      cardId: ids.demoCardId,
    });
    const demoVerification = await demoCustomer.mutation(api.cardClaims.verifyCode, {
      token: "demo-customer",
      code: demoCode.code,
    });
    expect(demoVerification.ok).toBe(true);
    if (!demoVerification.ok) throw new Error("Expected the Demo customer's card code to verify.");
    await expect(
      demoCustomer.mutation(api.cardClaims.complete, { challenge: demoVerification.challenge }),
    ).resolves.toEqual({ cardId: ids.demoCardId, profileId: ids.demoProfileId });
  });

  it("reassigns a claimed active card in place and requires a fresh destination claim", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const ids = await reassignmentFixture(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    const oldOwner = t.withIdentity(identity(ids.oldUserId));
    const destination = t.withIdentity(identity(ids.destinationUserId));
    const { code: oldCode } = await admin.mutation(api.cards.generateClaimCode, {
      cardId: ids.cardId,
    });
    const oldVerification = await oldOwner.mutation(api.cardClaims.verifyCode, {
      token: "reassign-card",
      code: oldCode,
    });
    if (!oldVerification.ok) throw new Error("Expected the original claim code to verify.");
    await oldOwner.mutation(api.cardClaims.complete, { challenge: oldVerification.challenge });
    await expect(oldOwner.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      hasCardOwnerFeatures: true,
    });

    await admin.mutation(api.cards.reassign, {
      cardId: ids.cardId,
      expectedProfileId: ids.oldProfileId,
      expectedStatus: "active",
      profileId: ids.destinationProfileId,
    });
    await expect(oldOwner.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      hasCardOwnerFeatures: false,
    });
    await expect(destination.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      hasCardOwnerFeatures: false,
    });
    const card = await t.run((ctx) => ctx.db.get(ids.cardId));
    expect(card).toMatchObject({
      _id: ids.cardId,
      token: "reassign-card",
      cardUrl: "https://tapit.test/c/reassign-card",
      profileId: ids.destinationProfileId,
      status: "active",
      claimCodeInvalidatedAt: expect.any(Number),
    });
    expect(card).not.toHaveProperty("claimCodeHash");
    expect(card).not.toHaveProperty("claimCodeGeneratedAt");
    expect(card).not.toHaveProperty("claimCodeExpiresAt");
    expect(card).not.toHaveProperty("claimCodeClaimedAt");
    await expect(t.run((ctx) => ctx.db.get(ids.extraCardId))).resolves.toMatchObject({
      status: "claimable",
    });
    const audit = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_cardId", (q) => q.eq("cardId", ids.cardId))
        .collect(),
    );
    const reassigned = audit.find((entry) => entry.action === "card.reassigned");
    expect(reassigned).toMatchObject({
      actorUserId: ids.adminUserId,
      cardId: ids.cardId,
      profileId: ids.destinationProfileId,
      accountId: ids.destinationOwnerId,
      before: expect.stringContaining(ids.oldProfileId),
      after: expect.stringContaining(ids.destinationProfileId),
    });
    expect(reassigned?.before).toContain('"profileName":"Old"');
    expect(reassigned?.after).toContain('"profileName":"Destination"');
    expect(JSON.stringify(reassigned)).not.toMatch(/code|hash/i);
    await expect(
      oldOwner.mutation(api.cardClaims.verifyCode, { token: "reassign-card", code: oldCode }),
    ).resolves.toEqual({ ok: false });
    const { code } = await admin.mutation(api.cards.generateClaimCode, { cardId: ids.cardId });
    const verification = await destination.mutation(api.cardClaims.verifyCode, {
      token: "reassign-card",
      code,
    });
    if (!verification.ok) throw new Error("Expected the destination claim code to verify.");
    await destination.mutation(api.cardClaims.complete, { challenge: verification.challenge });
    await expect(destination.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      hasCardOwnerFeatures: true,
    });
  });

  it("invalidates pending claim challenges when reassigning a claimable card", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const ids = await reassignmentFixture(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    const oldOwner = t.withIdentity(identity(ids.oldUserId));
    const destination = t.withIdentity(identity(ids.destinationUserId));
    await t.run((ctx) => ctx.db.patch(ids.cardId, { status: "claimable" }));
    const { code: oldCode } = await admin.mutation(api.cards.generateClaimCode, {
      cardId: ids.cardId,
    });
    const oldVerification = await oldOwner.mutation(api.cardClaims.verifyCode, {
      token: "reassign-card",
      code: oldCode,
    });
    if (!oldVerification.ok) throw new Error("Expected the original claim code to verify.");
    await admin.mutation(api.cards.reassign, {
      cardId: ids.cardId,
      expectedProfileId: ids.oldProfileId,
      expectedStatus: "claimable",
      profileId: ids.destinationProfileId,
    });
    await expect(
      oldOwner.mutation(api.cardClaims.verifyCode, { token: "reassign-card", code: oldCode }),
    ).resolves.toEqual({ ok: false });
    await expect(
      oldOwner.mutation(api.cardClaims.complete, { challenge: oldVerification.challenge }),
    ).rejects.toThrow();
    const { code } = await admin.mutation(api.cards.generateClaimCode, { cardId: ids.cardId });
    const verification = await destination.mutation(api.cardClaims.verifyCode, {
      token: "reassign-card",
      code,
    });
    if (!verification.ok) throw new Error("Expected the destination claim code to verify.");
    await destination.mutation(api.cardClaims.complete, { challenge: verification.challenge });
    await expect(destination.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      hasCardOwnerFeatures: true,
    });
  });

  it("rejects unauthorized, ineligible, and stale card reassignments without changing state", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const ids = await reassignmentFixture(t);
    const admin = t.withIdentity(identity(ids.adminUserId));
    const other = t.withIdentity(identity(ids.otherUserId));
    const args = {
      cardId: ids.cardId,
      expectedProfileId: ids.oldProfileId,
      expectedStatus: "active" as const,
      profileId: ids.destinationProfileId,
    };
    await expect(other.mutation(api.cards.reassign, args)).rejects.toThrow(
      "Administrator permission required.",
    );
    await expect(
      admin.mutation(api.cards.reassign, { ...args, expectedProfileId: ids.destinationProfileId }),
    ).rejects.toThrow();
    await expect(
      admin.mutation(api.cards.reassign, { ...args, expectedStatus: "claimable" }),
    ).rejects.toThrow();
    await t.run((ctx) => ctx.db.patch(ids.cardId, { status: "inactive" }));
    const before = await t.run((ctx) => ctx.db.get(ids.cardId));
    await expect(admin.mutation(api.cards.reassign, args)).rejects.toThrow();
    await expect(t.run((ctx) => ctx.db.get(ids.cardId))).resolves.toEqual(before);
    await t.run((ctx) => ctx.db.patch(ids.cardId, { status: "replaced" }));
    const replacedBefore = await t.run((ctx) => ctx.db.get(ids.cardId));
    await expect(
      admin.mutation(api.cards.reassign, { ...args, expectedStatus: "active" }),
    ).rejects.toThrow();
    await expect(t.run((ctx) => ctx.db.get(ids.cardId))).resolves.toEqual(replacedBefore);
    const audits = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_cardId", (q) => q.eq("cardId", ids.cardId))
        .collect(),
    );
    expect(audits.some((entry) => entry.action === "card.reassigned")).toBe(false);
  });

  it("generates secure, available card tokens for administrators only", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const ids = await t.run(async (ctx) => {
      const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
      const customerUserId = await ctx.db.insert("users", { email: "customer@example.com" });
      const otherUserId = await ctx.db.insert("users", { email: "other@example.com" });
      const demoAdminUserId = await ctx.db.insert("users", { email: "demo-admin@example.com" });
      await ctx.db.insert("customers", {
        userId: adminUserId,
        email: "admin@example.com",
        role: "admin",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const customerId = await ctx.db.insert("customers", {
        userId: customerUserId,
        email: "customer@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId: customerId,
        slug: "package-owner",
        status: "draft",
        draft: { name: "Package Owner", slug: "package-owner", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(customerId, { profileId });
      const otherCustomerId = await ctx.db.insert("customers", {
        userId: otherUserId,
        email: "other@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const otherProfileId = await ctx.db.insert("profiles", {
        ownerId: otherCustomerId,
        slug: "other",
        status: "draft",
        draft: { name: "Other", slug: "other", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(otherCustomerId, { profileId: otherProfileId });
      await ctx.db.insert("customers", {
        userId: demoAdminUserId,
        role: "admin",
        status: "active",
        deletionStatus: "active",
        scope: "demo",
        createdAt: 1,
        updatedAt: 1,
      });
      return { adminUserId, customerUserId, customerId, profileId, otherUserId, demoAdminUserId };
    });
    const admin = t.withIdentity(identity(ids.adminUserId));
    const customer = t.withIdentity(identity(ids.customerUserId));
    const other = t.withIdentity(identity(ids.otherUserId));
    const demoAdmin = t.withIdentity(identity(ids.demoAdminUserId));

    await expect(customer.mutation(api.cards.generateCardToken, {})).rejects.toThrow(
      "Administrator permission required.",
    );
    const tokens = await Promise.all(
      Array.from({ length: 20 }, () => admin.mutation(api.cards.generateCardToken, {})),
    );
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const token of tokens) expect(token).toMatch(/^card-[a-z0-9]{8}$/);
    const firstToken = tokens[0];
    if (firstToken === undefined) throw new Error("Expected a generated card token.");

    const cardId = await admin.mutation(api.cards.register, {
      cardUrl: `https://tapit-eosin.vercel.app/c/${firstToken}`,
      token: firstToken,
    });
    expect(cardId).toBeDefined();
    const { code } = await admin.mutation(api.cards.generateClaimCode, { cardId });
    expect(await t.run((ctx) => ctx.db.get(cardId))).toMatchObject({
      status: "registered",
      claimCodeHash: expect.any(String),
    });
    expect(await t.run((ctx) => ctx.db.get(cardId))).not.toHaveProperty("claimCodeExpiresAt");
    // Legacy timestamps are advisory only; an old past expiry does not invalidate a package code.
    await t.run(async (ctx) => await ctx.db.patch(cardId, { claimCodeExpiresAt: 1 }));
    const paginatedCards = await admin.query(api.cards.adminListPaginated, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(paginatedCards.page.find((card) => card._id === cardId)).not.toHaveProperty(
      "claimCodeExpiresAt",
    );
    const verification = await customer.mutation(api.cardClaims.verifyCode, {
      token: firstToken,
      code,
    });
    expect(verification.ok).toBe(true);
    if (!verification.ok) throw new Error("Expected the pre-assignment package code to verify.");
    await expect(
      other.mutation(api.cardClaims.complete, { challenge: verification.challenge }),
    ).rejects.toThrow();
    await t.run(async (ctx) => {
      const challenge = await ctx.db
        .query("cardClaimChallenges")
        .withIndex("by_cardId", (q) => q.eq("cardId", cardId))
        .first();
      if (!challenge) throw new Error("Expected persisted challenge");
      await ctx.db.patch(challenge._id, { expiresAt: 1 });
    });
    await expect(
      customer.mutation(api.cardClaims.complete, { challenge: verification.challenge }),
    ).rejects.toThrow();
    const freshVerification = await customer.mutation(api.cardClaims.verifyCode, {
      token: firstToken,
      code,
    });
    expect(freshVerification.ok).toBe(true);
    if (!freshVerification.ok) throw new Error("Expected an unexpired challenge");
    await expect(
      customer.mutation(api.cardClaims.complete, { challenge: freshVerification.challenge }),
    ).resolves.toEqual({ cardId, profileId: ids.profileId });
    await expect(
      customer.mutation(api.cardClaims.complete, { challenge: freshVerification.challenge }),
    ).rejects.toThrow();
    const demoCardId = await demoAdmin.mutation(api.cards.register, {
      cardUrl: "https://tapit-eosin.vercel.app/c/demo-scope",
      token: "demo-scope",
    });
    const demoCode = await demoAdmin.mutation(api.cards.generateClaimCode, { cardId: demoCardId });
    await expect(
      customer.mutation(api.cardClaims.verifyCode, { token: "demo-scope", code: demoCode.code }),
    ).resolves.toEqual({ ok: false });
    await expect(
      admin.mutation(api.cards.register, {
        cardUrl: `https://tapit-eosin.vercel.app/c/${firstToken}`,
        token: firstToken,
      }),
    ).rejects.toThrow("already registered");
  });

  it("commits failed claim-code attempts against the verification limit", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const ids = await t.run(async (ctx) => {
      const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
      const ownerUserId = await ctx.db.insert("users", { email: "owner@example.com" });
      await ctx.db.insert("customers", {
        userId: adminUserId,
        email: "admin@example.com",
        role: "admin",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const ownerId = await ctx.db.insert("customers", {
        userId: ownerUserId,
        email: "owner@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId,
        slug: "owner",
        status: "draft",
        draft: { name: "Owner", slug: "owner", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      const cardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/limited-card",
        token: "limited-card",
        profileId,
        status: "claimable",
        createdAt: 1,
        updatedAt: 1,
      });
      return { adminUserId, ownerUserId, cardId };
    });
    const admin = t.withIdentity(identity(ids.adminUserId));
    const owner = t.withIdentity(identity(ids.ownerUserId));
    const { code } = await admin.mutation(api.cards.generateClaimCode, { cardId: ids.cardId });
    const wrongCode = `${code[0] === "A" ? "B" : "A"}${code.slice(1)}`;
    const rejectedAttempts = [];

    for (let attempt = 0; attempt < 5; attempt += 1) {
      rejectedAttempts.push(
        await owner
          .mutation(api.cardClaims.verifyCode, { token: "limited-card", code: wrongCode })
          .catch(() => null),
      );
    }
    const correctAttempt = await owner
      .mutation(api.cardClaims.verifyCode, { token: "limited-card", code })
      .catch(() => null);

    expect(correctAttempt).toEqual({ ok: false });
    expect(rejectedAttempts).toEqual(Array.from({ length: 5 }, () => ({ ok: false })));
    await expect(
      t.run((ctx) =>
        ctx.db
          .query("cardClaimChallenges")
          .withIndex("by_cardId", (query) => query.eq("cardId", ids.cardId))
          .take(10),
      ),
    ).resolves.toHaveLength(0);
  });

  it("keeps an attached unpublished card private until the owner claims and publishes", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const ids = await t.run(async (ctx) => {
      const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
      const ownerUserId = await ctx.db.insert("users", { email: "owner@example.com" });
      const unrelatedUserId = await ctx.db.insert("users", { email: "other@example.com" });
      const adminId = await ctx.db.insert("customers", {
        userId: adminUserId,
        email: "admin@example.com",
        role: "admin",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const ownerId = await ctx.db.insert("customers", {
        userId: ownerUserId,
        email: "owner@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("customers", {
        userId: unrelatedUserId,
        email: "other@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId,
        slug: "owner",
        status: "draft",
        draft: {
          name: "Owner",
          slug: "owner",
          links: [{ id: "site", label: "Site", destination: "https://example.com", enabled: true }],
        },
        createdAt: 1,
        updatedAt: 1,
      });
      const adminProfileId = await ctx.db.insert("profiles", {
        ownerId: adminId,
        slug: "admin",
        status: "draft",
        draft: { name: "Admin", slug: "admin", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(adminId, { profileId: adminProfileId });
      await ctx.db.patch(ownerId, { profileId });
      const cardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/card-1",
        token: "card-1",
        status: "registered",
        createdAt: 1,
        updatedAt: 1,
      });
      return {
        adminUserId,
        ownerUserId,
        unrelatedUserId,
        adminId,
        ownerId,
        profileId,
        cardId,
      };
    });
    const admin = t.withIdentity(identity(ids.adminUserId));
    const owner = t.withIdentity(identity(ids.ownerUserId));
    const unrelated = t.withIdentity(identity(ids.unrelatedUserId));
    await expect(
      owner.mutation(api.cards.attach, { cardId: ids.cardId, profileId: ids.profileId }),
    ).rejects.toThrow();
    const attached = await admin.mutation(api.cards.attach, {
      cardId: ids.cardId,
      profileId: ids.profileId,
    });
    expect(attached.status).toBe("claimable");
    const secondDraftCardId = await admin.mutation(api.cards.register, {
      cardUrl: "https://tapit-eosin.vercel.app/c/card-draft-sibling",
      token: "card-draft-sibling",
    });
    await expect(
      admin.mutation(api.cards.attach, { cardId: secondDraftCardId, profileId: ids.profileId }),
    ).resolves.toEqual({ status: "claimable" });
    expect(await t.query(api.cards.resolve, { token: "card-1" })).toEqual({
      status: "claim",
    });
    // The public resolver must not disclose the owner's draft while the card is
    // claimable. Keep this assertion explicit because the resolver is callable
    // without authentication.
    const unpublishedResolution = await t.query(api.cards.resolve, { token: "card-1" });
    expect(unpublishedResolution).toEqual({ status: "claim" });
    expect(JSON.stringify(unpublishedResolution)).not.toContain("Owner");
    const { code: firstCode } = await admin.mutation(api.cards.generateClaimCode, {
      cardId: ids.cardId,
    });
    const storedCard = await t.run(async (ctx) => await ctx.db.get(ids.cardId));
    expect(storedCard?.claimCodeHash).toBeTypeOf("string");
    expect(storedCard).not.toHaveProperty("claimCode", firstCode);
    expect(await admin.query(api.cards.adminList, {})).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ claimCodeHash: expect.anything() })]),
    );
    await expect(
      t.mutation(api.cardClaims.verifyCode, { token: "card-1", code: firstCode }),
    ).rejects.toThrow("Authentication required.");
    const firstVerification = await owner.mutation(api.cardClaims.verifyCode, {
      token: "card-1",
      code: firstCode,
    });
    expect(firstVerification.ok).toBe(true);
    if (!firstVerification.ok) throw new Error("Expected the claim code to verify.");
    const staleChallenge = firstVerification.challenge;
    await admin.mutation(api.cards.invalidateClaimCode, { cardId: ids.cardId });
    await expect(t.run(async (ctx) => await ctx.db.get(ids.cardId))).resolves.toMatchObject({
      claimCodeHash: expect.any(String),
      claimCodeInvalidatedAt: expect.any(Number),
    });
    await expect(
      owner.mutation(api.cardClaims.verifyCode, { token: "card-1", code: firstCode }),
    ).resolves.toEqual({ ok: false });
    await expect(
      owner.mutation(api.cardClaims.complete, { challenge: staleChallenge }),
    ).rejects.toThrow();
    await expect(t.query(api.cards.resolve, { token: "card-1" })).resolves.toEqual({
      status: "unavailable",
    });
    const { code } = await admin.mutation(api.cards.generateClaimCode, { cardId: ids.cardId });
    const verification = await owner.mutation(api.cardClaims.verifyCode, {
      token: "card-1",
      code,
    });
    expect(verification.ok).toBe(true);
    if (!verification.ok) throw new Error("Expected the claim code to verify.");
    const { challenge } = verification;
    await expect(unrelated.mutation(api.cardClaims.complete, { challenge })).rejects.toThrow();
    await expect(owner.mutation(api.cardClaims.complete, { challenge })).resolves.toEqual({
      cardId: ids.cardId,
      profileId: ids.profileId,
    });
    await expect(t.query(api.cards.resolve, { token: "card-1" })).resolves.toEqual({
      status: "unavailable",
    });
    await expect(owner.query(api.cards.resolve, { token: "card-1" })).resolves.toEqual({
      status: "ownerSetup",
    });
    await expect(admin.query(api.cards.resolve, { token: "card-1" })).resolves.toEqual({
      status: "unavailable",
    });
    await expect(unrelated.query(api.cards.resolve, { token: "card-1" })).resolves.toEqual({
      status: "unavailable",
    });
    await t.run((ctx) => ctx.db.patch(ids.profileId, { scope: "demo" }));
    await expect(owner.query(api.cards.resolve, { token: "card-1" })).resolves.toEqual({
      status: "unavailable",
    });
    await t.run((ctx) => ctx.db.patch(ids.profileId, { scope: undefined }));
    await expect(
      owner.mutation(api.profiles.publish, { profileId: ids.profileId }),
    ).resolves.toMatchObject({ slug: "owner" });
    await expect(owner.mutation(api.cardClaims.complete, { challenge })).rejects.toThrow();
    await expect(
      owner.mutation(api.cardClaims.verifyCode, { token: "card-1", code }),
    ).resolves.toEqual({ ok: false });
    await expect(
      admin.mutation(api.cards.generateClaimCode, { cardId: ids.cardId }),
    ).rejects.toThrow();
    await expect(t.query(api.cards.resolve, { token: "card-1" })).resolves.toMatchObject({
      status: "active",
      profile: { slug: "owner" },
    });

    const publishedProfileId = await t.run(async (ctx) => {
      const profileId = await ctx.db.insert("profiles", {
        ownerId: ids.ownerId,
        slug: "owner-two",
        status: "published",
        draft: {
          name: "Owner Two",
          slug: "owner-two",
          links: [{ id: "site", label: "Site", destination: "https://example.com", enabled: true }],
        },
        published: {
          name: "Owner Two",
          slug: "owner-two",
          links: [{ id: "site", label: "Site", destination: "https://example.com", enabled: true }],
          publishedAt: 1,
        },
        createdAt: 1,
        updatedAt: 1,
        publishedAt: 1,
      });
      return profileId;
    });
    const immediateCardId = await admin.mutation(api.cards.register, {
      cardUrl: "https://tapit-eosin.vercel.app/c/card-2",
      token: "card-2",
    });
    await expect(
      admin.mutation(api.cards.attach, { cardId: immediateCardId, profileId: publishedProfileId }),
    ).resolves.toEqual({ status: "active" });
    const secondPublishedCardId = await admin.mutation(api.cards.register, {
      cardUrl: "https://tapit-eosin.vercel.app/c/card-published-sibling",
      token: "card-published-sibling",
    });
    await expect(
      admin.mutation(api.cards.assign, {
        cardId: secondPublishedCardId,
        profileId: publishedProfileId,
      }),
    ).resolves.toEqual({ status: "active" });
    await expect(
      t.run(async (ctx) =>
        Promise.all([ctx.db.get(immediateCardId), ctx.db.get(secondPublishedCardId)]),
      ),
    ).resolves.toMatchObject([{ status: "active" }, { status: "active" }]);
    await expect(
      t.run(async (ctx) => Promise.all([ctx.db.get(ids.cardId), ctx.db.get(secondDraftCardId)])),
    ).resolves.toMatchObject([{ status: "active" }, { status: "claimable" }]);
    await expect(t.query(api.cards.resolve, { token: "card-2" })).resolves.toEqual({
      status: "claim",
    });
    // A published profile remains gated until the card's fresh claim code is used.

    const cardlessUserId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "cardless@example.com" }),
    );
    const cardlessCustomerId = await t.run((ctx) =>
      ctx.db.insert("customers", {
        userId: cardlessUserId,
        email: "cardless@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const cardlessProfileId = await t.run(async (ctx) => {
      const profileId = await ctx.db.insert("profiles", {
        ownerId: cardlessCustomerId,
        slug: "cardless-published",
        status: "published",
        draft: { name: "Cardless", slug: "cardless-published", links: [] },
        published: {
          name: "Cardless",
          slug: "cardless-published",
          links: [
            {
              id: "site",
              label: "Site",
              destination: "https://example.com",
              enabled: true,
            },
          ],
          publishedAt: 1,
        },
        createdAt: 1,
        updatedAt: 1,
        publishedAt: 1,
      });
      await ctx.db.patch(cardlessCustomerId, { profileId });
      return profileId;
    });
    const cardlessOwner = t.withIdentity(identity(cardlessUserId));
    const claimablePublishedCardId = await admin.mutation(api.cards.register, {
      cardUrl: "https://tapit-eosin.vercel.app/c/cardless-published",
      token: "cardless-published",
    });
    await expect(
      admin.mutation(api.cards.attach, {
        cardId: claimablePublishedCardId,
        profileId: cardlessProfileId,
      }),
    ).resolves.toEqual({ status: "active" });
    const { code: publishedProfileCode } = await admin.mutation(api.cards.generateClaimCode, {
      cardId: claimablePublishedCardId,
    });
    await expect(t.query(api.cards.resolve, { token: "cardless-published" })).resolves.toEqual({
      status: "claim",
    });
    const publishedProfileVerification = await cardlessOwner.mutation(api.cardClaims.verifyCode, {
      token: "cardless-published",
      code: publishedProfileCode,
    });
    expect(publishedProfileVerification.ok).toBe(true);
    if (!publishedProfileVerification.ok) throw new Error("Expected the claim code to verify.");
    await expect(
      cardlessOwner.mutation(api.cardClaims.complete, {
        challenge: publishedProfileVerification.challenge,
      }),
    ).resolves.toMatchObject({ profileId: cardlessProfileId });
    await expect(cardlessOwner.query(api.admin.currentAccess, {})).resolves.toMatchObject({
      hasCardOwnerFeatures: true,
    });
    await expect(
      t.query(api.cards.resolve, { token: "cardless-published" }),
    ).resolves.toMatchObject({
      status: "active",
      profile: { slug: "cardless-published" },
    });

    const invited = await admin.mutation(api.customers.createCustomer, {
      email: "invited@example.com",
      slug: "invited-customer",
      tokenHash: "invited-setup-token",
    });
    const invitedCardId = await admin.mutation(api.cards.register, {
      cardUrl: "https://tapit-eosin.vercel.app/c/card-invited",
      token: "card-invited",
    });
    await expect(
      admin.mutation(api.cards.attach, {
        cardId: invitedCardId,
        profileId: invited.profileId,
      }),
    ).resolves.toEqual({ status: "claimable" });
    await expect(t.query(api.cards.resolve, { token: "card-invited" })).resolves.toEqual({
      status: "claim",
    });
  });

  it("keeps administrator profile restoration behind the claim gate", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const ids = await t.run(async (ctx) => {
      const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
      const ownerUserId = await ctx.db.insert("users", { email: "restore-owner@example.com" });
      const adminId = await ctx.db.insert("customers", {
        userId: adminUserId,
        email: "admin@example.com",
        role: "admin",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const ownerId = await ctx.db.insert("customers", {
        userId: ownerUserId,
        email: "restore-owner@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId,
        slug: "restore-owner",
        status: "unpublished",
        draft: {
          name: "Restore Owner",
          slug: "restore-owner",
          links: [
            {
              id: "site",
              label: "Site",
              destination: "https://example.com",
              enabled: true,
            },
          ],
        },
        published: {
          name: "Restore Owner",
          slug: "restore-owner",
          links: [
            {
              id: "site",
              label: "Site",
              destination: "https://example.com",
              enabled: true,
            },
          ],
          publishedAt: 1,
        },
        createdAt: 1,
        updatedAt: 1,
        publishedAt: 1,
      });
      await ctx.db.patch(ownerId, { profileId });
      return { adminUserId, ownerUserId, profileId, adminId };
    });
    const admin = t.withIdentity(identity(ids.adminUserId));
    const owner = t.withIdentity(identity(ids.ownerUserId));
    const cardId = await admin.mutation(api.cards.register, {
      cardUrl: "https://tapit-eosin.vercel.app/c/restore-card",
      token: "restore-card",
    });
    await admin.mutation(api.cards.attach, { cardId, profileId: ids.profileId });
    await expect(
      admin.mutation(api.profiles.setStatus, { profileId: ids.profileId, status: "published" }),
    ).rejects.toThrow("Claim the attached card before publishing");
    const { code } = await admin.mutation(api.cards.generateClaimCode, { cardId });
    const verification = await owner.mutation(api.cardClaims.verifyCode, {
      token: "restore-card",
      code,
    });
    if (!verification.ok) throw new Error("Expected the claim code to verify.");
    const { challenge } = verification;
    await owner.mutation(api.cardClaims.complete, { challenge });
    await expect(
      admin.mutation(api.profiles.setStatus, { profileId: ids.profileId, status: "published" }),
    ).resolves.toEqual({ status: "published" });
    await expect(t.query(api.cards.resolve, { token: "restore-card" })).resolves.toMatchObject({
      status: "active",
      profile: { slug: "restore-owner" },
    });
  });
});
