import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function headers(origin: string | null): Record<string, string> {
  const allowed = (process.env.TAPIT_ALLOWED_ORIGINS ?? "").split(",").map((v) => v.trim());
  return origin !== null && allowed.includes(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, X-Profile-Id, X-Media-Revision",
        Vary: "Origin",
      }
    : {};
}

async function handleUpload(
  ctx: ActionCtx,
  request: Request,
  adminOnly: boolean,
): Promise<Response> {
  const cors = headers(request.headers.get("Origin"));
  if (Object.keys(cors).length === 0) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: cors });
  if ((await ctx.auth.getUserIdentity()) === null)
    return new Response("Authentication required.", { status: 401, headers: cors });
  const profileId = request.headers.get("X-Profile-Id");
  const rawRevision = request.headers.get("X-Media-Revision");
  const revision = rawRevision === null ? NaN : Number(rawRevision);
  if (profileId === null)
    return new Response("X-Profile-Id is required.", { status: 400, headers: cors });
  if (
    rawRevision === null ||
    !/^(0|[1-9][0-9]*)$/.test(rawRevision) ||
    !Number.isSafeInteger(revision)
  )
    return new Response("A valid media revision is required.", { status: 400, headers: cors });
  const contentType = request.headers.get("Content-Type");
  if (contentType === null || !allowedTypes.has(contentType))
    return new Response("Media must be JPEG, PNG, or WebP.", { status: 415, headers: cors });
  const length = request.headers.get("Content-Length");
  if (length !== null && Number(length) > MAX_UPLOAD_SIZE)
    return new Response("Media must be 5 MB or smaller.", { status: 413, headers: cors });
  let jobId: Id<"profileMediaUploadJobs"> | undefined;
  let storageId: Id<"_storage"> | undefined;
  try {
    const accessArgs = { profileId: profileId as Id<"profiles"> };
    const access = adminOnly
      ? await ctx.runQuery(internal.profileMedia.getAdminAccess, accessArgs)
      : await ctx.runQuery(internal.profileMedia.getOwnerAccess, accessArgs);
    const body = await request.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MAX_UPLOAD_SIZE)
      return new Response("Media must be 5 MB or smaller.", { status: 413, headers: cors });
    const digest = await crypto.subtle.digest("SHA-256", body);
    const sha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    jobId = await ctx.runMutation(internal.profileMedia.createUploadJob, {
      profileId: profileId as Id<"profiles">,
      ownerId: access.ownerId,
      actorUserId: access.userId,
      accessMode: adminOnly ? "admin" : "owner",
      sha256,
      expectedMediaRevision: revision,
    });
    storageId = await ctx.storage.store(new Blob([body], { type: contentType }));
    await ctx.runMutation(internal.profileMedia.markUploadJob, { jobId, storageId });
    const result = await ctx.runAction(internal.profileMediaProcessing.process, { jobId });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (jobId !== undefined)
      await ctx.runMutation(internal.profileMedia.compensateUpload, { jobId, storageId });
    const message = error instanceof Error ? error.message : "Media upload failed.";
    const status =
      message.toLowerCase().includes("access denied") ||
      message.toLowerCase().includes("administrator permission required")
        ? 403
        : message.includes("changed elsewhere") || message.includes("Upload job")
          ? 409
          : 400;
    return new Response(message, { status, headers: cors });
  }
}

export const upload = httpAction((ctx, request) => handleUpload(ctx, request, false));
export const uploadAdmin = httpAction((ctx, request) => handleUpload(ctx, request, true));
