import { convexTest } from "convex-test";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");
const identity = (userId: Id<"users">) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});

type ProfileMedia = NonNullable<Doc<"profiles">["draft"]["media"]>;

const content = (slug: string, media?: ProfileMedia): Doc<"profiles">["draft"] => ({
  name: slug,
  slug,
  theme: "paper" as const,
  links: [
    {
      id: "site",
      label: "Site",
      destination: "https://example.com",
      enabled: true,
    },
  ],
  ...(media === undefined ? {} : { media }),
});

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const adminUserId = await ctx.db.insert("users", { email: "admin@example.com" });
    const ownerUserId = await ctx.db.insert("users", { email: "owner@example.com" });
    const otherUserId = await ctx.db.insert("users", { email: "other@example.com" });
    const ownerId = await ctx.db.insert("customers", {
      userId: ownerUserId,
      email: "owner@example.com",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const adminId = await ctx.db.insert("customers", {
      userId: adminUserId,
      email: "admin@example.com",
      role: "admin",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherId = await ctx.db.insert("customers", {
      userId: otherUserId,
      email: "other@example.com",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const ownerProfileId = await ctx.db.insert("profiles", {
      ownerId,
      slug: "owner",
      status: "draft",
      draft: content("owner"),
      createdAt: 1,
      updatedAt: 1,
    });
    const otherProfileId = await ctx.db.insert("profiles", {
      ownerId: otherId,
      slug: "other",
      status: "draft",
      draft: content("other"),
      createdAt: 1,
      updatedAt: 1,
    });
    const adminProfileId = await ctx.db.insert("profiles", {
      ownerId: adminId,
      slug: "admin",
      status: "draft",
      draft: content("admin"),
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(ownerId, { profileId: ownerProfileId });
    await ctx.db.patch(otherId, { profileId: otherProfileId });
    await ctx.db.patch(adminId, { profileId: adminProfileId });
    const deletionRequestId = await ctx.db.insert("deletionRequests", {
      customerId: ownerId,
      requestedAt: 1,
      status: "requested",
    });
    return {
      adminUserId,
      adminId,
      ownerUserId,
      otherUserId,
      ownerId,
      otherId,
      ownerProfileId,
      otherProfileId,
      adminProfileId,
      deletionRequestId,
    };
  });
}

async function asset(
  t: ReturnType<typeof convexTest>,
  profileId: Id<"profiles">,
  ownerId: Id<"customers">,
) {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["source"], { type: "image/png" }));
    const previewStorageId = await ctx.storage.store(new Blob(["preview"], { type: "image/png" }));
    const assetId = await ctx.db.insert("profileMediaAssets", {
      storageId,
      previewStorageId,
      profileId,
      ownerId,
      contentType: "image/png",
      size: 6,
      width: 100,
      height: 100,
      createdAt: 1,
    });
    return { assetId, storageId, previewStorageId };
  });
}

const media = (assetId: Id<"profileMediaAssets">, heroHeight = 320) => ({
  heroHeight,
  autoplay: true,
  slideshow: [{ assetId, altText: "A" }],
});

const mediaWithBackground = (assetId: Id<"profileMediaAssets">) => ({
  ...media(assetId),
  background: {
    assetId,
    altText: "Backdrop",
    positionX: 25,
    positionY: 75,
  },
});

describe("profile media hardening", () => {
  it("enforces ownership, media limits, ranges, and stale revisions", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const owner = t.withIdentity(identity(ids.ownerUserId));
    const otherAsset = await asset(t, ids.otherProfileId, ids.otherId);

    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: ids.ownerProfileId,
        draft: content("owner", media(otherAsset.assetId)),
        expectedMediaRevision: 0,
      }),
    ).rejects.toThrow("does not belong");

    const ownAsset = await asset(t, ids.ownerProfileId, ids.ownerId);
    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: ids.ownerProfileId,
        draft: content("owner", media(ownAsset.assetId, 0)),
        expectedMediaRevision: 0,
      }),
    ).rejects.toThrow("Hero height");
    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: ids.ownerProfileId,
        draft: content("owner", {
          ...media(ownAsset.assetId),
          slideshow: Array.from({ length: 11 }, () => ({
            assetId: ownAsset.assetId,
            altText: "A",
          })),
        }),
        expectedMediaRevision: 0,
      }),
    ).rejects.toThrow("at most ten");

    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner", media(ownAsset.assetId)),
      expectedMediaRevision: 0,
    });
    await t.run((ctx) => ctx.db.patch(ids.ownerProfileId, { mediaRevision: 1 }));
    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: ids.ownerProfileId,
        draft: content("owner", media(ownAsset.assetId)),
        expectedMediaRevision: 0,
      }),
    ).rejects.toThrow("changed elsewhere");
  });

  it("allows only the profile owner to upload media", async () => {
    vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const image = await sharp({
      create: { width: 32, height: 32, channels: 4, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const request = {
      method: "POST" as const,
      headers: {
        Origin: "http://localhost:3000",
        "X-Profile-Id": ids.ownerProfileId,
        "X-Media-Revision": "0",
        "Content-Type": "image/png",
      },
      body: new Uint8Array(image),
    };

    const adminResponse = await t
      .withIdentity(identity(ids.adminUserId))
      .fetch("/profile-media-upload", request);
    expect(adminResponse.status).toBe(403);
    expect(await adminResponse.text()).toContain("Profile access denied");

    const ownerResponse = await t
      .withIdentity(identity(ids.ownerUserId))
      .fetch("/profile-media-upload", request);
    expect(ownerResponse.status).toBe(200);
    expect((await ownerResponse.json()).mediaRevision).toBe(1);
    vi.unstubAllEnvs();
  });

  it("audits same-scope administrator media uploads and rejects customer use of the admin route", async () => {
    vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const crossScopeProfileId = await t.run(async (ctx) => {
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
        draft: content("isolated"),
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.patch(ownerId, { profileId });
      return profileId;
    });
    const image = await sharp({
      create: { width: 32, height: 32, channels: 4, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const request = (profileId: Id<"profiles">) => ({
      method: "POST" as const,
      headers: {
        Origin: "http://localhost:3000",
        "X-Profile-Id": profileId,
        "X-Media-Revision": "0",
        "Content-Type": "image/png",
      },
      body: new Uint8Array(image),
    });

    const customerResponse = await t
      .withIdentity(identity(ids.ownerUserId))
      .fetch("/admin-profile-media-upload", request(ids.ownerProfileId));
    expect(customerResponse.status).toBe(403);

    const crossScopeResponse = await t
      .withIdentity(identity(ids.adminUserId))
      .fetch("/admin-profile-media-upload", request(crossScopeProfileId));
    expect(crossScopeResponse.status).toBe(403);

    const adminResponse = await t
      .withIdentity(identity(ids.adminUserId))
      .fetch("/admin-profile-media-upload", request(ids.ownerProfileId));
    expect(adminResponse.status).toBe(200);
    expect((await adminResponse.json()).mediaRevision).toBe(1);
    const audit = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_profileId", (query) => query.eq("profileId", ids.ownerProfileId))
        .collect(),
    );
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "profile.media_uploaded",
          actorUserId: ids.adminUserId,
          accountId: ids.ownerId,
          profileId: ids.ownerProfileId,
        }),
      ]),
    );
    vi.unstubAllEnvs();
  });

  it("rejects administrator media jobs after the actor account is deleted", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const jobId = await t.mutation(internal.profileMedia.createUploadJob, {
      profileId: ids.ownerProfileId,
      ownerId: ids.ownerId,
      actorUserId: ids.adminUserId,
      accessMode: "admin",
      sha256: "a".repeat(64),
      expectedMediaRevision: 0,
    });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["source"])));
    const previewStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["preview"])));
    await t.mutation(internal.profileMedia.markUploadJob, {
      jobId,
      storageId,
      previewStorageId,
    });
    await t.run((ctx) => ctx.db.delete(ids.adminId));

    await expect(
      t.mutation(internal.profileMedia.attach, {
        jobId,
        storageId,
        previewStorageId,
        contentType: "image/png",
        size: 6,
        width: 100,
        height: 100,
      }),
    ).rejects.toThrow("Upload job does not match this media set");
    await expect(
      t.mutation(internal.profileMedia.createUploadJob, {
        profileId: ids.ownerProfileId,
        ownerId: ids.ownerId,
        actorUserId: ids.adminUserId,
        accessMode: "admin",
        sha256: "b".repeat(64),
        expectedMediaRevision: 0,
      }),
    ).rejects.toThrow("Profile access denied");
    expect((await t.run((ctx) => ctx.db.get(ids.ownerProfileId)))?.mediaRevision ?? 0).toBe(0);
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("auditLogs")
          .withIndex("by_profileId", (query) => query.eq("profileId", ids.ownerProfileId))
          .collect(),
      ),
    ).toHaveLength(0);
  });

  it("does not finish an admin media job after the admin role is demoted on their own profile", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const jobId = await t.mutation(internal.profileMedia.createUploadJob, {
      profileId: ids.adminProfileId,
      ownerId: ids.adminId,
      actorUserId: ids.adminUserId,
      accessMode: "admin",
      sha256: "c".repeat(64),
      expectedMediaRevision: 0,
    });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["source"])));
    const previewStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["preview"])));
    await t.mutation(internal.profileMedia.markUploadJob, {
      jobId,
      storageId,
      previewStorageId,
    });
    await t.run((ctx) => ctx.db.patch(ids.adminId, { role: "customer" }));

    await expect(
      t.mutation(internal.profileMedia.attach, {
        jobId,
        storageId,
        previewStorageId,
        contentType: "image/png",
        size: 6,
        width: 100,
        height: 100,
      }),
    ).rejects.toThrow("Upload job does not match this media set");
    expect((await t.run((ctx) => ctx.db.get(ids.adminProfileId)))?.mediaRevision ?? 0).toBe(0);
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("auditLogs")
          .withIndex("by_profileId", (query) => query.eq("profileId", ids.adminProfileId))
          .collect(),
      ),
    ).toHaveLength(0);
  });

  it("allows only the profile owner to remove media", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const item = await asset(t, ids.ownerProfileId, ids.ownerId);
    const args = {
      profileId: ids.ownerProfileId,
      assetId: item.assetId,
      expectedMediaRevision: 0,
    };

    await expect(
      t.withIdentity(identity(ids.adminUserId)).mutation(api.profileMedia.remove, args),
    ).rejects.toThrow("Profile access denied");
    await expect(
      t.withIdentity(identity(ids.ownerUserId)).mutation(api.profileMedia.remove, args),
    ).resolves.toEqual({ mediaRevision: 1 });
    expect(await t.run((ctx) => ctx.storage.getUrl(item.storageId))).toBeNull();
  });

  it("preserves omitted media and cleans replaced or cleared draft assets safely", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const owner = t.withIdentity(identity(ids.ownerUserId));
    const oldItem = await asset(t, ids.ownerProfileId, ids.ownerId);
    const replacement = await asset(t, ids.ownerProfileId, ids.ownerId);

    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner", media(oldItem.assetId)),
      expectedMediaRevision: 0,
    });
    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner"),
    });
    expect((await t.run((ctx) => ctx.db.get(ids.ownerProfileId)))?.draft.media).toBeDefined();

    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner", media(replacement.assetId)),
      expectedMediaRevision: 0,
    });
    expect(await t.run((ctx) => ctx.storage.getUrl(oldItem.storageId))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(replacement.storageId))).not.toBeNull();

    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner", null as never),
      expectedMediaRevision: 0,
    });
    expect((await t.run((ctx) => ctx.db.get(ids.ownerProfileId)))?.draft.media).toBeUndefined();
    expect(await t.run((ctx) => ctx.storage.getUrl(replacement.storageId))).toBeNull();
  });

  it("rejects oversized media dimensions before preview generation", async () => {
    vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const image = await sharp({
      create: { width: 12_001, height: 1, channels: 4, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const response = await t
      .withIdentity(identity(ids.ownerUserId))
      .fetch("/profile-media-upload", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "X-Profile-Id": ids.ownerProfileId,
          "X-Media-Revision": "0",
          "Content-Type": "image/png",
        },
        body: new Uint8Array(image),
      });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("dimensions exceed");
    vi.unstubAllEnvs();
  });

  it("allows admin owners while rejecting admins on another customer's profile", async () => {
    vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const image = await sharp({
      create: { width: 32, height: 32, channels: 4, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const adminUploadResponse = await t
      .withIdentity(identity(ids.adminUserId))
      .fetch("/profile-media-upload", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "X-Profile-Id": ids.adminProfileId,
          "X-Media-Revision": "0",
          "Content-Type": "image/png",
        },
        body: new Uint8Array(image),
      });
    expect(adminUploadResponse.status).toBe(200);
    const adminUpload = await adminUploadResponse.json();
    expect(adminUpload.mediaRevision).toBe(1);

    const adminItem = await asset(t, ids.adminProfileId, ids.adminId);
    await expect(
      t.withIdentity(identity(ids.adminUserId)).mutation(api.profileMedia.remove, {
        profileId: ids.adminProfileId,
        assetId: adminItem.assetId,
        expectedMediaRevision: 1,
      }),
    ).resolves.toEqual({ mediaRevision: 2 });
    expect(await t.run((ctx) => ctx.storage.getUrl(adminItem.storageId))).toBeNull();

    const ownerItem = await asset(t, ids.ownerProfileId, ids.ownerId);
    await expect(
      t.withIdentity(identity(ids.adminUserId)).mutation(api.profileMedia.remove, {
        profileId: ids.ownerProfileId,
        assetId: ownerItem.assetId,
        expectedMediaRevision: 0,
      }),
    ).rejects.toThrow("Profile access denied");

    const otherProfileUploadResponse = await t
      .withIdentity(identity(ids.adminUserId))
      .fetch("/profile-media-upload", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "X-Profile-Id": ids.ownerProfileId,
          "X-Media-Revision": "0",
          "Content-Type": "image/png",
        },
        body: new Uint8Array(image),
      });
    expect(otherProfileUploadResponse.status).toBe(403);
    expect(await otherProfileUploadResponse.text()).toContain("Profile access denied");
    vi.unstubAllEnvs();
  });

  it("keeps draft media private and gives direct/card publication parity", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const owner = t.withIdentity(identity(ids.ownerUserId));
    const item = await asset(t, ids.ownerProfileId, ids.ownerId);
    await t.run((ctx) =>
      ctx.db.insert("cards", {
        cardUrl: "https://cards.test/owner",
        token: "owner",
        profileId: ids.ownerProfileId,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner", media(item.assetId)),
      expectedMediaRevision: 0,
    });
    expect(await t.query(api.profiles.publicBySlug, { slug: "owner" })).toBeNull();
    await owner.mutation(api.profiles.publish, {
      profileId: ids.ownerProfileId,
      expectedMediaRevision: 0,
    });
    const direct = await t.query(api.profiles.publicBySlug, { slug: "owner" });
    const card = await t.query(api.cards.resolve, { token: "owner" });
    const previewUrl = await t.run((ctx) => ctx.storage.getUrl(item.previewStorageId));
    expect(direct?.media?.slideshow[0]).toMatchObject({ alt: "A", src: expect.any(String) });
    expect(direct?.media?.slideshow[0]?.src).toBe(previewUrl);
    expect(card).toMatchObject({ profile: { media: direct?.media } });
    expect(direct?.media?.slideshow[0]).not.toHaveProperty("assetId");
  });

  it("saves and publishes a slideshow image with an empty description", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const owner = t.withIdentity(identity(ids.ownerUserId));
    const item = await asset(t, ids.ownerProfileId, ids.ownerId);

    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner", {
        ...media(item.assetId),
        slideshow: [{ assetId: item.assetId, altText: "" }],
      }),
      expectedMediaRevision: 0,
    });
    expect((await t.run((ctx) => ctx.db.get(ids.ownerProfileId)))?.draft.media?.slideshow).toEqual([
      { assetId: item.assetId, altText: "" },
    ]);

    await owner.mutation(api.profiles.publish, {
      profileId: ids.ownerProfileId,
      expectedMediaRevision: 0,
    });
    const publicProfile = await t.query(api.profiles.publicBySlug, { slug: "owner" });
    expect(publicProfile?.media?.slideshow).toEqual([
      { src: await t.run((ctx) => ctx.storage.getUrl(item.previewStorageId)), alt: "" },
    ]);
  });

  it("round-trips owner media URLs without persisting them", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const owner = t.withIdentity(identity(ids.ownerUserId));
    const item = await asset(t, ids.ownerProfileId, ids.ownerId);
    const draftMedia = {
      ...mediaWithBackground(item.assetId),
      background: {
        ...mediaWithBackground(item.assetId).background,
        url: "https://cdn.test/background.jpg",
        previewUrl: "https://cdn.test/background-preview.jpg",
      },
      slideshow: [
        {
          assetId: item.assetId,
          altText: "A",
          url: "https://cdn.test/source.jpg",
          previewUrl: "https://cdn.test/preview.jpg",
        },
      ],
    };

    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner", draftMedia),
      expectedMediaRevision: 0,
    });
    const persisted = await t.run((ctx) => ctx.db.get(ids.ownerProfileId));
    expect(persisted?.draft.media?.background).not.toHaveProperty("url");
    expect(persisted?.draft.media?.background).not.toHaveProperty("previewUrl");
    expect(persisted?.draft.media?.slideshow[0]).not.toHaveProperty("url");
    expect(persisted?.draft.media?.slideshow[0]).not.toHaveProperty("previewUrl");

    const projected = await owner.query(api.profiles.mine, {});
    const projectedMedia = (projected?.draft as { media?: ProfileMedia } | undefined)?.media;
    expect(projectedMedia?.background).toMatchObject({
      assetId: item.assetId,
      url: expect.any(String),
      previewUrl: expect.any(String),
    });
    expect(projectedMedia?.slideshow[0]).toMatchObject({
      assetId: item.assetId,
      url: expect.any(String),
      previewUrl: expect.any(String),
    });
  });

  it("omits owner media when its referenced asset is invalid", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const owner = t.withIdentity(identity(ids.ownerUserId));
    const otherAsset = await asset(t, ids.otherProfileId, ids.otherId);
    await t.run(async (ctx) => {
      const profile = await ctx.db.get(ids.ownerProfileId);
      if (profile === null) throw new Error("Profile was not seeded");
      await ctx.db.patch(ids.ownerProfileId, {
        draft: { ...profile.draft, media: media(otherAsset.assetId) },
      });
    });

    const projected = await owner.query(api.profiles.mine, {});
    expect((projected?.draft as { media?: ProfileMedia } | undefined)?.media).toBeUndefined();
  });

  it("blocks pending publication and cleans abandoned assets/jobs without deleting referenced media", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const owner = t.withIdentity(identity(ids.ownerUserId));
    const item = await asset(t, ids.ownerProfileId, ids.ownerId);
    const jobId = await t.mutation(internal.profileMedia.createUploadJob, {
      profileId: ids.ownerProfileId,
      ownerId: ids.ownerId,
      sha256: "a".repeat(64),
      expectedMediaRevision: 0,
    });
    await expect(
      owner.mutation(api.profiles.publish, { profileId: ids.ownerProfileId }),
    ).rejects.toThrow("upload in progress");
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, {
        status: "attached",
        storageId: item.storageId,
        createdAt: 1,
        uploadWindowEndsAt: 1,
      });
      await ctx.db.patch(ids.ownerProfileId, {
        draft: { ...(await ctx.db.get(ids.ownerProfileId))!.draft, media: media(item.assetId) },
      });
    });
    const result = await t.mutation(internal.profileMediaCleanup.reconcileExpired, {
      now: 2 * 24 * 60 * 60 * 1000,
    });
    expect(result.retained).toBeGreaterThan(0);
    expect(await t.run((ctx) => ctx.storage.getUrl(item.storageId))).not.toBeNull();
    expect(await t.query(internal.profileMedia.getUploadJob, { jobId })).toBeNull();

    const orphanJob = await t.mutation(internal.profileMedia.createUploadJob, {
      profileId: ids.ownerProfileId,
      ownerId: ids.ownerId,
      sha256: "b".repeat(64),
      expectedMediaRevision: 0,
    });
    const orphanStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["orphan"])));
    await t.mutation(internal.profileMedia.markUploadJob, {
      jobId: orphanJob,
      storageId: orphanStorageId,
    });
    const crashJob = await t.mutation(internal.profileMedia.createUploadJob, {
      profileId: ids.ownerProfileId,
      ownerId: ids.ownerId,
      sha256: "placeholder",
      expectedMediaRevision: 0,
    });
    const crashStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["crashed"])));
    const crashSha256 = await t.run(
      async (ctx) => (await ctx.db.system.get("_storage", crashStorageId))!.sha256,
    );
    await t.run(async (ctx) => {
      const job = (await ctx.db.get(crashJob))!;
      await ctx.db.patch(crashJob, {
        sha256: crashSha256,
        scanSourceCandidateId: crashStorageId,
        createdAt: job.createdAt,
        uploadWindowEndsAt: job.uploadWindowEndsAt,
      });
    });
    const otherProfileImageStorageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["other-profile-image"])),
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("profileImages", {
        storageId: otherProfileImageStorageId,
        profileId: ids.otherProfileId,
        ownerId: ids.otherId,
        contentType: "image/png",
        size: 18,
        createdAt: 1,
      });
    });
    const crossProfileJob = await t.mutation(internal.profileMedia.createUploadJob, {
      profileId: ids.ownerProfileId,
      ownerId: ids.ownerId,
      sha256: "placeholder",
      expectedMediaRevision: 0,
    });
    const crossProfileSha256 = await t.run(
      async (ctx) => (await ctx.db.system.get("_storage", otherProfileImageStorageId))!.sha256,
    );
    await t.run(async (ctx) => {
      const job = (await ctx.db.get(crossProfileJob))!;
      await ctx.db.patch(crossProfileJob, {
        sha256: crossProfileSha256,
        scanSourceCandidateId: otherProfileImageStorageId,
        createdAt: job.createdAt,
        uploadWindowEndsAt: job.uploadWindowEndsAt,
      });
    });
    await t
      .withIdentity(identity(ids.adminUserId))
      .mutation(api.customers.approveDeletion, { requestId: ids.deletionRequestId });
    expect(await t.query(internal.profileMedia.getUploadJob, { jobId: orphanJob })).toBeNull();
    expect(await t.query(internal.profileMedia.getUploadJob, { jobId: crashJob })).toBeNull();
    expect(
      await t.query(internal.profileMedia.getUploadJob, { jobId: crossProfileJob }),
    ).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(orphanStorageId))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(crashStorageId))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(otherProfileImageStorageId))).not.toBeNull();
  });

  it("cleans failed upload jobs and their expired storage", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const failedJob = await t.mutation(internal.profileMedia.createUploadJob, {
      profileId: ids.ownerProfileId,
      ownerId: ids.ownerId,
      sha256: "c".repeat(64),
      expectedMediaRevision: 0,
    });
    const failedStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["failed"])));
    await t.mutation(internal.profileMedia.markUploadJob, {
      jobId: failedJob,
      storageId: failedStorageId,
      status: "failed",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(failedJob, { createdAt: 1, uploadWindowEndsAt: 1 });
    });

    const result = await t.mutation(internal.profileMediaCleanup.reconcileExpired, {
      now: 2 * 24 * 60 * 60 * 1000,
    });

    expect(result.deleted).toBeGreaterThan(0);
    expect(await t.query(internal.profileMedia.getUploadJob, { jobId: failedJob })).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(failedStorageId))).toBeNull();
  });

  it("deletes attached media assets that are no longer referenced", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const item = await asset(t, ids.ownerProfileId, ids.ownerId);
    const jobId = await t.mutation(internal.profileMedia.createUploadJob, {
      profileId: ids.ownerProfileId,
      ownerId: ids.ownerId,
      sha256: "d".repeat(64),
      expectedMediaRevision: 0,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, {
        status: "attached",
        storageId: item.storageId,
        previewStorageId: item.previewStorageId,
        createdAt: 1,
        uploadWindowEndsAt: 1,
      });
    });

    const result = await t.mutation(internal.profileMediaCleanup.reconcileExpired, {
      now: 2 * 24 * 60 * 60 * 1000,
    });

    expect(result.deleted).toBeGreaterThan(0);
    expect(await t.run((ctx) => ctx.db.get(item.assetId))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(item.storageId))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(item.previewStorageId))).toBeNull();
  });

  it("reconciles storage blobs when upload IDs were never recorded and retains ambiguity", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const orphanJob = await t.mutation(internal.profileMedia.createUploadJob, {
      profileId: ids.ownerProfileId,
      ownerId: ids.ownerId,
      sha256: "placeholder",
      expectedMediaRevision: 0,
    });
    const orphanStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["crashed-source"])));
    const orphanSha256 = await t.run(
      async (ctx) => (await ctx.db.system.get("_storage", orphanStorageId))!.sha256,
    );
    await t.run(async (ctx) => {
      const job = (await ctx.db.get(orphanJob))!;
      await ctx.db.patch(orphanJob, {
        sha256: orphanSha256,
        createdAt: job.createdAt,
        uploadWindowEndsAt: Date.now() + 10 * 60 * 1000,
      });
    });
    await t.mutation(internal.profileMediaCleanup.reconcileExpired, {
      now: Date.now() + 2 * 24 * 60 * 60 * 1000,
    });
    expect(await t.query(internal.profileMedia.getUploadJob, { jobId: orphanJob })).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(orphanStorageId))).toBeNull();

    const ambiguousJob = await t.mutation(internal.profileMedia.createUploadJob, {
      profileId: ids.ownerProfileId,
      ownerId: ids.ownerId,
      sha256: "placeholder",
      expectedMediaRevision: 0,
    });
    const first = await t.run((ctx) => ctx.storage.store(new Blob(["ambiguous-source"])));
    const second = await t.run((ctx) => ctx.storage.store(new Blob(["ambiguous-source"])));
    const ambiguousSha256 = await t.run(
      async (ctx) => (await ctx.db.system.get("_storage", first))!.sha256,
    );
    await t.run(async (ctx) => {
      const job = (await ctx.db.get(ambiguousJob))!;
      await ctx.db.patch(ambiguousJob, {
        sha256: ambiguousSha256,
        createdAt: job.createdAt,
        uploadWindowEndsAt: Date.now() + 10 * 60 * 1000,
      });
    });
    const result = await t.mutation(internal.profileMediaCleanup.reconcileExpired, {
      now: Date.now() + 2 * 24 * 60 * 60 * 1000,
    });
    expect(result.skipped).toBeGreaterThan(0);
    expect(
      await t.query(internal.profileMedia.getUploadJob, { jobId: ambiguousJob }),
    ).not.toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(first))).not.toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(second))).not.toBeNull();
  });
});
