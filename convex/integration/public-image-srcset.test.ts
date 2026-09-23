import { convexTest } from "convex-test";
import { expect, it } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");

it("publishes only the selected image set as responsive URLs", async () => {
  const t = convexTest(schema, modules);
  const urls = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("customers", {
      email: "image-owner@example.com",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const publishedLarge = await ctx.storage.store(new Blob(["published-large"]));
    const publishedSmall = await ctx.storage.store(new Blob(["published-small"]));
    const draftLarge = await ctx.storage.store(new Blob(["draft-large"]));
    const draftSmall = await ctx.storage.store(new Blob(["draft-small"]));
    const content = (imageStorageId: typeof publishedLarge) => ({
      name: "Image owner",
      slug: "image-owner",
      imageStorageId,
      links: [],
    });
    const profileId = await ctx.db.insert("profiles", {
      ownerId,
      slug: "image-owner",
      status: "published",
      draft: content(draftLarge),
      published: { ...content(publishedLarge), publishedAt: 1 },
      createdAt: 1,
      updatedAt: 1,
      publishedAt: 1,
    });
    for (const [storageId, smallStorageId] of [
      [publishedLarge, publishedSmall],
      [draftLarge, draftSmall],
    ] as const) {
      await ctx.db.insert("profileImages", {
        storageId,
        smallStorageId,
        profileId,
        ownerId,
        contentType: "image/png",
        size: 15,
        createdAt: 1,
      });
    }
    return {
      large: await ctx.storage.getUrl(publishedLarge),
      small: await ctx.storage.getUrl(publishedSmall),
      draftLarge: await ctx.storage.getUrl(draftLarge),
      draftSmall: await ctx.storage.getUrl(draftSmall),
    };
  });

  const visitor = await t.query(api.profiles.publicBySlug, { slug: "image-owner" });
  expect(visitor).toMatchObject({
    imageUrl: urls.large,
    imageSrcSet: `${urls.small} 192w, ${urls.large} 384w`,
  });
  expect(JSON.stringify(visitor)).not.toContain(String(urls.draftLarge));
  expect(JSON.stringify(visitor)).not.toContain(String(urls.draftSmall));
  expect(JSON.stringify(visitor)).not.toContain("imageStorageId");
});

it("keeps a legacy single-image row visible through slug and card projections", async () => {
  const t = convexTest(schema, modules);
  const imageUrl = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("customers", {
      email: "legacy-owner@example.com",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const storageId = await ctx.storage.store(new Blob(["legacy-image"]));
    const content = {
      name: "Legacy owner",
      slug: "legacy-owner",
      imageStorageId: storageId,
      links: [],
    };
    const profileId = await ctx.db.insert("profiles", {
      ownerId,
      slug: "legacy-owner",
      status: "published",
      draft: content,
      published: { ...content, publishedAt: 1 },
      createdAt: 1,
      updatedAt: 1,
      publishedAt: 1,
    });
    await ctx.db.insert("profileImages", {
      storageId,
      profileId,
      ownerId,
      contentType: "image/jpeg",
      size: 12,
      createdAt: 1,
    });
    await ctx.db.insert("cards", {
      cardUrl: "https://tapit.test/c/legacy-image",
      token: "legacy-image",
      profileId,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
      assignedAt: 1,
    });
    return await ctx.storage.getUrl(storageId);
  });

  const slug = await t.query(api.profiles.publicBySlug, { slug: "legacy-owner" });
  const card = await t.query(api.cards.resolve, { token: "legacy-image" });
  expect(slug).toMatchObject({ imageUrl });
  expect(slug).not.toHaveProperty("imageSrcSet");
  expect(card).toMatchObject({ profile: { imageUrl } });
  expect(card).not.toHaveProperty("profile.imageSrcSet");
});
