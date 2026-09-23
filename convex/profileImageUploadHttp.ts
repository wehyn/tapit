import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (process.env.TAPIT_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim());
  return origin !== null && allowed.includes(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, X-Profile-Id, X-Image-Revision",
        Vary: "Origin",
      }
    : {};
}

function errorResponse(message: string, status: number, headers: Record<string, string>) {
  return new Response(message, { status, headers });
}

export const upload = httpAction(async (ctx, request) => {
  const headers = corsHeaders(request.headers.get("Origin"));
  if (Object.keys(headers).length === 0) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return errorResponse("Method not allowed", 405, headers);

  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return errorResponse("Authentication required.", 401, headers);
  const profileId = request.headers.get("X-Profile-Id");
  if (profileId === null) return errorResponse("X-Profile-Id is required.", 400, headers);
  const rawRevision = request.headers.get("X-Image-Revision");
  const expectedImageRevision = rawRevision === null ? NaN : Number(rawRevision);
  if (
    rawRevision === null ||
    !/^(0|[1-9][0-9]*)$/.test(rawRevision) ||
    !Number.isSafeInteger(expectedImageRevision)
  )
    return errorResponse("A valid image revision is required.", 400, headers);
  const contentType = request.headers.get("Content-Type");
  if (contentType !== "image/jpeg" && contentType !== "image/png")
    return errorResponse("Profile images must be JPEG or PNG.", 415, headers);
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null && Number(contentLength) > MAX_UPLOAD_SIZE)
    return errorResponse("Images must be 5 MB or smaller.", 413, headers);

  let jobId: Id<"profileImageUploadJobs"> | undefined;
  let storageId: Id<"_storage"> | undefined;
  try {
    const access = await ctx.runQuery(internal.profileAccess.get, {
      profileId: profileId as Id<"profiles">,
    });
    const body = await request.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MAX_UPLOAD_SIZE)
      return errorResponse("Images must be 5 MB or smaller.", 413, headers);
    const digest = await crypto.subtle.digest("SHA-256", body);
    const largeSha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    jobId = await ctx.runMutation(internal.storage.createUploadJob, {
      profileId: profileId as Id<"profiles">,
      ownerId: access.ownerId,
      largeSha256,
      expectedImageRevision,
    });
    storageId = await ctx.storage.store(new Blob([body], { type: contentType }));
    await ctx.runMutation(internal.storage.markUploadJob, {
      jobId,
      largeStorageId: storageId,
    });
    const committed = await ctx.runAction(internal.profileImageProcessing.process, { jobId });
    const imageUrl = await ctx.storage.getUrl(storageId);
    if (imageUrl === null) throw new Error("The uploaded image was not found.");
    return new Response(
      JSON.stringify({ storageId, imageUrl, imageRevision: committed.imageRevision }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
    );
  } catch (error) {
    if (jobId !== undefined)
      await ctx.runMutation(internal.storage.compensateUpload, {
        jobId,
        ...(storageId === undefined ? {} : { unregisteredLargeStorageId: storageId }),
      });
    const message = error instanceof Error ? error.message : "Image upload failed.";
    const status = message.includes("Authentication required")
      ? 401
      : message.includes("Profile access denied")
        ? 403
        : message.includes("Photo changed elsewhere") || message.includes("Upload job")
          ? 409
          : 400;
    return errorResponse(message, status, headers);
  }
});
