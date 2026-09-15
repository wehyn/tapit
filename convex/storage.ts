import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { profileAccess } from "./profileAccess";
import {
  detectProfileImageContentType,
  MAX_PROFILE_IMAGE_SIZE,
  profileImageContentTypeValidator,
  removeIfUnreferenced,
} from "./profileImages";

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
    const imageUrl: string = await ctx.runMutation(internal.storage.attach, {
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
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (profile === null || profile.ownerId !== args.ownerId)
      throw new Error("Profile access denied.");
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (metadata === null || metadata.size !== args.size)
      throw new Error("The uploaded image was not found.");
    const existing = await ctx.db
      .query("profileImages")
      .withIndex("by_storageId", (query) => query.eq("storageId", args.storageId))
      .unique();
    if (
      existing !== null &&
      (existing.profileId !== args.profileId || existing.ownerId !== args.ownerId)
    )
      throw new Error("This image does not belong to this profile.");
    if (existing === null)
      await ctx.db.insert("profileImages", {
        storageId: args.storageId,
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
    return imageUrl;
  },
});

export const removeImage = mutation({
  args: { profileId: v.id("profiles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await profileAccess(ctx, args.profileId);
    const oldStorageId = profile.draft.imageStorageId;
    const draft = { ...profile.draft };
    delete draft.imageUrl;
    await ctx.db.patch(profile._id, {
      draft: { ...draft, imageStorageId: undefined },
      updatedAt: Date.now(),
    });
    if (oldStorageId !== undefined && profile.published?.imageStorageId !== oldStorageId)
      await removeIfUnreferenced(ctx, oldStorageId, profile._id);
    return null;
  },
});
