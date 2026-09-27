# Public Profile Customization Phase 2 Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add an optional bounded background hero and slideshow to the public Warm Studio profile, with safe media ownership, draft privacy, live preview, visible-only autoplay, and direct/card rendering parity.

**Architecture:** Keep Phase 1 customization intact and add an optional media presentation object to ProfileContent. Persist only owned media-asset IDs and presentation metadata; resolve URLs only in owner and published projections. Use a separate media upload/processing/reference pipeline so the existing square profile-photo pipeline and its revision guarantees remain unchanged. Render the media surface inside the existing profile panel and keep slideshow behavior in a focused component.

**Tech Stack:** Next.js 16.3.5 App Router, React 19.3, TypeScript 5.9, Convex 1.45, Tailwind CSS 4, Sharp, Vitest, Testing Library, Playwright, and convex-test.

---

## Scope and invariants

- Background media is optional and renders only inside the bounded public profile surface.
- Slideshow media is optional, ordered, and capped at ten images.
- Each slideshow frame is a single image with swipe, arrows, dots, and a gentle fade.
- Autoplay defaults to enabled, runs only while the slideshow is visible, and is disabled by prefers-reduced-motion.
- Owners can disable autoplay while retaining manual controls.
- Owners can set hero height and background crop position, reorder/remove/add slideshow images, and reuse a slideshow image as the background.
- Media is draft-private until publication; direct slug and active-card projections use the same published snapshot.
- Physical card artwork, QR design, free-form coverage, alternate transitions, and full-page browser backgrounds are not touched.
- sample_data/ remains visual-companion-only and is not used as product seed data.
- Preserve the existing untracked docs/pricing-strategy-philippines.md and sample_data/ paths.

## File map and ownership

Create these focused units:

- src/lib/profile-media.ts — media types, defaults, numeric bounds, normalization, validation, URL stripping, and pure reorder helpers.
- convex/profileMedia.ts — media-asset ownership/reference helpers and public/owned URL resolution.
- convex/profileMediaUploadHttp.ts — authenticated media upload endpoint.
- convex/profileMediaProcessing.ts — Sharp validation and preview generation.
- convex/profileMediaCleanup.ts — orphan-job and unreferenced-asset cleanup.
- src/components/forms/ProfileMediaEditor.tsx — accessible collapsed-section controls for background and slideshow media.
- src/components/profile/ProfileMediaSurface.tsx — bounded background hero presentation.
- src/components/profile/ProfileSlideshow.tsx — single-frame carousel state, controls, visibility, swipe, fade, and reduced-motion behavior.
- tests/unit/profile-media.test.ts — pure media contract tests.
- tests/unit/profile-media-editor.test.tsx — media editor interaction and accessibility tests.
- tests/unit/profile-slideshow.test.tsx — carousel behavior tests.
- convex/integration/profile-media.test.ts — upload ownership, revision safety, draft privacy, cleanup, and publication tests.

Modify these existing boundaries:

- src/lib/domain/index.ts — add optional media to profile content, published snapshots, and public projections; validate and compare media as part of publication.
- convex/schema.ts — add media fields to draft/published profile content, a mediaRevision field, profileMediaAssets, and profileMediaUploadJobs.
- convex/validators.ts — add persisted/public media validators, size/range/count checks, and reference-safe content validation.
- convex/profiles.ts — validate media references on save/publish, enforce media revisions, and keep draft privacy.
- convex/profileProjection.ts — resolve owned draft URLs and published public URLs, omitting invalid optional media rather than breaking a profile.
- convex/storage.ts, convex/http.ts, convex/crons.ts, convex/customers.ts — register media lifecycle, cleanup, and deletion behavior without changing avatar semantics.
- src/components/forms/ProfileCustomizationEditor.tsx — add a collapsed Media section while retaining all Phase 1 guided sections.
- src/components/forms/ProfileEditor.tsx — own upload state, draft persistence, demo/live upload adapters, preview data, and save/publish disabling.
- src/components/profile/PublicProfile.tsx — place the bounded hero and slideshow in the public profile panel.
- src/lib/demo/store.ts, src/lib/demo/projection.ts, src/lib/demo/fixtures.ts — keep local demo media behavior aligned with live projection and persistence.
- tests/unit/profile-customization-editor.test.tsx, tests/unit/public-profile-component.test.tsx, tests/unit/public-hydration.test.ts — extend existing editor/rendering coverage.
- convex/integration/storage.test.ts, convex/integration/profile-customization.test.ts — preserve avatar guarantees and add media privacy/publication assertions.
- e2e/customer.spec.ts, e2e/public-profile.spec.ts, e2e/accessibility.spec.ts — cover owner flow, direct/card parity, keyboard controls, and reduced-motion behavior.

Do not hand-edit convex/_generated/*; regenerate bindings after schema/API changes.

## Task 0: Implementation preflight and branch safety

**Files:**

- Read: AGENTS.md
- Read: convex/_generated/ai/guidelines.md
- Read: node_modules/next/dist/docs/01-app/index.md
- Read: docs/superpowers/specs/2026-09-24-profile-customization-phase-2-design.md

- [ ] Step 1: Confirm the branch and preserve user-owned files.

Run:

```
git status --short --branch
git log --oneline --decorate -5
```

Expected: branch feature/profile-customization, f59f4f0 at or before HEAD, and the only known untracked paths are docs/pricing-strategy-philippines.md and sample_data/.

- [ ] Step 2: Read framework/backend instructions before implementation.

Read the complete Convex guidelines and relevant Next App Router guide listed above. Record any changed API conventions in implementation notes before touching application code. Do not run a deployment-affecting command during this implementation without explicit user direction.

- [ ] Step 3: Establish a clean baseline.

Run:

```
npm run typecheck
npx vitest run tests/unit/profile-customization-editor.test.tsx convex/integration/profile-customization.test.ts
```

Expected: current Phase 1 typecheck and focused tests pass before Phase 2 changes begin.

- [ ] Step 4: Keep the baseline commit untouched.

Do not add the user-owned untracked paths to any Phase 2 commit. If a temporary implementation note is required, keep it under /private/tmp.

## Task 1: Define the pure Phase 2 media contract

**Files:**

- Create: src/lib/profile-media.ts
- Modify: src/lib/domain/index.ts
- Create: tests/unit/profile-media.test.ts
- Modify: tests/unit/domain.test.ts

- [ ] Step 1: Write failing tests for bounds, normalization, and privacy-safe serialization.

Add tests for the exact v1 contract:

```
import {
  DEFAULT_PROFILE_MEDIA,
  MAX_PROFILE_SLIDESHOW_IMAGES,
  normalizeProfileMedia,
  stripProfileMediaUrls,
  validateProfileMedia,
} from "../../src/lib/profile-media";

it("defaults autoplay on with no media regions", () => {
  expect(DEFAULT_PROFILE_MEDIA).toEqual({
    heroHeight: 320,
    autoplay: true,
    slideshow: [],
  });
});

it("accepts bounded crop and hero values", () => {
  expect(validateProfileMedia({
    heroHeight: 360,
    autoplay: false,
    background: {
      assetId: "asset-background",
      altText: "Warm studio wall",
      positionX: 25,
      positionY: 70,
      url: "https://cdn.test/background.jpg",
    },
    slideshow: [
      { assetId: "asset-one", altText: "Desk detail", url: "https://cdn.test/one.jpg" },
    ],
  })).toEqual([]);
});

it("rejects more than ten frames, duplicate assets, and invalid accessibility text", () => {
  const frames = Array.from({ length: MAX_PROFILE_SLIDESHOW_IMAGES + 1 }, (_, index) => ({
    assetId: "asset-" + index,
    altText: "Frame",
  }));
  expect(validateProfileMedia({
    heroHeight: 320,
    autoplay: true,
    slideshow: frames,
  })).toContain("A slideshow can contain at most ten images.");
  expect(validateProfileMedia({
    heroHeight: 320,
    autoplay: true,
    slideshow: [frames[0], frames[0]],
  })).toContain("Slideshow images must be unique.");
  expect(validateProfileMedia({
    heroHeight: 320,
    autoplay: true,
    background: {
      assetId: "asset-background",
      altText: "",
      positionX: 0,
      positionY: 0,
    },
    slideshow: [],
  })).toContain("A background image needs an accessible description.");
});

it("strips owner-only URLs before persistence", () => {
  expect(stripProfileMediaUrls({
    heroHeight: 320,
    autoplay: true,
    background: {
      assetId: "asset-background",
      altText: "Backdrop",
      positionX: 50,
      positionY: 50,
      url: "https://cdn.test/background.jpg",
    },
    slideshow: [{
      assetId: "asset-one",
      altText: "Frame",
      url: "https://cdn.test/one.jpg",
    }],
  })).toEqual({
    heroHeight: 320,
    autoplay: true,
    background: {
      assetId: "asset-background",
      altText: "Backdrop",
      positionX: 50,
      positionY: 50,
    },
    slideshow: [{ assetId: "asset-one", altText: "Frame" }],
  });
});
```

Add domain assertions proving that hasUnpublishedChanges detects media changes, projectPublicProfile returns only media from published, and a draft-only media URL never appears in the public projection.

- [ ] Step 2: Run the focused tests and verify the contract is missing.

```
npx vitest run tests/unit/profile-media.test.ts tests/unit/domain.test.ts
```

Expected: FAIL because the media module, profile fields, and projection logic do not exist.

- [ ] Step 3: Implement the bounded media types and pure helpers.

Use these constants and shapes in src/lib/profile-media.ts:

```
export const MAX_PROFILE_SLIDESHOW_IMAGES = 10;
export const MIN_PROFILE_HERO_HEIGHT = 220;
export const MAX_PROFILE_HERO_HEIGHT = 520;
export const DEFAULT_PROFILE_HERO_HEIGHT = 320;

export interface ProfileMediaImage {
  assetId: string;
  altText: string;
  url?: string;
}

export interface ProfileMediaBackground extends ProfileMediaImage {
  positionX: number;
  positionY: number;
}

export interface ProfileMediaPresentation {
  background?: ProfileMediaBackground;
  heroHeight: number;
  slideshow: ProfileMediaImage[];
  autoplay: boolean;
}

export interface PublicProfileMediaImage {
  src: string;
  alt: string;
}

export interface PublicProfileMediaPresentation {
  background?: PublicProfileMediaImage & {
    positionX: number;
    positionY: number;
  };
  heroHeight: number;
  slideshow: PublicProfileMediaImage[];
  autoplay: boolean;
}
```

validateProfileMedia must enforce hero height 220..520, crop positions 0..100, nonblank alt text of at most 160 characters, at most ten slideshow items, and unique asset IDs. normalizeProfileMedia must clamp numeric values, filter malformed optional items, preserve autoplay and default hero height, and return undefined only when there is no valid background and no slideshow. reorderProfileMediaSlides, removeProfileMediaSlide, and stripProfileMediaUrls must return new objects and never mutate caller state.

- [ ] Step 4: Add media to domain profile shapes without changing Phase 1 behavior.

Add media?: ProfileMediaPresentation to ProfileContent and PublicProfileProjection. PublishedProfileSnapshot inherits it through ProfileContent. Update projectPublicProfile to copy media only from the published snapshot after normalization, and update hasUnpublishedChanges so media changes count. Keep theme and customization behavior unchanged for legacy profiles.

- [ ] Step 5: Run tests and commit the pure contract.

```
npx vitest run tests/unit/profile-media.test.ts tests/unit/domain.test.ts tests/unit/profile-customization-editor.test.tsx
npm run typecheck
git add src/lib/profile-media.ts src/lib/domain/index.ts tests/unit/profile-media.test.ts tests/unit/domain.test.ts
git commit -m "feat: define bounded profile media contract"
```

Expected: PASS with no regressions in Phase 1 customization tests.

## Task 2: Add media storage, processing, ownership, and cleanup

**Files:**

- Modify: convex/schema.ts
- Modify: convex/validators.ts
- Modify: convex/http.ts
- Modify: convex/crons.ts
- Create: convex/profileMedia.ts
- Create: convex/profileMediaUploadHttp.ts
- Create: convex/profileMediaProcessing.ts
- Create: convex/profileMediaCleanup.ts
- Modify: convex/storage.ts
- Modify: convex/customers.ts
- Create: convex/integration/profile-media.test.ts
- Modify: convex/integration/storage.test.ts

- [ ] Step 1: Write failing integration tests for media asset ownership and lifecycle.

Use convex-test with the existing identity/owner fixture style. Cover:

```
it("accepts an owned media asset and rejects a cross-profile reference", async () => {
  const asset = await owner.action(api.profileMedia.attach, {
    profileId: data.ownerProfileId,
    storageId: ownedStorageId,
    expectedMediaRevision: 0,
  });
  expect(asset).toMatchObject({
    assetId: expect.any(String),
    mediaRevision: 1,
  });
  await expect(
    other.mutation(api.profiles.saveDraft, {
      profileId: data.otherProfileId,
      draft: validDraft("other", {
        media: {
          heroHeight: 320,
          autoplay: true,
          slideshow: [{ assetId: asset.assetId, altText: "No" }],
        },
      }),
    }),
  ).rejects.toThrow("does not belong to this profile");
});

it("rejects stale media revisions", async () => {
  await owner.action(api.profileMedia.attach, {
    profileId: data.ownerProfileId,
    storageId: firstStorageId,
    expectedMediaRevision: 0,
  });
  await expect(
    owner.action(api.profileMedia.attach, {
      profileId: data.ownerProfileId,
      storageId: secondStorageId,
      expectedMediaRevision: 0,
    }),
  ).rejects.toThrow("Media changed elsewhere");
});
```

Also test malformed bytes, unsupported content types, missing storage, oversized files, deletion of an unreferenced asset, retention of an asset referenced by either draft or published content, and account-deletion cleanup.

- [ ] Step 2: Run the new integration tests and verify they fail.

```
npx vitest run convex/integration/profile-media.test.ts
```

Expected: FAIL because the media tables, functions, and API references do not exist.

- [ ] Step 3: Add bounded schema and validators.

In convex/schema.ts, add media: v.optional(profileMediaPresentationValidator) to both profileContent and publishedProfile. The persisted validator contains only asset IDs and metadata (assetId, altText, positionX, positionY, heroHeight, slideshow, autoplay) and no URL fields. Add a separate owner-projection validator or optional runtime URL fields for projectOwnedProfile so owner-only draft responses can include resolved preview URLs without writing them back to storage. The public validator remains separate and contains only src, alt, position, hero height, slideshow, and autoplay.

Add mediaRevision: v.optional(v.number()) to profiles.

Add profileMediaAssets with storageId, optional previewStorageId, profile/owner IDs, content type, size, width, height, created time, and indexes by storage ID, preview storage ID, profile ID, and scope. Add profileMediaUploadJobs with profile/owner IDs, optional storage IDs, SHA-256, expected media revision, pending/attached/failed status, creation time, upload window, and indexes by profile and status/creation time.

Add persisted and public validators separately. Public media items contain src and alt, never assetId; public profile validators must use the public media validator. Extend validateDraftSafety and validateProfileContent with the pure validateProfileMedia errors and enforce the ten-image maximum at the Convex boundary.

- [ ] Step 4: Implement media ownership and reference helpers.

In convex/profileMedia.ts, implement these typed helpers:

```
getProfileMediaAsset(ctx, assetId)
assertOwnedProfileMedia(ctx, profileId, ownerId, assetId)
assertOwnedProfileMediaSet(ctx, profileId, ownerId, media)
resolveOwnedProfileMedia(ctx, profile, media)
resolvePublishedProfileMedia(ctx, profile, media)
removeIfMediaUnreferenced(ctx, profileId, assetId)
deleteProfileMedia(ctx, profileId)
```

Verify both profile and owner IDs, confirm storage metadata exists, and never trust a client URL. Invalid optional media is omitted from a projection; invalid references in save/publish mutations throw an ownership or validation error.

- [ ] Step 5: Implement the separate upload and processing path.

Register POST /profile-media-upload in convex/http.ts through profileMediaUploadHttp.ts. Require the authenticated owner, X-Profile-Id, and a decimal X-Media-Revision; accept JPEG/PNG/WebP and a 5 MB maximum. Create a pending media job before storing bytes, then run internal.profileMediaProcessing.process.

The processor must decode bytes with Sharp, reject malformed images and content-type mismatches, preserve the original aspect ratio, record width/height, and create an owner-preview derivative no larger than 800 px on its longest edge. Attach the asset transactionally, increment profiles.mediaRevision, mark the job attached, and return { assetId, url, previewUrl, mediaRevision }. On failure, compensate both storage objects and leave prior draft media unchanged.

Do not reuse profileImageUploadJobs, profileImageProcessing, or storage.attach; the avatar pipeline requires exactly 384x384 input and must remain unchanged.

- [ ] Step 6: Implement safe deletion and cleanup.

Add an owner-scoped api.profileMedia.remove mutation accepting profileId, assetId, and expectedMediaRevision. It may delete only an asset not referenced by either current draft or published media, increments the media revision, and returns the new revision. Keep an asset alive when it is used as both background and slideshow frame.

Add internal.profileMediaCleanup.reconcileExpired to remove failed/expired upload candidates after a 24-hour grace period, retaining ambiguous candidates. Schedule it in convex/crons.ts alongside existing image cleanup. Update convex/customers.ts approved account deletion to call deleteProfileMedia in addition to deleteProfileImages.

- [ ] Step 7: Regenerate bindings and run storage tests.

```
npx convex codegen --typecheck enable
npx vitest run convex/integration/profile-media.test.ts convex/integration/storage.test.ts
npm run typecheck
```

Expected: media lifecycle tests pass, existing avatar storage tests pass, and generated Convex bindings contain the new API without hand edits.

- [ ] Step 8: Commit the media storage boundary.

```
git add convex/schema.ts convex/validators.ts convex/http.ts convex/crons.ts convex/profileMedia.ts convex/profileMediaUploadHttp.ts convex/profileMediaProcessing.ts convex/profileMediaCleanup.ts convex/storage.ts convex/customers.ts convex/integration/profile-media.test.ts convex/integration/storage.test.ts convex/_generated
git commit -m "feat: add owned profile media storage"
```

## Task 3: Thread media through draft, publication, and projections

**Files:**

- Modify: convex/profiles.ts
- Modify: convex/profileProjection.ts
- Modify: convex/validators.ts
- Modify: src/lib/domain/index.ts
- Modify: convex/integration/profile-customization.test.ts
- Modify: convex/integration/profile-media.test.ts

- [ ] Step 1: Add failing draft/publication tests.

Attach one background and three slideshow assets. Assert:

```
await owner.mutation(api.profiles.saveDraft, {
  profileId,
  expectedMediaRevision: 3,
  draft: draft("owner", {
    media: {
      heroHeight: 380,
      autoplay: true,
      background: {
        assetId: backgroundAssetId,
        altText: "Studio wall",
        positionX: 35,
        positionY: 60,
      },
      slideshow: [
        { assetId: firstAssetId, altText: "Desk" },
        { assetId: secondAssetId, altText: "Materials" },
        { assetId: thirdAssetId, altText: "Workshop" },
      ],
    },
  }),
});
expect(await t.query(api.profiles.publicBySlug, { slug: "owner" }))
  .not.toHaveProperty("media");

await owner.mutation(api.profiles.publish, {
  profileId,
  expectedMediaRevision: 3,
});
expect(await t.query(api.profiles.publicBySlug, { slug: "owner" }))
  .toMatchObject({
    media: {
      heroHeight: 380,
      autoplay: true,
      background: {
        src: expect.any(String),
        alt: "Studio wall",
        positionX: 35,
        positionY: 60,
      },
      slideshow: [
        { src: expect.any(String), alt: "Desk" },
        { src: expect.any(String), alt: "Materials" },
        { src: expect.any(String), alt: "Workshop" },
      ],
    },
  });
```

Also assert direct slug and active card queries return the same published media, draft-only reorder/height changes remain private, invalid/missing references block save or publication, and old published assets remain live until new publication succeeds.

- [ ] Step 2: Run focused tests and verify they fail.

```
npx vitest run convex/integration/profile-customization.test.ts convex/integration/profile-media.test.ts
```

Expected: FAIL because profile mutations and projections do not yet accept media.

- [ ] Step 3: Update profiles.saveDraft safely.

Add optional expectedMediaRevision to mutation args. Compare it with profile.mediaRevision ?? 0 and throw MEDIA_REVISION_CONFLICT = "Media changed elsewhere. Reload and try again." on mismatch. Run validateDraftSafety, then assertOwnedProfileMediaSet for every media reference. Strip projection-only URLs before patching the draft. Leave mediaRevision unchanged; uploads/removals own that counter. Return the current mediaRevision with the existing save result.

- [ ] Step 4: Update publication and administrator publication checks.

In profiles.publish and the setStatus("published") branch, validate and assert every draft/published media reference before copying content. Accept expectedMediaRevision in owner publication and reject a current pending media upload. Copy only persisted asset IDs and metadata to published; never persist resolved URLs. When replacing a published media set, call removeIfMediaUnreferenced for assets no longer reachable from either snapshot after the new snapshot is stored.

- [ ] Step 5: Resolve media only in the correct projection.

In projectOwnedProfile, resolve draft and published media URLs for the authenticated owner so the editor and preview can display them. In projectPublicProfile, resolve only profile.published.media, map storage IDs to src, map altText to alt, omit asset IDs and draft-only media, and return no empty background/slideshow regions. Keep cards.resolve unchanged if it already consumes projectPublicProfile; verify that it cannot receive draft media.

- [ ] Step 6: Run focused Convex/type checks and commit.

```
npx convex codegen --typecheck enable
npx vitest run convex/integration/profile-customization.test.ts convex/integration/profile-media.test.ts
npm run typecheck
git add convex/profiles.ts convex/profileProjection.ts convex/validators.ts src/lib/domain/index.ts convex/integration/profile-customization.test.ts convex/integration/profile-media.test.ts convex/_generated
git commit -m "feat: publish profile media through safe projections"
```

Expected: draft privacy, publication, ownership, stale-revision, and slug/card parity tests pass.

## Task 4: Build the accessible public hero and slideshow

**Files:**

- Create: src/components/profile/ProfileMediaSurface.tsx
- Create: src/components/profile/ProfileSlideshow.tsx
- Modify: src/components/profile/PublicProfile.tsx
- Create: tests/unit/profile-slideshow.test.tsx
- Modify: tests/unit/public-profile-component.test.tsx
- Modify: tests/unit/public-hydration.test.ts

- [ ] Step 1: Write failing renderer and interaction tests.

Cover:

```
it("keeps background media inside the profile surface", () => {
  render(<PublicProfile profile={profileWithMedia} profileUrl="/mara" />);
  const hero = screen.getByRole("region", { name: "Profile hero" });
  expect(hero).toHaveStyle({ height: "380px" });
  expect(hero).toHaveStyle({
    backgroundImage: "url(" + profileWithMedia.media.background.src + ")",
  });
  expect(screen.getByRole("main")).not.toHaveStyle({
    backgroundImage: expect.any(String),
  });
});

it("supports manual slideshow controls and keeps the active image accessible", async () => {
  const user = userEvent.setup();
  render(<PublicProfile profile={profileWithMedia} profileUrl="/mara" />);
  expect(screen.getByRole("img", { name: "Desk" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Next image" }));
  expect(screen.getByRole("img", { name: "Materials" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Image 2 of 3" }))
    .toHaveAttribute("aria-current", "true");
});
```

Add tests for no media region when optional media is absent, first/last wrap behavior, aria-label/aria-current dots, keyboard activation, swipe threshold, autoplay only after intersection, autoplay pause outside the viewport, reduced-motion disabling autoplay/fade, and no controls when the slideshow is empty.

- [ ] Step 2: Run focused component tests and verify failure.

```
npx vitest run tests/unit/profile-slideshow.test.tsx tests/unit/public-profile-component.test.tsx
```

Expected: FAIL because the new components and public media projection are not rendered.

- [ ] Step 3: Implement ProfileMediaSurface.

Render an internal hero section with aria-label="Profile hero", a bounded inline height from the clamped media token, backgroundImage on that section only, backgroundPosition from positionX/positionY, backgroundSize: cover, and a readable translucent treatment over the image. Add a visually-hidden accessible description derived from background alt. Keep outer main page classes and the existing Warm Studio panel unchanged when no background exists.

- [ ] Step 4: Implement ProfileSlideshow.

Use a focused client component with activeIndex state, a viewport ref, and IntersectionObserver to maintain isVisible. Advance with one interval only when autoplay and isVisible and not reducedMotion and slides.length > 1. Use a 4-second interval and a 350 ms opacity transition; set motion-reduce:transition-none and never start the interval when reduced motion is requested. Keep manual arrows/dots enabled regardless of autoplay. Handle pointer down/up horizontal deltas of at least 40 px as previous/next without hijacking vertical scrolling. Give images meaningful alt, arrows explicit labels, and dots aria-label="Image n of total" with aria-current on the active dot.

- [ ] Step 5: Integrate media into PublicProfile.

Render the hero immediately inside the existing bounded profile panel before identity content when profile.media.background exists. Render the slideshow below the hero and before existing contact/actions when profile.media.slideshow.length > 0. Pass preview through without changing public behavior; the live preview must exercise the same renderer. Do not change card artwork or QR components.

- [ ] Step 6: Run tests and commit the public renderer.

```
npx vitest run tests/unit/profile-slideshow.test.tsx tests/unit/public-profile-component.test.tsx tests/unit/public-hydration.test.ts
npm run typecheck
git add src/components/profile/ProfileMediaSurface.tsx src/components/profile/ProfileSlideshow.tsx src/components/profile/PublicProfile.tsx tests/unit/profile-slideshow.test.tsx tests/unit/public-profile-component.test.tsx tests/unit/public-hydration.test.ts
git commit -m "feat: render bounded profile media"
```

Expected: PASS with no legacy renderer or hydration regressions.

## Task 5: Add the collapsed Media editor and live preview wiring

**Files:**

- Create: src/components/forms/ProfileMediaEditor.tsx
- Modify: src/components/forms/ProfileCustomizationEditor.tsx
- Modify: src/components/forms/ProfileEditor.tsx
- Modify: src/lib/profile-media.ts
- Create: tests/unit/profile-media-editor.test.tsx
- Modify: tests/unit/profile-customization-editor.test.tsx
- Modify: tests/unit/profile-editor-image-upload.test.tsx

- [ ] Step 1: Write failing editor tests for the approved controls.

Render the controlled editor with media and assert:

```
expect(screen.getByRole("button", { name: "Media" }))
  .toHaveAttribute("aria-expanded", "false");
await user.click(screen.getByRole("button", { name: "Media" }));
expect(screen.getByRole("button", { name: "Upload background image" }))
  .toBeInTheDocument();
expect(screen.getByLabelText("Hero height")).toHaveAttribute("min", "220");
expect(screen.getByLabelText("Hero height")).toHaveAttribute("max", "520");
expect(screen.getByLabelText("Autoplay while visible")).toBeChecked();
```

Cover upload state, n / 10 count, reorder up/down buttons, remove, background replace/remove, position sliders, reuse-as-background, autoplay toggle, accessible descriptions, and preventing the eleventh image. Assert every callback receives a new object and removal/reordering never mutates the prior array.

- [ ] Step 2: Run focused editor tests and verify failure.

```
npx vitest run tests/unit/profile-media-editor.test.tsx tests/unit/profile-customization-editor.test.tsx
```

Expected: FAIL because the Media section and component do not exist.

- [ ] Step 3: Implement ProfileMediaEditor as a controlled component.

Expose:

```
export type ProfileMediaEditorProps = {
  media?: ProfileMediaPresentation;
  onChange: (next: ProfileMediaPresentation | undefined) => void;
  onUpload: (
    file: File,
    target: "background" | "slideshow",
  ) => Promise<ProfileMediaImage>;
  busy?: boolean;
  error?: string;
};
```

Use DEFAULT_PROFILE_MEDIA when the first upload is made. Keep file inputs visually hidden but explicitly labeled, with accept="image/jpeg,image/png,image/webp". The background uploader replaces the current background; the slideshow uploader appends until ten. Use native range inputs for hero height and crop positions with visible numeric values, a checkbox for visible-only autoplay, and buttons labeled Move image n up, Move image n down, Remove image n, and Use image n as background.

When the background is removed, keep the slideshow and hero settings. When the slideshow becomes empty, call onChange(undefined) only if no background remains; otherwise retain the bounded media object without an empty gallery. A background reused from a slideshow must share the same assetId and never upload a duplicate.

- [ ] Step 4: Add the collapsed Media section to ProfileCustomizationEditor.

Add media to SectionName and sectionLabels. Render it after Style and before Review, with openSections.media = false. Accept media, onMediaChange, upload/busy/error props, and render ProfileMediaEditor inside the section. Preserve the legacy path: if customization is absent, show the existing Warm Studio opt-in and a short note that media controls become available after opting into Warm Studio; do not silently mutate legacy profiles.

- [ ] Step 5: Wire live uploads and draft persistence in ProfileEditor.

Add mediaRevisionRef, mediaRequestRef, and a media pending state. Implement uploadMedia(file, target) with authenticated POST /profile-media-upload, X-Profile-Id, and X-Media-Revision; update draft with returned URL/preview URL and new revision. Keep avatar uploads on their current endpoint.

Extend draftForPersistence to call stripProfileMediaUrls. Pass expectedMediaRevision to saveDraft and publish. Disable Save draft and Publish while media uploads/processes, as with avatar processing. Preserve the current retry loop for concurrent draft edits and include media in latestDraftRef snapshots. On media upload failure, leave the previous background/slideshow intact and announce the error through the existing Notice path.

Implement the local demo adapter with a data URL generated from the selected file so demo media survives local-storage reloads without Convex URLs. It must use the same ProfileMediaEditor and PublicProfile renderer.

- [ ] Step 6: Run editor, upload, and type checks, then commit.

```
npx vitest run tests/unit/profile-media-editor.test.tsx tests/unit/profile-customization-editor.test.tsx tests/unit/profile-editor-image-upload.test.tsx
npm run typecheck
git add src/components/forms/ProfileMediaEditor.tsx src/components/forms/ProfileCustomizationEditor.tsx src/components/forms/ProfileEditor.tsx src/lib/profile-media.ts tests/unit/profile-media-editor.test.tsx tests/unit/profile-customization-editor.test.tsx tests/unit/profile-editor-image-upload.test.tsx
git commit -m "feat: add profile media editor"
```

Expected: media controls are keyboard accessible, Save draft/Publish are disabled during processing, avatar upload tests remain green, and preview updates from draft state before saving.

## Task 6: Preserve demo, direct/card parity, and existing behavior

**Files:**

- Modify: src/lib/demo/store.ts
- Modify: src/lib/demo/projection.ts
- Modify: src/lib/demo/fixtures.ts
- Modify: src/components/profile/PublicProfileScreen.tsx
- Modify: src/components/profile/CardResolverClient.tsx
- Modify: src/components/workspace/WorkspacePreview.tsx
- Modify: convex/integration/profile-customization.test.ts
- Modify: convex/integration/public-image-srcset.test.ts
- Create: tests/unit/profile-media-parity.test.ts

- [ ] Step 1: Add failing parity tests.

Build one published projection with media and assert:

```
expect(slugProjection.media).toEqual(cardProjection.media);
expect(demoProjection.media).toEqual(previewProjection.media);
expect(JSON.stringify(slugProjection)).not.toContain("draft-background");
```

Keep existing profile-image imageSrcSet assertions unchanged. Assert WorkspacePreview passes media through without putting the background on its outer preview shell.

- [ ] Step 2: Run parity tests and verify failure.

```
npx vitest run tests/unit/profile-media-parity.test.ts convex/integration/profile-customization.test.ts convex/integration/public-image-srcset.test.ts
```

Expected: FAIL only on the new media assertions.

- [ ] Step 3: Update local demo projection and persistence.

Keep media in local profile draft/published objects, use projectPublicProfile for normalized public shape, and do not add default media to existing fixtures. The demo upload adapter may use data URLs; published demo media remains absent unless explicitly added by the owner. Preserve the legacy getDemoTheme fallback for profiles without Warm Studio customization.

- [ ] Step 4: Verify direct and active-card paths use one renderer.

Do not add separate media rendering to PublicProfileScreen or CardResolverClient; their only required changes are type adaptation if the public validator shape changes. Verify both continue passing the same projection into PublicProfile. Keep redirects, analytics, and card artwork behavior untouched.

- [ ] Step 5: Run parity tests and commit.

```
npx vitest run tests/unit/profile-media-parity.test.ts convex/integration/profile-customization.test.ts convex/integration/public-image-srcset.test.ts
npm run typecheck
git add src/lib/demo/store.ts src/lib/demo/projection.ts src/lib/demo/fixtures.ts src/components/profile/PublicProfileScreen.tsx src/components/profile/CardResolverClient.tsx src/components/workspace/WorkspacePreview.tsx convex/integration/profile-customization.test.ts convex/integration/public-image-srcset.test.ts tests/unit/profile-media-parity.test.ts
git commit -m "test: preserve profile media projection parity"
```

Expected: direct URL, active card, demo, and workspace preview agree on published media while legacy image behavior remains unchanged.

## Task 7: End-to-end acceptance and accessibility coverage

**Files:**

- Modify: e2e/customer.spec.ts
- Modify: e2e/public-profile.spec.ts
- Modify: e2e/accessibility.spec.ts
- Modify: e2e/live.spec.ts
- Modify: docs/CHANGELOG.md only if the repository’s existing release-note convention requires it

- [ ] Step 1: Add an owner-flow E2E test.

In the existing demo customer flow:

1. Opt into Warm Studio if the fixture starts legacy.
2. Open Media and upload a background plus three slideshow images.
3. Set hero height/crop, reorder to 2, 3, 1, remove one, and confirm 2 / 10.
4. Use a remaining slideshow image as the background.
5. Disable autoplay, save draft, and assert the visitor still sees the prior published profile.
6. Publish and assert the profile contains the bounded hero, one slideshow frame, arrows, and dots.

Use test-owned fixture files under the existing test fixture directory; do not add sample_data/ to product seeds.

- [ ] Step 2: Add direct/card parity coverage.

Extend e2e/public-profile.spec.ts so the same published media is visible at direct slug and active card URLs. Assert the page shell keeps the Tapit paper surface outside the bounded hero and no card-artwork controls are present.

- [ ] Step 3: Add keyboard and reduced-motion coverage.

Extend e2e/accessibility.spec.ts to open Media with the keyboard, operate hero sliders, reorder/remove images, activate arrows/dots without hover, and verify prefers-reduced-motion: reduce disables autoplay and fade motion. Use explicit accessible names rather than CSS selectors.

- [ ] Step 4: Run acceptance suites.

```
npx playwright test e2e/customer.spec.ts e2e/public-profile.spec.ts e2e/accessibility.spec.ts --project chromium
npm run test:e2e:demo
```

Expected: owner draft privacy, publication, controls, direct/card parity, keyboard operation, and reduced-motion behavior pass.

- [ ] Step 5: Commit acceptance coverage.

```
git add e2e/customer.spec.ts e2e/public-profile.spec.ts e2e/accessibility.spec.ts e2e/live.spec.ts docs/CHANGELOG.md
git commit -m "test: cover profile customization phase 2"
```

## Task 8: Full verification and review handoff

**Files:**

- No new implementation files; review all Phase 2 changes and generated bindings.

- [ ] Step 1: Run formatting, lint, typecheck, unit, integration, and build verification.

```
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: all commands pass. If format check identifies generated Convex output, regenerate codegen and rerun it; never hand-format generated files.

- [ ] Step 2: Inspect the final diff and verify scope.

```
git diff --stat f59f4f0..HEAD
git diff --name-only f59f4f0..HEAD
git status --short
```

Confirm no physical card artwork, QR design, card-ordering code, sample_data/, or docs/pricing-strategy-philippines.md changed. Confirm the only public media values are published src/alt projections and no assetId, draft URL, or upload-job field reaches public profile/card responses.

- [ ] Step 3: Run an independent review before declaring Phase 2 complete.

Use an independent reviewer to inspect the final diff for draft/publication privacy leaks, cross-profile media references, stale upload/revision races, orphaned storage, autoplay visibility and reduced-motion violations, keyboard/focus/alternative-text regressions, outer-page background leakage, and accidental changes to the avatar pipeline or physical-card boundary. Fix material findings, rerun affected focused tests, and repeat full verification.

- [ ] Step 4: Confirm the future extension boundary.

Leave v1 on gentle fade, keep alternate transitions out of the editor, and leave free-form coverage out of the persisted model. Record these as follow-up design items only after usage feedback; do not add hidden controls or speculative schema fields in this phase.
