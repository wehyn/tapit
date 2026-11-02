# Issue #211: Safe Errors from Upload HTTP Endpoints

**Status:** Approved design; awaiting spec review
**Date:** 2026-10-31
**Issue:** [#211 — Return safe errors from upload HTTP endpoints](https://github.com/wehyn/tapit/issues/211)

## Problem

The card design, receipt, payment QR, profile image, and profile media HTTP upload handlers return caught exception messages to callers. Those messages can contain internal storage or processing details. Their callers read error bodies as plain text, so changing the response format would break existing behavior.

The repository already has safe upload error codes and status mappings in `convex/uploadErrors.ts`, but the handlers do not use them. Error handling and status selection also differ across handlers. Profile image and media cleanup failures can escape their catch blocks, while the other handlers silently discard cleanup errors.

## Decision

Keep the plain-text response contract. Preserve each existing safe, actionable message for recognized expected errors, and map it to the appropriate status using the shared upload error helper. Return no unrecognized exception text to the caller.

Use one generic fallback body for unexpected failures: **“Upload failed. Please try again.”** Return status **503** when any Convex storage API operation fails, including storage calls inside processing actions. Return status **422** for every other unexpected failure, including processing and other unclassified handler failures. This follows the selected issue behavior; there is no separate 500 case.

Use the existing `STORAGE_UNAVAILABLE` and `PROCESSING_FAILED` upload error codes and status mapping, supplying the same generic fallback message for both. Tag failures at storage API boundaries and carry the storage code across internal action calls. Keep the original storage exception in server-side diagnostics before replacing it with the safe code. The recognized-error mapping must use an explicit allowlist of safe messages; it must never pass arbitrary `Error.message` text through to the response.

## Response and cleanup behavior

1. Keep existing direct validation responses and their specific messages for malformed requests, unsupported types, and size limits.
2. For recognized errors caught from internal functions, preserve the safe message and return the matching status: authentication 401, authorization 403, conflict 409, expired upload 410, size 413, unsupported type 415, rate or quota limit 429, and validation or processing 422 as applicable.
3. For an unexpected exception, log the endpoint and original error on the server. Use the shared fallback body and status determined by its source: any storage API failure is 503, all other failures are 422.
4. Keep upload compensation best-effort in HTTP handlers and processing actions. Log cleanup failures, but do not let them replace the original response or expose cleanup error text.
5. Ensure all fallible work in a POST request reaches the shared response mapper; expected validation returns remain direct responses.
6. Apply the same behavior to the profile image and profile media admin routes.

## Approaches considered

- **Shared error normalization in `uploadErrors.ts`, with storage failures tagged at their source — selected.** The handlers keep their existing safe messages, while one helper applies the allowlist, common fallback, and status mapping. Storage failures retain their code across internal action calls. This avoids changing client callers and only touches processing code where needed to distinguish storage failures or preserve cleanup diagnostics.
- **Convert every underlying function to throw typed upload errors.** This is explicit at each source but touches many more functions and tests.
- **Keep separate error mapping in each HTTP handler.** This avoids a shared mapper but duplicates rules and risks inconsistent responses.

## Scope

In scope: `convex/uploadErrors.ts`, the five upload HTTP handler modules, the five corresponding processing modules where storage errors need to be tagged or cleanup failures logged, and Convex HTTP integration coverage for card design, receipt, payment QR, profile image, profile media, and the profile image/media admin routes.

Out of scope: changing client error-body parsing, adopting JSON error responses, changing upload validation rules or cleanup operations, or rewriting unrelated Convex errors.

## Acceptance criteria

- Existing callers continue to receive plain-text error bodies.
- Recognized expected errors keep safe, useful messages and appropriate HTTP statuses.
- Every unexpected storage API failure, including one inside a processing action, returns the shared generic body with status 503.
- Every other unexpected failure returns the same generic body with status 422.
- Raw exception details do not appear in HTTP responses and remain available in server-side diagnostics with endpoint context.
- HTTP-handler and processing-action cleanup errors are logged and do not replace the chosen safe response.
- HTTP integration coverage checks safe expected errors and both generic fallback classes across all upload handler paths, including both admin variants. Storage failures inside processing actions are included so the 503 classification is verified across the internal action boundary.
