import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { describe, expect, it } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");
const identity = (userId: string) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});

describe("card archive, restore, and reactivation", () => {
  it("archives/restores without changing status or history and keeps the token reserved", async () => {
    const t = convexTest(schema, modules);
    const { adminUserId, scopedAdminUserId, inactiveCardId, replacedCardId } = await t.run(
      async (ctx) => {
        const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
        const scopedAdminUserId = await ctx.db.insert("users", {
          email: "scoped-admin@example.com",
        });
        await ctx.db.insert("customers", {
          userId: adminUserId,
          role: "admin",
          status: "active",
          deletionStatus: "active",
          createdAt: 1,
          updatedAt: 1,
        });
        await ctx.db.insert("customers", {
          userId: scopedAdminUserId,
          role: "admin",
          status: "active",
          deletionStatus: "active",
          scope: "demo",
          createdAt: 1,
          updatedAt: 1,
        });
        const ownerId = await ctx.db.insert("customers", {
          role: "customer",
          status: "active",
          deletionStatus: "active",
          createdAt: 1,
          updatedAt: 1,
        });
        const profileId = await ctx.db.insert("profiles", {
          ownerId,
          slug: "archive-owner",
          status: "draft",
          draft: { name: "Owner", slug: "archive-owner", links: [] },
          createdAt: 1,
          updatedAt: 1,
        });
        const inactiveCardId = await ctx.db.insert("cards", {
          cardUrl: "https://tapit.test/c/archive-inactive",
          token: "archive-inactive",
          profileId,
          status: "inactive",
          createdAt: 1,
          updatedAt: 1,
        });
        const replacedCardId = await ctx.db.insert("cards", {
          cardUrl: "https://tapit.test/c/archive-replaced",
          token: "archive-replaced",
          profileId,
          status: "replaced",
          replacedByCardId: inactiveCardId,
          createdAt: 1,
          updatedAt: 1,
        });
        return { adminUserId, scopedAdminUserId, inactiveCardId, replacedCardId };
      },
    );
    const admin = t.withIdentity(identity(adminUserId));
    const scopedAdmin = t.withIdentity(identity(scopedAdminUserId));

    await expect(t.mutation(api.cards.archive, { cardId: inactiveCardId })).rejects.toThrow(
      "Authentication required.",
    );
    await expect(
      scopedAdmin.mutation(api.cards.archive, { cardId: inactiveCardId }),
    ).rejects.toThrow("Card not found.");
    await expect(t.mutation(api.cards.restore, { cardId: inactiveCardId })).rejects.toThrow(
      "Authentication required.",
    );
    await expect(
      scopedAdmin.mutation(api.cards.restore, { cardId: inactiveCardId }),
    ).rejects.toThrow("Card not found.");
    await expect(admin.mutation(api.cards.archive, { cardId: inactiveCardId })).resolves.toBeNull();
    const archived = await t.run((ctx) => ctx.db.get(inactiveCardId));
    expect(archived).toMatchObject({ status: "inactive", archivedAt: expect.any(Number) });
    await expect(t.query(api.cards.resolve, { token: "archive-inactive" })).resolves.toEqual({
      status: "inactive",
    });
    await expect(admin.mutation(api.cards.archive, { cardId: inactiveCardId })).rejects.toThrow(
      "Only a visible inactive or replaced card can be archived.",
    );
    await expect(admin.mutation(api.cards.reactivate, { cardId: inactiveCardId })).rejects.toThrow(
      "Only a visible inactive, replaced, or lost card can be reactivated.",
    );
    await expect(
      admin.mutation(api.cards.register, {
        cardUrl: "https://tapit-eosin.vercel.app/c/archive-inactive",
        token: "archive-inactive",
      }),
    ).rejects.toThrow("already registered");
    await expect(admin.mutation(api.cards.restore, { cardId: inactiveCardId })).resolves.toBeNull();
    await expect(admin.mutation(api.cards.restore, { cardId: inactiveCardId })).rejects.toThrow(
      "Only an archived card can be restored.",
    );
    const restoredInactive = await t.run((ctx) => ctx.db.get(inactiveCardId));
    expect(restoredInactive).toMatchObject({ status: "inactive" });
    expect(restoredInactive?.updatedAt).toBeGreaterThanOrEqual(archived?.updatedAt ?? 0);
    expect(restoredInactive).not.toHaveProperty("archivedAt");

    await admin.mutation(api.cards.archive, { cardId: replacedCardId });
    await admin.mutation(api.cards.restore, { cardId: replacedCardId });
    const restoredReplaced = await t.run((ctx) => ctx.db.get(replacedCardId));
    expect(restoredReplaced).toMatchObject({
      status: "replaced",
      replacedByCardId: inactiveCardId,
    });
    expect(restoredReplaced).not.toHaveProperty("archivedAt");
    await expect(t.query(api.cards.resolve, { token: "archive-inactive" })).resolves.toEqual({
      status: "inactive",
    });
    const events = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_cardId", (q) => q.eq("cardId", inactiveCardId))
        .take(10),
    );
    expect(events.map(({ action }) => action)).toContain("card.archived");
    expect(events.map(({ action }) => action)).toContain("card.restored");
    await t.run((ctx) =>
      ctx.db.patch(inactiveCardId, {
        status: "lost",
        lostCardResolution: "inactive",
        ownerDisabledAt: 3,
      }),
    );
    await admin.mutation(api.cards.reactivate, { cardId: inactiveCardId });
    const recovered = await t.run((ctx) => ctx.db.get(inactiveCardId));
    expect(recovered).toMatchObject({ status: "claimable" });
    expect(recovered).not.toHaveProperty("lostCardResolution");
    expect(recovered).not.toHaveProperty("ownerDisabledAt");
  });

  it("reactivates with stale claims invalidated and fresh claims usable", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const ids = await t.run(async (ctx) => {
      const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
      const ownerUserId = await ctx.db.insert("users", { email: "owner@example.com" });
      await ctx.db.insert("customers", {
        userId: adminUserId,
        role: "admin",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const ownerId = await ctx.db.insert("customers", {
        userId: ownerUserId,
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId,
        slug: "reactivate-owner",
        status: "published",
        draft: { name: "Owner", slug: "reactivate-owner", links: [] },
        published: {
          name: "Owner",
          slug: "reactivate-owner",
          links: [{ id: "site", label: "Site", destination: "https://example.com", enabled: true }],
          publishedAt: 1,
        },
        createdAt: 1,
        updatedAt: 1,
        publishedAt: 1,
      });
      const activeSiblingCardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/reactivate-active-sibling",
        token: "reactivate-active-sibling",
        profileId,
        status: "active",
        claimCodeClaimedAt: 7,
        createdAt: 1,
        updatedAt: 1,
      });
      const claimableSiblingCardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/reactivate-claimable-sibling",
        token: "reactivate-claimable-sibling",
        profileId,
        status: "claimable",
        claimCodeHash: "sibling-code-hash",
        createdAt: 1,
        updatedAt: 1,
      });
      return {
        adminUserId,
        ownerUserId,
        ownerId,
        profileId,
        activeSiblingCardId,
        claimableSiblingCardId,
      };
    });
    const admin = t.withIdentity(identity(ids.adminUserId));
    const owner = t.withIdentity(identity(ids.ownerUserId));
    const cardId = await admin.mutation(api.cards.register, {
      cardUrl: "https://tapit-eosin.vercel.app/c/reactivate-card",
      token: "reactivate-card",
    });
    await admin.mutation(api.cards.attach, { cardId, profileId: ids.profileId });
    await t.run((ctx) => ctx.db.patch(cardId, { ownerDisabledAt: 3 }));
    await expect(t.mutation(api.cards.reactivate, { cardId })).rejects.toThrow(
      "Authentication required.",
    );
    const { code: oldCode } = await admin.mutation(api.cards.generateClaimCode, { cardId });
    const stale = await owner.mutation(api.cardClaims.verifyCode, {
      token: "reactivate-card",
      code: oldCode,
    });
    if (!stale.ok) throw new Error("Expected the original claim code to verify.");
    const originalChallenges = await t.run((ctx) =>
      ctx.db
        .query("cardClaimChallenges")
        .withIndex("by_cardId", (q) => q.eq("cardId", cardId))
        .take(10),
    );
    await admin.mutation(api.cards.deactivate, { cardId });
    expect(await t.run((ctx) => ctx.db.get(cardId))).not.toHaveProperty("ownerDisabledAt");
    await admin.mutation(api.cards.reactivate, { cardId });
    const reactivatedCard = await t.run((ctx) => ctx.db.get(cardId));
    expect(reactivatedCard).toMatchObject({
      status: "active",
      claimCodeInvalidatedAt: expect.any(Number),
    });
    expect(reactivatedCard).not.toHaveProperty("claimCodeClaimedAt");
    await expect(
      t.run((ctx) =>
        ctx.db
          .query("cardClaimChallenges")
          .withIndex("by_cardId", (q) => q.eq("cardId", cardId))
          .take(10),
      ),
    ).resolves.toEqual(originalChallenges);
    await expect(
      owner.mutation(api.cardClaims.verifyCode, { token: "reactivate-card", code: oldCode }),
    ).resolves.toEqual({ ok: false });
    await expect(
      owner.mutation(api.cardClaims.complete, { challenge: stale.challenge }),
    ).rejects.toThrow();
    const { code: freshCode } = await admin.mutation(api.cards.generateClaimCode, { cardId });
    const fresh = await owner.mutation(api.cardClaims.verifyCode, {
      token: "reactivate-card",
      code: freshCode,
    });
    if (!fresh.ok) throw new Error("Expected the fresh claim code to verify.");
    await expect(
      owner.mutation(api.cardClaims.complete, { challenge: stale.challenge }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.cardClaims.complete, { challenge: fresh.challenge }),
    ).resolves.toEqual({ cardId, profileId: ids.profileId });
    await expect(
      t.run((ctx) =>
        Promise.all([
          ctx.db.get(ids.activeSiblingCardId),
          ctx.db.get(ids.claimableSiblingCardId),
          ctx.db.get(cardId),
        ]),
      ),
    ).resolves.toMatchObject([
      { status: "active", claimCodeClaimedAt: 7 },
      { status: "claimable", claimCodeHash: "sibling-code-hash" },
      { status: "active", claimCodeClaimedAt: expect.any(Number) },
    ]);
    await expect(t.query(api.cards.resolve, { token: "reactivate-card" })).resolves.toMatchObject({
      status: "active",
      profile: { slug: "reactivate-owner" },
    });
    const events = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_cardId", (q) => q.eq("cardId", cardId))
        .take(20),
    );
    expect(events.map(({ action }) => action)).toContain("card.reactivated");
  });

  it("reactivates replaced draft cards while preserving history and rejects unavailable or cross-scope cards", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
      const demoAdminUserId = await ctx.db.insert("users", { email: "demo-admin@example.com" });
      await ctx.db.insert("customers", {
        userId: adminUserId,
        role: "admin",
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
      const ownerId = await ctx.db.insert("customers", {
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const inactiveOwnerId = await ctx.db.insert("customers", {
        role: "customer",
        status: "deleted",
        deletionStatus: "deleted",
        createdAt: 1,
        updatedAt: 1,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId,
        slug: "draft-reactivate",
        status: "draft",
        draft: { name: "Draft", slug: "draft-reactivate", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      const unavailableProfileId = await ctx.db.insert("profiles", {
        ownerId: inactiveOwnerId,
        slug: "unavailable-reactivate",
        status: "draft",
        draft: { name: "Unavailable", slug: "unavailable-reactivate", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      const demoOwnerId = await ctx.db.insert("customers", {
        role: "customer",
        status: "active",
        deletionStatus: "active",
        scope: "demo",
        createdAt: 1,
        updatedAt: 1,
      });
      const demoProfileId = await ctx.db.insert("profiles", {
        scope: "demo",
        ownerId: demoOwnerId,
        slug: "demo-reactivate",
        status: "draft",
        draft: { name: "Demo", slug: "demo-reactivate", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      const crossScopeOwnerProfileId = await ctx.db.insert("profiles", {
        ownerId: demoOwnerId,
        slug: "cross-scope-owner-reactivate",
        status: "draft",
        draft: { name: "Demo owner", slug: "cross-scope-owner-reactivate", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      const invalidPublishedProfileId = await ctx.db.insert("profiles", {
        ownerId,
        slug: "invalid-published-reactivate",
        status: "published",
        draft: { name: "Invalid", slug: "invalid-published-reactivate", links: [] },
        published: {
          name: "",
          slug: "invalid-published-reactivate",
          links: [],
          publishedAt: 1,
        },
        createdAt: 1,
        updatedAt: 1,
        publishedAt: 1,
      });
      const siblingCardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/reactivate-sibling",
        token: "reactivate-sibling",
        profileId,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const replacedCardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/reactivate-replaced",
        token: "reactivate-replaced",
        profileId,
        status: "replaced",
        replacedByCardId: siblingCardId,
        claimCodeClaimedAt: 5,
        createdAt: 1,
        updatedAt: 1,
      });
      const unavailableCardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/reactivate-unavailable",
        token: "reactivate-unavailable",
        profileId: unavailableProfileId,
        status: "inactive",
        createdAt: 1,
        updatedAt: 1,
      });
      const noProfileCardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/reactivate-no-profile",
        token: "reactivate-no-profile",
        status: "inactive",
        createdAt: 1,
        updatedAt: 1,
      });
      const crossScopeCardId = await ctx.db.insert("cards", {
        scope: "demo",
        cardUrl: "https://tapit.test/c/reactivate-cross-scope",
        token: "reactivate-cross-scope",
        profileId: demoProfileId,
        status: "inactive",
        createdAt: 1,
        updatedAt: 1,
      });
      const crossScopeProfileCardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/reactivate-cross-scope-profile",
        token: "reactivate-cross-scope-profile",
        profileId: demoProfileId,
        status: "inactive",
        createdAt: 1,
        updatedAt: 1,
      });
      const crossScopeOwnerCardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/reactivate-cross-scope-owner",
        token: "reactivate-cross-scope-owner",
        profileId: crossScopeOwnerProfileId,
        status: "inactive",
        createdAt: 1,
        updatedAt: 1,
      });
      const invalidPublishedCardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/reactivate-invalid-published",
        token: "reactivate-invalid-published",
        profileId: invalidPublishedProfileId,
        status: "inactive",
        createdAt: 1,
        updatedAt: 1,
      });
      const priorEventId = await ctx.db.insert("auditLogs", {
        actorUserId: adminUserId,
        actorLabel: "Administrator",
        action: "card.deactivated",
        cardId: replacedCardId,
        profileId,
        accountId: ownerId,
        occurredAt: 4,
        before: "active",
        after: "inactive",
      });
      return {
        adminUserId,
        demoAdminUserId,
        replacedCardId,
        siblingCardId,
        unavailableCardId,
        noProfileCardId,
        crossScopeCardId,
        crossScopeProfileCardId,
        crossScopeOwnerCardId,
        invalidPublishedCardId,
        priorEventId,
      };
    });
    const admin = t.withIdentity(identity(ids.adminUserId));
    const demoAdmin = t.withIdentity(identity(ids.demoAdminUserId));

    await expect(
      admin.mutation(api.cards.reactivate, { cardId: ids.crossScopeCardId }),
    ).rejects.toThrow("Only a visible inactive, replaced, or lost card can be reactivated.");
    await expect(
      demoAdmin.mutation(api.cards.reactivate, { cardId: ids.replacedCardId }),
    ).rejects.toThrow("Only a visible inactive, replaced, or lost card can be reactivated.");
    await expect(
      admin.mutation(api.cards.reactivate, { cardId: ids.crossScopeProfileCardId }),
    ).rejects.toThrow("The profile owner account is not active.");
    await expect(
      admin.mutation(api.cards.reactivate, { cardId: ids.crossScopeOwnerCardId }),
    ).rejects.toThrow("The profile owner account is not active.");
    await expect(
      admin.mutation(api.cards.reactivate, { cardId: ids.invalidPublishedCardId }),
    ).rejects.toThrow("A valid published profile is required.");
    await expect(
      admin.mutation(api.cards.reactivate, { cardId: ids.unavailableCardId }),
    ).rejects.toThrow("The profile owner account is not active.");
    await expect(
      admin.mutation(api.cards.reactivate, { cardId: ids.noProfileCardId }),
    ).rejects.toThrow("The card profile is not available.");

    await expect(
      admin.mutation(api.cards.reactivate, { cardId: ids.replacedCardId }),
    ).resolves.toEqual({
      status: "claimable",
    });
    const card = await t.run((ctx) => ctx.db.get(ids.replacedCardId));
    expect(card).toMatchObject({
      status: "claimable",
      replacedByCardId: ids.siblingCardId,
      claimCodeInvalidatedAt: expect.any(Number),
    });
    expect(card).not.toHaveProperty("claimCodeClaimedAt");
    expect(await t.run((ctx) => ctx.db.get(ids.siblingCardId))).toMatchObject({ status: "active" });
    const history = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_cardId", (q) => q.eq("cardId", ids.replacedCardId))
        .take(10),
    );
    expect(history.map(({ _id }) => _id)).toContain(ids.priorEventId);
    expect(history.map(({ action }) => action)).toContain("card.reactivated");
  });
});
