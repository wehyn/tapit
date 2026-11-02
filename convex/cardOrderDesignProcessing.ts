"use node";

import sharp from "sharp";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  CARD_ORDER_DESIGN_DIMENSIONS_EXCEEDED_MESSAGE,
  CARD_ORDER_DESIGN_FILE_TOO_LARGE_MESSAGE,
  CARD_ORDER_DESIGN_POLICY,
} from "./uploadPolicies";
import { runUploadCleanup, safeUploadError, withUploadStorage } from "./uploadErrors";

export const process = internalAction({
  args: { uploadId: v.id("cardOrderDesignUploads") },
  returns: v.id("cardOrderDesignUploads"),
  handler: async (ctx, args): Promise<Id<"cardOrderDesignUploads">> => {
    try {
      const upload = await ctx.runQuery(internal.cardOrderDesigns.getProcessingUpload, args);
      if (upload === null || upload.storageId === undefined || upload.fileName === undefined) {
        throw new Error("The uploaded design was not found.");
      }
      const storageId = upload.storageId;
      let file = await withUploadStorage("card order design processing get", () =>
        ctx.storage.get(storageId),
      );
      if (file === null) throw new Error("The uploaded design was not found.");
      if (file.size >= CARD_ORDER_DESIGN_POLICY.maxBytesExclusive)
        throw new Error(CARD_ORDER_DESIGN_FILE_TOO_LARGE_MESSAGE);

      const fileType = file.type;
      const bytes = await file.arrayBuffer();
      file = null;
      if (bytes.byteLength >= CARD_ORDER_DESIGN_POLICY.maxBytesExclusive)
        throw new Error(CARD_ORDER_DESIGN_FILE_TOO_LARGE_MESSAGE);

      // Buffer.from(ArrayBuffer) shares the buffer instead of duplicating a 5 MiB file.
      const image = sharp(Buffer.from(bytes), {
        failOn: "error",
        limitInputPixels: CARD_ORDER_DESIGN_POLICY.maxPixels,
        sequentialRead: true,
      });
      const metadata = await image.metadata();
      const contentType =
        metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : null;
      if (
        contentType === null ||
        !CARD_ORDER_DESIGN_POLICY.acceptedContentTypes.includes(contentType) ||
        fileType !== contentType
      ) {
        throw new Error("Upload a valid JPEG or PNG image.");
      }
      const { width, height } = metadata;
      if (
        width === undefined ||
        height === undefined ||
        width > (CARD_ORDER_DESIGN_POLICY.maxWidth ?? Infinity) ||
        height > (CARD_ORDER_DESIGN_POLICY.maxHeight ?? Infinity) ||
        (CARD_ORDER_DESIGN_POLICY.maxPixels !== undefined &&
          width * height > CARD_ORDER_DESIGN_POLICY.maxPixels)
      ) {
        throw new Error(CARD_ORDER_DESIGN_DIMENSIONS_EXCEEDED_MESSAGE);
      }
      await image.clone().stats();

      return await ctx.runMutation(internal.cardOrderDesigns.register, {
        uploadId: args.uploadId,
        contentType,
        byteSize: bytes.byteLength,
      });
    } catch (error) {
      await runUploadCleanup("card order design processing compensation", () =>
        ctx.runMutation(internal.cardOrderDesigns.cleanupFailedUpload, { uploadId: args.uploadId }),
      );
      const safeError = safeUploadError(error);
      if (safeError !== null && safeError.code !== "STORAGE_UNAVAILABLE")
        throw new ConvexError(safeError.message);
      throw error;
    }
  },
});
