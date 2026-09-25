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
