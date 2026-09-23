"use node";

import sharp from "sharp";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const MAX_IMAGE_SET_SIZE = 5 * 1024 * 1024;

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", Buffer.from(bytes));
  return Buffer.from(digest).toString("hex");
}

export const process = internalAction({
  args: { jobId: v.id("profileImageUploadJobs") },
  returns: v.object({ imageRevision: v.number() }),
  handler: async (ctx, args): Promise<{ imageRevision: number }> => {
    const job: Doc<"profileImageUploadJobs"> | null = await ctx.runQuery(
      internal.storage.getUploadJob,
      args,
    );
    if (job === null) throw new Error("Upload job not found.");
    if (job.largeStorageId === undefined) throw new Error("The uploaded image was not found.");
    const largeStorageId = job.largeStorageId;
    let smallStorageId: Id<"_storage"> | undefined;
    try {
      const source = await ctx.storage.get(largeStorageId);
      if (source === null) throw new Error("The uploaded image was not found.");
      const sourceBytes = new Uint8Array(await source.arrayBuffer());
      const image = sharp(Buffer.from(sourceBytes), { failOn: "error" });
      const metadata = await image.metadata();
      if (metadata.width !== 384 || metadata.height !== 384)
        throw new Error("Profile images must be exactly 384 by 384 pixels.");
      const format = metadata.format === "png" ? "png" : metadata.format === "jpeg" ? "jpeg" : null;
      if (format === null) throw new Error("Profile images must be JPEG or PNG.");
      if (source.type !== (format === "png" ? "image/png" : "image/jpeg"))
        throw new Error("Image Content-Type does not match the uploaded bytes.");
      const resized = image.resize(192, 192, { fit: "fill" });
      const smallBytes = await (
        format === "png" ? resized.png() : resized.jpeg({ quality: 82 })
      ).toBuffer();
      if (sourceBytes.byteLength + smallBytes.byteLength > MAX_IMAGE_SET_SIZE)
        throw new Error("The image set must be 5 MB or smaller.");
      const smallSha256 = await sha256(smallBytes);
      await ctx.runMutation(internal.storage.markUploadJob, { jobId: args.jobId, smallSha256 });
      smallStorageId = await ctx.storage.store(
        new Blob([smallBytes], { type: format === "png" ? "image/png" : "image/jpeg" }),
      );
      await ctx.runMutation(internal.storage.markUploadJob, {
        jobId: args.jobId,
        smallStorageId,
      });
      const committed: { imageUrl: string; imageRevision: number } = await ctx.runMutation(
        internal.storage.attach,
        {
          profileId: job.profileId,
          ownerId: job.ownerId,
          storageId: largeStorageId,
          smallStorageId,
          contentType: format === "png" ? "image/png" : "image/jpeg",
          size: sourceBytes.byteLength,
          expectedImageRevision: job.expectedImageRevision,
          uploadJobId: args.jobId,
        },
      );
      return { imageRevision: committed.imageRevision };
    } catch (error) {
      await ctx.runMutation(internal.storage.compensateUpload, {
        jobId: args.jobId,
        ...(smallStorageId === undefined ? {} : { unregisteredSmallStorageId: smallStorageId }),
      });
      if (
        error instanceof Error &&
        /^(Profile images|Image Content-Type|The image set|Photo changed elsewhere|Upload job)/.test(
          error.message,
        )
      )
        throw error;
      throw new Error("The uploaded image could not be decoded or attached.");
    }
  },
});
