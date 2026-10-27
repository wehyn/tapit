import { getAuthUserId } from "@convex-dev/auth/server";

import type { ActionCtx } from "./_generated/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const MAX_BYTES_EXCLUSIVE = 5 * 1024 * 1024;
const MAX_BLOB_PART_BYTES = 1024 * 1024;
const MAX_STREAM_READ_BYTES = 64 * 1024;
const TOO_LARGE = "Choose a receipt under 5 MB.";
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (process.env.TAPIT_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim());
  return origin !== null && allowed.includes(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name, X-Upload-Id",
        Vary: "Origin",
      }
    : {};
}

function fileNameFromHeader(header: string | null): string | null {
  if (header === null) return null;
  try {
    const name = decodeURIComponent(header)
      .replace(/[\\/]/g, "_")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 255);
    return name && name !== "." && name !== ".." ? name : null;
  } catch {
    return null;
  }
}

async function storeBody(
  ctx: ActionCtx,
  request: Request,
  contentType: string,
): Promise<Id<"_storage">> {
  if (request.body === null) throw new Error("Upload a non-empty receipt.");
  const reader = request.body.getReader({ mode: "byob" });
  const parts: Blob[] = [];
  let current: BlobPart[] = [];
  let currentBytes = 0;
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(new Uint8Array(MAX_STREAM_READ_BYTES));
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total >= MAX_BYTES_EXCLUSIVE) {
        await reader.cancel().catch(() => null);
        throw new Error(TOO_LARGE);
      }
      if (!(value.buffer instanceof ArrayBuffer))
        throw new Error("The upload body format is unsupported.");
      for (let offset = 0; offset < value.byteLength;) {
        const size = Math.min(MAX_BLOB_PART_BYTES - currentBytes, value.byteLength - offset);
        current.push(new Uint8Array(value.buffer, value.byteOffset + offset, size));
        currentBytes += size;
        offset += size;
        if (currentBytes === MAX_BLOB_PART_BYTES) {
          parts.push(new Blob(current));
          current = [];
          currentBytes = 0;
        }
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => null);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new Error("Upload a non-empty receipt.");
  if (currentBytes > 0) parts.push(new Blob(current));
  const body = new Blob(parts, { type: contentType });
  if (body.size !== total) throw new Error("The upload body could not be read.");
  return await ctx.storage.store(body);
}

async function handleUpload(ctx: ActionCtx, request: Request): Promise<Response> {
  const headers = corsHeaders(request.headers.get("Origin"));
  if (Object.keys(headers).length === 0) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers });
  const userId = await getAuthUserId(ctx);
  if (userId === null) return new Response("Authentication required.", { status: 401, headers });

  const contentType = request.headers.get("Content-Type");
  if (
    contentType === null ||
    !ACCEPTED_TYPES.includes(contentType as (typeof ACCEPTED_TYPES)[number])
  )
    return new Response("Upload a JPEG, PNG, or PDF receipt.", { status: 415, headers });
  const length = request.headers.get("Content-Length");
  if (length !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(length) || !Number.isSafeInteger(Number(length)))
      return new Response("A valid Content-Length is required.", { status: 400, headers });
    if (Number(length) >= MAX_BYTES_EXCLUSIVE)
      return new Response(TOO_LARGE, { status: 413, headers });
  }
  const fileName = fileNameFromHeader(request.headers.get("X-File-Name"));
  if (fileName === null)
    return new Response("A valid file name is required.", { status: 400, headers });
  const uploadHeader = request.headers.get("X-Upload-Id");
  if (uploadHeader === null)
    return new Response("A valid upload ID is required.", { status: 400, headers });

  const uploadId = uploadHeader as Id<"cardOrderReceiptUploads">;
  let storageId: Id<"_storage"> | undefined;
  try {
    await ctx.runQuery(internal.cardOrderReceipts.checkUploadIntent, { uploadId, userId });
    storageId = await storeBody(ctx, request, contentType);
    await ctx.runMutation(internal.cardOrderReceipts.prepareUpload, {
      uploadId,
      userId,
      storageId,
      fileName,
      declaredContentType: contentType,
    });
    await ctx.runAction(internal.cardOrderReceiptProcessing.process, { uploadId });
    return new Response(JSON.stringify({ uploadId }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    await ctx
      .runMutation(internal.cardOrderReceipts.cleanupFailedUpload, {
        uploadId,
        userId,
        ...(storageId === undefined ? {} : { storageId }),
      })
      .catch(() => null);
    const message = error instanceof Error ? error.message : "Receipt upload failed.";
    return new Response(message, { status: message === TOO_LARGE ? 413 : 400, headers });
  }
}

export const upload = httpAction(handleUpload);
