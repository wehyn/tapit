import { ConvexError } from "convex/values";

export const UPLOAD_ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "UNSUPPORTED_TYPE",
  "FILE_TOO_LARGE",
  "INVALID_SIGNATURE",
  "INVALID_IMAGE",
  "DIMENSIONS_EXCEEDED",
  "RATE_LIMITED",
  "QUOTA_EXCEEDED",
  "UPLOAD_EXPIRED",
  "PROCESSING_FAILED",
  "STORAGE_UNAVAILABLE",
  "CONFLICT",
] as const;

export type UploadErrorCode = (typeof UPLOAD_ERROR_CODES)[number];

export type UploadError = {
  code: UploadErrorCode;
  message: string;
  retryable: boolean;
};

const DEFAULT_MESSAGES: Record<UploadErrorCode, string> = {
  UNAUTHENTICATED: "Authentication is required.",
  FORBIDDEN: "You do not have permission to upload this file.",
  UNSUPPORTED_TYPE: "This file type is not supported.",
  FILE_TOO_LARGE: "This file is too large.",
  INVALID_SIGNATURE: "The file contents do not match its declared type.",
  INVALID_IMAGE: "This image could not be read.",
  DIMENSIONS_EXCEEDED: "This image exceeds the allowed dimensions.",
  RATE_LIMITED: "Too many upload attempts. Try again later.",
  QUOTA_EXCEEDED: "The upload quota has been exceeded.",
  UPLOAD_EXPIRED: "This upload has expired. Start again.",
  PROCESSING_FAILED: "The image could not be processed.",
  STORAGE_UNAVAILABLE: "Upload storage is temporarily unavailable.",
  CONFLICT: "The upload conflicts with a newer change.",
};

const RETRYABLE_CODES = new Set<UploadErrorCode>([
  "RATE_LIMITED",
  "STORAGE_UNAVAILABLE",
  "PROCESSING_FAILED",
]);

export const UPLOAD_FAILURE_MESSAGE = "Upload failed. Please try again.";

const SAFE_UPLOAD_MESSAGES: Record<string, UploadErrorCode> = {
  "Authentication required.": "UNAUTHENTICATED",
  "Active account required.": "FORBIDDEN",
  "Administrator permission required.": "FORBIDDEN",
  "Profile access denied.": "FORBIDDEN",
  "This image does not belong to this profile.": "FORBIDDEN",
  "Slideshow uploads require a claimed card.": "FORBIDDEN",
  "This media asset does not belong to this profile.": "FORBIDDEN",
  "This media asset cannot be used in that profile slot.": "FORBIDDEN",
  "This upload was not created for the current upload request.": "FORBIDDEN",
  "This file was not created for this upload request.": "FORBIDDEN",
  "This upload request is no longer available.": "UPLOAD_EXPIRED",
  "This upload request expired. Start a new upload.": "UPLOAD_EXPIRED",
  "Start a new card design upload.": "UPLOAD_EXPIRED",
  "Upload job is no longer pending.": "UPLOAD_EXPIRED",
  "Choose a receipt under 5 MB.": "FILE_TOO_LARGE",
  "Choose an image under 5 MB.": "FILE_TOO_LARGE",
  "The image set must be 5 MB or smaller.": "FILE_TOO_LARGE",
  "Media must be 5 MB or smaller.": "FILE_TOO_LARGE",
  "Images must be 5 MB or smaller.": "FILE_TOO_LARGE",
  "Upload a JPEG, PNG, or PDF receipt.": "UNSUPPORTED_TYPE",
  "Profile images must be JPEG or PNG.": "UNSUPPORTED_TYPE",
  "Media must be JPEG, PNG, or WebP.": "UNSUPPORTED_TYPE",
  "Upload a valid JPEG or PNG image.": "INVALID_IMAGE",
  "Upload a valid JPEG or PNG image matching its file type.": "INVALID_SIGNATURE",
  "Upload a valid JPEG or PNG receipt matching its file type.": "INVALID_SIGNATURE",
  "Upload a valid PDF receipt matching its file type.": "INVALID_SIGNATURE",
  "Image Content-Type does not match the uploaded bytes.": "INVALID_SIGNATURE",
  "Media Content-Type does not match the uploaded bytes.": "INVALID_SIGNATURE",
  "The uploaded file must be a valid JPEG, PNG, or WebP image.": "INVALID_SIGNATURE",
  "Profile images must be exactly 384 by 384 pixels.": "DIMENSIONS_EXCEEDED",
  "Choose an image with 6 megapixels or fewer and no side over 12,000 pixels.":
    "DIMENSIONS_EXCEEDED",
  "Media dimensions exceed the supported limit.": "DIMENSIONS_EXCEEDED",
  "The uploaded media dimensions are invalid.": "INVALID_IMAGE",
  "The uploaded image could not be decoded or attached.": "PROCESSING_FAILED",
  "The uploaded media could not be decoded or attached.": "PROCESSING_FAILED",
  "The uploaded image was not found.": "PROCESSING_FAILED",
  "The uploaded media was not found.": "PROCESSING_FAILED",
  "The media preview was not found.": "PROCESSING_FAILED",
  "The uploaded QR image was not found.": "PROCESSING_FAILED",
  "The uploaded design was not found.": "PROCESSING_FAILED",
  "The upload body was not found.": "INVALID_IMAGE",
  "The upload body format is unsupported.": "INVALID_IMAGE",
  "The upload body could not be read.": "INVALID_IMAGE",
  "Upload a non-empty image.": "INVALID_IMAGE",
  "Upload a non-empty receipt.": "INVALID_IMAGE",
  "Too many profile media upload jobs are assigned to this profile.": "QUOTA_EXCEEDED",
  "Too many profile media assets are assigned to this profile.": "QUOTA_EXCEEDED",
  "Media changed elsewhere. Reload and try again.": "CONFLICT",
  "Photo changed elsewhere. Reload and try again.": "CONFLICT",
  "The profile draft changed while you were editing. Refresh and try again.": "CONFLICT",
  "Photo upload in progress. Wait for it to finish and try again.": "CONFLICT",
  "Upload job does not match this media set.": "CONFLICT",
  "A card design upload is already being processed.": "CONFLICT",
  "A previous card design upload is still being cleaned up.": "CONFLICT",
  "This file is already in use.": "CONFLICT",
  "Upload job does not match this image set.": "CONFLICT",
  "Upload job not found.": "CONFLICT",
  [UPLOAD_FAILURE_MESSAGE]: "PROCESSING_FAILED",
  "Authentication is required.": "UNAUTHENTICATED",
  "You do not have permission to upload this file.": "FORBIDDEN",
  "This file type is not supported.": "UNSUPPORTED_TYPE",
  "This file is too large.": "FILE_TOO_LARGE",
  "The file contents do not match its declared type.": "INVALID_SIGNATURE",
  "This image could not be read.": "INVALID_IMAGE",
  "This image exceeds the allowed dimensions.": "DIMENSIONS_EXCEEDED",
  "Too many upload attempts. Try again later.": "RATE_LIMITED",
  "The upload quota has been exceeded.": "QUOTA_EXCEEDED",
  "This upload has expired. Start again.": "UPLOAD_EXPIRED",
  "The image could not be processed.": "PROCESSING_FAILED",
  "Upload storage is temporarily unavailable.": "STORAGE_UNAVAILABLE",
  "The upload conflicts with a newer change.": "CONFLICT",
};

function normalizedUploadError(value: unknown): UploadError | null {
  if (!isUploadError(value)) return null;
  const code = value.code;
  const message =
    code === "STORAGE_UNAVAILABLE" ||
    (code === "PROCESSING_FAILED" && SAFE_UPLOAD_MESSAGES[value.message] !== code)
      ? UPLOAD_FAILURE_MESSAGE
      : SAFE_UPLOAD_MESSAGES[value.message] === code
        ? value.message
        : DEFAULT_MESSAGES[code];
  return { code, message, retryable: RETRYABLE_CODES.has(code) };
}

export function safeUploadError(error: unknown): UploadError | null {
  const direct = normalizedUploadError(error);
  if (direct) return direct;
  if (error instanceof ConvexError) {
    const structured = normalizedUploadError(error.data);
    if (structured) return structured;
  }
  if (error instanceof Error && Object.hasOwn(SAFE_UPLOAD_MESSAGES, error.message)) {
    const code = SAFE_UPLOAD_MESSAGES[error.message];
    return uploadError(code, error.message);
  }
  return null;
}

export function uploadErrorResponse(
  error: unknown,
  endpoint: string,
  headers: Record<string, string>,
): Response {
  const safeError = safeUploadError(error);
  const mapped = safeError ?? uploadError("PROCESSING_FAILED", UPLOAD_FAILURE_MESSAGE);
  if (safeError === null) console.error(`Unexpected upload failure at ${endpoint}`, error);
  return new Response(mapped.message, {
    status: httpStatusForUploadError(mapped),
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
  });
}

export async function withUploadStorage<T>(
  context: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`Upload storage failure: ${context}`, error);
    throw new ConvexError(uploadError("STORAGE_UNAVAILABLE", UPLOAD_FAILURE_MESSAGE));
  }
}

export async function runUploadCleanup(
  context: string,
  cleanup: () => Promise<unknown>,
): Promise<void> {
  try {
    await cleanup();
  } catch (error) {
    console.error(`Upload cleanup failed: ${context}`, error);
  }
}

const isUploadErrorCode = (value: unknown): value is UploadErrorCode =>
  typeof value === "string" && (UPLOAD_ERROR_CODES as readonly string[]).includes(value);

export function uploadError(code: UploadErrorCode, detail?: string): UploadError {
  // Details are accepted only as short, user-safe message text; storage IDs and other
  // operational identifiers are intentionally not represented in this contract.
  const message = detail?.trim() && detail.length <= 160 ? detail.trim() : DEFAULT_MESSAGES[code];
  return { code, message, retryable: RETRYABLE_CODES.has(code) };
}

export function isUploadError(value: unknown): value is UploadError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<UploadError>;
  return (
    isUploadErrorCode(candidate.code) &&
    typeof candidate.message === "string" &&
    typeof candidate.retryable === "boolean"
  );
}

export function httpStatusForUploadError(error: Pick<UploadError, "code">): number {
  switch (error.code) {
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "UNSUPPORTED_TYPE":
      return 415;
    case "FILE_TOO_LARGE":
      return 413;
    case "UPLOAD_EXPIRED":
      return 410;
    case "RATE_LIMITED":
    case "QUOTA_EXCEEDED":
      return 429;
    case "CONFLICT":
      return 409;
    case "STORAGE_UNAVAILABLE":
      return 503;
    case "INVALID_SIGNATURE":
    case "INVALID_IMAGE":
    case "DIMENSIONS_EXCEEDED":
    case "PROCESSING_FAILED":
      return 422;
  }
}
