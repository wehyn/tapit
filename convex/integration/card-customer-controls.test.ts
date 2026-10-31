import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { api } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");
const identity = (id: string) => ({
  issuer: "https://tapit.test",
  subject: id,
  tokenIdentifier: `https://tapit.test|${id}`,
});

describe("customer card controls", () => {
  it("paginates only owned assigned cards and returns an allowlist", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "owner@example.com" });
      const otherUserId = await ctx.db.insert("users", { email: "other@example.com" });
      const ownerId = await ctx.db.insert("customers", {
        userId,
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const otherId = await ctx.db.insert("customers", {
        userId: otherUserId,
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId,
        slug: "owner",
        status: "published",
        draft: { name: "Owner", slug: "owner", links: [] },
        published: { name: "Owner", slug: "owner", links: [], publishedAt: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
      const otherProfileId = await ctx.db.insert("profiles", {
        ownerId: otherId,
        slug: "other",
        status: "published",
        draft: { name: "Other", slug: "other", links: [] },
        published: { name: "Other", slug: "other", links: [], publishedAt: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(ownerId, { profileId });
      await ctx.db.patch(otherId, { profileId: otherProfileId });
      const cardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/owned",
        token: "owned",
        profileId,
        status: "active",
        claimCodeHash: "secret-hash",
        claimCodeClaimedAt: 2,
        createdAt: 1,
        updatedAt: 1,
      });
      const unclaimedArchivedCardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/unclaimed",
        token: "unclaimed",
        profileId,
        status: "claimable",
        claimCodeHash: "secret-hash",
        createdAt: 1,
        updatedAt: 1,
        archivedAt: 3,
      });
      await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/other",
        token: "other",
        profileId: otherProfileId,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/inventory",
        token: "inventory",
        status: "registered",
        createdAt: 1,
        updatedAt: 1,
      });
      return { userId, cardId, unclaimedArchivedCardId };
    });
    const owner = t.withIdentity(identity(ids.userId));
    const page = await owner.query(api.cards.myCards, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(page.page).toHaveLength(1);
    expect(page.page[0]).toMatchObject({
      _id: ids.cardId,
      lostCardResolution: "return",
      canDisable: true,
    });
    expect(Object.keys(page.page[0]!).sort()).toEqual(
      [
        "_id",
        "cardUrl",
        "canDisable",
        "canMarkLost",
        "canReactivate",
        "canSetLostResolution",
        "lostCardResolution",
        "status",
      ].sort(),
    );
    expect(JSON.stringify(page)).not.toContain("secret-hash");
    const next = await owner.query(api.cards.myCards, {
      paginationOpts: { numItems: 10, cursor: page.continueCursor },
    });
    expect(next.page).toHaveLength(1);
    expect(next.page[0]).toMatchObject({ status: "claimable", archivedAt: 3 });
    await t.run((ctx) => ctx.db.patch(ids.unclaimedArchivedCardId, { status: "lost" }));
    await owner.mutation(api.cards.ownerSetLostResolution, {
      cardId: ids.unclaimedArchivedCardId,
      lostCardResolution: "inactive",
    });
    expect(await t.run((ctx) => ctx.db.get(ids.unclaimedArchivedCardId))).toMatchObject({
      status: "lost",
      archivedAt: 3,
      lostCardResolution: "inactive",
    });
  });

  it("disables, marks lost, changes its public resolution, and requires a fresh claim to reactivate", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const ids = await t.run(async (ctx) => {
      const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
      const userId = await ctx.db.insert("users", { email: "owner@example.com" });
      await ctx.db.insert("customers", {
        userId: adminUserId,
        role: "admin",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const ownerId = await ctx.db.insert("customers", {
        userId,
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
        status: "published",
        draft: { name: "Owner", slug: "owner", links: [] },
        published: {
          name: "Owner",
          slug: "owner",
          links: [{ id: "site", label: "Site", destination: "https://example.com", enabled: true }],
          publishedAt: 1,
        },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(ownerId, { profileId });
      const cardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/owned",
        token: "owned",
        profileId,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const siblingCardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/sibling",
        token: "sibling",
        profileId,
        status: "active",
        claimCodeClaimedAt: 2,
        createdAt: 1,
        updatedAt: 1,
      });
      return { adminUserId, userId, ownerId, profileId, cardId, siblingCardId };
    });
    const admin = t.withIdentity(identity(ids.adminUserId));
    const owner = t.withIdentity(identity(ids.userId));
    const { code } = await admin.mutation(api.cards.generateClaimCode, { cardId: ids.cardId });
    const initialVerification = await owner.mutation(api.cardClaims.verifyCode, {
      token: "owned",
      code,
    });
    const staleVerification = await owner.mutation(api.cardClaims.verifyCode, {
      token: "owned",
      code,
    });
    if (!initialVerification.ok || !staleVerification.ok)
      throw new Error("Expected valid initial claim challenges.");
    await owner.mutation(api.cardClaims.complete, { challenge: initialVerification.challenge });

    await owner.mutation(api.cards.ownerDisable, { cardId: ids.cardId });
    expect(await t.run((ctx) => ctx.db.get(ids.cardId))).toMatchObject({
      status: "inactive",
      ownerDisabledAt: expect.any(Number),
      claimCodeClaimedAt: expect.any(Number),
    });
    await owner.mutation(api.cards.ownerReactivate, { cardId: ids.cardId });
    expect(await t.run((ctx) => ctx.db.get(ids.cardId))).toMatchObject({
      status: "active",
      claimCodeInvalidatedAt: expect.any(Number),
    });
    expect(await t.run((ctx) => ctx.db.get(ids.cardId))).not.toHaveProperty("claimCodeClaimedAt");
    expect(await t.run((ctx) => ctx.db.get(ids.cardId))).not.toHaveProperty("ownerDisabledAt");
    await expect(
      owner.mutation(api.cardClaims.complete, { challenge: staleVerification.challenge }),
    ).rejects.toThrow("invalid or unavailable");
    await expect(
      owner.mutation(api.cards.ownerMarkLost, {
        cardId: ids.cardId,
        lostCardResolution: "inactive",
      }),
    ).rejects.toThrow();
    const freshCode = await admin.mutation(api.cards.generateClaimCode, { cardId: ids.cardId });
    const freshVerification = await owner.mutation(api.cardClaims.verifyCode, {
      token: "owned",
      code: freshCode.code,
    });
    if (!freshVerification.ok) throw new Error("Expected the fresh administrator code to verify.");
    await expect(
      owner.mutation(api.cardClaims.complete, { challenge: staleVerification.challenge }),
    ).rejects.toThrow("invalid or unavailable");
    await owner.mutation(api.cardClaims.complete, { challenge: freshVerification.challenge });
    await owner.mutation(api.cards.ownerMarkLost, {
      cardId: ids.cardId,
      lostCardResolution: "inactive",
    });
    await expect(t.query(api.cards.resolve, { token: "owned" })).resolves.toEqual({
      status: "inactive",
    });
    await owner.mutation(api.cards.ownerSetLostResolution, {
      cardId: ids.cardId,
      lostCardResolution: "return",
    });
    await expect(t.query(api.cards.resolve, { token: "owned" })).resolves.toMatchObject({
      status: "lost",
    });
    const audits = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_cardId", (q) => q.eq("cardId", ids.cardId))
        .take(10),
    );
    const ownerAudits = audits.filter(
      ({ action }) => action.startsWith("card.owner") || action === "card.lost_resolution_changed",
    );
    expect(ownerAudits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "card.owner_disabled",
          actorUserId: ids.userId,
          accountId: ids.ownerId,
          profileId: ids.profileId,
          cardId: ids.cardId,
          occurredAt: expect.any(Number),
          before: "active",
          after: "inactive",
        }),
        expect.objectContaining({
          action: "card.owner_reactivation_started",
          actorUserId: ids.userId,
          accountId: ids.ownerId,
          profileId: ids.profileId,
          cardId: ids.cardId,
          occurredAt: expect.any(Number),
          before: "inactive",
          after: "active",
        }),
        expect.objectContaining({
          action: "card.owner_marked_lost",
          actorUserId: ids.userId,
          accountId: ids.ownerId,
          profileId: ids.profileId,
          cardId: ids.cardId,
          occurredAt: expect.any(Number),
          before: "active",
          after: "lost:inactive",
        }),
        expect.objectContaining({
          action: "card.lost_resolution_changed",
          actorUserId: ids.userId,
          accountId: ids.ownerId,
          profileId: ids.profileId,
          cardId: ids.cardId,
          occurredAt: expect.any(Number),
          before: "inactive",
          after: "return",
        }),
      ]),
    );
    expect(await t.run((ctx) => ctx.db.get(ids.siblingCardId))).toMatchObject({
      status: "active",
      claimCodeClaimedAt: 2,
    });
  });

  it("keeps the reactivation action unavailable when published content is invalid", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "owner@example.com" });
      const ownerId = await ctx.db.insert("customers", {
        userId,
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId,
        slug: "owner",
        status: "published",
        draft: { name: "Owner", slug: "owner", links: [] },
        published: { name: "", slug: "owner", links: [], publishedAt: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(ownerId, { profileId });
      const cardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/invalid-published",
        token: "invalid-published",
        profileId,
        status: "inactive",
        ownerDisabledAt: 2,
        createdAt: 1,
        updatedAt: 1,
      });
      return { userId, cardId };
    });
    const owner = t.withIdentity(identity(ids.userId));
    const page = await owner.query(api.cards.myCards, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page).toMatchObject([{ _id: ids.cardId, canReactivate: false }]);
    const before = await t.run((ctx) => ctx.db.get(ids.cardId));
    await expect(owner.mutation(api.cards.ownerReactivate, { cardId: ids.cardId })).rejects.toThrow(
      "valid published profile",
    );
    expect(await t.run((ctx) => ctx.db.get(ids.cardId))).toEqual(before);
  });

  it("rejects unauthorized, cross-owner, stale, and administrator-controlled actions without changing cards", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "owner@example.com" });
      const otherUserId = await ctx.db.insert("users", { email: "other@example.com" });
      const inactiveUserId = await ctx.db.insert("users", { email: "inactive@example.com" });
      const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
      const ownerId = await ctx.db.insert("customers", {
        userId,
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const otherId = await ctx.db.insert("customers", {
        userId: otherUserId,
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("customers", {
        userId: inactiveUserId,
        role: "customer",
        status: "deleted",
        deletionStatus: "deleted",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("customers", {
        userId: adminUserId,
        role: "admin",
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
      const otherProfileId = await ctx.db.insert("profiles", {
        ownerId: otherId,
        slug: "other",
        status: "draft",
        draft: { name: "Other", slug: "other", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(ownerId, { profileId });
      await ctx.db.patch(otherId, { profileId: otherProfileId });
      const insertCard = (
        token: string,
        fields: {
          status?: Doc<"cards">["status"];
          scope?: "demo";
          archivedAt?: number;
          ownerDisabledAt?: number;
          correctionRequestedAt?: number;
          claimCodeInvalidatedAt?: number;
        } = {},
      ) =>
        ctx.db.insert("cards", {
          cardUrl: `https://tapit.test/c/${token}`,
          token,
          profileId,
          status: "active" as const,
          claimCodeClaimedAt: 2,
          createdAt: 1,
          updatedAt: 1,
          ...fields,
        });
      const ownedCardId = await insertCard("owned");
      const otherCardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/other",
        token: "other",
        profileId: otherProfileId,
        status: "active",
        claimCodeClaimedAt: 2,
        createdAt: 1,
        updatedAt: 1,
      });
      const crossScopeCardId = await insertCard("cross-scope", { scope: "demo" });
      const correctionCardId = await insertCard("correction", { correctionRequestedAt: 3 });
      const openCorrectionCardId = await insertCard("open-correction");
      const openCorrectionId = await ctx.db.insert("cardCorrectionRequests", {
        cardId: openCorrectionCardId,
        requesterId: ownerId,
        profileId,
        status: "open",
        createdAt: 1,
        updatedAt: 1,
      });
      const lostCorrectionCardId = await insertCard("lost-correction", {
        status: "lost",
        correctionRequestedAt: 3,
      });
      const pendingReactivateCardId = await insertCard("pending-reactivate", {
        status: "inactive",
        ownerDisabledAt: 2,
        correctionRequestedAt: 3,
      });
      const archivedCardId = await insertCard("archived", {
        status: "inactive",
        ownerDisabledAt: 2,
        archivedAt: 3,
      });
      const adminDisabledCardId = await insertCard("admin-disabled", { status: "inactive" });
      const lostCardId = await insertCard("lost", { status: "lost" });
      const invalidatedCardId = await insertCard("invalidated", { claimCodeInvalidatedAt: 3 });
      return {
        userId,
        otherUserId,
        inactiveUserId,
        adminUserId,
        ownedCardId,
        otherCardId,
        crossScopeCardId,
        correctionCardId,
        openCorrectionCardId,
        openCorrectionId,
        lostCorrectionCardId,
        pendingReactivateCardId,
        archivedCardId,
        adminDisabledCardId,
        lostCardId,
        invalidatedCardId,
      };
    });
    const owner = t.withIdentity(identity(ids.userId));
    const other = t.withIdentity(identity(ids.otherUserId));
    const inactive = t.withIdentity(identity(ids.inactiveUserId));
    const admin = t.withIdentity(identity(ids.adminUserId));
    const cardIds = [
      ids.ownedCardId,
      ids.otherCardId,
      ids.crossScopeCardId,
      ids.correctionCardId,
      ids.openCorrectionCardId,
      ids.lostCorrectionCardId,
      ids.pendingReactivateCardId,
      ids.archivedCardId,
      ids.adminDisabledCardId,
      ids.lostCardId,
      ids.invalidatedCardId,
    ];
    const before = await t.run((ctx) => Promise.all(cardIds.map((cardId) => ctx.db.get(cardId))));

    await expect(
      t.query(api.cards.myCards, { paginationOpts: { numItems: 10, cursor: null } }),
    ).rejects.toThrow("Active customer profile required.");
    await expect(
      admin.query(api.cards.myCards, { paginationOpts: { numItems: 10, cursor: null } }),
    ).rejects.toThrow("Active customer profile required.");
    await expect(
      inactive.mutation(api.cards.ownerDisable, { cardId: ids.ownedCardId }),
    ).rejects.toThrow("Active customer profile required.");
    await expect(
      other.mutation(api.cards.ownerDisable, { cardId: ids.ownedCardId }),
    ).rejects.toThrow("Card not found.");
    await expect(
      owner.mutation(api.cards.ownerDisable, { cardId: ids.otherCardId }),
    ).rejects.toThrow("Card not found.");
    await expect(
      owner.mutation(api.cards.ownerDisable, { cardId: ids.crossScopeCardId }),
    ).rejects.toThrow("Card not found.");
    await expect(
      admin.mutation(api.cards.ownerDisable, { cardId: ids.ownedCardId }),
    ).rejects.toThrow("Active customer profile required.");
    await expect(
      owner.mutation(api.cards.ownerDisable, { cardId: ids.correctionCardId }),
    ).rejects.toThrow("pending assignment correction");
    await expect(
      owner.mutation(api.cards.ownerMarkLost, {
        cardId: ids.correctionCardId,
        lostCardResolution: "return",
      }),
    ).rejects.toThrow("pending assignment correction");
    await expect(
      owner.mutation(api.cards.ownerDisable, { cardId: ids.openCorrectionCardId }),
    ).rejects.toThrow("pending assignment correction");
    await expect(
      owner.mutation(api.cards.ownerSetLostResolution, {
        cardId: ids.lostCorrectionCardId,
        lostCardResolution: "inactive",
      }),
    ).rejects.toThrow("pending assignment correction");
    await expect(
      owner.mutation(api.cards.ownerReactivate, { cardId: ids.pendingReactivateCardId }),
    ).rejects.toThrow("pending assignment correction");
    await expect(
      owner.mutation(api.cards.ownerReactivate, { cardId: ids.archivedCardId }),
    ).rejects.toThrow("Only a customer-disabled");
    await expect(
      owner.mutation(api.cards.ownerReactivate, { cardId: ids.adminDisabledCardId }),
    ).rejects.toThrow("Only a customer-disabled");
    await expect(
      owner.mutation(api.cards.ownerReactivate, { cardId: ids.lostCardId }),
    ).rejects.toThrow("Only a customer-disabled");
    await expect(
      owner.mutation(api.cards.ownerDisable, { cardId: ids.invalidatedCardId }),
    ).rejects.toThrow("currently claimed");
    await expect(
      owner.mutation(api.cards.ownerMarkLost, {
        cardId: ids.invalidatedCardId,
        lostCardResolution: "return",
      }),
    ).rejects.toThrow("currently claimed");

    expect(await t.run((ctx) => Promise.all(cardIds.map((cardId) => ctx.db.get(cardId))))).toEqual(
      before,
    );
    expect(await t.run((ctx) => ctx.db.get(ids.openCorrectionId))).toMatchObject({
      status: "open",
    });
    expect(await t.run((ctx) => ctx.db.query("auditLogs").take(10))).toHaveLength(0);
  });
});
