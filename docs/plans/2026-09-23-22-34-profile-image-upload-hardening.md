# Profile Image Upload Hardening Implementation Plan

> **Status:** Draft for review. This document plans the work; it does not authorize implementation or deployment.

**Goal:** Let customers crop a profile photo or logo, serve appropriately sized images, preserve transparency, and make upload, save, publish, replacement, and cleanup deterministic.

**Architecture:** The browser produces one 384px square image from an approved crop. An authenticated Convex HTTP action stores it and calls an internal Node action to decode it, create a 192px derivative, and attach the image set through an internal mutation. The existing draft/published `imageStorageId` remains the canonical large-image ID; a profile-owned image-set mapping holds the small variant and cleanup metadata. An image revision and server-side image-field merge prevent stale draft saves or publications from silently changing the selected image.

**Tech Stack:** Next.js 16.3.5, React 19.3.0, Convex 1.45.0 with Convex Auth, browser Canvas, a Node action with `sharp` for image decoding/resizing, Vitest/convex-test, Playwright.

**Spec:** `docs/spec.md` (Image handling, AC-013, AC-014), `docs/plan.md` (current MVP boundaries), and this plan's Decisions section. The existing spec does not yet define transparency or retention; update it in Task 1.

## Global constraints

- Read `convex/_generated/ai/guidelines.md` before Convex edits and the relevant installed Next.js guides under `node_modules/next/dist/docs/` before Next.js code changes.
- Preserve the existing untracked `public/images/tapit-profile-card-cutout-v2.png` and any local environment files.
- Keep profile drafts private; signed-out slug/card projections receive only the published image URLs and never storage IDs or upload-job records.
- Keep demo mode browser-local. Use only an explicitly selected non-production Convex/Vercel deployment for upload and live E2E proof; do not treat local tests as Production acceptance.
- No credentials, bearer tokens, raw uploaded bytes, or customer identifiers in logs or plan artifacts.

---

## Decisions to review

- Scope is profile photo/logo on `/app/profile`, in both local demo and live mode. `/build-card` remains a browser-local design preview and is a separate product flow.
- The crop is **1:1 square** with drag and zoom, keyboard-accessible position/zoom controls, a round avatar preview, and a checkerboard under transparent pixels. Cancel leaves the existing image intact. No original is retained for later recropping; customers can reselect the source file.
- Produce a **384×384** browser crop and a **192×192** server derivative. Both are JPEG at quality 0.82 when opaque; if the rendered crop contains alpha, both are PNG. Do not silently flatten a transparent logo. Keep each image set at or below 5 MiB total; retain the current 5 MiB source-file limit.
- The large variant is the canonical `imageStorageId` for compatibility with current profiles. The small variant is stored in the owned `profileImages` row. Existing single-image rows remain readable and publishable without migration or backfill.
- The upload endpoint receives the 384px blob in one authenticated request. Before storing anything it records an upload job with the SHA-256 of the incoming blob, profile ownership, and a creation time. The Node processing action records the derivative hash before storing it. The endpoint reports success only after both blobs are attached; handled failures delete newly stored blobs. A daily bounded reconciliation examines only expired jobs and deletes their verified, unreferenced blobs after **24 hours**; it must log counts and skip ambiguous matches. The 24-hour window is a proposed operational choice, separate from the still-unresolved account-deletion legal retention period.
- The UI disables Save, Publish, Remove, and a second upload while crop/export/upload is pending. A stale request completion cannot replace a newer image. An image revision check also protects cross-tab Save and Publish; a conflict gives a reload/retry message and does not overwrite the server image.
- This plan keeps direct Convex storage URLs for current image display. Such URLs are reusable by anyone who obtains them; they are not expiring signed URLs. If revocable draft media is required, add an authenticated serving endpoint as a separate decision before production.

## Source facts that shape the plan

- Current live preparation scales the full image to 1200px and exports JPEG; no crop coordinates or alpha-preserving format exist: `src/lib/profile-image.ts:11-45`.
- Live upload is `generateUploadUrl → POST → attachImage`; Save/Publish remain usable while it runs: `src/components/forms/ProfileEditor.tsx:644-679,980-1004`.
- `profiles.saveDraft` replaces the complete draft, including its image reference, without a revision check: `convex/profiles.ts:109-138`.
- Storage currently keeps one file mapping per profile image and cleans replacement/removal/deletion when it has a mapping: `convex/storage.ts:56-125`, `convex/profileImages.ts:87-119`.
- The public component renders one URL with `unoptimized`: `src/components/profile/PublicProfile.tsx:114-122`.
- Convex documents custom HTTP actions for a one-request upload; the current request-body limit is 20 MiB. HTTP actions run in the default runtime, so `sharp` belongs in a separate Node action called through `ctx.runAction`. `_storage` metadata is queryable for bounded reconciliation. See [Convex HTTP actions](https://docs.convex.dev/functions/http-actions), [upload guide](https://docs.convex.dev/file-storage/upload-files), [file metadata](https://docs.convex.dev/file-storage/file-metadata), [bundling guide](https://docs.convex.dev/functions/bundling), and [storage URL security](https://docs.convex.dev/file-storage/overview). The installed Convex Auth package exposes `useAuthToken()` for bearer-authenticated HTTP requests.

## State and failure contract

| Event                        | Local state                                                        | Stored state                                                      | Visitor state                           |
| ---------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------- |
| Pick source                  | Crop dialog opens; existing image remains                          | Unchanged                                                         | Unchanged                               |
| Cancel or invalid source     | Dialog closes with error if needed                                 | Unchanged                                                         | Unchanged                               |
| Apply crop                   | 384px crop exports and uploads as one request                      | Server generates 192px; only successful attach updates draft      | Unchanged                               |
| Upload failure               | Existing preview remains; actionable retry                         | Handled partial blobs deleted; crash orphans await reconciliation | Unchanged                               |
| Upload success               | New cropped image appears; editor adopts returned revision         | New image set is attached to draft                                | Published image unchanged               |
| Save other fields            | Latest server image reference is preserved                         | Draft fields update only if image revision matches                | Published image unchanged               |
| Publish                      | Disabled during upload; revision checked                           | Snapshot receives the exact current image set                     | New image appears after success         |
| Remove                       | Disabled during upload; revision checked                           | Draft image cleared; published set retained until next publish    | Published image unchanged until publish |
| Replace or approved deletion | Old set is removed only after no draft/published reference remains | Both variants and mapping deleted together                        | Deleted image URL becomes unavailable   |

## Planned file boundaries

| Area             | Files                                                                                                                                                                | Responsibility                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Product contract | `docs/spec.md`, `docs/plan.md`, `docs/design-proof.md`, `docs/live-e2e.md`                                                                                           | Crop, format, dimensions, retention, and proof language                                          |
| Image math       | `src/lib/profile-image.ts`, `tests/profile-image.test.ts`                                                                                                            | Decode limits, crop coordinates, alpha inspection, 384px output                                  |
| Crop UI          | New `src/components/forms/ProfileImageCropDialog.tsx`, new focused component test                                                                                    | Drag/zoom, keyboard controls, preview, Apply/Cancel                                              |
| Editor           | `src/components/forms/ProfileEditor.tsx`, focused UI test                                                                                                            | Shared demo/live selection, pending state, upload request, conflict feedback                     |
| Upload API       | `convex/http.ts`, new `convex/profileImageUploadHttp.ts`, new `convex/profileImageProcessing.ts`, `convex/storage.ts`, `convex.json`, `package.json`, `.env.example` | Authenticated blob intake, Node `sharp` validation/derivative, compensation, atomic attach       |
| Data and cleanup | `convex/schema.ts`, `convex/profileImages.ts`, `convex/profiles.ts`, new `convex/crons.ts`, new cleanup module                                                       | Image set mapping, upload jobs, image revision, reference-aware deletion, bounded reconciliation |
| Public delivery  | `convex/profileProjection.ts`, `convex/validators.ts`, `src/lib/domain/index.ts`, `src/components/profile/PublicProfile.tsx`                                         | Public small/large URLs and `srcSet`; no storage IDs in public projection                        |
| Other callers    | `src/components/forms/LinksEditor.tsx`, `src/components/admin/ProfilesManager.tsx`                                                                                   | Supply image revision to Publish and administrative draft saves                                  |
| End-to-end       | `convex/integration/storage.test.ts`, `e2e/live.spec.ts`, demo E2E profile coverage                                                                                  | Ownership, race, cleanup, crop, transparency, responsive delivery                                |

## Task 1: Fix the product contract and test fixtures

**Files:** Modify `docs/spec.md`, `docs/plan.md`; create small opaque landscape, transparent PNG, transparent WebP, and malformed-image fixtures under `tests/fixtures/profile-images/`.

**Interfaces:** Source input ≤ 5 MiB; browser crop is exactly 384×384; server derivative is exactly 192×192; combined output ≤ 5 MiB; alpha-preserving PNG decision; 24-hour orphan grace.

- [ ] Add the exact crop/format/variant/failure states above to Image handling and AC-013/AC-014. Replace the claim that one 1200px JPEG fulfills optimized responsive output.
- [ ] Add reproducible fixtures with known dimensions and alpha pixels. Check fixture dimensions, format, and size in a unit test rather than trusting filenames.
- [ ] Document that account-deletion retention remains a separate launch decision; the 24-hour rule applies only to abandoned upload blobs.
- [ ] Review the spec and plan for contradictions before implementation begins.

## Task 2: Image preparation and crop dialog

**Files:** Modify `src/lib/profile-image.ts`, `tests/profile-image.test.ts`; create `src/components/forms/ProfileImageCropDialog.tsx` and `tests/unit/profile-image-crop-dialog.test.tsx`; modify demo and live selection in `src/components/forms/ProfileEditor.tsx`.

**Interfaces:**

```ts
type Crop = { x: number; y: number; size: number }; // source-pixel square
type PreparedCrop = { blob: Blob; width: 384; contentType: "image/jpeg" | "image/png" };
async function prepareProfileImageCrop(file: File, crop: Crop): Promise<PreparedCrop>;
```

- [ ] Write failing tests for a landscape source where changing `crop.x` changes the sampled output, for exact 384px dimensions, for transparent pixels remaining alpha in PNG, and for opaque output being JPEG. Reject empty, unsupported, oversized, undecodable, zero-dimension, and excessive-pixel-count sources without changing the prior image.
- [ ] Implement source-pixel crop normalization and draw the crop into a 384px canvas. Inspect output alpha on the rendered canvas; export JPEG or PNG accordingly. Revoke temporary object URLs and release decoded resources on Cancel, retry, and unmount.
- [ ] Build a square crop viewport with pointer drag, zoom buttons/slider, arrow-key position controls, visible focus, and a round final preview. The Apply button emits the normalized crop; Cancel emits nothing. Announce export errors through the existing Notice/live-region pattern.
- [ ] Replace demo's duplicated full-image JPEG conversion with the shared crop result, storing only the 384px data URL in demo state. Keep a failed/cancelled selection from changing the current demo image.
- [ ] Run `npx vitest run tests/profile-image.test.ts tests/unit/profile-image-crop-dialog.test.tsx` and `npm run typecheck`; inspect the actual opaque-photo and transparent-logo previews on narrow and wide viewports.

## Task 3: Image-set storage with atomic attach and cleanup

**Files:** Modify `convex/schema.ts`, `convex/profileImages.ts`, `convex/storage.ts`, `convex/http.ts`, `package.json`, `package-lock.json`, `.env.example`; create `convex/profileImageUploadHttp.ts`, `convex/profileImageProcessing.ts`, `convex.json`; extend `convex/integration/storage.test.ts`.

**Interfaces:**

```ts
// Existing profile draft/published field stays the canonical large ID.
profileImages: {
  storageId: Id<"_storage">;      // large, 384px
  smallStorageId?: Id<"_storage">; // 192px; absent for legacy rows
  profileId: Id<"profiles">;
  ownerId: Id<"customers">;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
  createdAt: number;
};

profileImageUploadJobs: {
  profileId: Id<"profiles">;
  ownerId: Id<"customers">;
  largeSha256: string;
  smallSha256?: string; // populated before storing the derivative
  largeStorageId?: Id<"_storage">;
  smallStorageId?: Id<"_storage">;
  status: "pending" | "attached" | "failed";
  createdAt: number;
  uploadWindowEndsAt: number; // createdAt + 10 minutes
};

// POST /profile-image-upload: Authorization: Bearer <Convex Auth token>
// body: 384px JPEG or PNG; headers: Content-Type, X-Profile-Id, X-Image-Revision
// success JSON: { storageId, imageUrl, imageRevision }
```

- [ ] Add failing Convex integration tests for unauthenticated and cross-profile requests, invalid bytes despite MIME labels, wrong dimensions, over-limit output bytes, attachment failure cleanup, and both-variant replacement/removal/approved-deletion cleanup. Preserve existing single-image-row tests.
- [ ] Keep old `generateUploadUrl`/`attachImage` callable while developing the new path; after all callers and tests move and non-production upload succeeds, remove those public endpoints from the final change. Legacy **stored image rows** remain readable. The new job sweep cannot identify already abandoned blobs created by the old endpoint, so audit those separately before any manual cleanup.
- [ ] Add `sharp` as an explicit dependency and mark it external for the Convex Node bundle. Keep `convex/profileImageProcessing.ts` as a `"use node"` internal action file; HTTP actions and mutations stay in default-runtime files. Prove the package loads in an isolated non-production deployment before relying on it.
- [ ] Add `NEXT_PUBLIC_CONVEX_SITE_URL` to the example and live preflight contract. It must be the `.convex.site` URL paired with the configured `NEXT_PUBLIC_CONVEX_URL` deployment; reject a mismatch before uploading. Configure exact allowed web origins for CORS on the Convex side, including the isolated Preview origin.
- [ ] Add the HTTP action to the existing auth router. Authenticate via `ctx.auth`, confirm active profile access and scope, verify the incoming blob is within the 5 MiB cap, create the upload job with its SHA-256, and store the large blob. Call the internal Node action with its storage ID and job ID. The Node action uses `sharp` to decode/verify exact 384px dimensions, derive the 192px image in the same format, and enforce the combined output cap. Handle CORS only for configured app origins; register `OPTIONS` as well as `POST`. Do not log tokens or upload bytes.
- [ ] Register the large storage ID on the job immediately. The Node action calculates and records the derivative SHA-256 before storing it, then registers the small storage ID immediately. On a handled validation or attach error, delete every newly stored ID and mark the job failed. The attach mutation rechecks profile owner/scope, expected image revision, file metadata, and mapping uniqueness immediately before patching the draft and marking the job attached.
- [ ] Adapt `removeIfUnreferenced` and `deleteProfileImages` to delete the large and small objects as one image set. Keep a published set available while the draft points at a replacement. Legacy rows with no `smallStorageId` still work.
- [ ] Run `npx vitest run convex/integration/storage.test.ts` and `npm run typecheck`. Validate the HTTP route and preflight against an isolated non-production Convex deployment before treating browser upload as proved; `convex-test` alone cannot prove cross-origin upload behavior.

## Task 4: Revision-aware editor, Save, and Publish

**Files:** Modify `convex/schema.ts`, `convex/storage.ts`, `convex/profiles.ts`, `src/components/forms/ProfileEditor.tsx`, `src/components/forms/LinksEditor.tsx`, `src/components/admin/ProfilesManager.tsx`; add focused UI and Convex integration tests.

**Interfaces:**

```ts
// Old profiles read as revision 0; each attach/remove increments by 1.
profile.imageRevision?: number;
profiles.saveDraft({ profileId, draft, expectedImageRevision });
profiles.publish({ profileId, expectedImageRevision });
storage.removeImage({ profileId, expectedImageRevision });
```

- [ ] Write failing tests for: Save started before attach cannot restore the old image; a second tab with an old revision gets a conflict; Publish started during an upload cannot publish the older image; an earlier upload finishing after a newer selection cannot replace the newer one; Remove followed by stale Save cannot resurrect a deleted image.
- [ ] In `saveDraft`, compare the supplied revision with the server revision and build the persisted draft using the **current server `imageStorageId`**. Client `imageUrl` is still discarded. Return the updated revision with the Save result. In Publish, check revision before snapshotting. Increment revision on attach/remove. Use a stable conflict error string so callers can show “Photo changed elsewhere. Reload and try again.”
- [ ] In `ProfileEditor`, use one operation state for crop/export/upload/remove/save/publish. Save, Publish, Remove, and replacement picker are disabled while an image operation is active. After a successful upload, update the draft from the returned canonical ID and revision; a failed upload leaves the existing image and edits intact. Serialize Save and Publish through the latest draft revision rather than render-time `currentDraft`.
- [ ] Pass the image revision through Links Publish and administrative Save/Publish. If a conflict occurs, keep local nonimage edits, show the conflict, and require refresh/rebase before a retry. Do not silently retry against a different image.
- [ ] Run the focused editor and integration tests, then `npm run typecheck`. Verify double-click, navigation, sign-out, and cross-tab cases manually in non-production live mode.

## Task 5: Public responsive delivery and legacy compatibility

**Files:** Modify `convex/profileProjection.ts`, `convex/validators.ts`, `src/lib/domain/index.ts`, `src/components/profile/PublicProfile.tsx`, and tests for public/card projections.

**Interfaces:** Public projection adds `imageSrcSet?: string`; it never exposes either storage ID. Legacy rows return only `imageUrl`.

- [ ] Write failing tests proving draft variants do not appear in signed-out slug/card queries, publication exposes only the published set, old single-image rows still render, and both URLs are removed after approved deletion.
- [ ] Resolve both URLs from the verified owned mapping only. Build `imageSrcSet` as `smallUrl 192w, largeUrl 384w`; use `sizes="(min-width: 640px) 96px, 80px"` in the public component. Use a native `<img srcSet>` for this specific, already-optimized remote image (with a scoped Next lint explanation); `next/image` with `unoptimized` does not generate these custom stored-variant candidates. Keep existing `next/image` usage for repository-owned images.
- [ ] Verify 1×/2× mobile and desktop network requests select an appropriate source, transparent logos render consistently across themes, and missing legacy variants fall back to `imageUrl`.

## Task 6: Abandoned-upload reconciliation and retention proof

**Files:** Create `convex/crons.ts` and `convex/profileImageCleanup.ts`; extend `convex/integration/storage.test.ts`; update `docs/launch-readiness.md`, `docs/design-proof.md`, and `docs/live-e2e.md`.

**Interfaces:** A daily internal job paginates expired `profileImageUploadJobs`. For each pending/failed job it inspects known storage IDs plus `_storage` rows whose SHA-256 matches the job's expected hashes and whose creation time is between job creation and `uploadWindowEndsAt`. It deletes only blobs with no owned image-set mapping or draft/published reference. Unknown or ambiguous matches are logged and skipped.

- [ ] Write failing tests with a fake clock for 23-hour retention, 25-hour abandoned-file deletion, a crash between `storage.store` and job ID registration, referenced draft and published files retained, identical content uploaded for another profile retained, legacy rows retained, unknown owner skipped, and idempotent repeated sweeps.
- [ ] Index upload jobs by status and creation time. Reconcile only expired pending/failed jobs; never delete every unmapped `_storage` row by default. Use `ctx.db.system.query("_storage")` with the system creation-time index and bounded pagination to find crash-gap SHA matches within the ten-minute job window. Persist a scan cursor when one job exceeds a batch; expire completed job records after cleanup. An internal mutation rechecks references and job state before each deletion so an attachment racing the sweep wins safely.
- [ ] Emit counts for scanned, deleted, retained, and skipped files, without customer identifiers or URLs. Add an alert/runbook threshold for unexpected growth or cleanup errors. Account-deletion retention is still governed by its separate policy decision.
- [ ] Run the focused integration tests and inspect one dry-run result on an isolated non-production deployment. Enable deletion only after the matched candidates are confirmed to belong to expired upload jobs.

## Task 7: End-to-end verification and documentation closeout

**Files:** Modify `e2e/live.spec.ts` and relevant demo E2E coverage; update `docs/design-proof.md`, `docs/plan.md`, `docs/live-e2e.md`.

- [ ] Add browser coverage for: choose → crop → Apply → new private draft preview → Save → signed-out visitor still sees old image → Publish → visitor receives small/large `srcset`; Cancel and invalid file preserve the old image; transparent-logo output retains alpha; upload failure retains the old image and shows a retryable error.
- [ ] Search for remaining callers of `api.storage.generateUploadUrl` and `api.storage.attachImage`; require zero app callers and zero exposed legacy upload functions in the final diff. Keep legacy read and deletion compatibility in `profileImages`.
- [ ] Run focused Vitest/convex-test, `npm run verify`, demo Playwright, and the guarded `npm run test:e2e:live` only against an explicitly named isolated dev/preview deployment with the existing full live E2E contract. Never bypass the guarded wrapper or target Production for this proof.
- [ ] Inspect the actual network payload sizes and image appearance at 390px, 768px, and 1440px. Confirm browser behavior on current iPhone Safari and Android Chrome before claiming device acceptance.
- [ ] Record measured image bytes, upload latency, failed-upload behavior, orphan sweep counts, deployment IDs, and any open launch gates in `docs/design-proof.md`. Update `docs/plan.md` to remove only the image gates actually proved; retain overall launch NO-GO until the unrelated Preview, operational, and NTAG215 gates are satisfied.

## Completion criteria

- A customer can crop and preview both a photo and transparent logo before replacing an existing image.
- The final public image has 192px/384px browser-selectable variants and no public storage IDs.
- Failed or cancelled uploads do not change draft/published images; partial handled uploads are deleted; abandoned blobs are reconciled after the defined grace period without deleting unrelated files.
- Save/Publish/Remove cannot silently overwrite a newer image, including across tabs.
- Legacy single-image profiles and current publication privacy continue to work.
- The non-production browser run, tests, cleanup dry run, and visual/device checks have recorded evidence. No Production readiness claim follows solely from these checks.

## Review points before implementation

1. Confirm the proposed square crop, 192/384px variants, and transparency-preserving PNG rule. A logo-first product may prefer an uncropped `contain` option.
2. Confirm 24 hours for abandoned-upload cleanup and the operational owner for its alert. This is separate from the legal deletion-retention decision.
3. Confirm whether reusable direct Convex URLs are acceptable for draft previews. If immediate revocation of a shared draft URL is required, serving design must change.
