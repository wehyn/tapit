"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import sharp from "sharp";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { CARD_DESIGN_POLICY } from "./uploadPolicies";

export const process = action({
  args: { storageId: v.id("_storage"), fileName: v.string() },
  returns: v.id("cardOrderDesignUploads"),
  handler: async (ctx, args): Promise<Id<"cardOrderDesignUploads">> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Authentication required.");

    // shortcut: IDs lack owner proof; use a server-verifiable upload token if Convex adds one.
    const uploadId = await ctx.runMutation(internal.cardOrderDesigns.validateUpload, {
      userId,
      storageId: args.storageId,
    });
    try {
      const file = await ctx.storage.get(args.storageId);
      if (file === null) throw new Error("The uploaded design was not found.");
      if (file.size >= CARD_DESIGN_POLICY.maxBytesExclusive)
        throw new Error("Choose an image under 50 MB.");
      const fileName = args.fileName.trim().slice(0, 255);
      if (!fileName) throw new Error("The file name is required.");

      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength >= CARD_DESIGN_POLICY.maxBytesExclusive)
        throw new Error("Choose an image under 50 MB.");

      const image = sharp(Buffer.from(bytes), {
        failOn: "error",
        limitInputPixels: CARD_DESIGN_POLICY.maxPixels,
        sequentialRead: true,
      });
      const metadata = await image.metadata();
      const contentType =
        metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : null;
      if (contentType === null || !CARD_DESIGN_POLICY.acceptedContentTypes.includes(contentType)) {
        throw new Error("Upload a valid JPEG or PNG image.");
      }
      const { width, height } = metadata;
      if (
        width === undefined ||
        height === undefined ||
        width > (CARD_DESIGN_POLICY.maxWidth ?? Infinity) ||
        height > (CARD_DESIGN_POLICY.maxHeight ?? Infinity) ||
        (CARD_DESIGN_POLICY.maxPixels !== undefined &&
          width * height > CARD_DESIGN_POLICY.maxPixels)
      ) {
        throw new Error("The image dimensions exceed the card design limits.");
      }
      // Stats force full pixel decoding without materializing the decoded image buffer.
      await image.clone().stats();

      return await ctx.runMutation(internal.cardOrderDesigns.register, {
        userId,
        uploadId,
        storageId: args.storageId,
        fileName,
        contentType,
        byteSize: bytes.byteLength,
      });
    } catch (error) {
      await ctx
        .runMutation(internal.cardOrderDesigns.cleanupFailedUpload, {
          uploadId,
          storageId: args.storageId,
        })
        .catch(() => null);
      throw error;
    }
  },
});
