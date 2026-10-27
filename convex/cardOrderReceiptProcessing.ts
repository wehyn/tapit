"use node";

import sharp from "sharp";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const MAX_BYTES_EXCLUSIVE = 5 * 1024 * 1024;

export const process = internalAction({
  args: { uploadId: v.id("cardOrderReceiptUploads") },
  returns: v.id("cardOrderReceiptUploads"),
  handler: async (ctx, { uploadId }): Promise<Id<"cardOrderReceiptUploads">> => {
    try {
      const upload = await ctx.runQuery(internal.cardOrderReceipts.getProcessingUpload, {
        uploadId,
      });
      if (upload === null) throw new Error("This upload request is no longer available.");
      const file = await ctx.storage.get(upload.storageId);
      if (file === null || file.size >= MAX_BYTES_EXCLUSIVE)
        throw new Error("Choose a receipt under 5 MB.");
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength >= MAX_BYTES_EXCLUSIVE) throw new Error("Choose a receipt under 5 MB.");

      let contentType: "image/jpeg" | "image/png" | "application/pdf";
      if (upload.declaredContentType === "application/pdf") {
        if (
          file.type !== "application/pdf" ||
          Buffer.from(bytes, 0, 5).toString("ascii") !== "%PDF-"
        )
          throw new Error("Upload a valid PDF receipt matching its file type.");
        contentType = "application/pdf";
      } else {
        const image = sharp(Buffer.from(bytes), {
          failOn: "error",
          limitInputPixels: 6_000_000,
          sequentialRead: true,
        });
        const metadata = await image.metadata();
        const actualType =
          metadata.format === "jpeg"
            ? "image/jpeg"
            : metadata.format === "png"
              ? "image/png"
              : null;
        if (
          actualType === null ||
          actualType !== upload.declaredContentType ||
          file.type !== actualType
        )
          throw new Error("Upload a valid JPEG or PNG receipt matching its file type.");
        const { width, height } = metadata;
        if (
          width === undefined ||
          height === undefined ||
          width > 12_000 ||
          height > 12_000 ||
          width * height > 6_000_000
        )
          throw new Error(
            "Choose an image with 6 megapixels or fewer and no side over 12,000 pixels.",
          );
        await image.clone().stats();
        contentType = actualType;
      }

      return await ctx.runMutation(internal.cardOrderReceipts.register, {
        uploadId,
        contentType,
        byteSize: bytes.byteLength,
      });
    } catch (error) {
      await ctx
        .runMutation(internal.cardOrderReceipts.cleanupFailedUpload, { uploadId })
        .catch(() => null);
      throw error;
    }
  },
});
