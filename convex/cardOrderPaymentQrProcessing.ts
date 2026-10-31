"use node";

import sharp from "sharp";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { CARD_ORDER_PAYMENT_QR_POLICY } from "./uploadPolicies";
import { runUploadCleanup, safeUploadError, withUploadStorage } from "./uploadErrors";

export const process = internalAction({
  args: { uploadId: v.id("cardOrderQrUploads") },
  returns: v.id("cardOrderQrUploads"),
  handler: async (ctx, { uploadId }): Promise<Id<"cardOrderQrUploads">> => {
    try {
      const upload = await ctx.runQuery(internal.cardOrderPaymentQr.getProcessingUpload, {
        uploadId,
      });
      if (upload === null || upload.storageId === undefined)
        throw new Error("The uploaded QR image was not found.");
      const storageId = upload.storageId;
      const file = await withUploadStorage("card order payment QR processing get", () =>
        ctx.storage.get(storageId),
      );
      if (file === null || file.size >= CARD_ORDER_PAYMENT_QR_POLICY.maxBytesExclusive)
        throw new Error("Choose an image under 5 MB.");
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength >= CARD_ORDER_PAYMENT_QR_POLICY.maxBytesExclusive)
        throw new Error("Choose an image under 5 MB.");
      const image = sharp(Buffer.from(bytes), {
        failOn: "error",
        limitInputPixels: CARD_ORDER_PAYMENT_QR_POLICY.maxPixels,
        sequentialRead: true,
      });
      const metadata = await image.metadata();
      const actualType =
        metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : null;
      if (actualType === null || actualType !== file.type)
        throw new Error("Upload a valid JPEG or PNG image matching its file type.");
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
      return await ctx.runMutation(internal.cardOrderPaymentQr.register, {
        uploadId,
        contentType: actualType,
        byteSize: bytes.byteLength,
      });
    } catch (error) {
      await runUploadCleanup("card order payment QR processing", () =>
        ctx.runMutation(internal.cardOrderPaymentQr.cleanupFailedUpload, { uploadId }),
      );
      const safeError = safeUploadError(error);
      if (safeError !== null && safeError.code !== "STORAGE_UNAVAILABLE")
        throw new ConvexError(safeError.message);
      throw error;
    }
  },
});
