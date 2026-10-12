# Profile Content Row Order

## Status

Approved design for review before implementation.

## Goal

Let profile owners choose the order of the slideshow, links, and About/Services content from the Customize workspace. Keep the profile identity bundle together at the top: photo or logo, name, bio, and contact information.

## Layout behavior

The Layout category replaces the current two-choice content order control with an ordered list of three rows:

1. Slideshow
2. Links (the featured link and regular profile links stay together)
3. About/Services

Owners can drag rows and can also use Move up and Move down buttons. The controls work with keyboard and touch input. The live preview follows the selected order immediately.

The identity bundle remains fixed at the top and is not split into rows. Save contact remains after the ordered content. A slideshow row is configurable even when no slideshow images have been uploaded; it is omitted from the rendered profile until images exist. About/Services remains configurable when no section is present and is omitted from the rendered profile until one is added.

The slideshow is ordered independently from the background image and hero surface. A background continues to render with the identity bundle; slideshow placement follows the selected content order whether or not a background is set. The same content order is respected in narrow previews, wide previews, and published profiles.

## Data and compatibility

Add an optional ordered block list to profile customization, with the supported values `slideshow`, `links`, and `section`. Keep the existing `contentOrder` field and accepted values so existing saved profile data remains valid.

When a saved profile has no ordered block list, derive one from its existing `contentOrder`: `links-first` becomes Slideshow, Links, About/Services; `section-first` becomes Slideshow, About/Services, Links. New customizations use the same default as `links-first`. Saving a customization persists the explicit row order while continuing to accept legacy records.

Validation and normalization must reject unknown or duplicate block values and supply the backward-compatible order when the optional list is absent. No database migration or change to the profile publication model is needed; the field is part of the existing customization object.

## Rendering and state flow

The Layout editor changes the ordered list in the existing local customization draft. Existing Save draft, preview, and Publish flows persist and project the complete customization. `PublicProfile` renders available blocks in their selected order. Conditional blocks keep their slot in the order list when they are temporarily absent, so adding slideshow images or About/Services later restores the chosen position.

The identity bundle stays together in the identity area. The ordered blocks render as one sequence in the content area so wide layouts preserve their relative order as well as narrow layouts.

## Accessibility and interaction

- Every row has a visible drag affordance and a clear label.
- Move up and Move down buttons provide a non-drag path and are disabled at the corresponding boundary.
- Reordering updates the draft and preview without requiring a separate apply action.
- Existing save and publish safeguards remain authoritative.

## Acceptance criteria

- The Layout category exposes Slideshow, Links, and About/Services as reorderable rows.
- Dragging and Move up/Move down update the same persisted order.
- The profile identity bundle stays together and before the ordered content.
- Featured and regular links remain a single ordered block.
- Save contact follows the ordered content.
- The published profile and live preview render all available blocks in the selected order at narrow and wide widths.
- Older profiles without the new field retain their prior relative Links/About-Services order and remain valid.
- Invalid, duplicate, or incomplete incoming order values normalize safely to a valid default.
