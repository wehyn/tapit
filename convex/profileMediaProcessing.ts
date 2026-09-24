"use node";

import sharp from "sharp";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export const MAX_PROFILE_MEDIA_DIMENSION = 12_000;
export const MAX_PROFILE_MEDIA_PIXELS = 40_000_000;

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", Buffer.from(bytes));
  return Buffer.from(digest).toString("hex");
}

export const process = internalAction({
  args: { jobId: v.id("profileMediaUploadJobs") },
  returns: v.object({
    assetId: v.id("profileMediaAssets"),
    url: v.string(),
    previewUrl: v.string(),
    mediaRevision: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    assetId: Id<"profileMediaAssets">;
    url: string;
    previewUrl: string;
    mediaRevision: number;
  }> => {
    const job: Doc<"profileMediaUploadJobs"> | null = await ctx.runQuery(
      internal.profileMedia.getUploadJob,
      args,
    );
    if (job === null || job.storageId === undefined)
      throw new Error("The uploaded media was not found.");
    const storageId = job.storageId;
    let previewStorageId: Id<"_storage"> | undefined;
    try {
      const source = await ctx.storage.get(job.storageId);
      if (source === null || source.size > 5 * 1024 * 1024)
        throw new Error("Media must be 5 MB or smaller.");
      const bytes = new Uint8Array(await source.arrayBuffer());
      if ((await sha256(bytes)) !== job.sha256)
        throw new Error("The uploaded media was not found.");
      const image = sharp(Buffer.from(bytes), {
        failOn: "error",
        limitInputPixels: MAX_PROFILE_MEDIA_PIXELS,
      });
      const metadata = await image.metadata();
      const format = metadata.format;
      const contentType =
        format === "jpeg"
          ? "image/jpeg"
          : format === "png"
            ? "image/png"
            : format === "webp"
              ? "image/webp"
              : null;
      if (contentType === null || source.type !== contentType)
        throw new Error("Media Content-Type does not match the uploaded bytes.");
      if (metadata.width === undefined || metadata.height === undefined)
        throw new Error("The uploaded media dimensions are invalid.");
      if (
        metadata.width > MAX_PROFILE_MEDIA_DIMENSION ||
        metadata.height > MAX_PROFILE_MEDIA_DIMENSION ||
        metadata.width * metadata.height > MAX_PROFILE_MEDIA_PIXELS
      )
        throw new Error("Media dimensions exceed the supported limit.");
      const preview = image.resize({
        width: 800,
        height: 800,
        fit: "inside",
        withoutEnlargement: true,
      });
      const previewBytes = await (
        format === "jpeg"
          ? preview.jpeg({ quality: 84 })
          : format === "png"
            ? preview.png()
            : preview.webp({ quality: 84 })
      ).toBuffer();
      if (previewBytes.byteLength > 5 * 1024 * 1024)
        throw new Error("Media must be 5 MB or smaller.");
      const previewSha256 = await sha256(previewBytes);
      await ctx.runMutation(internal.profileMedia.markUploadJob, {
        jobId: args.jobId,
        previewSha256,
      });
      previewStorageId = await ctx.storage.store(new Blob([previewBytes], { type: contentType }));
      await ctx.runMutation(internal.profileMedia.markUploadJob, {
        jobId: args.jobId,
        previewStorageId,
      });
      const refreshed: Doc<"profileMediaUploadJobs"> | null = await ctx.runQuery(
        internal.profileMedia.getUploadJob,
        args,
      );
      previewStorageId = refreshed?.previewStorageId;
      if (previewStorageId === undefined) throw new Error("The media preview was not found.");
      return await ctx.runMutation(internal.profileMedia.attach, {
        jobId: args.jobId,
        storageId,
        previewStorageId,
        contentType,
        size: bytes.byteLength,
        width: metadata.width,
        height: metadata.height,
      });
    } catch (error) {
      await ctx.runMutation(internal.profileMedia.compensateUpload, {
        jobId: args.jobId,
        storageId,
        previewStorageId,
      });
      if (
        error instanceof Error &&
        /^(Media|The uploaded|Upload job|Media changed)/.test(error.message)
      )
        throw error;
      throw new Error("The uploaded media could not be decoded or attached.");
    }
  },
});
