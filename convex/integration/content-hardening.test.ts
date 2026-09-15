import { convexTest } from "convex-test";
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

type TestLink = {
  id: string;
  label: string;
  destination: string;
  enabled: boolean;
  icon?: string;
};

const validLink = (id = "link"): TestLink => ({
  id,
  label: "Website",
  destination: "https://example.com",
  enabled: true,
  icon: "link",
});

const validDraft = (links: TestLink[] = [validLink()]) => ({
  name: "Owner",
  slug: "owner",
  bio: "Owner bio",
  links,
});

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
    const ownerUserId = await ctx.db.insert("users", { email: "owner@example.com" });
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
    const profileId = await ctx.db.insert("profiles", {
      ownerId: ownerCustomerId,
      slug: "owner",
      status: "draft",
      draft: validDraft(),
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(ownerCustomerId, { profileId });
    return { adminUserId, ownerUserId, adminCustomerId, profileId };
  });
}

describe("content hardening", () => {
  it("rejects oversized and duplicate-id link drafts", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const tooMany = Array.from({ length: 101 }, (_, index) => validLink(`link-${index}`));

    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: data.profileId,
        draft: validDraft(tooMany),
      }),
    ).rejects.toThrow("more than 100 links");
    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: data.profileId,
        draft: validDraft([validLink("same"), validLink("same")]),
      }),
    ).rejects.toThrow("Duplicate link IDs");
  });

  it("rejects unknown icons while allowing incomplete draft fields", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));

    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: data.profileId,
        draft: validDraft([{ ...validLink(), icon: "unknown" }]),
      }),
    ).rejects.toThrow("icon");
    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: data.profileId,
        draft: validDraft([{ ...validLink(), label: "", destination: "" }]),
      }),
    ).resolves.toMatchObject({ updatedAt: expect.any(Number) });
  });

  it("keeps saveDraft links synchronized with the links table", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const links = [validLink("first"), { ...validLink("second"), enabled: false }];

    await owner.mutation(api.profiles.saveDraft, {
      profileId: data.profileId,
      draft: validDraft(links),
    });
    await expect(
      owner.query(api.links.listForProfile, { profileId: data.profileId }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ position: 0, label: "Website" }),
        expect.objectContaining({ position: 1, enabled: false }),
      ]),
    );
  });

  it("requires valid published content for status changes and card assignment", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const admin = t.withIdentity(identity(data.adminUserId));
    const cardId = await admin.mutation(api.cards.register, {
      cardUrl: "https://cards.example/c/valid-token",
      token: "valid-token",
    });

    await expect(
      admin.mutation(api.profiles.setStatus, { profileId: data.profileId, status: "published" }),
    ).rejects.toThrow("published content");
    await expect(
      admin.mutation(api.cards.assign, { cardId, profileId: data.profileId }),
    ).rejects.toThrow("published profile");
  });

  it("rejects unsafe, ambiguous, and mismatched card URLs", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const admin = t.withIdentity(identity(data.adminUserId));
    for (const cardUrl of [
      "javascript:alert(1)",
      "data:text/plain,/c/token",
      "//cards.example/c/token",
      "/c/token",
      "https://cards.example/c/token?x=1",
      "https://cards.example/c/token#fragment",
    ]) {
      await expect(admin.mutation(api.cards.register, { cardUrl, token: "token" })).rejects.toThrow(
        "/c/<token> format",
      );
    }
    await expect(
      admin.mutation(api.cards.register, {
        cardUrl: "https://cards.example/c/other-token",
        token: "token",
      }),
    ).rejects.toThrow("/c/<token> format");
  });
});
