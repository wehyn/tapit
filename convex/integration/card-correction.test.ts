import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { api } from "../_generated/api";
import schema from "../schema";
const modules = import.meta.glob("../**/*.{ts,js}");
const identity = (id: string) => ({
  issuer: "https://tapit.test",
  subject: id,
  tokenIdentifier: `https://tapit.test|${id}`,
});

describe("card correction requests", () => {
  it("pauses public routing, consumes the challenge once, and resolves only for an admin", async () => {
    const t = convexTest(schema, modules);
    rateLimiter.register(t);
    const ids = await t.run(async (ctx) => {
      const au = await ctx.db.insert("users", { email: "a@test.com" });
      const cu = await ctx.db.insert("users", { email: "c@test.com" });
      const otherUser = await ctx.db.insert("users", { email: "other@test.com" });
      const admin = await ctx.db.insert("customers", {
        userId: au,
        role: "admin",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const customer = await ctx.db.insert("customers", {
        userId: cu,
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const otherCustomer = await ctx.db.insert("customers", {
        userId: otherUser,
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const requesterProfile = await ctx.db.insert("profiles", {
        ownerId: customer,
        slug: "customer",
        status: "draft",
        draft: { name: "Customer", slug: "customer", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      const otherProfile = await ctx.db.insert("profiles", {
        ownerId: otherCustomer,
        slug: "other",
        status: "draft",
        draft: { name: "Other", slug: "other", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      const wrongProfile = await ctx.db.insert("profiles", {
        ownerId: admin,
        slug: "wrong",
        status: "draft",
        draft: { name: "Wrong", slug: "wrong", links: [] },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(customer, { profileId: requesterProfile });
      await ctx.db.patch(otherCustomer, { profileId: otherProfile });
      const card = await ctx.db.insert("cards", {
        cardUrl: "https://tapit-eosin.vercel.app/c/correction?x=1",
        token: "correction",
        profileId: wrongProfile,
        status: "claimable",
        createdAt: 1,
        updatedAt: 1,
      });
      return { au, cu, otherUser, customer, otherCustomer, card, requesterProfile, wrongProfile };
    });
    const admin = t.withIdentity(identity(ids.au));
    const customer = t.withIdentity(identity(ids.cu));
    const other = t.withIdentity(identity(ids.otherUser));
    const { code } = await admin.mutation(api.cards.generateClaimCode, { cardId: ids.card });
    const verification = await customer.mutation(api.cardClaims.verifyCode, {
      token: "correction",
      code,
    });
    expect(verification.ok).toBe(true);
    if (!verification.ok) throw new Error("Expected a verification challenge");
    await expect(
      other.mutation(api.cardCorrectionRequests.requestCorrection, {
        token: "correction",
        challenge: verification.challenge,
      }),
    ).rejects.toThrow();
    const requestId = await customer.mutation(api.cardCorrectionRequests.requestCorrection, {
      token: "correction",
      challenge: verification.challenge,
    });
    await expect(t.query(api.cards.resolve, { token: "correction" })).resolves.toEqual({
      status: "unavailable",
    });
    await expect(t.query(api.cardCorrectionRequests.adminList, {})).rejects.toThrow(
      "Authentication required.",
    );
    await expect(admin.query(api.cardCorrectionRequests.adminList, {})).resolves.toMatchObject([
      {
        requestId,
        token: "correction",
        cardUrl: "https://tapit-eosin.vercel.app/c/correction?x=1",
        requesterProfileSlug: "customer",
        currentProfileSlug: "wrong",
      },
    ]);
    await expect(
      customer.mutation(api.cardCorrectionRequests.requestCorrection, {
        token: "correction",
        challenge: verification.challenge,
      }),
    ).rejects.toThrow();
    const blockerId = await t.run((ctx) =>
      ctx.db.insert("cards", {
        cardUrl: "https://tapit-eosin.vercel.app/c/blocker",
        token: "blocker",
        profileId: ids.requesterProfile,
        status: "claimable",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await expect(
      admin.mutation(api.cardCorrectionRequests.correctAssignment, { requestId }),
    ).rejects.toThrow("already has an active or claimable card");
    await expect(t.run((ctx) => ctx.db.get(requestId))).resolves.toMatchObject({ status: "open" });
    await t.run((ctx) => ctx.db.delete(blockerId));
    await expect(
      admin.mutation(api.cardCorrectionRequests.correctAssignment, { requestId }),
    ).resolves.toEqual({ status: "corrected" });
    await expect(t.run((ctx) => ctx.db.get(ids.card))).resolves.toMatchObject({
      cardUrl: "https://tapit-eosin.vercel.app/c/correction?x=1",
      profileId: ids.requesterProfile,
    });
    const pendingRequest = await t.run(async (ctx) => {
      const cardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit-eosin.vercel.app/c/stale",
        token: "stale",
        profileId: ids.requesterProfile,
        status: "active",
        correctionRequestedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      const requestId = await ctx.db.insert("cardCorrectionRequests", {
        cardId,
        requesterId: ids.customer,
        profileId: ids.requesterProfile,
        status: "open",
        createdAt: 1,
        updatedAt: 1,
      });
      return { cardId, requestId };
    });
    await expect(
      admin.mutation(api.cards.deactivate, { cardId: pendingRequest.cardId }),
    ).rejects.toThrow("pending assignment correction");
    await expect(
      admin.mutation(api.cards.invalidateClaimCode, { cardId: pendingRequest.cardId }),
    ).rejects.toThrow("pending assignment correction");
    await expect(t.run((ctx) => ctx.db.get(pendingRequest.cardId))).resolves.toMatchObject({
      status: "active",
      correctionRequestedAt: 1,
    });
    await expect(t.run((ctx) => ctx.db.get(pendingRequest.requestId))).resolves.toMatchObject({
      status: "open",
    });
    const replacedRequest = await t.run(async (ctx) => {
      const cardId = await ctx.db.insert("cards", {
        cardUrl: "https://tapit-eosin.vercel.app/c/replaced-stale",
        token: "replaced-stale",
        profileId: ids.wrongProfile,
        status: "active",
        correctionRequestedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      const requestId = await ctx.db.insert("cardCorrectionRequests", {
        cardId,
        requesterId: ids.customer,
        profileId: ids.requesterProfile,
        status: "open",
        createdAt: 1,
        updatedAt: 1,
      });
      return { cardId, requestId };
    });
    await expect(
      admin.mutation(api.cards.replace, {
        oldCardId: replacedRequest.cardId,
        newCardUrl: "https://tapit-eosin.vercel.app/c/replacement",
        newToken: "replacement",
      }),
    ).rejects.toThrow("pending assignment correction");
    await expect(
      admin.mutation(api.cardCorrectionRequests.correctAssignment, {
        requestId: replacedRequest.requestId,
      }),
    ).rejects.toThrow("already has an active or claimable card");
    await expect(t.run((ctx) => ctx.db.get(replacedRequest.cardId))).resolves.toMatchObject({
      status: "active",
      correctionRequestedAt: 1,
    });
  });
});
