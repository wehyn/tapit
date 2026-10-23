"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import sharp from "sharp";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { CARD_DESIGN_POLICY } from "./uploadPolicies";

export const process = action({
  args: { storageId: v.id("_storage"), fileName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Authentication required.");
    if (!(await ctx.runQuery(internal.cardOrderDesigns.activeCustomer, { userId }))) {
      throw new Error("Active account required.");
    }

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

      await ctx.runMutation(internal.cardOrderDesigns.register, {
        userId,
        storageId: args.storageId,
        fileName,
        contentType,
        byteSize: bytes.byteLength,
      });
      return null;
    } catch (error) {
      try {
        await ctx.runMutation(internal.cardOrderDesigns.deleteUnregistered, {
          storageId: args.storageId,
        });
      } catch {
        throw new Error("Upload failed and its temporary file could not be cleaned up.");
      }
      if (error instanceof Error) throw error;
      throw new Error("The uploaded card design could not be processed.");
    }
  },
});
