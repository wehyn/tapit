# Editor Media Preview Validation and Demo Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Keep an uploaded background image visible in the editor while its accessible description is empty, block draft saves and publication until that description is supplied, and keep demo-mode media within a safe localStorage budget.

**Architecture:** Preserve the strict published projection and existing persistence validators. Add a narrowly scoped editor-preview option that permits only a valid background asset with empty altText, validate media before both demo and live saves, and isolate demo image resizing/compression in a browser-only helper that stores one bounded data URL rather than duplicating url and previewUrl.

**Tech Stack:** Next.js, React, TypeScript, Convex-backed live editor, localStorage demo store, Playwright E2E, Vitest verification suite.

---

### Task 1: Add strict-by-default incomplete-media projection

**Files:**

- Modify: src/lib/profile-media.ts
- Modify: src/lib/domain/index.ts
- Modify: src/lib/demo/projection.ts
- Modify: src/components/forms/ProfileEditor.tsx
- Test: e2e/customer.spec.ts

- [ ] **Step 1: Add the failing E2E scenario**

Add this test beside the existing bounded media test in e2e/customer.spec.ts:

```ts
test("incomplete background media stays in preview but blocks saving and publishing", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await page.getByRole("tab", { name: "Media" }).click();
  await page
    .getByLabel("Upload background image")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");

  await expect(page.getByRole("status").filter({ hasText: "Uploading image" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Profile hero" })).toBeVisible();
  await expect(
    page.getByText("A background image needs an accessible description.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /^(?:Publish(?: changes)?|Published)$/ }),
  ).toBeDisabled();

  await page.getByLabel("Background image description").fill("Warm studio backdrop");
  await expect(
    page.getByText("A background image needs an accessible description.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
npm run test:e2e:demo -- e2e/customer.spec.ts -g "incomplete background media stays"
```

Expected: FAIL because strict normalization drops the empty-alt background and Save is not guarded by media errors.

- [ ] **Step 3: Add opt-in normalization for an incomplete background**

In src/lib/profile-media.ts, add:

```ts
export type ProfileMediaNormalizationOptions = {
  allowIncompleteBackground?: boolean;
};

function normalizeImage(
  value: unknown,
  allowEmptyAltText = false,
): ProfileMediaImage | undefined {
  if (!isRecord(value) || !validAssetId(value.assetId)) return undefined;
  const altText = typeof value.altText === "string" ? value.altText.trim() : "";
  if (!validAltText(altText) && !(allowEmptyAltText && altText.length === 0)) return undefined;
  return {
    assetId: value.assetId.trim() as Id<"profileMediaAssets">,
    altText,
    ...(validUrl(value.url) ? { url: value.url.trim() } : {}),
    ...(validUrl(value.previewUrl) ? { previewUrl: value.previewUrl.trim() } : {}),
  };
}

function normalizeBackground(
  value: unknown,
  options: ProfileMediaNormalizationOptions,
): ProfileMediaBackground | undefined {
  const image = normalizeImage(value, options.allowIncompleteBackground === true);
  if (image === undefined || !isRecord(value)) return undefined;
  const positionX = isFiniteNumber(value.positionX) ? clamp(value.positionX, 0, 100) : 50;
  const positionY = isFiniteNumber(value.positionY) ? clamp(value.positionY, 0, 100) : 50;
  return { ...image, positionX, positionY };
}

export function normalizeProfileMedia(
  value: unknown,
  options: ProfileMediaNormalizationOptions = {},
): ProfileMediaPresentation | undefined {
  if (!isRecord(value)) return undefined;
  const background = normalizeBackground(value.background, options);
  // Retain the existing slideshow loop, which calls normalizeImage(item) strictly.
```

Keep stripProfileMediaUrls calling normalizeProfileMedia(media) with no options. Therefore persistence and public normalization stay strict, and only a background can use the editor exception.

- [ ] **Step 4: Thread a projection option through the public projector**

In src/lib/domain/index.ts, add:

```ts
export type PublicProfileProjectionOptions = {
  allowIncompleteMedia?: boolean;
};
```

Change the private projector and public function signatures to accept that option:

```ts
function projectPublicProfileMedia(
  value: unknown,
  options: PublicProfileProjectionOptions = {},
): PublicProfileMediaPresentation | undefined {
  const normalized = normalizeProfileMedia(value, {
    allowIncompleteBackground: options.allowIncompleteMedia === true,
  });
  // Retain the current source selection, alt mapping, and output shape.
}

export function projectPublicProfile(
  profile: ProfileRecord,
  options: PublicProfileProjectionOptions = {},
): PublicProfileProjection | null {
  if (profile.status !== "published" || profile.published === null) return null;
  const snapshot = profile.published;
  const media = projectPublicProfileMedia(snapshot.media, options);
  // Retain every existing projected profile field.
}
```

Keep the default strict. In src/lib/demo/projection.ts, accept an optional final PublicProfileProjectionOptions parameter and pass it as the second argument to projectPublicProfile:

```ts
export function projectDemoPublicProfile(
  profile: DemoProfile,
  content: ProfileContent | PublishedProfileSnapshot | null = profile.published,
  legacyTheme?: ProfileTheme,
  options: PublicProfileProjectionOptions = {},
): PublicProfileProjection | null {
  if (content === null || profile.status !== "published") return null;
  return projectPublicProfile(
    {
      ...profile,
      status: "published",
      published: {
        ...content,
        theme: legacyTheme ?? content.theme ?? profile.theme,
        publishedAt: "publishedAt" in content ? content.publishedAt : new Date().toISOString(),
      },
    },
    options,
  );
}
```

- [ ] **Step 5: Use the option only in editor preview**

In src/components/forms/ProfileEditor.tsx, pass { allowIncompleteMedia: true } to both projectDemoPublicProfile and projectPublicProfile calls inside profileForPreview. Do not pass it from public pages, Convex projections, publication snapshots, or stripProfileMediaUrls.

- [ ] **Step 6: Run projection checks**

Run:

```bash
npm run test:unit -- tests/unit/profile-media.test.ts tests/unit/profile-media-parity.test.ts tests/unit/domain.test.ts
npm run test:e2e:demo -- e2e/customer.spec.ts -g "incomplete background media stays"
```

Expected: existing strict projection tests pass and the hero is now visible; the focused E2E may still fail on Save controls until Task 2.

- [ ] **Step 7: Commit the projection change**

```bash
git add src/lib/profile-media.ts src/lib/domain/index.ts src/lib/demo/projection.ts src/components/forms/ProfileEditor.tsx e2e/customer.spec.ts
git commit -m "feat: preview incomplete background media in editor"
```

### Task 2: Gate demo and live saves on media validation

**Files:**

- Modify: src/components/forms/ProfileEditor.tsx
- Test: e2e/customer.spec.ts

- [ ] **Step 1: Derive media-specific errors in both editor implementations**

Import validateProfileMedia with the existing domain helpers. In DemoProfileEditor add:

```ts
const mediaErrors = validateProfileMedia(draft.media);
```

In LiveProfileEditorContent add:

```ts
const mediaErrors = validateProfileMedia(currentDraft.media);
```

Keep the existing complete errors list for publication validation and workspace error display.

- [ ] **Step 2: Guard both save callbacks before persistence**

After the unresolved-upload guard and before any updateDemoState or saveDraftMutation call, add to both save functions:

```ts
if (mediaErrors.length > 0) {
  setMessage({ tone: "error", text: mediaErrors.join(" ") });
  return false;
}
```

This protects both the visible Save action and navigation-triggered saves. Publish continues to use the existing complete publication validation.

- [ ] **Step 3: Disable Save while media errors exist**

Add mediaErrors.length > 0 to both saveDisabled expressions:

```tsx
saveDisabled={
  !isDirty ||
  mediaErrors.length > 0 ||
  cropFile !== null ||
  imagePending ||
  hasUnresolvedMedia
}
```

Retain the live editor pending !== null condition. Leave publishDisabled based on errors.length so all existing publication rules remain enforced.

- [ ] **Step 4: Run focused behavior checks**

Run:

```bash
npm run test:e2e:demo -- e2e/customer.spec.ts -g "incomplete background media stays|pending media uploads|failed media uploads|bounded profile media"
```

Expected: the incomplete image remains visible, both action buttons are disabled until its description is nonblank, and existing pending/failed upload tests remain green.

- [ ] **Step 5: Commit the validation gate**

```bash
git add src/components/forms/ProfileEditor.tsx e2e/customer.spec.ts
git commit -m "fix: require media descriptions before saving drafts"
```

### Task 3: Bound demo media and remove duplicate storage

**Files:**

- Create: src/lib/demo/media.ts
- Modify: src/components/forms/ProfileEditor.tsx
- Test: e2e/customer.spec.ts

- [ ] **Step 1: Add the failing localStorage assertion**

Extend the successful demo media E2E flow after the description is filled and Save succeeds:

```ts
const storedMedia = await page.evaluate(() => {
  const raw = window.localStorage.getItem("tapit:demo-state:v1");
  if (!raw) throw new Error("Expected demo state after saving media.");
  const state = JSON.parse(raw) as {
    profile?: { draft?: { media?: { background?: Record<string, unknown> } } };
    profiles?: Array<{ draft?: { media?: { background?: Record<string, unknown> } } }>;
  };
  const profile = state.profiles?.find((candidate) => candidate.draft?.media?.background);
  return profile?.draft?.media?.background ?? state.profile?.draft?.media?.background;
});
expect(storedMedia).toBeTruthy();
expect(storedMedia).not.toHaveProperty("previewUrl");
expect(typeof storedMedia?.url).toBe("string");
expect((storedMedia?.url as string).length).toBeLessThan(250_000);
```

Run:

```bash
npm run test:e2e:demo -- e2e/customer.spec.ts -g "bounded profile media"
```

Expected: FAIL because uploadDemoMedia currently stores the original data URL as both url and previewUrl.

- [ ] **Step 2: Create the bounded browser helper**

Create src/lib/demo/media.ts:

```ts
const MAX_DEMO_MEDIA_DIMENSION = 1280;
const DEMO_MEDIA_JPEG_QUALITY = 0.78;

export async function prepareDemoMediaDataUrl(file: File): Promise<string> {
  if (
    typeof document === "undefined" ||
    typeof FileReader === "undefined" ||
    typeof Image === "undefined"
  ) {
    throw new Error("Demo media can only be prepared in a browser.");
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onerror = () => reject(new Error("That image could not be decoded. Try again."));
      element.onload = () => resolve(element);
      element.src = sourceUrl;
    });
    const scale = Math.min(
      1,
      MAX_DEMO_MEDIA_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context || typeof canvas.toBlob !== "function")
      throw new Error("This browser cannot prepare demo media.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (nextBlob) =>
          nextBlob
            ? resolve(nextBlob)
            : reject(new Error("That image could not be converted. Try again.")),
        "image/jpeg",
        DEMO_MEDIA_JPEG_QUALITY,
      );
    });
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("That image could not be stored. Try again."));
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("That image could not be stored. Try again."));
      reader.readAsDataURL(blob);
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
```

Use the existing image file validation before this helper. Do not return the original file data URL on failure.

- [ ] **Step 3: Store the prepared value once**

Import prepareDemoMediaDataUrl in ProfileEditor.tsx. Replace the demo upload return with:

```ts
const url = await prepareDemoMediaDataUrl(file);
if (requestId !== mediaRequestRef.current) throw new Error("The media upload was canceled.");
return { assetId: demoMediaAssetId(requestId), altText: "", url };
```

Leave uploadLiveMedia, parseMediaUploadResponse, Convex ownership/revision behavior, and the pending object-URL preview unchanged. Preparation errors must use the existing setMediaError and retry path.

- [ ] **Step 4: Run focused media and upload checks**

Run:

```bash
npm run test:e2e:demo -- e2e/customer.spec.ts -g "bounded profile media|incomplete background media stays|pending media uploads|failed media uploads"
npm run test:unit -- tests/unit/profile-editor-image-upload.test.ts tests/unit/profile-media-editor.test.ts
```

Expected: saved demo media has one url, no previewUrl, and a data URL shorter than 250,000 characters. Pending preview remains a blob URL, and live upload parsing tests remain green.

- [ ] **Step 5: Commit the quota-safe upload**

```bash
git add src/lib/demo/media.ts src/components/forms/ProfileEditor.tsx e2e/customer.spec.ts
git commit -m "fix: bound demo media storage"
```

### Task 4: Complete verification and final review

**Files:**

- Verify: all changed files and preserved worktree state

- [ ] **Step 1: Run the required checks**

Run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:e2e:demo
npm run build
npm run verify
```

Expected: every command exits 0. Keep E2E artifacts under test-results and do not use production or live E2E.

- [ ] **Step 2: Review the final diff**

Run:

```bash
git status --short
git diff HEAD~3..HEAD --stat
git diff HEAD~3..HEAD -- src/lib/profile-media.ts src/lib/domain/index.ts src/lib/demo/projection.ts src/components/forms/ProfileEditor.tsx src/lib/demo/media.ts e2e/customer.spec.ts
```

Confirm that public projection defaults remain strict, stripProfileMediaUrls never preserves incomplete media, the editor-only option is used only by profileForPreview, both save paths validate media before persistence, publish still uses full publication validation, demo media is stored once, and unrelated worktree changes remain untouched.

- [ ] **Step 3: Commit only any required final adjustment**

If verification requires a source adjustment, commit only affected files:

```bash
git add src/lib/profile-media.ts src/lib/domain/index.ts src/lib/demo/projection.ts src/components/forms/ProfileEditor.tsx src/lib/demo/media.ts e2e/customer.spec.ts
git commit -m "chore: verify editor media persistence guards"
```
