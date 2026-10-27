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
      deletionRequestedAt: 1,
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
  it("enforces the streamed request cap and validates Content-Length", async () => {
    const { readBoundedRequestBody } = await import("../profileUploadBody");
    const makeRequest = (size: number, length?: string) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const chunk = new Uint8Array(64 * 1024);
          let remaining = size;
          while (remaining > 0) {
            const next = chunk.subarray(0, Math.min(chunk.byteLength, remaining));
            controller.enqueue(next);
            remaining -= next.byteLength;
          }
          controller.close();
        },
      });
      return new Request("https://example.test/upload", {
        method: "POST",
        body,
        duplex: "half",
        headers: length === undefined ? {} : { "Content-Length": length },
      } as RequestInit);
    };
    const max = 5 * 1024 * 1024;
    expect(await readBoundedRequestBody(makeRequest(max, String(max)), max)).toMatchObject({
      kind: "ok",
      bytes: expect.any(Uint8Array),
    });
    expect(await readBoundedRequestBody(makeRequest(max + 1), max)).toEqual({ kind: "too-large" });
    expect(await readBoundedRequestBody(makeRequest(8, "7"), max)).toEqual({
      kind: "length-mismatch",
    });
    expect(await readBoundedRequestBody(makeRequest(8, "not-a-number"), max)).toEqual({
      kind: "invalid-length",
    });
  });

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
          "X-Draft-Revision": "0",
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

  it("keeps customer photo paths owner-only and audits administrator photo changes", async () => {
    vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const otherScopeProfileId = await t.run(async (ctx) => {
      const ownerUserId = await ctx.db.insert("users", { email: "isolated@example.com" });
      const ownerId = await ctx.db.insert("customers", {
        userId: ownerUserId,
        email: "isolated@example.com",
        role: "customer",
        scope: "demo",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId,
        scope: "demo",
        slug: "isolated",
        status: "draft",
        draft: validDraft("isolated"),
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(ownerId, { profileId });
      return profileId;
    });
    const image = await sharp({
      create: { width: 384, height: 384, channels: 4, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const request = (profileId: Id<"profiles">) => ({
      method: "POST" as const,
      headers: {
        Origin: "http://localhost:3000",
        "X-Profile-Id": profileId,
        "X-Image-Revision": "0",
        "X-Draft-Revision": "0",
        "Content-Type": "image/png",
      },
      body: new Uint8Array(image),
    });

    const adminOnCustomerPath = await t
      .withIdentity(identity(data.adminUserId))
      .fetch("/profile-image-upload", request(data.ownerProfileId));
    expect(adminOnCustomerPath.status).toBe(403);

    const customerOnAdminPath = await t
      .withIdentity(identity(data.ownerUserId))
      .fetch("/admin-profile-image-upload", request(data.ownerProfileId));
    expect(customerOnAdminPath.status).toBe(403);

    const crossScopeAdminUpload = await t
      .withIdentity(identity(data.adminUserId))
      .fetch("/admin-profile-image-upload", request(otherScopeProfileId));
    expect(crossScopeAdminUpload.status).toBe(403);
    await expect(
      t.withIdentity(identity(data.adminUserId)).mutation(api.storage.removeImageAsAdmin, {
        profileId: otherScopeProfileId,
        expectedImageRevision: 0,
        expectedDraftRevision: 0,
      }),
    ).rejects.toThrow("Profile access denied");

    const adminUpload = await t
      .withIdentity(identity(data.adminUserId))
      .fetch("/admin-profile-image-upload", request(data.ownerProfileId));
    expect(adminUpload.status).toBe(200);
    expect((await adminUpload.json()).imageRevision).toBe(1);
    await expect(
      t.withIdentity(identity(data.adminUserId)).mutation(api.storage.removeImage, {
        profileId: data.ownerProfileId,
        expectedImageRevision: 1,
        expectedDraftRevision: 1,
      }),
    ).rejects.toThrow("Profile access denied");

    const auditAfterUpload = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_profileId", (query) => query.eq("profileId", data.ownerProfileId))
        .collect(),
    );
    expect(auditAfterUpload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "profile.photo_uploaded",
          actorUserId: data.adminUserId,
          accountId: data.ownerCustomerId,
          profileId: data.ownerProfileId,
        }),
      ]),
    );

    const adminRemove = await t
      .withIdentity(identity(data.adminUserId))
      .mutation(api.storage.removeImageAsAdmin, {
        profileId: data.ownerProfileId,
        expectedImageRevision: 1,
        expectedDraftRevision: 1,
      });
    expect(adminRemove.imageRevision).toBe(2);
    const auditAfterRemoval = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_profileId", (query) => query.eq("profileId", data.ownerProfileId))
        .collect(),
    );
    expect(auditAfterRemoval).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "profile.photo_removed",
          actorUserId: data.adminUserId,
          accountId: data.ownerCustomerId,
          profileId: data.ownerProfileId,
        }),
      ]),
    );
    vi.unstubAllEnvs();
  });

  it("rejects administrator photo jobs after the actor account is deleted or demoted", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const jobId = await t.mutation(internal.storage.createUploadJob, {
      profileId: data.ownerProfileId,
      ownerId: data.ownerCustomerId,
      actorUserId: data.adminUserId,
      accessMode: "admin",
      largeSha256: "f".repeat(64),
      expectedImageRevision: 0,
    });
    const largeStorageId = await t.run((ctx) => ctx.storage.store(new Blob([pngSignature()])));
    const smallStorageId = await t.run((ctx) => ctx.storage.store(new Blob([pngSignature()])));
    await t.mutation(internal.storage.markUploadJob, {
      jobId,
      largeStorageId,
      smallStorageId,
    });
    await t.run((ctx) => ctx.db.delete(data.adminCustomerId));

    await expect(
      t.mutation(internal.storage.attach, {
        profileId: data.ownerProfileId,
        ownerId: data.ownerCustomerId,
        storageId: largeStorageId,
        smallStorageId,
        contentType: "image/png",
        size: 8,
        expectedImageRevision: 0,
        uploadJobId: jobId,
      }),
    ).rejects.toThrow("Profile access denied");
    await expect(
      t.mutation(internal.storage.createUploadJob, {
        profileId: data.ownerProfileId,
        ownerId: data.ownerCustomerId,
        actorUserId: data.adminUserId,
        accessMode: "admin",
        largeSha256: "a".repeat(64),
        expectedImageRevision: 0,
      }),
    ).rejects.toThrow("Profile access denied");
    expect((await t.run((ctx) => ctx.db.get(data.ownerProfileId)))?.imageRevision ?? 0).toBe(0);
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("auditLogs")
          .withIndex("by_profileId", (query) => query.eq("profileId", data.ownerProfileId))
          .collect(),
      ),
    ).toHaveLength(0);
  });

  it("does not finish an admin photo job after the admin role is demoted on their own profile", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const adminProfileId = await t.run(async (ctx) => {
      const profileId = await ctx.db.insert("profiles", {
        ownerId: data.adminCustomerId,
        slug: "admin-owner",
        status: "draft",
        draft: validDraft("admin-owner"),
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(data.adminCustomerId, { profileId });
      return profileId;
    });
    const jobId = await t.mutation(internal.storage.createUploadJob, {
      profileId: adminProfileId,
      ownerId: data.adminCustomerId,
      actorUserId: data.adminUserId,
      accessMode: "admin",
      largeSha256: "b".repeat(64),
      expectedImageRevision: 0,
    });
    const largeStorageId = await t.run((ctx) => ctx.storage.store(new Blob([pngSignature()])));
    const smallStorageId = await t.run((ctx) => ctx.storage.store(new Blob([pngSignature()])));
    await t.mutation(internal.storage.markUploadJob, {
      jobId,
      largeStorageId,
      smallStorageId,
    });
    await t.run((ctx) => ctx.db.patch(data.adminCustomerId, { role: "customer" }));

    await expect(
      t.mutation(internal.storage.attach, {
        profileId: adminProfileId,
        ownerId: data.adminCustomerId,
        storageId: largeStorageId,
        smallStorageId,
        contentType: "image/png",
        size: 8,
        expectedImageRevision: 0,
        uploadJobId: jobId,
      }),
    ).rejects.toThrow("Profile access denied");
    expect((await t.run((ctx) => ctx.db.get(adminProfileId)))?.imageRevision ?? 0).toBe(0);
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("auditLogs")
          .withIndex("by_profileId", (query) => query.eq("profileId", adminProfileId))
          .collect(),
      ),
    ).toHaveLength(0);
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
    const [largeMetadata, smallMetadata] = await t.run((ctx) =>
      Promise.all([ctx.db.system.get("_storage", large), ctx.db.system.get("_storage", small)]),
    );
    const jobId = await t.mutation(internal.storage.createUploadJob, {
      profileId: data.ownerProfileId,
      ownerId: data.ownerCustomerId,
      largeSha256: largeMetadata!.sha256,
      expectedImageRevision: 0,
    });
    await t.mutation(internal.storage.markUploadJob, { jobId, largeStorageId: large });
    await t.mutation(internal.storage.markUploadJob, {
      jobId,
      smallSha256: smallMetadata!.sha256,
    });
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

    const uploadWindowEndsAt =
      Math.max(largeMetadata!._creationTime, smallMetadata!._creationTime) + 1;
    await t.run((ctx) =>
      ctx.db.patch(jobId, {
        createdAt: Math.min(largeMetadata!._creationTime, smallMetadata!._creationTime) - 1,
        uploadWindowEndsAt,
      }),
    );
    await t.mutation(internal.profileImageCleanup.reconcileExpired, {
      now: uploadWindowEndsAt + 25 * 60 * 60 * 1000,
    });
    expect(await t.query(internal.storage.getUploadJob, { jobId })).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(large))).not.toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(small))).not.toBeNull();
  });

  it("reclaims an attached upload after its profile image is replaced", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const largeBytes = new Uint8Array([...pngSignature(), 1]);
    const smallBytes = new Uint8Array([...pngSignature(), 2]);
    const images = await t.run(async (ctx) => {
      const largeStorageId = await ctx.storage.store(new Blob([largeBytes], { type: "image/png" }));
      const smallStorageId = await ctx.storage.store(new Blob([smallBytes], { type: "image/png" }));
      return {
        largeStorageId,
        smallStorageId,
        largeMetadata: (await ctx.db.system.get("_storage", largeStorageId))!,
        smallMetadata: (await ctx.db.system.get("_storage", smallStorageId))!,
      };
    });
    const jobId = await t.mutation(internal.storage.createUploadJob, {
      profileId: data.ownerProfileId,
      ownerId: data.ownerCustomerId,
      largeSha256: images.largeMetadata.sha256,
      expectedImageRevision: 0,
    });
    await t.mutation(internal.storage.markUploadJob, {
      jobId,
      largeStorageId: images.largeStorageId,
      smallStorageId: images.smallStorageId,
      smallSha256: images.smallMetadata.sha256,
    });
    await t.mutation(internal.storage.attach, {
      profileId: data.ownerProfileId,
      ownerId: data.ownerCustomerId,
      storageId: images.largeStorageId,
      smallStorageId: images.smallStorageId,
      contentType: "image/png",
      size: largeBytes.length,
      expectedImageRevision: 0,
      expectedDraftRevision: 0,
      uploadJobId: jobId,
    });
    const replacement = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([new Uint8Array([...pngSignature(), 3])], { type: "image/png" })),
    );
    await owner.action(api.storage.attachImage, {
      profileId: data.ownerProfileId,
      storageId: replacement,
      expectedDraftRevision: 1,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, {
        createdAt:
          Math.min(images.largeMetadata._creationTime, images.smallMetadata._creationTime) - 1,
        uploadWindowEndsAt:
          Math.max(images.largeMetadata._creationTime, images.smallMetadata._creationTime) + 1,
      });
    });

    expect(
      await t.query(internal.profileImages.getMapping, { storageId: images.largeStorageId }),
    ).toBeNull();
    expect(await t.query(internal.storage.getUploadJob, { jobId })).toMatchObject({
      status: "attached",
    });
    expect(await t.run((ctx) => ctx.storage.getUrl(images.largeStorageId))).not.toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(images.smallStorageId))).not.toBeNull();

    await t.mutation(internal.profileImageCleanup.reconcileExpired, {
      now:
        Math.max(images.largeMetadata._creationTime, images.smallMetadata._creationTime) +
        25 * 60 * 60 * 1000,
    });
    vi.useFakeTimers();
    try {
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    expect(await t.query(internal.storage.getUploadJob, { jobId })).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(images.largeStorageId))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(images.smallStorageId))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(replacement))).not.toBeNull();
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

  it("finds a crash-gap blob by hash and skips ambiguous identical content across pages", async () => {
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
    const fillerBefore = await t.run((ctx) =>
      Promise.all(
        Array.from({ length: 64 }, (_, index) => ctx.storage.store(new Blob([`before-${index}`]))),
      ),
    );
    const duplicateA = await t.run((ctx) => ctx.storage.store(new Blob([bytes])));
    const duplicateB = await t.run((ctx) => ctx.storage.store(new Blob([bytes])));
    const fillerAfter = await t.run((ctx) =>
      Promise.all(
        Array.from({ length: 64 }, (_, index) => ctx.storage.store(new Blob([`after-${index}`]))),
      ),
    );
    const duplicateMetadata = await t.run(
      async (ctx) => (await ctx.db.system.get("_storage", duplicateA))!,
    );
    const [fillerBeforeTimes, fillerAfterTimes] = await t.run(async (ctx) => [
      await Promise.all(
        fillerBefore.map(
          async (storageId) => (await ctx.db.system.get("_storage", storageId))!._creationTime,
        ),
      ),
      await Promise.all(
        fillerAfter.map(
          async (storageId) => (await ctx.db.system.get("_storage", storageId))!._creationTime,
        ),
      ),
    ]);
    const duplicateCreatedAt = duplicateMetadata._creationTime;
    await t.run((ctx) =>
      ctx.db.patch(secondJob, {
        largeSha256: duplicateMetadata.sha256,
        createdAt: Math.min(...fillerBeforeTimes),
        uploadWindowEndsAt: Math.max(...fillerAfterTimes) + 1,
      }),
    );
    const now = duplicateCreatedAt + 25 * 60 * 60 * 1000;
    await t.mutation(internal.profileImageCleanup.reconcileOneJob, {
      jobId: secondJob,
      now,
      dryRun: false,
    });
    await t.mutation(internal.profileImageCleanup.reconcileOneJob, {
      jobId: secondJob,
      now,
      dryRun: false,
    });
    const skipped = await t.mutation(internal.profileImageCleanup.reconcileOneJob, {
      jobId: secondJob,
      now,
      dryRun: false,
    });
    expect(skipped.skipped).toBeGreaterThan(0);
    expect(await t.run((ctx) => ctx.storage.getUrl(duplicateA))).not.toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(duplicateB))).not.toBeNull();
    expect(await t.query(internal.storage.getUploadJob, { jobId: secondJob })).not.toBeNull();
  });

  it("continues past unresolved failed image jobs to reclaim later jobs", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const ambiguousBytes = pngSignature();
    const [ambiguousA, ambiguousB] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob([ambiguousBytes])),
      await ctx.storage.store(new Blob([ambiguousBytes])),
    ]);
    const [ambiguousMetadataA, ambiguousMetadataB] = await t.run(async (ctx) =>
      Promise.all([
        ctx.db.system.get("_storage", ambiguousA),
        ctx.db.system.get("_storage", ambiguousB),
      ]),
    );
    const ambiguousSha256 = ambiguousMetadataA!.sha256;
    const ambiguousCreatedAt = Math.min(
      ambiguousMetadataA!._creationTime,
      ambiguousMetadataB!._creationTime,
    );
    const ambiguousUploadWindowEndsAt =
      Math.max(ambiguousMetadataA!._creationTime, ambiguousMetadataB!._creationTime) + 1;
    const unresolvedJobIds = await t.run(async (ctx) =>
      Promise.all(
        Array.from({ length: 8 }, () =>
          ctx.db.insert("profileImageUploadJobs", {
            profileId: data.ownerProfileId,
            ownerId: data.ownerCustomerId,
            largeSha256: ambiguousSha256,
            status: "failed",
            createdAt: ambiguousCreatedAt - 1,
            uploadWindowEndsAt: ambiguousUploadWindowEndsAt,
          }),
        ),
      ),
    );

    const reclaimableBytes = new Uint8Array([...pngSignature(), 7]);
    const reclaimableStorageId = await t.run((ctx) =>
      ctx.storage.store(new Blob([reclaimableBytes])),
    );
    const reclaimableMetadata = await t.run(
      async (ctx) => (await ctx.db.system.get("_storage", reclaimableStorageId))!,
    );
    const reclaimableJobId = await t.run((ctx) =>
      ctx.db.insert("profileImageUploadJobs", {
        profileId: data.ownerProfileId,
        ownerId: data.ownerCustomerId,
        largeStorageId: reclaimableStorageId,
        largeSha256: reclaimableMetadata.sha256,
        status: "failed",
        createdAt: ambiguousCreatedAt - 1,
        uploadWindowEndsAt: reclaimableMetadata._creationTime + 1,
      }),
    );

    await t.mutation(internal.profileImageCleanup.reconcileExpired, {
      now: reclaimableMetadata._creationTime + 25 * 60 * 60 * 1000,
      jobBatchSize: 8,
    });
    vi.useFakeTimers();
    try {
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    expect(await t.query(internal.storage.getUploadJob, { jobId: reclaimableJobId })).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(reclaimableStorageId))).toBeNull();
    const unresolvedJobs = await t.run(async (ctx) =>
      Promise.all(unresolvedJobIds.map((jobId) => ctx.db.get(jobId))),
    );
    expect(unresolvedJobs.every((job) => job !== null)).toBe(true);
    expect(await t.run((ctx) => ctx.storage.getUrl(ambiguousA))).not.toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(ambiguousB))).not.toBeNull();
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

  it("reclaims orphan uploads beyond 1000 profiles and jobs without deleting live references", async () => {
    const t = convexTest({ schema, modules, transactionLimits: { documentsRead: 100 } });
    const data = await seed(t);
    const largeBytes = pngSignature();
    const smallBytes = new Uint8Array([...pngSignature(), 1]);
    const jobId = await t.mutation(internal.storage.createUploadJob, {
      profileId: data.ownerProfileId,
      ownerId: data.ownerCustomerId,
      largeSha256: createHash("sha256").update(largeBytes).digest("hex"),
      expectedImageRevision: 0,
    });
    const [orphanStorageId, referencedStorageId] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob([largeBytes])),
      await ctx.storage.store(new Blob([smallBytes])),
    ]);
    const [orphanMetadata, referencedMetadata] = await t.run(async (ctx) => [
      (await ctx.db.system.get("_storage", orphanStorageId))!,
      (await ctx.db.system.get("_storage", referencedStorageId))!,
    ]);
    await t.mutation(internal.storage.markUploadJob, {
      jobId,
      largeStorageId: orphanStorageId,
      smallStorageId: referencedStorageId,
      smallSha256: referencedMetadata.sha256,
    });
    await t.run((ctx) =>
      ctx.db.patch(jobId, {
        largeSha256: orphanMetadata.sha256,
        createdAt: Math.min(orphanMetadata._creationTime, referencedMetadata._creationTime) - 1,
        uploadWindowEndsAt:
          Math.max(orphanMetadata._creationTime, referencedMetadata._creationTime) + 1,
      }),
    );

    const otherCustomerId = await t.run(
      async (ctx) => (await ctx.db.get(data.otherProfileId))!.ownerId,
    );
    const futureCreatedAt =
      Math.max(orphanMetadata._creationTime, referencedMetadata._creationTime) +
      2 * 24 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      for (let index = 0; index < 1001; index += 1) {
        const slug = `cleanup-overflow-${index}`;
        await ctx.db.insert("profiles", {
          ownerId: otherCustomerId,
          slug,
          status: "draft",
          draft: validDraft(slug),
          createdAt: futureCreatedAt,
          updatedAt: futureCreatedAt,
        });
      }
      await ctx.db.insert("profiles", {
        ownerId: otherCustomerId,
        slug: "live-overflow-reference",
        status: "draft",
        draft: validDraft("live-overflow-reference", referencedStorageId),
        createdAt: futureCreatedAt,
        updatedAt: futureCreatedAt,
      });
      for (let index = 0; index < 1001; index += 1) {
        await ctx.db.insert("profileImageUploadJobs", {
          profileId: data.ownerProfileId,
          ownerId: data.ownerCustomerId,
          largeSha256: "f".repeat(64),
          status: "pending",
          createdAt: futureCreatedAt,
          uploadWindowEndsAt: futureCreatedAt + 10 * 60 * 1000,
        });
      }
    });

    const result = await t.mutation(internal.profileImageCleanup.reconcileExpired, {
      now: futureCreatedAt - 24 * 60 * 60 * 1000,
    });

    expect(result).toMatchObject({ deleted: 1, retained: 1, skipped: 0 });
    expect(await t.run((ctx) => ctx.storage.getUrl(orphanStorageId))).toBeNull();
    expect(await t.query(internal.storage.getUploadJob, { jobId })).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(referencedStorageId))).not.toBeNull();
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
    const admin = t.withIdentity(identity(data.adminUserId));
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
      admin.mutation(api.storage.generateUploadUrl, { profileId: data.ownerProfileId }),
    ).rejects.toThrow("Profile access denied.");
    await expect(
      other.action(api.storage.attachImage, {
        profileId: data.ownerProfileId,
        storageId,
        expectedDraftRevision: 0,
      }),
    ).rejects.toThrow("Profile access denied.");
    await expect(
      admin.action(api.storage.attachImage, {
        profileId: data.ownerProfileId,
        storageId,
        expectedDraftRevision: 0,
      }),
    ).rejects.toThrow("Profile access denied.");
    await expect(
      owner.action(api.storage.attachImage, {
        profileId: data.ownerProfileId,
        storageId,
        expectedDraftRevision: 0,
      }),
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
      expectedDraftRevision: 0,
    });

    await expect(
      owner.action(api.storage.attachImage, {
        profileId: data.ownerProfileId,
        storageId: invalidStorageId,
        expectedDraftRevision: 1,
      }),
    ).rejects.toThrow("valid JPEG, PNG, or WebP");
    await expect(
      owner.action(api.storage.attachImage, {
        profileId: data.ownerProfileId,
        storageId: oversizedStorageId,
        expectedDraftRevision: 1,
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
      other.action(api.storage.attachImage, {
        profileId: data.otherProfileId,
        storageId,
        expectedDraftRevision: 0,
      }),
    ).resolves.toMatchObject({ storageId });
    const owner = t.withIdentity(identity(data.ownerUserId));
    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: data.ownerProfileId,
        draft: validDraft("owner", storageId),
        expectedDraftRevision: await t.run(
          async (ctx) => (await ctx.db.get(data.ownerProfileId))?.draftRevision ?? 0,
        ),
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
      expectedDraftRevision: 0,
    });
    await owner.mutation(api.profiles.publish, { profileId: data.ownerProfileId });
    await owner.action(api.storage.attachImage, {
      profileId: data.ownerProfileId,
      storageId: second,
      expectedDraftRevision: 1,
    });
    await expect(t.run((ctx) => ctx.storage.getUrl(first))).resolves.toEqual(expect.any(String));
    await owner.mutation(api.storage.removeImage, {
      profileId: data.ownerProfileId,
      expectedImageRevision: 2,
      expectedDraftRevision: 2,
    });
    await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.toMatchObject({
      imageUrl: expect.any(String),
    });
    await owner.mutation(api.profiles.publish, { profileId: data.ownerProfileId });
    await expect(t.run((ctx) => ctx.storage.getUrl(first))).resolves.toBeNull();
    await expect(t.run((ctx) => ctx.storage.getUrl(second))).resolves.toBeNull();
  });

  it("retains image storage while a media asset row still references it", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob([pngSignature()], { type: "image/png" })),
    );
    await owner.action(api.storage.attachImage, {
      profileId: data.ownerProfileId,
      storageId,
      expectedDraftRevision: 0,
    });
    await t.run((ctx) =>
      ctx.db.insert("profileMediaAssets", {
        storageId,
        profileId: data.ownerProfileId,
        ownerId: data.ownerCustomerId,
        contentType: "image/png",
        size: 8,
        width: 1,
        height: 1,
        createdAt: 1,
      }),
    );

    await owner.mutation(api.storage.removeImage, {
      profileId: data.ownerProfileId,
      expectedImageRevision: 1,
      expectedDraftRevision: 1,
    });

    expect(
      await t.run((ctx) =>
        ctx.db
          .query("profileImages")
          .withIndex("by_storageId", (query) => query.eq("storageId", storageId))
          .take(1),
      ),
    ).toEqual([]);
    await expect(t.run((ctx) => ctx.storage.getUrl(storageId))).resolves.not.toBeNull();
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
      expectedDraftRevision: 0,
    });
    const admin = t.withIdentity(identity(data.adminUserId));
    await admin.mutation(api.customers.approveDeletion, { requestId: data.deletionRequestId });
    vi.useFakeTimers();
    try {
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    await expect(t.run((ctx) => ctx.storage.getUrl(image))).resolves.toBeNull();
  });

  it("preserves another profile's shared image when deletion is approved", async () => {
    const t = convexTest(schema, modules);
    const data = await seed(t);
    const image = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob([pngSignature()], { type: "image/png" }));
      for (const [profileId, ownerId] of [
        [data.ownerProfileId, data.ownerCustomerId],
        [
          data.otherProfileId,
          await ctx.db
            .query("customers")
            .withIndex("by_userId", (q) => q.eq("userId", data.otherUserId))
            .unique()
            .then((row) => row!._id),
        ],
      ] as const) {
        await ctx.db.insert("profileImages", {
          storageId,
          profileId,
          ownerId,
          contentType: "image/png",
          size: 8,
          createdAt: 1,
        });
      }
      return storageId;
    });
    const admin = t.withIdentity(identity(data.adminUserId));
    await admin.mutation(api.customers.approveDeletion, { requestId: data.deletionRequestId });
    vi.useFakeTimers();
    try {
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
    await expect(t.run((ctx) => ctx.storage.getUrl(image))).resolves.not.toBeNull();
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
      expectedDraftRevision: 0,
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
        expectedDraftRevision: 1,
      }),
    ).rejects.toThrow("Photo changed elsewhere");
    await owner.mutation(api.storage.removeImage, {
      profileId: data.ownerProfileId,
      expectedImageRevision: 1,
      expectedDraftRevision: 1,
    });
    await expect(t.run((ctx) => ctx.storage.getUrl(large))).resolves.toBeNull();
    await expect(t.run((ctx) => ctx.storage.getUrl(small))).resolves.toBeNull();
  });

  it.each(["attach", "owner removal", "admin removal"] as const)(
    "requires a draft revision for public photo %s",
    async (operation) => {
      const t = convexTest(schema, modules);
      const data = await seed(t);
      const owner = t.withIdentity(identity(data.ownerUserId));
      const admin = t.withIdentity(identity(data.adminUserId));
      const storageId = await t.run(async (ctx) =>
        ctx.storage.store(new Blob([pngSignature()], { type: "image/png" })),
      );
      let result: Promise<unknown>;

      if (operation === "attach") {
        result = owner.action(api.storage.attachImage, {
          profileId: data.ownerProfileId,
          storageId,
        } as never);
      } else if (operation === "owner removal") {
        result = owner.mutation(api.storage.removeImage, {
          profileId: data.ownerProfileId,
          expectedImageRevision: 0,
        } as never);
      } else {
        result = admin.mutation(api.storage.removeImageAsAdmin, {
          profileId: data.ownerProfileId,
          expectedImageRevision: 0,
        } as never);
      }

      await expect(result).rejects.toThrow("expectedDraftRevision");
    },
  );
});
