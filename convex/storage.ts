import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { profileAccess } from "./profileAccess";
import {
  detectProfileImageContentType,
  MAX_PROFILE_IMAGE_SIZE,
  profileImageContentTypeValidator,
  removeIfUnreferenced,
} from "./profileImages";
import schema from "./schema";
import { isActiveCustomer, sameScope } from "./admin";

export const IMAGE_REVISION_CONFLICT = "Photo changed elsewhere. Reload and try again.";
export const IMAGE_UPLOAD_PENDING =
  "Photo upload in progress. Wait for it to finish and try again.";

export const generateUploadUrl = mutation({
  args: { profileId: v.id("profiles") },
  returns: v.string(),
  handler: async (ctx, args) => {
    await profileAccess(ctx, args.profileId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const attachImage = action({
  args: { profileId: v.id("profiles"), storageId: v.id("_storage") },
  returns: v.object({ storageId: v.id("_storage"), imageUrl: v.string() }),
  handler: async (ctx, args): Promise<{ storageId: Id<"_storage">; imageUrl: string }> => {
    const access = await ctx.runQuery(internal.profileAccess.get, { profileId: args.profileId });
    const mapping = await ctx.runQuery(internal.profileImages.getMapping, {
      storageId: args.storageId,
    });
    if (
      mapping !== null &&
      (mapping.profileId !== args.profileId || mapping.ownerId !== access.ownerId)
    )
      throw new Error("This image does not belong to this profile.");
    const blob = await ctx.storage.get(args.storageId);
    if (blob === null) throw new Error("The uploaded image was not found.");
    if (blob.size > MAX_PROFILE_IMAGE_SIZE) {
      if (mapping === null) await ctx.storage.delete(args.storageId);
      throw new Error("Images must be 5 MB or smaller.");
    }
    const contentType = detectProfileImageContentType(new Uint8Array(await blob.arrayBuffer()));
    if (contentType === null) {
      if (mapping === null) await ctx.storage.delete(args.storageId);
      throw new Error("The uploaded file must be a valid JPEG, PNG, or WebP image.");
    }
    const { imageUrl } = await ctx.runMutation(internal.storage.attach, {
      ...access,
      storageId: args.storageId,
      contentType,
      size: blob.size,
    });
    return { storageId: args.storageId, imageUrl };
  },
});

export const attach = internalMutation({
  args: {
    profileId: v.id("profiles"),
    ownerId: v.id("customers"),
    storageId: v.id("_storage"),
    contentType: profileImageContentTypeValidator,
    size: v.number(),
    smallStorageId: v.optional(v.id("_storage")),
    expectedImageRevision: v.optional(v.number()),
    uploadJobId: v.optional(v.id("profileImageUploadJobs")),
  },
  returns: v.object({ imageUrl: v.string(), imageRevision: v.number() }),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (profile === null || profile.ownerId !== args.ownerId)
      throw new Error("Profile access denied.");
    const owner = await ctx.db.get(args.ownerId);
    if (owner === null || !isActiveCustomer(owner) || !sameScope(owner, profile))
      throw new Error("Profile access denied.");
    const currentRevision = profile.imageRevision ?? 0;
    if (args.expectedImageRevision !== undefined && args.expectedImageRevision !== currentRevision)
      throw new Error(IMAGE_REVISION_CONFLICT);
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (metadata === null || metadata.size !== args.size)
      throw new Error("The uploaded image was not found.");
    if (args.smallStorageId !== undefined) {
      if (args.smallStorageId === args.storageId)
        throw new Error("The derivative must be a separate image.");
      const smallMetadata = await ctx.db.system.get("_storage", args.smallStorageId);
      if (smallMetadata === null) throw new Error("The derivative image was not found.");
      const occupied = await ctx.db
        .query("profileImages")
        .withIndex("by_smallStorageId", (query) => query.eq("smallStorageId", args.smallStorageId))
        .unique();
      if (occupied !== null && occupied.storageId !== args.storageId)
        throw new Error("Derivative image already belongs to a profile.");
    }
    const existing = await ctx.db
      .query("profileImages")
      .withIndex("by_storageId", (query) => query.eq("storageId", args.storageId))
      .unique();
    if (
      existing !== null &&
      (existing.profileId !== args.profileId || existing.ownerId !== args.ownerId)
    )
      throw new Error("This image does not belong to this profile.");
    if (existing !== null && existing.smallStorageId !== args.smallStorageId)
      throw new Error("This image set has different variants.");
    if (args.uploadJobId !== undefined) {
      const job = await ctx.db.get(args.uploadJobId);
      if (
        job === null ||
        job.status !== "pending" ||
        job.profileId !== args.profileId ||
        job.ownerId !== args.ownerId ||
        job.largeStorageId !== args.storageId ||
        job.smallStorageId !== args.smallStorageId
      )
        throw new Error("Upload job does not match this image set.");
    }
    if (existing === null)
      await ctx.db.insert("profileImages", {
        scope: profile.scope,
        storageId: args.storageId,
        ...(args.smallStorageId === undefined ? {} : { smallStorageId: args.smallStorageId }),
        profileId: args.profileId,
        ownerId: args.ownerId,
        contentType: args.contentType,
        size: args.size,
        createdAt: Date.now(),
      });
    const oldStorageId = profile.draft.imageStorageId;
    const draft = { ...profile.draft };
    delete draft.imageUrl;
    await ctx.db.patch(profile._id, {
      draft: { ...draft, imageStorageId: args.storageId },
      imageRevision: currentRevision + 1,
      updatedAt: Date.now(),
    });
    if (
      oldStorageId !== undefined &&
      oldStorageId !== args.storageId &&
      profile.published?.imageStorageId !== oldStorageId
    )
      await removeIfUnreferenced(ctx, oldStorageId, profile._id);
    const imageUrl = await ctx.storage.getUrl(args.storageId);
    if (imageUrl === null) throw new Error("The uploaded image was not found.");
    if (args.uploadJobId !== undefined)
      await ctx.db.patch(args.uploadJobId, { status: "attached" });
    return { imageUrl, imageRevision: currentRevision + 1 };
  },
});

export const markUploadJob = internalMutation({
  args: {
    jobId: v.id("profileImageUploadJobs"),
    largeStorageId: v.optional(v.id("_storage")),
    smallStorageId: v.optional(v.id("_storage")),
    smallSha256: v.optional(v.string()),
    status: v.optional(v.union(v.literal("pending"), v.literal("attached"), v.literal("failed"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job === null) throw new Error("Upload job not found.");
    if (job.status !== "pending") throw new Error("Upload job is no longer pending.");
    if (
      args.largeStorageId !== undefined &&
      job.largeStorageId !== undefined &&
      job.largeStorageId !== args.largeStorageId
    )
      throw new Error("Upload job already has a different image.");
    if (
      args.smallStorageId !== undefined &&
      job.smallStorageId !== undefined &&
      job.smallStorageId !== args.smallStorageId
    )
      throw new Error("Upload job already has a different derivative.");
    await ctx.db.patch(args.jobId, {
      ...(args.largeStorageId === undefined ? {} : { largeStorageId: args.largeStorageId }),
      ...(args.smallStorageId === undefined ? {} : { smallStorageId: args.smallStorageId }),
      ...(args.smallSha256 === undefined ? {} : { smallSha256: args.smallSha256 }),
      ...(args.status === undefined ? {} : { status: args.status }),
    });
    return null;
  },
});

export const createUploadJob = internalMutation({
  args: {
    profileId: v.id("profiles"),
    ownerId: v.id("customers"),
    largeSha256: v.string(),
    expectedImageRevision: v.number(),
  },
  returns: v.id("profileImageUploadJobs"),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (profile === null || profile.ownerId !== args.ownerId)
      throw new Error("Profile access denied.");
    if (args.expectedImageRevision !== (profile.imageRevision ?? 0))
      throw new Error(IMAGE_REVISION_CONFLICT);
    const now = Date.now();
    return await ctx.db.insert("profileImageUploadJobs", {
      profileId: args.profileId,
      ownerId: args.ownerId,
      largeSha256: args.largeSha256,
      expectedImageRevision: args.expectedImageRevision,
      status: "pending",
      createdAt: now,
      uploadWindowEndsAt: now + 10 * 60 * 1000,
    });
  },
});

/** Makes the compensation decision and storage deletion in one transaction. */
export const compensateUpload = internalMutation({
  args: {
    jobId: v.id("profileImageUploadJobs"),
    unregisteredLargeStorageId: v.optional(v.id("_storage")),
    unregisteredSmallStorageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job === null || job.status !== "pending") return null;
    const profile = await ctx.db.get(job.profileId);
    if (
      job.largeStorageId !== undefined &&
      args.unregisteredLargeStorageId !== undefined &&
      job.largeStorageId !== args.unregisteredLargeStorageId
    )
      return null;
    const ids = [
      job.largeStorageId ?? args.unregisteredLargeStorageId,
      job.smallStorageId,
      args.unregisteredSmallStorageId,
    ].filter(
      (id, index, values): id is Id<"_storage"> => id !== undefined && values.indexOf(id) === index,
    );
    for (const id of ids) {
      if (profile?.draft.imageStorageId === id || profile?.published?.imageStorageId === id)
        return null;
      const largeMapping = await ctx.db
        .query("profileImages")
        .withIndex("by_storageId", (query) => query.eq("storageId", id))
        .unique();
      const smallMapping = await ctx.db
        .query("profileImages")
        .withIndex("by_smallStorageId", (query) => query.eq("smallStorageId", id))
        .unique();
      if (largeMapping !== null || smallMapping !== null) return null;
    }
    for (const id of ids) await ctx.storage.delete(id);
    await ctx.db.patch(job._id, { status: "failed" });
    return null;
  },
});

export const getUploadJob = internalQuery({
  args: { jobId: v.id("profileImageUploadJobs") },
  returns: v.union(v.null(), schema.doc("profileImageUploadJobs")),
  handler: async (ctx, args) => await ctx.db.get(args.jobId),
});

export const removeImage = mutation({
  args: { profileId: v.id("profiles"), expectedImageRevision: v.optional(v.number()) },
  returns: v.object({ imageRevision: v.number() }),
  handler: async (ctx, args) => {
    const { profile } = await profileAccess(ctx, args.profileId);
    const currentRevision = profile.imageRevision ?? 0;
    if (args.expectedImageRevision !== undefined && args.expectedImageRevision !== currentRevision)
      throw new Error(IMAGE_REVISION_CONFLICT);
    const oldStorageId = profile.draft.imageStorageId;
    const draft = { ...profile.draft };
    delete draft.imageUrl;
    await ctx.db.patch(profile._id, {
      draft: { ...draft, imageStorageId: undefined },
      imageRevision: currentRevision + 1,
      updatedAt: Date.now(),
    });
    if (oldStorageId !== undefined && profile.published?.imageStorageId !== oldStorageId)
      await removeIfUnreferenced(ctx, oldStorageId, profile._id);
    return { imageRevision: currentRevision + 1 };
  },
});
