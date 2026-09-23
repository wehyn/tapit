import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createHash } from "node:crypto";

import { api, internal } from "../_generated/api";
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
  it("creates a pending upload job before either storage ID exists", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const jobId = await t.mutation(internal.storage.createUploadJob, {
      profileId: data.ownerProfileId,
      ownerId: data.ownerCustomerId,
      largeSha256: "a".repeat(64),
      expectedImageRevision: 0,
    });
    const job = await t.query(internal.storage.getUploadJob, { jobId });
    expect(job).toMatchObject({ status: "pending", largeSha256: "a".repeat(64) });
    expect(job?.largeStorageId).toBeUndefined();
    expect(job?.uploadWindowEndsAt).toBeGreaterThan(job!.createdAt);
  });

  it("rejects a malformed HTTP image revision before storing a blob", async () => {
    vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const response = await t
      .withIdentity(identity(data.ownerUserId))
      .fetch("/profile-image-upload", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "X-Profile-Id": data.ownerProfileId,
          "X-Image-Revision": "NaN",
          "Content-Type": "image/png",
        },
        body: pngSignature(),
      });
    expect(response.status).toBe(400);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    const jobs = await t.run((ctx) =>
      ctx.db
        .query("profileImageUploadJobs")
        .withIndex("by_profileId", (query) => query.eq("profileId", data.ownerProfileId))
        .take(1),
    );
    expect(jobs).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it("rejects decoded dimensions and MIME mismatch, then attaches exact image variants", async () => {
    vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const image = (width: number) =>
      sharp({
        create: { width, height: width, channels: 4, background: "#ffffff" },
      })
        .png()
        .toBuffer();
    const send = async (body: Buffer, type: string) =>
      owner.fetch("/profile-image-upload", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "X-Profile-Id": data.ownerProfileId,
          "X-Image-Revision": "0",
          "Content-Type": type,
        },
        body: new Uint8Array(body),
      });

    const wrongSize = await send(await image(128), "image/png");
    expect(wrongSize.status).toBe(400);
    expect(await wrongSize.text()).toContain("384 by 384");
    expect(wrongSize.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    const mismatch = await send(await image(384), "image/jpeg");
    expect(mismatch.status).toBe(400);
    expect(await mismatch.text()).toContain("Content-Type");

    const success = await send(await image(384), "image/png");
    expect(success.status).toBe(200);
    const result = await success.json();
    expect(result.imageRevision).toBe(1);
    const mapping = await t.run((ctx) =>
      ctx.db
        .query("profileImages")
        .withIndex("by_storageId", (query) => query.eq("storageId", result.storageId))
        .unique(),
    );
    expect(mapping?.smallStorageId).toBeDefined();
    const smallBytes = await t.run(async (ctx) =>
      (await ctx.storage.get(mapping!.smallStorageId!))!.arrayBuffer(),
    );
    expect(await sharp(Buffer.from(smallBytes)).metadata()).toMatchObject({
      width: 192,
      height: 192,
      format: "png",
    });
    vi.unstubAllEnvs();
  });

  it("blocks publication for a current pending upload but not an expired one", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const jobId = await t.mutation(internal.storage.createUploadJob, {
      profileId: data.ownerProfileId,
      ownerId: data.ownerCustomerId,
      largeSha256: "b".repeat(64),
      expectedImageRevision: 0,
    });
    await expect(
      owner.mutation(api.profiles.publish, {
        profileId: data.ownerProfileId,
        expectedImageRevision: 0,
      }),
    ).rejects.toThrow("Photo upload in progress");
    await t.run(async (ctx) => ctx.db.patch(jobId, { uploadWindowEndsAt: 1 }));
    await expect(
      owner.mutation(api.profiles.publish, {
        profileId: data.ownerProfileId,
        expectedImageRevision: 0,
      }),
    ).resolves.toMatchObject({ slug: "owner" });
  });

  it("never compensates an attached or referenced image set", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const large = await t.run((ctx) => ctx.storage.store(new Blob([pngSignature()])));
    const small = await t.run((ctx) => ctx.storage.store(new Blob([pngSignature()])));
    const jobId = await t.mutation(internal.storage.createUploadJob, {
      profileId: data.ownerProfileId,
      ownerId: data.ownerCustomerId,
      largeSha256: "c".repeat(64),
      expectedImageRevision: 0,
    });
    await t.mutation(internal.storage.markUploadJob, { jobId, largeStorageId: large });
    await t.mutation(internal.storage.markUploadJob, { jobId, smallSha256: "d".repeat(64) });
    await t.mutation(internal.storage.markUploadJob, { jobId, smallStorageId: small });
    await t.mutation(internal.storage.attach, {
      profileId: data.ownerProfileId,
      ownerId: data.ownerCustomerId,
      storageId: large,
      smallStorageId: small,
      contentType: "image/png",
      size: 8,
      expectedImageRevision: 0,
      uploadJobId: jobId,
    });
    await t.mutation(internal.storage.compensateUpload, { jobId });
    expect((await t.query(internal.storage.getUploadJob, { jobId }))?.status).toBe("attached");
    expect(await t.run((ctx) => ctx.storage.getUrl(large))).not.toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(small))).not.toBeNull();

    await t.run((ctx) => ctx.db.patch(jobId, { createdAt: 1 }));
    await t.mutation(internal.profileImageCleanup.reconcileExpired, {
      now: 25 * 60 * 60 * 1000,
    });
    expect(await t.query(internal.storage.getUploadJob, { jobId })).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(large))).not.toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(small))).not.toBeNull();
  });

  it("deletes an unregistered derivative during handled compensation", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const large = await t.run((ctx) => ctx.storage.store(new Blob([pngSignature()])));
    const unregisteredSmall = await t.run((ctx) => ctx.storage.store(new Blob([pngSignature()])));
    const jobId = await t.mutation(internal.storage.createUploadJob, {
      profileId: data.ownerProfileId,
      ownerId: data.ownerCustomerId,
      largeSha256: "e".repeat(64),
      expectedImageRevision: 0,
    });
    await t.mutation(internal.storage.markUploadJob, { jobId, largeStorageId: large });
    await t.mutation(internal.storage.compensateUpload, {
      jobId,
      unregisteredSmallStorageId: unregisteredSmall,
    });
    expect(await t.run((ctx) => ctx.storage.getUrl(large))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(unregisteredSmall))).toBeNull();
    expect((await t.query(internal.storage.getUploadJob, { jobId }))?.status).toBe("failed");
  });

  it("rechecks owner lifecycle immediately before attaching an image set", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const large = await t.run((ctx) => ctx.storage.store(new Blob([pngSignature()])));
    const small = await t.run((ctx) => ctx.storage.store(new Blob([pngSignature()])));
    await t.run((ctx) => ctx.db.patch(data.ownerCustomerId, { status: "deleted" }));
    await expect(
      t.mutation(internal.storage.attach, {
        profileId: data.ownerProfileId,
        ownerId: data.ownerCustomerId,
        storageId: large,
        smallStorageId: small,
        contentType: "image/png",
        size: 8,
        expectedImageRevision: 0,
      }),
    ).rejects.toThrow("Profile access denied");
  });

  it("rejects a derivative storage ID already mapped to another image", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const large = await t.run((ctx) => ctx.storage.store(new Blob([pngSignature()])));
    const anotherLarge = await t.run((ctx) => ctx.storage.store(new Blob([pngSignature()])));
    const small = await t.run((ctx) => ctx.storage.store(new Blob([pngSignature()])));
    await t.mutation(internal.storage.attach, {
      profileId: data.otherProfileId,
      ownerId: await t.run(async (ctx) => (await ctx.db.get(data.otherProfileId))!.ownerId),
      storageId: anotherLarge,
      smallStorageId: small,
      contentType: "image/png",
      size: 8,
    });
    await expect(
      t.mutation(internal.storage.attach, {
        profileId: data.ownerProfileId,
        ownerId: data.ownerCustomerId,
        storageId: large,
        smallStorageId: small,
        contentType: "image/png",
        size: 8,
      }),
    ).rejects.toThrow("Derivative image already belongs to a profile");
  });

  it("retains abandoned uploads for 23 hours and deletes them after 25 hours", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const bytes = pngSignature();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const jobId = await t.mutation(internal.storage.createUploadJob, {
      profileId: data.ownerProfileId,
      ownerId: data.ownerCustomerId,
      largeSha256: sha256,
      expectedImageRevision: 0,
    });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([bytes])));
    const metadata = await t.run(async (ctx) => (await ctx.db.system.get("_storage", storageId))!);
    const createdAt = metadata._creationTime;
    await t.run((ctx) =>
      ctx.db.patch(jobId, {
        largeSha256: metadata.sha256,
        createdAt: createdAt - 1,
        uploadWindowEndsAt: createdAt + 10 * 60 * 1000,
      }),
    );
    await t.mutation(internal.storage.markUploadJob, { jobId, largeStorageId: storageId });

    await t.mutation(internal.profileImageCleanup.reconcileExpired, {
      now: createdAt + 23 * 60 * 60 * 1000,
    });
    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
    expect(await t.query(internal.storage.getUploadJob, { jobId })).not.toBeNull();

    const result = await t.mutation(internal.profileImageCleanup.reconcileExpired, {
      now: createdAt + 25 * 60 * 60 * 1000,
    });
    expect(result.deleted).toBe(1);
    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
    expect(await t.query(internal.storage.getUploadJob, { jobId })).toBeNull();
    await expect(
      t.mutation(internal.profileImageCleanup.reconcileExpired, {
        now: createdAt + 26 * 60 * 60 * 1000,
      }),
    ).resolves.toMatchObject({ deleted: 0 });
  });

  it("finds a crash-gap blob by hash but skips ambiguous identical content", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const bytes = pngSignature();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const firstJob = await t.mutation(internal.storage.createUploadJob, {
      profileId: data.ownerProfileId,
      ownerId: data.ownerCustomerId,
      largeSha256: sha256,
      expectedImageRevision: 0,
    });
    const crashBlob = await t.run((ctx) => ctx.storage.store(new Blob([bytes])));
    const metadata = await t.run(async (ctx) => (await ctx.db.system.get("_storage", crashBlob))!);
    const createdAt = metadata._creationTime;
    await t.run((ctx) =>
      ctx.db.patch(firstJob, {
        largeSha256: metadata.sha256,
        createdAt: createdAt - 1,
        uploadWindowEndsAt: createdAt + 1,
      }),
    );
    const deleted = await t.mutation(internal.profileImageCleanup.reconcileExpired, {
      now: createdAt + 25 * 60 * 60 * 1000,
    });
    expect(deleted.deleted).toBe(1);
    expect(await t.run((ctx) => ctx.storage.getUrl(crashBlob))).toBeNull();

    const secondJob = await t.mutation(internal.storage.createUploadJob, {
      profileId: data.ownerProfileId,
      ownerId: data.ownerCustomerId,
      largeSha256: sha256,
      expectedImageRevision: 0,
    });
    const duplicateA = await t.run((ctx) => ctx.storage.store(new Blob([bytes])));
    const duplicateB = await t.run((ctx) => ctx.storage.store(new Blob([bytes])));
    const [duplicateMetadata, duplicateMetadataB] = await t.run(async (ctx) => [
      (await ctx.db.system.get("_storage", duplicateA))!,
      (await ctx.db.system.get("_storage", duplicateB))!,
    ]);
    const duplicateCreatedAt = duplicateMetadata._creationTime;
    await t.run((ctx) =>
      ctx.db.patch(secondJob, {
        largeSha256: duplicateMetadata.sha256,
        createdAt: duplicateCreatedAt - 1,
        uploadWindowEndsAt:
          Math.max(duplicateMetadata._creationTime, duplicateMetadataB._creationTime) + 1,
      }),
    );
    const skipped = await t.mutation(internal.profileImageCleanup.reconcileExpired, {
      now: duplicateCreatedAt + 25 * 60 * 60 * 1000,
    });
    expect(skipped.skipped).toBeGreaterThan(0);
    expect(await t.run((ctx) => ctx.storage.getUrl(duplicateA))).not.toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(duplicateB))).not.toBeNull();
    expect(await t.query(internal.storage.getUploadJob, { jobId: secondJob })).not.toBeNull();
  });

  it("does not claim a hash match registered to another upload job", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const bytes = pngSignature();
    const placeholderSha = createHash("sha256").update(bytes).digest("hex");
    const crashGapJob = await t.mutation(internal.storage.createUploadJob, {
      profileId: data.ownerProfileId,
      ownerId: data.ownerCustomerId,
      largeSha256: placeholderSha,
      expectedImageRevision: 0,
    });
    const otherOwnerId = await t.run(
      async (ctx) => (await ctx.db.get(data.otherProfileId))!.ownerId,
    );
    const registeredJob = await t.mutation(internal.storage.createUploadJob, {
      profileId: data.otherProfileId,
      ownerId: otherOwnerId,
      largeSha256: placeholderSha,
      expectedImageRevision: 0,
    });
    const registeredBlob = await t.run((ctx) => ctx.storage.store(new Blob([bytes])));
    const metadata = await t.run(
      async (ctx) => (await ctx.db.system.get("_storage", registeredBlob))!,
    );
    await t.mutation(internal.storage.markUploadJob, {
      jobId: registeredJob,
      largeStorageId: registeredBlob,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(crashGapJob, {
        largeSha256: metadata.sha256,
        createdAt: metadata._creationTime - 1,
        uploadWindowEndsAt: metadata._creationTime + 1,
      });
      await ctx.db.patch(registeredJob, {
        largeSha256: metadata.sha256,
        createdAt: metadata._creationTime - 1,
        uploadWindowEndsAt: metadata._creationTime + 30 * 60 * 60 * 1000,
      });
    });

    const result = await t.mutation(internal.profileImageCleanup.reconcileExpired, {
      now: metadata._creationTime + 25 * 60 * 60 * 1000,
    });
    expect(result.deleted).toBe(0);
    expect(result.retained).toBe(1);
    expect(await t.run((ctx) => ctx.storage.getUrl(registeredBlob))).not.toBeNull();
  });

  it("retains referenced files and skips jobs whose owner no longer exists", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const bytes = pngSignature();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const referencedJob = await t.mutation(internal.storage.createUploadJob, {
      profileId: data.ownerProfileId,
      ownerId: data.ownerCustomerId,
      largeSha256: sha256,
      expectedImageRevision: 0,
    });
    const referenced = await t.run((ctx) => ctx.storage.store(new Blob([bytes])));
    const metadata = await t.run(async (ctx) => (await ctx.db.system.get("_storage", referenced))!);
    const createdAt = metadata._creationTime;
    await t.mutation(internal.storage.markUploadJob, {
      jobId: referencedJob,
      largeStorageId: referenced,
    });
    await t.run(async (ctx) => {
      const profile = (await ctx.db.get(data.ownerProfileId))!;
      await ctx.db.patch(profile._id, {
        draft: { ...profile.draft, imageStorageId: referenced },
      });
      await ctx.db.patch(referencedJob, {
        largeSha256: metadata.sha256,
        createdAt: createdAt - 1,
        uploadWindowEndsAt: createdAt + 1,
      });
    });
    const retained = await t.mutation(internal.profileImageCleanup.reconcileExpired, {
      now: createdAt + 25 * 60 * 60 * 1000,
    });
    expect(retained.retained).toBe(1);
    expect(await t.run((ctx) => ctx.storage.getUrl(referenced))).not.toBeNull();

    const unknownOwnerJob = await t.mutation(internal.storage.createUploadJob, {
      profileId: data.otherProfileId,
      ownerId: await t.run(async (ctx) => (await ctx.db.get(data.otherProfileId))!.ownerId),
      largeSha256: sha256,
      expectedImageRevision: 0,
    });
    const unknownOwnerBlob = await t.run((ctx) => ctx.storage.store(new Blob([bytes])));
    await t.mutation(internal.storage.markUploadJob, {
      jobId: unknownOwnerJob,
      largeStorageId: unknownOwnerBlob,
    });
    await t.run(async (ctx) => {
      const job = (await ctx.db.get(unknownOwnerJob))!;
      const metadata = (await ctx.db.system.get("_storage", unknownOwnerBlob))!;
      await ctx.db.delete(job.ownerId);
      await ctx.db.patch(job._id, {
        largeSha256: metadata.sha256,
        createdAt: metadata._creationTime - 1,
        uploadWindowEndsAt: metadata._creationTime + 1,
      });
    });
    const skipped = await t.mutation(internal.profileImageCleanup.reconcileExpired, {
      now: createdAt + 26 * 60 * 60 * 1000,
    });
    expect(skipped.skipped).toBeGreaterThan(0);
    expect(await t.run((ctx) => ctx.storage.getUrl(unknownOwnerBlob))).not.toBeNull();
  });
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

  it("rejects stale image revisions and removes both variants as one set", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const large = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([pngSignature()], { type: "image/png" })),
    );
    const small = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([pngSignature()], { type: "image/png" })),
    );

    await owner.action(api.storage.attachImage, {
      profileId: data.ownerProfileId,
      storageId: large,
    });
    await t.run(async (ctx) => {
      const profile = await ctx.db.get(data.ownerProfileId);
      if (profile === null) throw new Error("profile missing");
      await ctx.db.patch(data.ownerProfileId, {
        draft: { ...profile.draft, imageStorageId: large },
        imageRevision: 1,
      });
      const mapping = await ctx.db
        .query("profileImages")
        .withIndex("by_storageId", (query) => query.eq("storageId", large))
        .unique();
      if (mapping === null) throw new Error("mapping missing");
      await ctx.db.patch(mapping._id, { smallStorageId: small });
    });

    await expect(
      owner.mutation(api.storage.removeImage, {
        profileId: data.ownerProfileId,
        expectedImageRevision: 0,
      }),
    ).rejects.toThrow("Photo changed elsewhere");
    await owner.mutation(api.storage.removeImage, {
      profileId: data.ownerProfileId,
      expectedImageRevision: 1,
    });
    await expect(t.run((ctx) => ctx.storage.getUrl(large))).resolves.toBeNull();
    await expect(t.run((ctx) => ctx.storage.getUrl(small))).resolves.toBeNull();
  });
});
