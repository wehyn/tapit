import { getAuthUserId } from "@convex-dev/auth/server";

import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  CARD_ORDER_DESIGN_FILE_TOO_LARGE_MESSAGE,
  CARD_ORDER_DESIGN_POLICY,
} from "./uploadPolicies";

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (process.env.TAPIT_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim());
  return origin !== null && allowed.includes(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name",
        Vary: "Origin",
      }
    : {};
}

function errorResponse(message: string, status: number, headers: Record<string, string>) {
  return new Response(message, { status, headers });
}

function fileNameFromHeader(header: string | null): string | null {
  if (header === null) return null;
  try {
    const decoded = decodeURIComponent(header)
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 255);
    return decoded || null;
  } catch {
    return null;
  }
}

const MAX_BLOB_PART_BYTES = 1024 * 1024;
const MAX_STREAM_READ_BYTES = 64 * 1024;

async function storeRequestBody(
  ctx: ActionCtx,
  request: Request,
  contentType: string,
): Promise<Id<"_storage">> {
  const bodyStream = request.body;
  if (bodyStream === null) throw new Error("The upload body was not found.");
  const reader = bodyStream.getReader({ mode: "byob" });

  const blobParts: Blob[] = [];
  let currentParts: BlobPart[] = [];
  let currentPartBytes = 0;
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(new Uint8Array(MAX_STREAM_READ_BYTES));
      if (done) break;
      if (value === undefined) continue;
      totalBytes += value.byteLength;
      if (totalBytes >= CARD_ORDER_DESIGN_POLICY.maxBytesExclusive) {
        await reader.cancel().catch(() => null);
        throw new Error(CARD_ORDER_DESIGN_FILE_TOO_LARGE_MESSAGE);
      }
      const chunkBuffer = value.buffer;
      if (!(chunkBuffer instanceof ArrayBuffer)) {
        throw new Error("The upload body format is unsupported.");
      }

      let offset = 0;
      while (offset < value.byteLength) {
        const partSize = Math.min(
          MAX_BLOB_PART_BYTES - currentPartBytes,
          value.byteLength - offset,
        );
        currentParts.push(new Uint8Array(chunkBuffer, value.byteOffset + offset, partSize));
        currentPartBytes += partSize;
        offset += partSize;
        if (currentPartBytes === MAX_BLOB_PART_BYTES) {
          blobParts.push(new Blob(currentParts));
          currentParts = [];
          currentPartBytes = 0;
        }
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => null);
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    throw new Error("Upload a non-empty image.");
  }
  if (currentPartBytes > 0) blobParts.push(new Blob(currentParts));
  const body = new Blob(blobParts, { type: contentType });
  if (body.size !== totalBytes) {
    throw new Error("The upload body could not be read.");
  }
  return await ctx.storage.store(body);
}

async function handleUpload(ctx: ActionCtx, request: Request): Promise<Response> {
  const headers = corsHeaders(request.headers.get("Origin"));
  if (Object.keys(headers).length === 0) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return errorResponse("Method not allowed", 405, headers);

  const userId = await getAuthUserId(ctx);
  if (userId === null) return errorResponse("Authentication required.", 401, headers);

  const contentType = request.headers.get("Content-Type");
  if (
    contentType === null ||
    !CARD_ORDER_DESIGN_POLICY.acceptedContentTypes.includes(contentType)
  ) {
    return errorResponse("Upload a JPEG or PNG image.", 415, headers);
  }
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(contentLength) || !Number.isSafeInteger(Number(contentLength))) {
      return errorResponse("A valid Content-Length is required.", 400, headers);
    }
    if (Number(contentLength) >= CARD_ORDER_DESIGN_POLICY.maxBytesExclusive) {
      return errorResponse(CARD_ORDER_DESIGN_FILE_TOO_LARGE_MESSAGE, 413, headers);
    }
  }

  const fileName = fileNameFromHeader(request.headers.get("X-File-Name"));
  if (fileName === null) return errorResponse("A valid file name is required.", 400, headers);

  let uploadId: Id<"cardOrderDesignUploads"> | undefined;
  let storageId: Id<"_storage"> | undefined;
  try {
    uploadId = await ctx.runMutation(internal.cardOrderDesigns.createUploadIntent, { userId });
    storageId = await storeRequestBody(ctx, request, contentType);
    await ctx.runMutation(internal.cardOrderDesigns.prepareUpload, {
      uploadId,
      storageId,
      fileName,
    });
    const result = await ctx.runAction(internal.cardOrderDesignProcessing.process, { uploadId });
    return new Response(JSON.stringify({ uploadId: result }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (uploadId !== undefined) {
      await ctx
        .runMutation(internal.cardOrderDesigns.cleanupFailedUpload, {
          uploadId,
          ...(storageId === undefined ? {} : { storageId }),
        })
        .catch(() => null);
    }
    const message = error instanceof Error ? error.message : "Design upload failed.";
    const status =
      message === "Authentication required."
        ? 401
        : message.includes("Active account required")
          ? 403
          : message.includes("already being processed") ||
              message.includes("still being cleaned up")
            ? 409
            : message === CARD_ORDER_DESIGN_FILE_TOO_LARGE_MESSAGE
              ? 413
              : 400;
    return errorResponse(message, status, headers);
  }
}

export const upload = httpAction(handleUpload);
