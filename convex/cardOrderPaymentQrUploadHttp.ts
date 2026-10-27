import { getAuthUserId } from "@convex-dev/auth/server";

import type { ActionCtx } from "./_generated/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CARD_ORDER_PAYMENT_QR_POLICY } from "./uploadPolicies";

const TOO_LARGE = "Choose an image under 5 MB.";
const MAX_BLOB_PART_BYTES = 1024 * 1024;

function cors(origin: string | null): Record<string, string> {
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

function fileName(header: string | null): string | null {
  if (header === null) return null;
  try {
    return (
      decodeURIComponent(header)
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 255) || null
    );
  } catch {
    return null;
  }
}

async function store(
  ctx: ActionCtx,
  request: Request,
  contentType: string,
): Promise<Id<"_storage">> {
  if (request.body === null) throw new Error("Upload a non-empty image.");
  const reader = request.body.getReader({ mode: "byob" });
  const parts: Blob[] = [];
  let current: BlobPart[] = [];
  let currentBytes = 0;
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(new Uint8Array(64 * 1024));
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total >= CARD_ORDER_PAYMENT_QR_POLICY.maxBytesExclusive) {
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
  if (total === 0) throw new Error("Upload a non-empty image.");
  if (currentBytes > 0) parts.push(new Blob(current));
  const blob = new Blob(parts, { type: contentType });
  if (blob.size !== total) throw new Error("The upload body could not be read.");
  return await ctx.storage.store(blob);
}

async function handle(ctx: ActionCtx, request: Request): Promise<Response> {
  const headers = cors(request.headers.get("Origin"));
  if (Object.keys(headers).length === 0) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers });
  const userId = await getAuthUserId(ctx);
  if (userId === null) return new Response("Authentication required.", { status: 401, headers });
  try {
    await ctx.runMutation(internal.cardOrderPaymentQr.assertAdministrator, { userId });
  } catch {
    return new Response("Administrator permission required.", { status: 403, headers });
  }
  const contentType = request.headers.get("Content-Type");
  if (
    contentType === null ||
    !CARD_ORDER_PAYMENT_QR_POLICY.acceptedContentTypes.includes(contentType)
  )
    return new Response("Upload a JPEG or PNG image.", { status: 415, headers });
  const length = request.headers.get("Content-Length");
  if (
    length !== null &&
    (!/^(0|[1-9][0-9]*)$/.test(length) || !Number.isSafeInteger(Number(length)))
  )
    return new Response("A valid Content-Length is required.", { status: 400, headers });
  if (length !== null && Number(length) >= CARD_ORDER_PAYMENT_QR_POLICY.maxBytesExclusive)
    return new Response(TOO_LARGE, { status: 413, headers });
  const name = fileName(request.headers.get("X-File-Name"));
  if (name === null)
    return new Response("A valid file name is required.", { status: 400, headers });
  let uploadId: Id<"cardOrderQrUploads"> | undefined;
  let storageId: Id<"_storage"> | undefined;
  try {
    uploadId = await ctx.runMutation(internal.cardOrderPaymentQr.createUploadIntent, { userId });
    storageId = await store(ctx, request, contentType);
    await ctx.runMutation(internal.cardOrderPaymentQr.prepareUpload, {
      uploadId,
      storageId,
      fileName: name,
    });
    await ctx.runAction(internal.cardOrderPaymentQrProcessing.process, { uploadId });
    return new Response(JSON.stringify({ uploadId }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (uploadId !== undefined)
      await ctx
        .runMutation(internal.cardOrderPaymentQr.cleanupFailedUpload, {
          uploadId,
          ...(storageId === undefined ? {} : { storageId }),
        })
        .catch(() => null);
    const message = error instanceof Error ? error.message : "QR upload failed.";
    return new Response(message, { status: message === TOO_LARGE ? 413 : 400, headers });
  }
}

export const upload = httpAction(handle);
