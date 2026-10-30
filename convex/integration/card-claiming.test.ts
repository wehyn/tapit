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

describe("card claiming contracts", () => {
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
    await expect(unrelated.query(api.cards.resolve, { token: "card-1" })).resolves.toEqual({
      status: "unavailable",
    });
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
