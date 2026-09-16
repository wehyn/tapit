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
      await ctx.db.insert("customers", {
        userId: adminUserId,
        email: "admin@example.com",
        role: "admin",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("customers", {
        userId: customerUserId,
        email: "customer@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      return { adminUserId, customerUserId };
    });
    const admin = t.withIdentity(identity(ids.adminUserId));
    const customer = t.withIdentity(identity(ids.customerUserId));

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
      cardUrl: `https://tapit.test/c/${firstToken}`,
      token: firstToken,
    });
    expect(cardId).toBeDefined();
    await expect(
      admin.mutation(api.cards.register, {
        cardUrl: `https://tapit.test/c/${firstToken}`,
        token: firstToken,
      }),
    ).rejects.toThrow("already registered");
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
    expect(await t.query(api.cards.resolve, { token: "card-1" })).toEqual({
      status: "onboarding",
    });
    await expect(
      owner.mutation(api.profiles.publish, { profileId: ids.profileId }),
    ).rejects.toThrow("Claim the attached card before publishing");
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
    const { challenge: staleChallenge } = await owner.mutation(api.cardClaims.verifyCode, {
      token: "card-1",
      code: firstCode,
    });
    await admin.mutation(api.cards.invalidateClaimCode, { cardId: ids.cardId });
    await expect(t.run(async (ctx) => await ctx.db.get(ids.cardId))).resolves.toMatchObject({
      claimCodeHash: expect.any(String),
      claimCodeInvalidatedAt: expect.any(Number),
    });
    await expect(
      owner.mutation(api.cardClaims.verifyCode, { token: "card-1", code: firstCode }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.cardClaims.complete, { challenge: staleChallenge }),
    ).rejects.toThrow();
    const { code } = await admin.mutation(api.cards.generateClaimCode, { cardId: ids.cardId });
    const { challenge } = await owner.mutation(api.cardClaims.verifyCode, {
      token: "card-1",
      code,
    });
    await expect(unrelated.mutation(api.cardClaims.complete, { challenge })).rejects.toThrow();
    await expect(owner.mutation(api.cardClaims.complete, { challenge })).resolves.toEqual({
      cardId: ids.cardId,
      profileId: ids.profileId,
    });
    await expect(owner.mutation(api.cardClaims.complete, { challenge })).rejects.toThrow();
    await expect(
      admin.mutation(api.cards.generateClaimCode, { cardId: ids.cardId }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.profiles.publish, { profileId: ids.profileId }),
    ).resolves.toMatchObject({
      slug: "owner",
    });
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
      cardUrl: "https://tapit.test/c/card-2",
      token: "card-2",
    });
    await expect(
      admin.mutation(api.cards.attach, { cardId: immediateCardId, profileId: publishedProfileId }),
    ).resolves.toEqual({ status: "claimable" });
    await expect(t.query(api.cards.resolve, { token: "card-2" })).resolves.toEqual({
      status: "onboarding",
    });
    const { code: publishedCode } = await admin.mutation(api.cards.generateClaimCode, {
      cardId: immediateCardId,
    });
    const { challenge: publishedChallenge } = await owner.mutation(api.cardClaims.verifyCode, {
      token: "card-2",
      code: publishedCode,
    });
    await owner.mutation(api.cardClaims.complete, { challenge: publishedChallenge });
    await expect(t.query(api.cards.resolve, { token: "card-2" })).resolves.toMatchObject({
      status: "active",
      profile: { slug: "owner-two" },
    });

    const invited = await admin.mutation(api.customers.createCustomer, {
      email: "invited@example.com",
      slug: "invited-customer",
      tokenHash: "invited-setup-token",
      expiresAt: Date.now() + 60_000,
    });
    const invitedCardId = await admin.mutation(api.cards.register, {
      cardUrl: "https://tapit.test/c/card-invited",
      token: "card-invited",
    });
    await expect(
      admin.mutation(api.cards.attach, {
        cardId: invitedCardId,
        profileId: invited.profileId,
      }),
    ).resolves.toEqual({ status: "claimable" });
    await expect(t.query(api.cards.resolve, { token: "card-invited" })).resolves.toEqual({
      status: "onboarding",
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
      cardUrl: "https://tapit.test/c/restore-card",
      token: "restore-card",
    });
    await admin.mutation(api.cards.attach, { cardId, profileId: ids.profileId });
    await expect(
      admin.mutation(api.profiles.setStatus, { profileId: ids.profileId, status: "published" }),
    ).rejects.toThrow("Claim the attached card before publishing");
    const { code } = await admin.mutation(api.cards.generateClaimCode, { cardId });
    const { challenge } = await owner.mutation(api.cardClaims.verifyCode, {
      token: "restore-card",
      code,
    });
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
