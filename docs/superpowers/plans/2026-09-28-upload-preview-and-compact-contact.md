# Upload Preview and Compact Contact Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make selected profile media visible immediately during cloud upload and add persisted full-label, icon-circle, and icon-soft-square contact display choices.

**Architecture:** Keep pending media entirely client-side: the media editor owns the local object URL and selected file, while the profile editor merges a separate pending-media projection into the live preview and blocks persistence until the upload succeeds or the pending selection is removed. Add one backward-compatible `contactDisplay` customization value that flows through existing normalization, Convex validation, editor controls, public projection, and `ProfileContactStrip` rendering.

**Tech Stack:** Next.js App Router, React, TypeScript, Convex validators/mutations, Phosphor Icons, Playwright demo E2E, existing Tapit Warm Studio styling.

---

## File map and boundaries

| File | Responsibility in this plan |
| --- | --- |
| `src/lib/profile-customization.ts` | Define, normalize, validate, and default the contact display choice. |
| `convex/validators.ts` | Accept the new persisted customization value on drafts and published snapshots. |
| `src/lib/profile-workspace.ts` | Classify new customization errors under Layout. |
| `src/components/profile/ProfileContactStrip.tsx` | Render full labels or either compact icon treatment with accessible names. |
| `src/components/forms/ProfileCustomizationEditor.tsx` | Expose the three contact display choices in the existing Layout controls. |
| `src/lib/profile-media-preview.ts` | Pure client-only type/helper for merging pending local media into a public preview projection. |
| `src/components/forms/ProfileMediaEditor.tsx` | Create/revoke local object URLs, retain failed files for retry, and report pending preview state. |
| `src/components/forms/ProfileEditor.tsx` | Coordinate pending media state, preview projection, action guards, refresh warning, and demo/live parity. |
| `e2e/support/demo-harness.ts` | Set deterministic demo upload delay/failure controls for E2E. |
| `e2e/customer.spec.ts` | Verify pending upload UX, failure recovery, contact display choices, and publication privacy. |
| `docs/superpowers/specs/2026-09-28-upload-preview-and-compact-contact-design.md` | Approved design source of truth; do not change behavior beyond it. |

The plan deliberately does not change `convex/profileMediaUploadHttp.ts`, media ownership checks, media revision semantics, or cloud cleanup.

---

### Task 1: Add the backward-compatible contact display contract

**Files:**

- Modify: `src/lib/profile-customization.ts`
- Modify: `convex/validators.ts`
- Modify: `src/lib/profile-workspace.ts`

- [ ] **Step 1: Define the display union and default.**

In `src/lib/profile-customization.ts`, add the type beside the existing link-treatment types and make it optional on the stored customization so older records remain valid:

```ts
export type ProfileContactDisplay = "labels" | "icons-circle" | "icons-soft-square";

export interface ProfileCustomization {
  preset: "warm-studio";
  accent: ProfileAccent;
  typeScale: ProfileTypeScale;
  linkTreatment: ProfileLinkTreatment;
  contentOrder: ProfileContentOrder;
  contactDisplay?: ProfileContactDisplay;
  identityColors?: ProfileIdentityColors;
  featuredLinkId?: string;
  section?: ProfileSection;
}

export const DEFAULT_WARM_STUDIO_CUSTOMIZATION: ProfileCustomization = {
  preset: "warm-studio",
  accent: "coral",
  typeScale: "comfortable",
  linkTreatment: "filled",
  contentOrder: "links-first",
  contactDisplay: "labels",
};
```

- [ ] **Step 2: Normalize missing and invalid values safely.**

Add a set of allowed values and resolve missing values to `labels` while preserving the existing normalization contract:

```ts
const PROFILE_CONTACT_DISPLAYS = new Set<ProfileContactDisplay>([
  "labels",
  "icons-circle",
  "icons-soft-square",
]);

function normalizeContactDisplay(value: unknown): ProfileContactDisplay {
  return PROFILE_CONTACT_DISPLAYS.has(value as ProfileContactDisplay)
    ? (value as ProfileContactDisplay)
    : "labels";
}
```

Include `contactDisplay: normalizeContactDisplay(value.contactDisplay)` in the returned normalized customization. Extend `validateProfileCustomization` so an explicitly provided invalid value returns the existing style of publication-blocking message, using the marker text `profile customization contact display`.

- [ ] **Step 3: Extend Convex validation without forcing a migration.**

In `convex/validators.ts`, add the optional union to `profileCustomizationValidator`:

```ts
contactDisplay: v.optional(
  v.union(v.literal("labels"), v.literal("icons-circle"), v.literal("icons-soft-square")),
),
```

Do not make it required: old profile documents must continue to validate and normalize to labels in application code.

- [ ] **Step 4: Classify the new validation marker.**

Add the marker to the Layout category in `src/lib/profile-workspace.ts`:

```ts
layout: ["profile customization content order", "profile customization contact display"],
```

- [ ] **Step 5: Commit the contract change.**

```sh
git add src/lib/profile-customization.ts convex/validators.ts src/lib/profile-workspace.ts
git commit -m "feat: add contact display customization"
```

---

### Task 2: Render and edit the compact contact choices

**Files:**

- Modify: `src/components/profile/ProfileContactStrip.tsx`
- Modify: `src/components/forms/ProfileCustomizationEditor.tsx`

- [ ] **Step 1: Add a display prop and class variants to the contact strip.**

Update `ProfileContactStrip` to accept `display?: ProfileContactDisplay`, default it to `labels`, and use explicit compact classes:

```tsx
export function ProfileContactStrip({
  email,
  phone,
  website,
  display = "labels",
  className = "",
}: {
  email?: string;
  phone?: string;
  website?: string;
  display?: ProfileContactDisplay;
  className?: string;
}) {
const compact = display !== "labels";
const shape = display === "icons-soft-square" ? "rounded-lg" : "rounded-full";
```

For each action, keep the visible label only in label mode and always keep the accessible name. The compact link shape should follow the existing Warm Studio border/current-color treatment:

```tsx
<a
  aria-label={action.label}
  className={`inline-flex min-h-11 min-w-11 items-center justify-center border border-current/20 px-3.5 py-2 text-sm font-semibold transition motion-reduce:transition-none motion-reduce:transform-none hover:-translate-y-px hover:border-current/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus active:translate-y-px ${compact ? shape : "gap-2 rounded-full"}`}
  href={action.href}
  title={compact ? action.label : undefined}
  ...
>
  <Icon aria-hidden="true" size={17} />
  {!compact ? <span>{action.label}</span> : null}
</a>
```

Preserve website `target`/`rel`, action order, omission of blank fields, and the existing navigation label.

- [ ] **Step 2: Add the choice group to Layout controls.**

In `ProfileCustomizationEditor.tsx`, import `ProfileContactDisplay` and add a `ChoiceGroup` after Content order in the Layout tab:

```tsx
<ChoiceGroup
  error={contactDisplayError}
  label="Contact info display"
  name={`${baseId}-contact-display`}
  onChange={(value) => update({ contactDisplay: value })}
  options={[
    ["labels", "Icon + label"],
    ["icons-circle", "Icons · circles"],
    ["icons-soft-square", "Icons · soft squares"],
  ]}
  value={customization.contactDisplay ?? "labels"}
/>
```

Derive `contactDisplayError` through the same `findError` marker pattern used by the other customization fields. Keep the group disabled for legacy profiles until Warm Studio is enabled, matching all other guided customization controls.

- [ ] **Step 3: Pass the choice through the public profile renderer.**

In `PublicProfile.tsx`, pass the normalized customization choice to `ProfileContactStrip`:

```tsx
<ProfileContactStrip
  display={customization?.contactDisplay ?? "labels"}
  email={profile.email}
  phone={profile.phone}
  website={profile.website}
  className={`${phonePreview ? "mt-7 justify-center" : preview ? "mt-5 justify-center" : "mt-7 justify-center sm:justify-start"} ${mutedClasses}`}
/>
```

- [ ] **Step 4: Commit the contact UI.**

```sh
git add src/components/profile/ProfileContactStrip.tsx src/components/forms/ProfileCustomizationEditor.tsx src/components/profile/PublicProfile.tsx
git commit -m "feat: render compact contact actions"
```

---

### Task 3: Add a client-only pending-media preview boundary

**Files:**

- Create: `src/lib/profile-media-preview.ts`
- Modify: `src/components/forms/ProfileEditor.tsx`

- [ ] **Step 1: Define pending upload state without a fake asset ID.**

Create a pure helper module with this shape:

```ts
import type { PublicProfileProjection } from "./domain";

export type PendingProfileMediaUpload = {
  target: "background" | "slideshow";
  file: File;
  previewUrl: string;
  altText: string;
  positionX: number;
  positionY: number;
  state: "uploading" | "error";
  error?: string;
};

export function mergePendingProfileMediaPreview(
  profile: PublicProfileProjection,
  pending: PendingProfileMediaUpload | null,
): PublicProfileProjection {
  if (pending === null) return profile;

  const currentMedia = profile.media ?? {
    heroHeight: 320,
    slideshow: [],
    autoplay: true,
  };
  const localImage = { src: pending.previewUrl, alt: pending.altText };
  const media =
    pending.target === "background"
      ? {
          ...currentMedia,
          background: {
            ...localImage,
            positionX: pending.positionX,
            positionY: pending.positionY,
          },
        }
      : { ...currentMedia, slideshow: [...currentMedia.slideshow, localImage] };

  return { ...profile, media };
}
```

The helper must only operate on the already-public preview shape. It must never add `assetId`, `storageId`, or local URLs to a persisted `ProfileContent` value.

- [ ] **Step 2: Extend the preview projection boundary.**

Change `profileForPreview` in `ProfileEditor.tsx` to accept `pendingMedia: PendingProfileMediaUpload | null`, build the existing projection exactly as before, then return `mergePendingProfileMediaPreview(projected, pendingMedia)`. Keep the demo legacy-theme path and live Warm Studio path behavior identical apart from the merged client-only media.

- [ ] **Step 3: Add the state to both editor implementations.**

In both `DemoProfileEditor` and `LiveProfileEditorContent`, add:

```tsx
const [pendingMediaPreview, setPendingMediaPreview] =
  useState<PendingProfileMediaUpload | null>(null);
const hasUnresolvedMedia = mediaBusy || pendingMediaPreview !== null;
```

Pass `pendingMediaPreview` to `profileForPreview` and pass `setPendingMediaPreview` into `ProfileCustomizationEditor` as the new media-preview callback.

- [ ] **Step 4: Commit the preview boundary.**

```sh
git add src/lib/profile-media-preview.ts src/components/forms/ProfileEditor.tsx
git commit -m "feat: merge pending media into editor preview"
```

---

### Task 4: Make the media editor local-first and retryable

**Files:**

- Modify: `src/components/forms/ProfileMediaEditor.tsx`
- Modify: `src/components/forms/ProfileCustomizationEditor.tsx`

- [ ] **Step 1: Add the pending-preview callback prop.**

Extend `ProfileMediaEditorProps` and the parent editor props with:

```ts
onPendingPreviewChange?: (pending: PendingProfileMediaUpload | null) => void;
```

Import `PendingProfileMediaUpload` from `src/lib/profile-media-preview.ts`.

- [ ] **Step 2: Create a local preview before awaiting cloud upload.**

On file selection, create an object URL and notify the parent before calling `onUpload`:

```ts
const previewUrl = URL.createObjectURL(file);
const pending = {
  target,
  file,
  previewUrl,
  altText: file.name || `Selected ${target} image`,
  positionX: 50,
  positionY: 50,
  state: "uploading" as const,
};
onPendingPreviewChange?.(pending);
```

The upload request then runs using the existing request-id protection. Do not call `onChange` with the pending image because it has no cloud asset ID.

- [ ] **Step 3: Replace local state with the returned cloud image on success.**

When `onUpload` resolves, update the existing background/slideshow draft exactly as today, call `onChange(next)`, clear the pending callback, and revoke the prior object URL after the cloud image is installed:

```ts
onChange(next);
onPendingPreviewChange?.(null);
URL.revokeObjectURL(previewUrl);
```

Guard the cleanup by request ID so a stale response cannot revoke a newer request’s URL.

- [ ] **Step 4: Preserve the local preview and selected file on failure.**

On failure, keep the object URL and report an error pending state:

```ts
onPendingPreviewChange?.({
  ...pending,
  state: "error",
  error: message,
});
```

Add a visible `Retry upload` button in the media error treatment. Retry the retained `File` using a new request ID. Add a `Discard selected image` action that clears pending state, revokes the URL, and leaves the persisted draft media unchanged.

- [ ] **Step 5: Clean up replacements and unmounts.**

Track the active object URL in a ref. Revoke it when a pending selection is replaced, discarded, successfully uploaded, or the component unmounts. Do not revoke it merely because the upload failed while Retry remains available.

- [ ] **Step 6: Pass the callback through the customization editor.**

Add `onMediaPendingPreviewChange` to `ProfileCustomizationEditorProps` and pass it to `ProfileMediaEditor` as `onPendingPreviewChange={onMediaPendingPreviewChange}` beside the existing `onChange`, `onUpload`, `busy`, and `error` props. `ProfileMediaEditor` itself keeps the shorter `onPendingPreviewChange` prop name.

- [ ] **Step 7: Commit the local-first media editor.**

```sh
git add src/components/forms/ProfileMediaEditor.tsx src/components/forms/ProfileCustomizationEditor.tsx
git commit -m "feat: show local media previews during upload"
```

---

### Task 5: Block persistence safely and warn before refresh

**Files:**

- Modify: `src/components/forms/ProfileEditor.tsx`

- [ ] **Step 1: Add the pending-navigation warning.**

In both demo and live editor implementations, add an effect keyed by `hasUnresolvedMedia`:

```tsx
useEffect(() => {
  if (!hasUnresolvedMedia) return;
  const warn = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = "";
  };
  window.addEventListener("beforeunload", warn);
  return () => window.removeEventListener("beforeunload", warn);
}, [hasUnresolvedMedia]);
```

Use the existing draft-save registration for in-app navigation and return `false` while unresolved media exists.

- [ ] **Step 2: Add explicit save/publish guards.**

At the start of `saveDraft`, handle unresolved media before other validation:

```tsx
if (hasUnresolvedMedia) {
  setMessage({
    tone: "error",
    text: "Your image is still uploading. Save and publish will be available when it finishes.",
  });
  return false;
}
```

At the start of `publish`, use the same message and return without starting the mutation:

```tsx
if (hasUnresolvedMedia) {
  setMessage({
    tone: "error",
    text: "Your image is still uploading. Save and publish will be available when it finishes.",
  });
  return;
}
```

Preserve all existing validation and revision checks after these guards.

- [ ] **Step 3: Disable action-bar buttons from the shared state.**

Use `hasUnresolvedMedia` in `saveDisabled` and `publishDisabled` for both demo and live editor render paths. Keep the existing `mediaBusy` checks if needed for loading semantics, but do not allow a failed retained selection to become saveable until it succeeds or is discarded.

- [ ] **Step 4: Add visible pending status and error recovery messaging.**

Render a polite status near the media controls while `pendingMediaPreview?.state === "uploading"`:

```tsx
<p aria-live="polite" className="text-sm text-tapit-muted" role="status">
  Uploading image… Keep this page open.
</p>
```

For error state, include the existing upload error plus the Retry and Discard actions from Task 4. Keep the local image visible in the preview until discard or replacement.

- [ ] **Step 5: Preserve demo/live parity.**

Wire `onMediaPendingPreviewChange={setPendingMediaPreview}` in both editor branches. Do not add different user-facing states for demo and live storage.

- [ ] **Step 6: Commit the persistence guards.**

```sh
git add src/components/forms/ProfileEditor.tsx
git commit -m "feat: block saves during pending media uploads"
```

---

### Task 6: Add deterministic demo upload controls and E2E coverage

**Files:**

- Modify: `src/components/forms/ProfileEditor.tsx`
- Modify: `e2e/support/demo-harness.ts`
- Modify: `e2e/customer.spec.ts`

- [ ] **Step 1: Add development-only demo upload controls.**

In the demo upload path only, read two local-storage controls guarded by demo mode and non-production execution:

```ts
const delayMs =
  process.env.NODE_ENV === "production"
    ? 0
    : Number(window.localStorage.getItem("tapit:e2e-media-upload-delay-ms") ?? "0");
const shouldFail =
  process.env.NODE_ENV !== "production" &&
  window.localStorage.getItem("tapit:e2e-media-upload-failure") === "true";
if (delayMs > 0) await new Promise((resolve) => window.setTimeout(resolve, delayMs));
if (shouldFail) throw new Error("The media upload failed. Try again.");
```

Keep these controls out of the live upload path and ensure production builds ignore them.

- [ ] **Step 2: Add harness helpers for deterministic media states.**

In `e2e/support/demo-harness.ts`, add:

```ts
export async function setDemoMediaUploadControl(
  page: Page,
  control: { delayMs?: number; fail?: boolean },
) {
  await page.evaluate(({ delayMs, fail }) => {
    if (delayMs === undefined) localStorage.removeItem("tapit:e2e-media-upload-delay-ms");
    else localStorage.setItem("tapit:e2e-media-upload-delay-ms", String(delayMs));
    if (fail) localStorage.setItem("tapit:e2e-media-upload-failure", "true");
    else localStorage.removeItem("tapit:e2e-media-upload-failure");
  }, control);
}
```

Clear both keys in `resetDemoHarness` so tests remain isolated.

- [ ] **Step 3: Add the pending upload E2E scenario.**

In `e2e/customer.spec.ts`, use the existing fixture and assert the preview/state before upload completion:

```ts
test("customer sees local media while upload is pending", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await setDemoMediaUploadControl(page, { delayMs: 500 });
  await page.goto("/app/customize");
  await page.getByRole("tab", { name: "Media" }).click();
  await page.getByLabel("Upload background image").setInputFiles(
    "tests/fixtures/profile-images/opaque-landscape.png",
  );

  await expect(page.getByRole("status")).toContainText("Uploading image");
  await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Publish/ })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Profile hero" })).toBeVisible();
  await page.screenshot({ path: "test-results/profile-media-upload-pending.png" });
});
```

- [ ] **Step 4: Add failure and retry E2E coverage.**

Set `{ fail: true }`, select the same fixture, assert the local hero remains visible, assert the failure text and `Retry upload`, click Retry after clearing failure mode, and assert the status/action guard clears after success. Capture `test-results/profile-media-upload-failed.png`.

- [ ] **Step 5: Add compact contact E2E coverage.**

Verify labels are the default, then select each compact radio option and assert the preview still exposes links with accessible names while their visible text is absent. Save and publish the circle variant, navigate to `/mara-velasquez`, assert the public profile uses the selected variant, then switch to soft squares and verify the draft remains private until the next publish. Capture the compact preview screenshot.

- [ ] **Step 6: Add the new test to the existing media/privacy flow rather than creating a new test runner.**

Keep the test in `e2e/customer.spec.ts`, reuse `resetDemoHarness` and `signInAsCustomer`, and do not add unit tests for the new behavior.

- [ ] **Step 7: Commit the E2E coverage.**

```sh
git add src/components/forms/ProfileEditor.tsx e2e/support/demo-harness.ts e2e/customer.spec.ts
git commit -m "test: cover pending media and compact contacts"
```

---

### Task 7: Run focused checks, full verification, and inspect the artifact

**Files:**

- Modify only if verification reveals a defect: files listed in Tasks 1–6.
- Artifact: `test-results/profile-media-upload-pending.png`, `test-results/profile-media-upload-failed.png`, and compact contact screenshot from the E2E run.

- [ ] **Step 1: Run formatting and type checks.**

```sh
npm run format:check
npm run lint
npm run typecheck
```

Expected: all commands exit successfully with no formatting, lint, or TypeScript errors.

- [ ] **Step 2: Run the focused demo E2E scenarios.**

```sh
TAPIT_E2E_PORT=3001 NEXT_PUBLIC_DEMO_MODE=true NEXT_PUBLIC_DEMO_STORAGE=local npx playwright test e2e/customer.spec.ts --project chromium --grep "media|compact contact"
```

Expected: pending, failure/retry, and contact-display scenarios pass and screenshots are written under `test-results/`.

- [ ] **Step 3: Inspect the repeatable visual artifact.**

Open the generated screenshots and verify:

- The local background is visible before the delayed upload resolves.
- The pending state is legible without obscuring the image.
- Error and Retry/Discard controls fit at desktop and 390px widths.
- Circle and soft-square contact actions have clear focus/shape treatment and no clipped wrapping.

- [ ] **Step 4: Run the required project verification.**

```sh
npm run verify
```

Expected: `format:check`, lint, typecheck, existing Vitest coverage, and production build all pass.

- [ ] **Step 5: Review the final diff and status.**

```sh
git diff --check
git status --short
git log -6 --oneline
```

Expected: no whitespace errors, only scoped feature changes plus repeatable E2E artifacts, and each implementation task has a focused commit.

- [ ] **Step 6: Report completion with evidence.**

Include the implementation commits, the focused E2E command, `npm run verify`, and the screenshot artifact paths. Keep local/demo evidence distinct from any Preview/Production or physical-device evidence.
