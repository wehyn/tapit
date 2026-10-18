import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { inspectProfileStorage } from "./profileStorageReferences";

export const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;

export type ProfileImageContentType = "image/jpeg" | "image/png" | "image/webp";

export const profileImageContentTypeValidator = v.union(
  v.literal("image/jpeg"),
  v.literal("image/png"),
  v.literal("image/webp"),
);

type StorageDbContext = Pick<QueryCtx | MutationCtx, "db" | "storage">;
type ProfileImageSnapshot = Doc<"profiles">["draft"] | NonNullable<Doc<"profiles">["published"]>;

export function detectProfileImageContentType(bytes: Uint8Array): ProfileImageContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length >= pngSignature.length &&
    pngSignature.every((byte, index) => bytes[index] === byte)
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function getProfileImageMapping(ctx: StorageDbContext, storageId: Id<"_storage">) {
  const direct = await ctx.db
    .query("profileImages")
    .withIndex("by_storageId", (query) => query.eq("storageId", storageId))
    .unique();
  if (direct !== null) return direct;
  return await ctx.db
    .query("profileImages")
    .withIndex("by_smallStorageId", (query) => query.eq("smallStorageId", storageId))
    .unique();
}

export async function assertOwnedProfileImage(
  ctx: StorageDbContext,
  profileId: Id<"profiles">,
  ownerId: Id<"customers">,
  storageId: Id<"_storage">,
) {
  const mapping = await getProfileImageMapping(ctx, storageId);
  const metadata = await ctx.db.system.get("_storage", storageId);
  if (
    mapping === null ||
    mapping.profileId !== profileId ||
    mapping.ownerId !== ownerId ||
    metadata === null
  ) {
    throw new Error("This image does not belong to this profile.");
  }
  return mapping;
}

/** Resolves owned storage references and preserves legacy URLs for old snapshots. */
export async function resolveProfileImageUrl(
  ctx: StorageDbContext,
  profile: Doc<"profiles">,
  snapshot: ProfileImageSnapshot,
) {
  if (snapshot.imageStorageId !== undefined) {
    const mapping = await getProfileImageMapping(ctx, snapshot.imageStorageId);
    if (
      mapping === null ||
      mapping.profileId !== profile._id ||
      mapping.ownerId !== profile.ownerId
    ) {
      return undefined;
    }
    return (await ctx.storage.getUrl(snapshot.imageStorageId)) ?? undefined;
  }
  // This fallback is for records written before owned storage references existed.
  return snapshot.imageUrl;
}

/** Deletes an old file only when it is no longer referenced by this profile. */
export async function removeIfUnreferenced(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  profileId: Id<"profiles">,
) {
  const profile = await ctx.db.get(profileId);
  if (
    profile?.draft.imageStorageId === storageId ||
    profile?.published?.imageStorageId === storageId
  ) {
    return;
  }
  const mapping = await getProfileImageMapping(ctx, storageId);
  if (mapping === null || mapping.profileId !== profileId) return;
  await releaseProfileImageMapping(ctx, mapping, profileId);
}

export async function releaseProfileImageMapping(
  ctx: MutationCtx,
  mapping: Doc<"profileImages">,
  ignoredProfileId?: Id<"profiles">,
) {
  const storageIds = new Set<Id<"_storage">>([mapping.storageId]);
  if (mapping.smallStorageId !== undefined) storageIds.add(mapping.smallStorageId);
  const inspections = new Map<Id<"_storage">, Awaited<ReturnType<typeof inspectProfileStorage>>>();
  for (const storageId of storageIds)
    inspections.set(
      storageId,
      await inspectProfileStorage(ctx, storageId, {
        kind: "profileImageRelease",
        mappingId: mapping._id,
        ignoredProfileId,
      }),
    );
  await ctx.db.delete(mapping._id);
  for (const [storageId, inspection] of inspections)
    if (inspection.kind === "unreferenced") await ctx.storage.delete(storageId);
}

export const getMapping = internalQuery({
  args: { storageId: v.id("_storage") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("profileImages"),
      _creationTime: v.number(),
      storageId: v.id("_storage"),
      smallStorageId: v.optional(v.id("_storage")),
      profileId: v.id("profiles"),
      ownerId: v.id("customers"),
      contentType: profileImageContentTypeValidator,
      size: v.number(),
      createdAt: v.number(),
      scope: v.optional(v.literal("demo")),
    }),
  ),
  handler: async (ctx, args) => await getProfileImageMapping(ctx, args.storageId),
});
