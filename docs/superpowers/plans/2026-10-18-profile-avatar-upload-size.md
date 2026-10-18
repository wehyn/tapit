# Profile Avatar Upload Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow profile avatar source files up to 20 MB while preserving bounded browser processing and the existing 5 MB processed-upload limits.

**Architecture:** `validateProfileAvatarFile` accepts avatar source files through 20 MiB and the crop helper uses that validator. Keep `validateProfileImageFile` at 5 MiB for profile gallery/background media, and retain the 5 MiB guards in both customer and administrator media callbacks. Decode through a temporary object URL where available, reject images over 12,000 pixels per edge or 24 million total pixels, then keep the existing 384 by 384 crop and image encoding. Do not change processed server upload/storage caps.

**Tech Stack:** Next.js, React, TypeScript, browser image APIs, Convex HTTP Actions, Playwright demo E2E, Vitest.

---

### Task 1: Add coverage for the larger source-file boundary

**Files:**

- Modify: `tests/profile-image.test.ts`
- Modify: `e2e/customer.spec.ts`
- Modify: `e2e/admin.spec.ts`

- [ ] **Step 1: Update the existing validator boundary assertions before changing implementation**

In `tests/profile-image.test.ts`, retain the existing 5 MiB boundary and unsupported-MIME assertions for `validateProfileImageFile`. Add separate `validateProfileAvatarFile` assertions that accept files through `20 * 1024 * 1024`, reject `20 * 1024 * 1024 + 1`, and return `Images must be 20 MB or smaller.` for oversized avatar sources.

- [ ] **Step 2: Cover the decoded-pixel guard in the existing helper test file**

Add a `prepareProfileImageCrop` case with a valid JPEG `File`, a mocked `Image` whose `naturalWidth` is 6000 and `naturalHeight` is 5000, and a crop within those bounds. Expect rejection with `This image has too many pixels to crop. Choose a lower-resolution image.`. Assert that canvas creation was not called. Stub `URL.createObjectURL` and `URL.revokeObjectURL`, and retain the `FileReader` stub until the implementation switches to the object-URL path. Verify the temporary URL is revoked after both success and failure.

- [ ] **Step 3: Add a customer E2E case for a valid source above 5 MB**

Add `sharp` and `randomBytes` imports to `e2e/customer.spec.ts`. Name the test `customer can crop a profile photo source larger than 5 MB`. Beside the existing photo-crop test, generate a valid 1600 by 1600 PNG with raw random RGB pixels and PNG compression level 0:

```ts
const width = 1600;
const height = 1600;
const pixels = randomBytes(width * height * 3);
const source = await sharp(pixels, {
  raw: { width, height, channels: 3 },
})
  .png({ compressionLevel: 0 })
  .toBuffer();

expect(source.byteLength).toBeGreaterThan(5 * 1024 * 1024);
expect(source.byteLength).toBeLessThanOrEqual(20 * 1024 * 1024);
```

Reset the demo harness, sign in as a customer, open `/app/profile`, pass the buffer to `Profile photo or logo`, and assert that `Adjust profile photo` appears. Apply the crop and assert `Photo applied` is visible and the profile image uses the prepared image data URL.

- [ ] **Step 4: Run the new focused checks and confirm the expected initial failure**

Run:

```bash
npm run test -- tests/profile-image.test.ts
npm run test:e2e:demo -- e2e/customer.spec.ts -g "customer can crop a profile photo source larger than 5 MB"
```

Expected before implementation: the updated validation boundary fails because the helper still rejects sources above 5 MB, and the E2E does not reach the crop dialog.

- [ ] **Step 5: Add the equivalent administrator upload E2E**

In `e2e/admin.spec.ts`, use the same Sharp/randomBytes PNG pattern, assert the generated source is larger than 5 MiB and no larger than 20 MiB, then sign in as admin, open Mara's profile editor, upload the source through `Profile photo or logo`, and verify the existing crop dialog opens and applies the crop.

### Task 2: Raise the source limit and guard browser processing

**Files:**

- Modify: `src/lib/profile-image.ts`
- Modify: `src/components/forms/ProfileEditor.tsx`
- Modify: `src/components/admin/AdminProfileContentEditor.tsx`

- [ ] **Step 1: Keep separate avatar and gallery/background validators**

In `src/lib/profile-image.ts`, retain the separate 5 MiB `validateProfileImageFile` policy and use a 20 MiB ceiling for `validateProfileAvatarFile`, with the corresponding `Images must be 20 MB or smaller.` error. The crop helper must use `validateProfileAvatarFile`. Keep the existing JPEG/PNG/WebP type check and `MAX_CROP_PIXELS` unchanged.

```ts
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PROFILE_AVATAR_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_IMAGE_EDGE = 12_000;
const MAX_SOURCE_IMAGE_PIXELS = 24_000_000;
```

- [ ] **Step 2: Decode the source with a temporary object URL**

Replace the primary `readAsDataUrl(file)` path in `prepareProfileImageCrop` with `URL.createObjectURL(file)`. Retain a `FileReader` fallback only when `URL.createObjectURL` is unavailable. Update the browser capability check to require `Image` and at least one of object-URL or FileReader support. Revoke a created URL in `finally` so it is cleaned up on successful crop preparation and every thrown error. Keep the existing canvas crop and JPEG/PNG output code unchanged.

- [ ] **Step 3: Enforce source dimensions before canvas work**

Immediately after image decoding, reject non-finite or non-positive dimensions, either edge above `MAX_SOURCE_IMAGE_EDGE`, or a source pixel count above `MAX_SOURCE_IMAGE_PIXELS`:

```ts
const sourcePixels = image.naturalWidth * image.naturalHeight;
if (
  !Number.isSafeInteger(image.naturalWidth) ||
  !Number.isSafeInteger(image.naturalHeight) ||
  image.naturalWidth <= 0 ||
  image.naturalHeight <= 0 ||
  image.naturalWidth > MAX_SOURCE_IMAGE_EDGE ||
  image.naturalHeight > MAX_SOURCE_IMAGE_EDGE ||
  sourcePixels > MAX_SOURCE_IMAGE_PIXELS
) {
  throw new Error("This image has too many pixels to crop. Choose a lower-resolution image.");
}
```

Run this before creating the 384 by 384 canvas. Keep the existing crop-coordinate and crop-area validation after it.

- [ ] **Step 4: Update avatar-only help text**

Change only avatar-photo helper strings to `JPG, PNG, or WebP. Max 20 MB.` in `src/components/forms/ProfileEditor.tsx` and `src/components/admin/AdminProfileContentEditor.tsx`. Keep customer and administrator media callback guards at 5 MiB and do not change profile gallery/background copy or behavior.

### Task 3: Update the product documentation

**Files:**

- Modify: `docs/spec.md`
- Modify: `docs/plan.md`

- [ ] **Step 1: Clarify the source-file limit in the specification**

Update the failed-image-upload requirement in `docs/spec.md` to say the user-facing error explains accepted formats and the 20 MB avatar source-file limit.

- [ ] **Step 2: Clarify the input and processed-image distinction in the project plan**

Update the profile-image references in `docs/plan.md` from a single 5 MB file limit to a 20 MB selected avatar source limit followed by the existing bounded crop output. State that profile gallery/background media retain their separate 5 MB limit.

### Task 4: Verify the implementation without changing backend limits

**Files:**

- Verify: `src/lib/profile-image.ts`
- Verify: `src/components/forms/ProfileEditor.tsx`
- Verify: `src/components/admin/AdminProfileContentEditor.tsx`
- Verify: `convex/profileImageUploadHttp.ts`
- Verify: `convex/profileImageProcessing.ts`
- Verify: `convex/profileImages.ts`
- Verify: `convex/storage.ts`
- Verify: `convex/profileMediaUploadHttp.ts`

- [ ] **Step 1: Run the focused avatar E2E**

Run both customer and administrator paths:

```bash
npm run test:e2e:demo -- e2e/customer.spec.ts -g "customer can crop a profile photo source larger than 5 MB"
npm run test:e2e:demo -- e2e/admin.spec.ts -g "administrator can crop a profile photo source larger than 5 MB"
```

Expected: each valid source over 5 MiB and no larger than 20 MiB opens the crop dialog, applies successfully, and results in the prepared avatar image.

- [ ] **Step 2: Run the required project verification command**

Run `npm run verify`. Expected: formatting, lint, typecheck, unit tests, and build pass. Keep `NEXT_PUBLIC_DEMO_MODE=true` and do not use Production for E2E or provisioning.

- [ ] **Step 3: Confirm backend and media boundaries remain unchanged**

Review that the profile image HTTP route still limits the prepared request to 5 MB, server processing still requires 384 by 384 and keeps the combined image set within 5 MB, and the profile gallery/background routes still reject sources above 5 MB.

- [ ] **Step 4: Commit only the implementation files for this feature**

Stage the files listed in Tasks 1–3 and commit them with:

```bash
git commit -m "fix: accept larger profile avatar sources"
```

Do not stage unrelated untracked worktree files.
