# Public profile customization — Phase 2 design

Status: approved for implementation planning
Date: 2026-09-24

## Outcome

Extend the public digital profile with a bounded visual media layer. Profile
owners can add a background image and an optional slideshow without turning the
profile into a full-page canvas or unrestricted media editor.

The experience applies only to the public digital profile and its live preview.
Physical card artwork, QR design, and card ordering remain separate features.

## Decisions from brainstorming

- Use the Hybrid Studio direction: a background image plus an optional
  slideshow.
- Keep the image inside a bounded profile surface; the outer page remains the
  Tapit paper surface.
- Use a profile-surface background with a readable content treatment. The
  background does not spill into the whole browser page.
- Make the background hero adjustable by the owner through height and crop
  position controls.
- Keep background and slideshow uploads separate by default.
- Allow an explicit option to reuse a slideshow image as the background.
- Place the slideshow below the hero.
- Support up to ten slideshow images.
- Render one slideshow image at a time with swipe, arrow controls, and progress
  dots.
- Use a gentle fade transition for Phase 2. Keep owner-selectable transitions
  and transition variants as future extension points.
- Enable autoplay by default, but only while the profile is visible. Pause when
  it leaves the viewport.
- Let owners turn autoplay off. Manual controls remain available when autoplay
  is disabled.
- Let owners reorder and remove slideshow images, and add more until the
  ten-image limit is reached.
- Preserve the existing split editor and live preview. Add media as a guided,
  collapsed Media section with explicit controls.
- Use `sample_data/Background_image.png` and
  `sample_data/Profile_picture.PNG` only for visual companion placeholders;
  they are not product seed assets or default user content.

## Version 2 scope

### Included

- Optional background image for the bounded profile hero/surface.
- Background crop position and hero-height adjustment.
- Optional slideshow with a maximum of ten images.
- Separate background and slideshow asset management.
- Reuse-one-slideshow-image-as-background action.
- Reorder, remove, and add slideshow images.
- Single-frame slideshow with swipe, arrows, dots, and gentle fade.
- Visible-only autoplay, enabled by default and owner-toggleable.
- Live preview of the complete draft presentation.
- Draft privacy and explicit publish behavior consistent with Phase 1.
- Responsive behavior for desktop, tablet, and mobile profiles.
- Reduced-motion behavior that disables or minimizes automatic motion.

### Deferred

- Alternate transition choices such as slide or instant replacement.
- A user-controlled transition-style selector.
- Free-form background coverage or arbitrary profile-region shapes. The
  adjustable hero is the Phase 2 boundary; future coverage variants may reuse
  the same media model.
- Full-page browser backgrounds.
- Video, audio, galleries with lightbox behavior, testimonials, and arbitrary
  media blocks.
- Custom CSS, arbitrary colors, custom fonts, and unrestricted layout editing.
- Physical card artwork, QR artwork, and card ordering.

## User experience

### Public profile

The public profile keeps its existing page shell and Warm Studio presentation.
When media is configured, a bounded hero surface appears within the profile:

1. Profile identity and image treatment.
2. Optional background image, cropped to the owner’s chosen hero height and
   position.
3. Optional slideshow below the hero.
4. Existing contact actions, featured link, links, section, and Save contact
   content according to the Phase 1 content order.

If no background is configured, the existing Warm Studio surface remains. If no
slideshow is configured, no empty gallery region is rendered.

The slideshow shows one image at a time. It supports touch swiping, visible
previous/next controls, progress dots, and gentle fade transitions. Autoplay
advances only while the slideshow is visible in the viewport, pauses when it is
not visible, and can be disabled by the owner. `prefers-reduced-motion` takes
precedence over autoplay and transition animation.

### Editor

The existing split editor remains intact. The left editing column adds a
collapsed Media section with:

- Background image upload, replace, remove, and crop/position controls.
- Hero height adjustment.
- Slideshow image upload with a visible `n / 10` count.
- Thumbnail rows that support reorder and remove.
- A clear action to reuse a slideshow image as the background.
- Autoplay toggle labeled in terms of visible-only playback.
- A live preview that updates with draft media choices.

The action bar continues to distinguish Save draft from Publish. Media changes
are draft-only until publication. Uploading or processing media disables save
and publish actions that would race the media operation.

## Data and architecture

Extend the structured customization boundary rather than introducing a general
page-builder model. The media contract should be optional so existing legacy
profiles and Phase 1 profiles remain valid.

At the domain level, add a typed media presentation object containing:

- An optional background image reference.
- A bounded ordered list of slideshow image references, capped at ten.
- Background crop/position values constrained to safe numeric ranges.
- Hero-height values constrained to an approved range.
- An autoplay boolean whose default is enabled for new Phase 2 media.

Image references should use the existing hardened profile-image storage and
revision mechanisms. The design must not reintroduce the stale-upload or
abandoned-upload risks addressed by the current image pipeline. Reuse should
copy or reference a validated existing slideshow asset, not create an
untracked second upload.

Public projection must expose only published media. Draft media remains private
until publication. The same published projection must serve direct profile URLs,
active card paths, and the editor preview projection.

The renderer should resolve media into safe presentation tokens before applying
styles. It must clamp dimensions and positions, reject unsupported references,
and omit invalid optional media rather than breaking the profile.

## Validation and accessibility

- Accept the existing supported image types and size limits unless a later
  implementation plan proves a narrower media-specific limit necessary.
- Enforce a maximum of ten slideshow images at the domain and backend layers.
- Reject duplicate, missing, malformed, or unauthorized storage references.
- Keep all upload, crop, reorder, remove, and autoplay controls keyboard
  accessible with explicit labels.
- Provide meaningful alternative text for each slideshow image and require an
  accessible description when an image is used as a decorative background.
- Keep arrow controls and dots usable without hover.
- Pause automatic motion when the slideshow is not visible or when reduced
  motion is requested.
- Preserve the existing focus, draft privacy, publication validation, and
  responsive layout guarantees.

## Testing and acceptance

### Domain and backend

- Validate the media shape, image count, crop ranges, hero-height range, and
  autoplay default.
- Save media to a draft without exposing it publicly.
- Publish media and expose only the published projection.
- Reject unauthorized or stale media revisions.
- Verify reuse of a slideshow image as the background preserves ownership and
  revision safety.
- Verify removal and reorder operations preserve the remaining ordered list.

### Renderer and editor

- Render no empty media regions when optional media is absent.
- Render the bounded hero without changing the outer page background.
- Render the slideshow below the hero with one active image, controls, dots,
  and fade behavior.
- Verify autoplay pauses outside the viewport and respects reduced motion.
- Verify the Media section can add, remove, reorder, replace, and reuse images.
- Verify save/publish controls are disabled during media processing.
- Verify desktop, mobile, keyboard, focus, and screen-reader behavior.

### End-to-end

1. Add a background image and adjust hero crop/height.
2. Add multiple slideshow images, reorder them, remove one, and publish.
3. Verify the direct profile URL renders the published bounded hero and
   slideshow.
4. Verify the active card path renders the same published presentation.
5. Save a draft and verify visitors still see the previous published media.
6. Disable autoplay and verify manual controls continue to work.
7. Verify no media controls affect physical card artwork or QR design.

## Future extension points

The Phase 2 model should leave explicit room for:

- Owner-selectable transition styles, including slide and instant replacement.
- More flexible bounded coverage presets or a carefully constrained free-form
  region.
- Additional media presentation modes after observing profile usage.

These additions require a follow-up design and publication/privacy review.
