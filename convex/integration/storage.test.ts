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

const pngSignature = () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const validDraft = (slug: string, imageStorageId?: Id<"_storage">) => ({
  name: slug === "owner" ? "Owner" : "Other",
  slug,
  bio: `${slug} bio`,
  links: [
    {
      id: `${slug}-link`,
      label: "Website",
      destination: "https://example.com",
      enabled: true,
    },
  ],
  ...(imageStorageId === undefined ? {} : { imageStorageId }),
});

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
    const ownerUserId = await ctx.db.insert("users", { email: "owner@example.com" });
    const otherUserId = await ctx.db.insert("users", { email: "other@example.com" });
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
    const otherCustomerId = await ctx.db.insert("customers", {
      userId: otherUserId,
      email: "other@example.com",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const ownerProfileId = await ctx.db.insert("profiles", {
      ownerId: ownerCustomerId,
      slug: "owner",
      status: "published",
      draft: validDraft("owner"),
      published: { ...validDraft("owner"), publishedAt: 1 },
      createdAt: 1,
      updatedAt: 1,
      publishedAt: 1,
    });
    const otherProfileId = await ctx.db.insert("profiles", {
      ownerId: otherCustomerId,
      slug: "other",
      status: "draft",
      draft: validDraft("other"),
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(ownerCustomerId, { profileId: ownerProfileId });
    await ctx.db.patch(otherCustomerId, { profileId: otherProfileId });
    await ctx.db.insert("cards", {
      cardUrl: "https://tapit.test/c/owner-image-card",
      token: "owner-image-card",
      profileId: ownerProfileId,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
      assignedAt: 1,
    });
    const deletionRequestId = await ctx.db.insert("deletionRequests", {
      customerId: ownerCustomerId,
      requestedAt: 1,
      status: "requested",
    });
    return {
      adminUserId,
      ownerUserId,
      otherUserId,
      adminCustomerId,
      ownerCustomerId,
      ownerProfileId,
      otherProfileId,
      deletionRequestId,
    };
  });
}

describe("profile image storage", () => {
  it("requires owned image uploads and keeps draft images private", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const other = t.withIdentity(identity(data.otherUserId));
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([pngSignature()], { type: "image/png" })),
    );

    await expect(
      t.mutation(api.storage.generateUploadUrl, { profileId: data.ownerProfileId }),
    ).rejects.toThrow("Authentication required.");
    await expect(
      other.mutation(api.storage.generateUploadUrl, { profileId: data.ownerProfileId }),
    ).rejects.toThrow("Profile access denied.");
    await expect(
      other.action(api.storage.attachImage, { profileId: data.ownerProfileId, storageId }),
    ).rejects.toThrow("Profile access denied.");
    await expect(
      owner.action(api.storage.attachImage, { profileId: data.ownerProfileId, storageId }),
    ).resolves.toMatchObject({ storageId, imageUrl: expect.any(String) });
    await expect(owner.query(api.profiles.mine, {})).resolves.toMatchObject({
      draft: { imageStorageId: storageId, imageUrl: expect.any(String) },
    });
    await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.not.toMatchObject({
      imageUrl: expect.any(String),
    });
    await expect(t.query(api.cards.resolve, { token: "owner-image-card" })).resolves.toMatchObject({
      status: "active",
      profile: {},
    });
    await owner.mutation(api.profiles.publish, { profileId: data.ownerProfileId });
    const publicProfile = await t.query(api.profiles.publicBySlug, { slug: "owner" });
    expect(publicProfile).toMatchObject({ imageUrl: expect.any(String) });
    expect(publicProfile).not.toHaveProperty("imageStorageId");
    await expect(t.query(api.cards.resolve, { token: "owner-image-card" })).resolves.toMatchObject({
      status: "active",
      profile: { imageUrl: expect.any(String) },
    });
  });

  it("rejects invalid signatures and oversized unassociated files, then deletes them", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const invalidStorageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["not an image"], { type: "image/png" })),
    );
    const oversizedStorageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" })),
    );
    const existingStorageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([pngSignature()], { type: "image/png" })),
    );

    await owner.action(api.storage.attachImage, {
      profileId: data.ownerProfileId,
      storageId: existingStorageId,
    });

    await expect(
      owner.action(api.storage.attachImage, {
        profileId: data.ownerProfileId,
        storageId: invalidStorageId,
      }),
    ).rejects.toThrow("valid JPEG, PNG, or WebP");
    await expect(
      owner.action(api.storage.attachImage, {
        profileId: data.ownerProfileId,
        storageId: oversizedStorageId,
      }),
    ).rejects.toThrow("5 MB");
    await expect(owner.query(api.profiles.mine, {})).resolves.toMatchObject({
      draft: { imageStorageId: existingStorageId },
    });
    await expect(t.run((ctx) => ctx.storage.getUrl(invalidStorageId))).resolves.toBeNull();
    await expect(t.run((ctx) => ctx.storage.getUrl(oversizedStorageId))).resolves.toBeNull();
  });

  it("rejects cross-profile storage references", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const other = t.withIdentity(identity(data.otherUserId));
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([pngSignature()], { type: "image/png" })),
    );
    await expect(
      other.action(api.storage.attachImage, { profileId: data.otherProfileId, storageId }),
    ).resolves.toMatchObject({ storageId });
    const owner = t.withIdentity(identity(data.ownerUserId));
    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: data.ownerProfileId,
        draft: validDraft("owner", storageId),
      }),
    ).rejects.toThrow("does not belong to this profile");
  });

  it("cleans replaced files only after publication and preserves the published output on removal", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const first = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([pngSignature()], { type: "image/png" })),
    );
    const second = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([pngSignature()], { type: "image/png" })),
    );
    await owner.action(api.storage.attachImage, {
      profileId: data.ownerProfileId,
      storageId: first,
    });
    await owner.mutation(api.profiles.publish, { profileId: data.ownerProfileId });
    await owner.action(api.storage.attachImage, {
      profileId: data.ownerProfileId,
      storageId: second,
    });
    await expect(t.run((ctx) => ctx.storage.getUrl(first))).resolves.toEqual(expect.any(String));
    await owner.mutation(api.storage.removeImage, { profileId: data.ownerProfileId });
    await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.toMatchObject({
      imageUrl: expect.any(String),
    });
    await owner.mutation(api.profiles.publish, { profileId: data.ownerProfileId });
    await expect(t.run((ctx) => ctx.storage.getUrl(first))).resolves.toBeNull();
    await expect(t.run((ctx) => ctx.storage.getUrl(second))).resolves.toBeNull();
  });

  it("cleans mapped files during approved account deletion", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const image = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([pngSignature()], { type: "image/png" })),
    );
    await owner.action(api.storage.attachImage, {
      profileId: data.ownerProfileId,
      storageId: image,
    });
    const admin = t.withIdentity(identity(data.adminUserId));
    await admin.mutation(api.customers.approveDeletion, { requestId: data.deletionRequestId });
    await expect(t.run((ctx) => ctx.storage.getUrl(image))).resolves.toBeNull();
  });
});
