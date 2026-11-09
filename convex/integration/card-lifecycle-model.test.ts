import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";

import { api } from "../_generated/api";
import schema from "../schema";

// Regression test for CorrectionCanResolve in verification/card-lifecycle:
// reassigning a card with a pending correction used to invalidate its claim
// code and leave the correction unresolvable.
const modules = import.meta.glob("../**/*.{ts,js}");
const identity = (id: string) => ({
  issuer: "https://tapit.test",
  subject: id,
  tokenIdentifier: `https://tapit.test|${id}`,
});
const draft = (slug: string) => ({ name: slug, slug, links: [] });

describe("card lifecycle model replay", () => {
  it("refuses to reassign a card that has a pending assignment correction", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const ids = await t.run(async (ctx) => {
      const adminUser = await ctx.db.insert("users", { email: "a@test.com" });
      const ownerUser = await ctx.db.insert("users", { email: "c@test.com" });
      const base = { status: "active", deletionStatus: "active", createdAt: 1, updatedAt: 1 };
      const admin = await ctx.db.insert("customers", {
        userId: adminUser,
        role: "admin",
        ...base,
      } as never);
      const owner = await ctx.db.insert("customers", {
        userId: ownerUser,
        role: "customer",
        ...base,
      } as never);
      const mine = await ctx.db.insert("profiles", {
        ownerId: owner,
        slug: "mine",
        status: "draft",
        draft: draft("mine"),
        createdAt: 1,
        updatedAt: 1,
      });
      const wrong = await ctx.db.insert("profiles", {
        ownerId: admin,
        slug: "wrong",
        status: "draft",
        draft: draft("wrong"),
        createdAt: 1,
        updatedAt: 1,
      });
      const elsewhere = await ctx.db.insert("profiles", {
        ownerId: admin,
        slug: "elsewhere",
        status: "draft",
        draft: draft("elsewhere"),
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(owner, { profileId: mine });
      const card = await ctx.db.insert("cards", {
        cardUrl: "https://tapit.test/c/stuck",
        token: "stuck",
        profileId: wrong,
        status: "claimable",
        createdAt: 1,
        updatedAt: 1,
      });
      return { adminUser, ownerUser, card, wrong, elsewhere };
    });
    const admin = t.withIdentity(identity(ids.adminUser));
    const owner = t.withIdentity(identity(ids.ownerUser));
    const { code } = await admin.mutation(api.cards.generateClaimCode, { cardId: ids.card });
    const verification = await owner.mutation(api.cardClaims.verifyCode, { token: "stuck", code });
    if (!verification.ok) throw new Error("Expected a verification challenge");
    await owner.mutation(api.cardCorrectionRequests.requestCorrection, {
      token: "stuck",
      challenge: verification.challenge,
    });

    await expect(
      admin.mutation(api.cards.reassign, {
        cardId: ids.card,
        expectedProfileId: ids.wrong,
        expectedStatus: "claimable",
        profileId: ids.elsewhere,
      }),
    ).rejects.toThrow("Resolve the pending assignment correction");
    await expect(t.run((ctx) => ctx.db.get(ids.card))).resolves.toMatchObject({
      profileId: ids.wrong,
    });
  });
});
