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

async function claimCardOwnerFeatures(
  t: ReturnType<typeof convexTest>,
  profileId: Id<"profiles">,
  token = "claimed-owner",
) {
  await t.run((ctx) =>
    ctx.db.insert("cards", {
      cardUrl: `https://cards.test/${token}`,
      token,
      profileId,
      status: "active",
      claimCodeClaimedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
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

async function draftRevision(t: ReturnType<typeof convexTest>, profileId: Id<"profiles">) {
  return await t.run(async (ctx) => (await ctx.db.get(profileId))?.draftRevision ?? 0);
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
  it("preserves over-limit media on rejection and cleans up only after explicit trimming", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const owner = t.withIdentity(identity(ids.ownerUserId));
    await claimCardOwnerFeatures(t, ids.ownerProfileId);
    const existing = await asset(t, ids.ownerProfileId, ids.ownerId);
    const slides = await Promise.all(
      Array.from({ length: 6 }, () => asset(t, ids.ownerProfileId, ids.ownerId)),
    );
    const mediaAssets = [existing, ...slides];
    const assetRecordsBefore = await Promise.all(
      mediaAssets.map(({ assetId }) => t.run((ctx) => ctx.db.get(assetId))),
    );
    const expectMediaAssetsPreserved = async () => {
      for (const [index, item] of mediaAssets.entries()) {
        expect(await t.run((ctx) => ctx.db.get(item.assetId))).toEqual(assetRecordsBefore[index]);
        expect(await t.run((ctx) => ctx.storage.getUrl(item.storageId))).not.toBeNull();
        expect(await t.run((ctx) => ctx.storage.getUrl(item.previewStorageId))).not.toBeNull();
      }
    };
    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner", media(existing.assetId)),
      expectedDraftRevision: await draftRevision(t, ids.ownerProfileId),
      expectedMediaRevision: 0,
    });
    await owner.mutation(api.profiles.publish, {
      profileId: ids.ownerProfileId,
      expectedMediaRevision: 0,
    });
    const beforeSave = await t.run((ctx) => ctx.db.get(ids.ownerProfileId));
    const overLimit = {
      ...media(existing.assetId),
      slideshow: slides.map(({ assetId }) => ({ assetId, altText: "Slide" })),
    };
    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: ids.ownerProfileId,
        draft: content("owner", overLimit),
        expectedDraftRevision: beforeSave!.draftRevision ?? 0,
        expectedMediaRevision: beforeSave!.mediaRevision ?? 0,
      }),
    ).rejects.toThrow("at most 5 images");
    expect(await t.run((ctx) => ctx.db.get(ids.ownerProfileId))).toEqual(beforeSave);
    await expectMediaAssetsPreserved();

    await t.run(async (ctx) => {
      const profile = await ctx.db.get(ids.ownerProfileId);
      if (profile === null || profile.published === null || profile.published === undefined) {
        throw new Error("Published profile was not seeded");
      }
      await ctx.db.patch(ids.ownerProfileId, {
        draft: { ...profile.draft, media: overLimit },
        published: { ...profile.published, media: overLimit },
      });
    });
    const beforePublish = await t.run((ctx) => ctx.db.get(ids.ownerProfileId));
    await expect(
      owner.mutation(api.profiles.publish, {
        profileId: ids.ownerProfileId,
        expectedMediaRevision: beforePublish!.mediaRevision ?? 0,
      }),
    ).rejects.toThrow("at most 5 images");
    expect(await t.run((ctx) => ctx.db.get(ids.ownerProfileId))).toEqual(beforePublish);
    await expectMediaAssetsPreserved();

    const trimmed = { ...overLimit, slideshow: overLimit.slideshow.slice(0, 5) };
    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner", trimmed),
      expectedDraftRevision: await draftRevision(t, ids.ownerProfileId),
      expectedMediaRevision: beforePublish!.mediaRevision ?? 0,
    });
    const trimmedProfile = await t.run((ctx) => ctx.db.get(ids.ownerProfileId));
    expect(trimmedProfile?.draft.media?.slideshow).toEqual(trimmed.slideshow);
    expect(trimmedProfile?.published?.media?.slideshow).toEqual(overLimit.slideshow);
    expect(await t.run((ctx) => ctx.db.get(slides[5]!.assetId))).not.toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(slides[5]!.storageId))).not.toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(slides[5]!.previewStorageId))).not.toBeNull();

    await owner.mutation(api.profiles.publish, {
      profileId: ids.ownerProfileId,
      expectedMediaRevision: trimmedProfile!.mediaRevision ?? 0,
    });
    const republishedProfile = await t.run((ctx) => ctx.db.get(ids.ownerProfileId));
    expect(republishedProfile?.draft.media?.slideshow).toEqual(trimmed.slideshow);
    expect(republishedProfile?.published?.media?.slideshow).toEqual(trimmed.slideshow);
    expect(await t.run((ctx) => ctx.db.get(slides[5]!.assetId))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(slides[5]!.storageId))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(slides[5]!.previewStorageId))).toBeNull();
    for (const item of slides.slice(0, 5)) {
      expect(await t.run((ctx) => ctx.db.get(item.assetId))).not.toBeNull();
      expect(await t.run((ctx) => ctx.storage.getUrl(item.storageId))).not.toBeNull();
      expect(await t.run((ctx) => ctx.storage.getUrl(item.previewStorageId))).not.toBeNull();
    }
  });

  it("enforces ownership, media limits, ranges, and stale revisions", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const owner = t.withIdentity(identity(ids.ownerUserId));
    await claimCardOwnerFeatures(t, ids.ownerProfileId);
    const otherAsset = await asset(t, ids.otherProfileId, ids.otherId);

    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: ids.ownerProfileId,
        draft: content("owner", media(otherAsset.assetId)),
        expectedDraftRevision: await draftRevision(t, ids.ownerProfileId),
        expectedMediaRevision: 0,
      }),
    ).rejects.toThrow("does not belong");

    const ownAsset = await asset(t, ids.ownerProfileId, ids.ownerId);
    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: ids.ownerProfileId,
        draft: content("owner", media(ownAsset.assetId, 0)),
        expectedDraftRevision: await draftRevision(t, ids.ownerProfileId),
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
        expectedDraftRevision: await draftRevision(t, ids.ownerProfileId),
        expectedMediaRevision: 0,
      }),
    ).rejects.toThrow("at most 5");

    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner", media(ownAsset.assetId)),
      expectedDraftRevision: await draftRevision(t, ids.ownerProfileId),
      expectedMediaRevision: 0,
    });
    await t.run((ctx) => ctx.db.patch(ids.ownerProfileId, { mediaRevision: 1 }));
    await expect(
      owner.mutation(api.profiles.saveDraft, {
        profileId: ids.ownerProfileId,
        draft: content("owner", media(ownAsset.assetId)),
        expectedDraftRevision: await draftRevision(t, ids.ownerProfileId),
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
        "X-Media-Target": "background",
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
        "X-Media-Target": "background",
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

  it("rejects administrator media uploads for customers entering deletion", async () => {
    vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    await t.run((ctx) =>
      ctx.db.patch(ids.ownerId, { status: "deleted", deletionStatus: "deleted" }),
    );
    const image = await sharp({
      create: { width: 32, height: 32, channels: 4, background: "#ffffff" },
    })
      .png()
      .toBuffer();

    const response = await t
      .withIdentity(identity(ids.adminUserId))
      .fetch("/admin-profile-media-upload", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000",
          "X-Profile-Id": ids.ownerProfileId,
          "X-Media-Revision": "0",
          "X-Media-Target": "background",
          "Content-Type": "image/png",
        },
        body: new Uint8Array(image),
      });

    expect(response.status).toBe(403);
    expect(await response.text()).toContain("Profile access denied");
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("profileMediaUploadJobs")
          .withIndex("by_profileId", (query) => query.eq("profileId", ids.ownerProfileId))
          .collect(),
      ),
    ).toEqual([]);
    vi.unstubAllEnvs();
  });

  it("rejects administrator upload-job creation after the profile owner is deleted", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    await t.run((ctx) =>
      ctx.db.patch(ids.ownerId, { status: "deleted", deletionStatus: "deleted" }),
    );

    await expect(
      t.mutation(internal.profileMedia.createUploadJob, {
        profileId: ids.ownerProfileId,
        ownerId: ids.ownerId,
        actorUserId: ids.adminUserId,
        accessMode: "admin",
        sha256: "a".repeat(64),
        expectedMediaRevision: 0,
        target: "background",
      }),
    ).rejects.toThrow("Profile access denied.");
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("profileMediaUploadJobs")
          .withIndex("by_profileId", (query) => query.eq("profileId", ids.ownerProfileId))
          .take(1),
      ),
    ).toEqual([]);
  });

  it("rejects an existing administrator media job after its customer owner is deleted", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const jobId = await t.mutation(internal.profileMedia.createUploadJob, {
      profileId: ids.ownerProfileId,
      ownerId: ids.ownerId,
      actorUserId: ids.adminUserId,
      accessMode: "admin",
      sha256: "a".repeat(64),
      expectedMediaRevision: 0,
      target: "background",
    });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["source"])));
    const previewStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["preview"])));
    await t.mutation(internal.profileMedia.markUploadJob, {
      jobId,
      storageId,
      previewStorageId,
    });
    await t.run((ctx) =>
      ctx.db.patch(ids.ownerId, { status: "deleted", deletionStatus: "deleted" }),
    );

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
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("profileMediaAssets")
          .withIndex("by_profileId", (query) => query.eq("profileId", ids.ownerProfileId))
          .collect(),
      ),
    ).toEqual([]);
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
      target: "background",
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
        target: "background",
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
      target: "background",
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
    await claimCardOwnerFeatures(t, ids.ownerProfileId);
    const oldItem = await asset(t, ids.ownerProfileId, ids.ownerId);
    const replacement = await asset(t, ids.ownerProfileId, ids.ownerId);

    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner", media(oldItem.assetId)),
      expectedDraftRevision: await draftRevision(t, ids.ownerProfileId),
      expectedMediaRevision: 0,
    });
    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner"),
      expectedDraftRevision: await draftRevision(t, ids.ownerProfileId),
    });
    expect((await t.run((ctx) => ctx.db.get(ids.ownerProfileId)))?.draft.media).toBeDefined();

    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner", media(replacement.assetId)),
      expectedDraftRevision: await draftRevision(t, ids.ownerProfileId),
      expectedMediaRevision: 0,
    });
    expect(await t.run((ctx) => ctx.storage.getUrl(oldItem.storageId))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(replacement.storageId))).not.toBeNull();

    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner", null as never),
      expectedDraftRevision: await draftRevision(t, ids.ownerProfileId),
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
          "X-Media-Target": "background",
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
          "X-Media-Target": "background",
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
          "X-Media-Target": "background",
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
    await claimCardOwnerFeatures(t, ids.ownerProfileId, "owner");
    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner", media(item.assetId)),
      expectedDraftRevision: await draftRevision(t, ids.ownerProfileId),
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
    await claimCardOwnerFeatures(t, ids.ownerProfileId);

    await owner.mutation(api.profiles.saveDraft, {
      profileId: ids.ownerProfileId,
      draft: content("owner", {
        ...media(item.assetId),
        slideshow: [{ assetId: item.assetId, altText: "" }],
      }),
      expectedDraftRevision: await draftRevision(t, ids.ownerProfileId),
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
    await claimCardOwnerFeatures(t, ids.ownerProfileId);
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
      expectedDraftRevision: await draftRevision(t, ids.ownerProfileId),
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
      target: "background",
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
      target: "background",
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
      target: "background",
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
      target: "background",
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

  it("does not change or schedule a continuation for a truncated dry-run job page", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const now = Date.now() + 2 * 24 * 60 * 60 * 1000;
    const jobIds = await t.run(async (ctx) => {
      const created: Id<"profileMediaUploadJobs">[] = [];
      for (let index = 0; index < 33; index += 1)
        created.push(
          await ctx.db.insert("profileMediaUploadJobs", {
            profileId: ids.ownerProfileId,
            ownerId: ids.ownerId,
            sha256: `${index}`.padStart(64, "0"),
            expectedMediaRevision: 0,
            status: "pending",
            createdAt: now - 2 * 24 * 60 * 60 * 1000,
            uploadWindowEndsAt: now - 24 * 60 * 60 * 1000,
          }),
        );
      return created;
    });
    expect(jobIds).toHaveLength(33);
    const jobsBefore = await t.run(async (ctx) =>
      Promise.all(jobIds.map((jobId) => ctx.db.get(jobId))),
    );
    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    vi.useFakeTimers();
    try {
      await t.mutation(internal.profileMediaCleanup.reconcileExpired, {
        now,
        dryRun: true,
        jobBatchSize: 32,
      });

      const jobsAfter = await t.run(async (ctx) =>
        Promise.all(jobIds.map((jobId) => ctx.db.get(jobId))),
      );
      const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());

      expect.soft(jobsAfter).toEqual(jobsBefore);
      expect.soft(jobsAfter.every((job) => job?.scanCursor === undefined)).toBe(true);
      expect.soft(scheduled).toEqual([]);
      expect(logSpy).toHaveBeenCalledWith(
        "profile media orphan reconciliation page",
        expect.objectContaining({
          status: "pending",
          jobCount: 32,
          hasMore: true,
          dryRun: true,
          continuationScheduled: false,
        }),
      );
    } finally {
      vi.useRealTimers();
      logSpy.mockRestore();
    }
  });

  it("does not change or schedule a continuation for a truncated dry-run storage page", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const storageIds = await t.run(async (ctx) => {
      const created: Id<"_storage">[] = [];
      for (let index = 0; index < 65; index += 1)
        created.push(await ctx.storage.store(new Blob([`dry-run-storage-${index}`])));
      return created;
    });
    const metadata = await t.run(async (ctx) =>
      Promise.all(storageIds.map((storageId) => ctx.db.system.get("_storage", storageId))),
    );
    expect(storageIds).toHaveLength(65);
    const createdAt = Math.min(...metadata.map((item) => item!._creationTime)) - 1;
    const uploadWindowEndsAt = Math.max(...metadata.map((item) => item!._creationTime)) + 1;
    const jobId = await t.run((ctx) =>
      ctx.db.insert("profileMediaUploadJobs", {
        profileId: ids.ownerProfileId,
        ownerId: ids.ownerId,
        sha256: "f".repeat(64),
        expectedMediaRevision: 0,
        status: "pending",
        createdAt,
        uploadWindowEndsAt,
      }),
    );
    const jobBefore = await t.run((ctx) => ctx.db.get(jobId));
    const storageBefore = await t.run((ctx) =>
      Promise.all(storageIds.map((storageId) => ctx.storage.getUrl(storageId))),
    );

    vi.useFakeTimers();
    try {
      await t.mutation(internal.profileMediaCleanup.reconcileOneJob, {
        jobId,
        now: uploadWindowEndsAt + 1,
        dryRun: true,
      });

      const jobAfter = await t.run((ctx) => ctx.db.get(jobId));
      const storageAfter = await t.run((ctx) =>
        Promise.all(storageIds.map((storageId) => ctx.storage.getUrl(storageId))),
      );
      const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());

      expect.soft(jobAfter).toEqual(jobBefore);
      expect.soft(jobAfter?.scanCursor).toBeUndefined();
      expect.soft(storageAfter).toEqual(storageBefore);
      expect.soft(storageAfter.every((url) => url !== null)).toBe(true);
      expect.soft(scheduled).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cleans failed upload jobs and their expired storage", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const failedJob = await t.mutation(internal.profileMedia.createUploadJob, {
      profileId: ids.ownerProfileId,
      ownerId: ids.ownerId,
      sha256: "c".repeat(64),
      expectedMediaRevision: 0,
      target: "background",
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

  it("logs deletion counts from scheduled storage scan continuations", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const jobId = await t.mutation(internal.profileMedia.createUploadJob, {
      profileId: ids.ownerProfileId,
      ownerId: ids.ownerId,
      sha256: "placeholder",
      expectedMediaRevision: 0,
      target: "background",
    });
    const firstFillerStorageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["profile-media-scan-filler-0"])),
    );
    for (let index = 1; index < 64; index += 1) {
      await t.run((ctx) => ctx.storage.store(new Blob([`profile-media-scan-filler-${index}`])));
    }
    const orphanStorageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["continued profile media orphan"])),
    );
    const [firstMetadata, orphanMetadata] = await Promise.all([
      t.run(async (ctx) => (await ctx.db.system.get("_storage", firstFillerStorageId))!),
      t.run(async (ctx) => (await ctx.db.system.get("_storage", orphanStorageId))!),
    ]);
    await t.run(async (ctx) => {
      const job = await ctx.db.get(jobId);
      if (job === null) throw new Error("Upload job was not created");
      await ctx.db.patch(jobId, {
        status: "failed",
        sha256: orphanMetadata.sha256,
        createdAt:
          Math.min(job.createdAt, firstMetadata._creationTime, orphanMetadata._creationTime) - 1,
        uploadWindowEndsAt: Math.max(firstMetadata._creationTime, orphanMetadata._creationTime) + 1,
      });
    });

    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await t.mutation(internal.profileMediaCleanup.reconcileExpired, {
        now: orphanMetadata._creationTime + 2 * 24 * 60 * 60 * 1000,
      });
      vi.useFakeTimers();
      try {
        await t.finishAllScheduledFunctions(vi.runAllTimers);
      } finally {
        vi.useRealTimers();
      }

      expect(await t.run((ctx) => ctx.storage.getUrl(orphanStorageId))).toBeNull();
      expect(await t.query(internal.profileMedia.getUploadJob, { jobId })).toBeNull();
      const pageLogs = logSpy.mock.calls.map(([event, fields]) => [event, fields]);
      expect(pageLogs).toEqual([
        [
          "profile media orphan reconciliation page",
          {
            status: "pending",
            jobCount: 0,
            hasMore: false,
            dryRun: false,
            continuationScheduled: false,
            scanned: 0,
            deleted: 0,
            retained: 0,
            skipped: 0,
          },
        ],
        [
          "profile media orphan reconciliation page",
          {
            status: "failed",
            jobCount: 1,
            hasMore: false,
            dryRun: false,
            continuationScheduled: false,
            scanned: 64,
            deleted: 0,
            retained: 0,
            skipped: 0,
          },
        ],
        [
          "profile media orphan reconciliation page",
          {
            status: "attached",
            jobCount: 0,
            hasMore: false,
            dryRun: false,
            continuationScheduled: false,
            scanned: 0,
            deleted: 0,
            retained: 0,
            skipped: 0,
          },
        ],
        [
          "profile media orphan reconciliation page",
          {
            status: "failed",
            jobCount: 1,
            hasMore: false,
            dryRun: false,
            continuationScheduled: false,
            scanned: 1,
            deleted: 1,
            retained: 0,
            skipped: 0,
          },
        ],
      ]);
      const loggedDeletions = logSpy.mock.calls.reduce(
        (total, [, fields]) => total + ("deleted" in fields ? Number(fields.deleted) : 0),
        0,
      );
      expect(loggedDeletions).toBe(1);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("does not duplicate page logs when a status page resumes a saved storage cursor", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const now = Date.now() + 2 * 24 * 60 * 60 * 1000;
    const jobId = await t.mutation(internal.profileMedia.createUploadJob, {
      profileId: ids.ownerProfileId,
      ownerId: ids.ownerId,
      sha256: "placeholder",
      expectedMediaRevision: 0,
      target: "background",
    });
    const storageIds = await t.run(async (ctx) => {
      const created: Id<"_storage">[] = [];
      for (let index = 0; index < 64; index += 1)
        created.push(await ctx.storage.store(new Blob([`status-page-scan-filler-${index}`])));
      created.push(await ctx.storage.store(new Blob(["status-page resumed orphan"])));
      return created;
    });
    const metadata = await t.run(async (ctx) =>
      Promise.all(storageIds.map((storageId) => ctx.db.system.get("_storage", storageId))),
    );
    const orphanStorageId = storageIds.at(-1);
    const orphanMetadata = metadata.at(-1);
    if (orphanStorageId === undefined || orphanMetadata === null || orphanMetadata === undefined)
      throw new Error("Orphan storage was not created");
    const creationTimes = metadata.map((item) => {
      if (item === null) throw new Error("Storage metadata was not created");
      return item._creationTime;
    });
    await t.run(async (ctx) => {
      const job = await ctx.db.get(jobId);
      if (job === null) throw new Error("Upload job was not created");
      await ctx.db.patch(jobId, {
        status: "failed",
        sha256: orphanMetadata.sha256,
        createdAt: Math.min(job.createdAt, ...creationTimes) - 1,
        uploadWindowEndsAt: Math.max(...creationTimes) + 1,
      });
    });

    await t.mutation(internal.profileMediaCleanup.reconcileOneJob, {
      jobId,
      now,
      dryRun: false,
    });
    const jobWithCursor = await t.query(internal.profileMedia.getUploadJob, { jobId });
    expect(jobWithCursor?.scanCursor).toBeDefined();

    const logSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await t.mutation(internal.profileMediaCleanup.reconcileStatusPage, {
        status: "failed",
        cursor: null,
        now,
        dryRun: false,
        batchSize: 8,
      });

      const pageLogs = logSpy.mock.calls.filter(
        ([event]) => event === "profile media orphan reconciliation page",
      );
      expect(pageLogs).toEqual([
        [
          "profile media orphan reconciliation page",
          {
            status: "failed",
            jobCount: 1,
            hasMore: false,
            dryRun: false,
            continuationScheduled: false,
            scanned: 1,
            deleted: 1,
            retained: 0,
            skipped: 0,
          },
        ],
      ]);
      expect(await t.run((ctx) => ctx.storage.getUrl(orphanStorageId))).toBeNull();
    } finally {
      logSpy.mockRestore();
    }
  });

  it("retains profile image storage referenced by an image mapping or upload job", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const [mappedStorageId, jobStorageId] = await Promise.all([
      t.run((ctx) => ctx.storage.store(new Blob(["mapped profile image"]))),
      t.run((ctx) => ctx.storage.store(new Blob(["uploading profile image"]))),
    ]);
    const [mappedMetadata, jobMetadata] = await Promise.all([
      t.run(async (ctx) => (await ctx.db.system.get("_storage", mappedStorageId))!),
      t.run(async (ctx) => (await ctx.db.system.get("_storage", jobStorageId))!),
    ]);
    const jobId = await t.run(async (ctx) => {
      await ctx.db.insert("profileImages", {
        storageId: mappedStorageId,
        profileId: ids.otherProfileId,
        ownerId: ids.otherId,
        contentType: "image/png",
        size: 19,
        createdAt: Date.now(),
      });
      await ctx.db.insert("profileImageUploadJobs", {
        profileId: ids.otherProfileId,
        ownerId: ids.otherId,
        largeSha256: jobMetadata.sha256,
        largeStorageId: jobStorageId,
        status: "pending",
        createdAt: Date.now(),
        uploadWindowEndsAt: Date.now() + 10 * 60 * 1000,
      });
      return await ctx.db.insert("profileMediaUploadJobs", {
        profileId: ids.ownerProfileId,
        ownerId: ids.ownerId,
        sha256: mappedMetadata.sha256,
        previewSha256: jobMetadata.sha256,
        scanSourceCandidateId: mappedStorageId,
        scanPreviewCandidateId: jobStorageId,
        expectedMediaRevision: 0,
        status: "failed",
        createdAt: Math.min(mappedMetadata._creationTime, jobMetadata._creationTime) - 1,
        uploadWindowEndsAt: Math.max(mappedMetadata._creationTime, jobMetadata._creationTime) + 1,
      });
    });

    const result = await t.mutation(internal.profileMediaCleanup.reconcileOneJob, {
      jobId,
      now: Date.now() + 2 * 24 * 60 * 60 * 1000,
      dryRun: false,
    });

    expect(result).toMatchObject({ deleted: 0, retained: 2, skipped: 0 });
    expect(await t.run((ctx) => ctx.storage.getUrl(mappedStorageId))).not.toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(jobStorageId))).not.toBeNull();
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("profileImages")
          .withIndex("by_storageId", (query) => query.eq("storageId", mappedStorageId))
          .collect(),
      ),
    ).toHaveLength(1);
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("profileImageUploadJobs")
          .withIndex("by_largeStorageId", (query) => query.eq("largeStorageId", jobStorageId))
          .collect(),
      ),
    ).toHaveLength(1);
  });

  it("keeps the cleanup job and candidate when duplicate asset references are uncertain", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["uncertain candidate"])));
    const metadata = await t.run(async (ctx) => (await ctx.db.system.get("_storage", storageId))!);
    const jobId = await t.run(async (ctx) => {
      for (const [profileId, ownerId] of [
        [ids.ownerProfileId, ids.ownerId],
        [ids.otherProfileId, ids.otherId],
      ] as const) {
        await ctx.db.insert("profileMediaAssets", {
          storageId,
          profileId,
          ownerId,
          contentType: "image/png",
          size: 20,
          width: 100,
          height: 100,
          createdAt: metadata._creationTime,
        });
      }
      return await ctx.db.insert("profileMediaUploadJobs", {
        profileId: ids.ownerProfileId,
        ownerId: ids.ownerId,
        sha256: metadata.sha256,
        scanSourceCandidateId: storageId,
        expectedMediaRevision: 0,
        status: "failed",
        createdAt: metadata._creationTime - 1,
        uploadWindowEndsAt: metadata._creationTime + 1,
      });
    });

    const firstPass = await t.mutation(internal.profileMediaCleanup.reconcileOneJob, {
      jobId,
      now: metadata._creationTime + 2 * 24 * 60 * 60 * 1000,
      dryRun: false,
    });

    expect(firstPass).toMatchObject({ deleted: 0, retained: 0, skipped: 1 });
    expect(await t.query(internal.profileMedia.getUploadJob, { jobId })).toMatchObject({
      scanSourceCandidateId: storageId,
      status: "failed",
    });
    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();

    const secondPass = await t.mutation(internal.profileMediaCleanup.reconcileOneJob, {
      jobId,
      now: metadata._creationTime + 2 * 24 * 60 * 60 * 1000,
      dryRun: false,
    });

    expect(secondPass.deleted).toBe(1);
    expect(await t.query(internal.profileMedia.getUploadJob, { jobId })).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
  });

  it("reclaims orphan media beyond 1000 upload jobs while retaining live references", async () => {
    const t = convexTest({ schema, modules, transactionLimits: { documentsRead: 100 } });
    const ids = await seed(t);
    const candidates: {
      jobId: Id<"profileMediaUploadJobs">;
      storageId: Id<"_storage">;
      createdAt: number;
    }[] = [];
    for (const value of ["orphan-media", "shared-media"]) {
      const jobId = await t.mutation(internal.profileMedia.createUploadJob, {
        profileId: ids.ownerProfileId,
        ownerId: ids.ownerId,
        sha256: "a".repeat(64),
        expectedMediaRevision: 0,
        target: "background",
      });
      const storageId = await t.run((ctx) => ctx.storage.store(new Blob([value])));
      const metadata = await t.run(
        async (ctx) => (await ctx.db.system.get("_storage", storageId))!,
      );
      await t.mutation(internal.profileMedia.markUploadJob, { jobId, storageId });
      await t.run((ctx) =>
        ctx.db.patch(jobId, {
          status: "attached",
          createdAt: metadata._creationTime - 1,
          uploadWindowEndsAt: metadata._creationTime + 1,
        }),
      );
      candidates.push({ jobId, storageId, createdAt: metadata._creationTime });
    }

    const orphan = candidates[0]!;
    const shared = candidates[1]!;
    const futureCreatedAt =
      Math.max(...candidates.map((candidate) => candidate.createdAt)) + 2 * 24 * 60 * 60 * 1000;
    const liveJobId = await t.run(async (ctx) => {
      for (let index = 0; index < 1001; index += 1) {
        await ctx.db.insert("profileMediaUploadJobs", {
          profileId: ids.ownerProfileId,
          ownerId: ids.ownerId,
          sha256: "f".repeat(64),
          expectedMediaRevision: 0,
          status: "pending",
          createdAt: futureCreatedAt,
          uploadWindowEndsAt: futureCreatedAt + 10 * 60 * 1000,
        });
      }
      return await ctx.db.insert("profileMediaUploadJobs", {
        profileId: ids.otherProfileId,
        ownerId: ids.otherId,
        sha256: "e".repeat(64),
        storageId: shared.storageId,
        expectedMediaRevision: 0,
        status: "pending",
        createdAt: futureCreatedAt,
        uploadWindowEndsAt: futureCreatedAt + 10 * 60 * 1000,
      });
    });

    const result = await t.mutation(internal.profileMediaCleanup.reconcileExpired, {
      now: futureCreatedAt - 24 * 60 * 60 * 1000,
    });

    expect(result).toMatchObject({ deleted: 1, retained: 1, skipped: 0 });
    expect(await t.run((ctx) => ctx.storage.getUrl(orphan.storageId))).toBeNull();
    expect(await t.query(internal.profileMedia.getUploadJob, { jobId: orphan.jobId })).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(shared.storageId))).not.toBeNull();
    expect(await t.query(internal.profileMedia.getUploadJob, { jobId: shared.jobId })).toBeNull();
    expect(await t.query(internal.profileMedia.getUploadJob, { jobId: liveJobId })).not.toBeNull();
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
      target: "background",
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

  it("deletes a stale media asset's distinct preview during reconciliation", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const item = await asset(t, ids.ownerProfileId, ids.ownerId);
    const metadata = await t.run(
      async (ctx) => (await ctx.db.system.get("_storage", item.storageId))!,
    );
    const jobId = await t.run(
      async (ctx) =>
        await ctx.db.insert("profileMediaUploadJobs", {
          profileId: ids.ownerProfileId,
          ownerId: ids.ownerId,
          sha256: metadata.sha256,
          storageId: item.storageId,
          expectedMediaRevision: 0,
          status: "failed",
          createdAt: metadata._creationTime - 1,
          uploadWindowEndsAt: metadata._creationTime + 1,
        }),
    );

    await t.mutation(internal.profileMediaCleanup.reconcileOneJob, {
      jobId,
      now: metadata._creationTime + 2,
      dryRun: false,
    });

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
      target: "background",
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
      target: "background",
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

  it("advances past ambiguous jobs and reclaims later expired orphans", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const ambiguous: { jobId: Id<"profileMediaUploadJobs">; storageIds: Id<"_storage">[] }[] = [];
    for (let index = 0; index < 8; index += 1) {
      const jobId = await t.mutation(internal.profileMedia.createUploadJob, {
        profileId: ids.ownerProfileId,
        ownerId: ids.ownerId,
        sha256: "placeholder",
        expectedMediaRevision: 0,
        target: "background",
      });
      if (index === 0)
        for (let filler = 0; filler < 65; filler += 1)
          await t.run((ctx) => ctx.storage.store(new Blob([`scan-page-filler-${filler}`])));
      const storageIds = await Promise.all([
        t.run((ctx) => ctx.storage.store(new Blob([`ambiguous-${index}`]))),
        t.run((ctx) => ctx.storage.store(new Blob([`ambiguous-${index}`]))),
      ]);
      const sha256 = await t.run(
        async (ctx) => (await ctx.db.system.get("_storage", storageIds[0]!))!.sha256,
      );
      await t.run(async (ctx) => {
        const job = (await ctx.db.get(jobId))!;
        await ctx.db.patch(jobId, {
          sha256,
          createdAt: job.createdAt,
          uploadWindowEndsAt: job.createdAt + 10 * 60 * 1000,
        });
      });
      ambiguous.push({ jobId, storageIds });
    }
    const orphanJob = await t.mutation(internal.profileMedia.createUploadJob, {
      profileId: ids.ownerProfileId,
      ownerId: ids.ownerId,
      sha256: "placeholder",
      expectedMediaRevision: 0,
      target: "background",
    });
    const orphanStorageId = await t.run((ctx) => ctx.storage.store(new Blob(["later-orphan"])));
    const orphanSha256 = await t.run(
      async (ctx) => (await ctx.db.system.get("_storage", orphanStorageId))!.sha256,
    );
    await t.run(async (ctx) => {
      const job = (await ctx.db.get(orphanJob))!;
      await ctx.db.patch(orphanJob, {
        sha256: orphanSha256,
        createdAt: job.createdAt,
        uploadWindowEndsAt: job.createdAt + 10 * 60 * 1000,
      });
    });

    await t.mutation(internal.profileMediaCleanup.reconcileExpired, {
      now: Date.now() + 2 * 24 * 60 * 60 * 1000,
    });
    vi.useFakeTimers();
    try {
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }

    for (const job of ambiguous) {
      expect(
        await t.query(internal.profileMedia.getUploadJob, { jobId: job.jobId }),
      ).not.toBeNull();
      for (const storageId of job.storageIds)
        expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
    }
    expect(await t.query(internal.profileMedia.getUploadJob, { jobId: orphanJob })).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(orphanStorageId))).toBeNull();
  });
});
