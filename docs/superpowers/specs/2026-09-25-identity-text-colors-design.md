# Identity-Only Profile Text Colors

## Status

Approved for implementation planning. Implementation has not started.

Date: 2026-09-25

Reference visual: `.superpowers/brainstorm/42328-1790331599/content/identity-colors-v3.html`

## Outcome

Add restrained text-color controls to the Warm Studio profile without turning
profile styling into a general theme editor. Profile owners can independently
choose a color for the profile name and for the bio/role line. Each identity
field offers a compact set of curated color circles and a custom color circle
that opens a focused picker with a saturation/value area, a hue rail, a current
color preview, and a plain hex value.

The control remains compact when closed: color names are not printed beside the
circles. Names are available in the hover/focus tooltip and in accessible
button labels. The custom picker has no format dropdown; its value is always a
hex color, with the current-color pill immediately to the left of the input.

## Goals

- Give Warm Studio profiles independent name and bio/role text colors.
- Keep the editor visually quiet and compact with circular controls.
- Offer a small, prevalidated curated palette for fast choices.
- Offer a custom six-digit hex color through a visual picker and direct input.
- Keep custom colors readable on every normal Warm Studio surface.
- Show unsaved color changes in the live draft preview.
- Preserve draft privacy and the existing explicit Save draft / Publish flow.
- Apply the selected colors consistently to direct public profiles, active-card
  profile paths, and the editor preview after publication.
- Leave a clean extension point for a future, more controlled per-element color
  system without implementing that system now.

## Non-goals

- No arbitrary CSS, gradients, opacity values, color themes, or custom fonts.
- No color controls for links, buttons, contact actions, section copy, labels,
  avatar backgrounds, icons, or the Powered by Tapit mark.
- No changes to the existing Warm Studio accent selection or link/button
  treatment.
- No color controls for legacy paper, moss, or night profiles.
- No color controls for physical card artwork, QR artwork, or card ordering.
- No attempt to recolor identity text over a profile background image.
- No general-purpose per-element editor in this release.

## Scope and terminology

The current profile model calls the secondary identity field `bio`. The editor
labels it “Bio / role” because the same identity treatment is intended to cover
a future role label without adding a second color model. In this release,
`bioColor` behavior applies to the existing `bio` text only.

“Normal Warm Studio surface” means a Warm Studio profile without a configured
background image. A slideshow without a background image is still a normal
surface and receives the chosen identity colors.

## Data model

Extend the existing `ProfileCustomization` value with a nested, optional
identity-color object:

```ts
export type ProfileIdentityColorPreset = "default" | "coral" | "jade" | "ink";

export type ProfileIdentityColor =
  | { kind: "preset"; value: ProfileIdentityColorPreset }
  | { kind: "custom"; hex: string };

export interface ProfileIdentityColors {
  name?: ProfileIdentityColor;
  bio?: ProfileIdentityColor;
}

export interface ProfileCustomization {
  preset: "warm-studio";
  accent: ProfileAccent;
  typeScale: ProfileTypeScale;
  linkTreatment: ProfileLinkTreatment;
  contentOrder: ProfileContentOrder;
  featuredLinkId?: string;
  section?: ProfileSection;
  identityColors?: ProfileIdentityColors;
}
```

The fields are optional for backward compatibility. An omitted field is the
default for that identity surface. The existing
`DEFAULT_WARM_STUDIO_CUSTOMIZATION` remains unchanged so old profiles and
fixtures do not acquire noisy persisted fields. Selecting the default option
clears that field; non-default curated choices and valid custom choices are
persisted explicitly.

The nested shape is deliberate: it keeps identity controls together while
leaving a bounded place for a future per-element color design. The future
design must add an explicit schema and validation decision before adding new
keys; arbitrary keys are not accepted.

The resolved presentation should expose concrete safe CSS values separately
from persisted choices:

```ts
export interface ResolvedProfileAppearance {
  mode: "legacy" | "warm-studio";
  accent: ProfileAccent;
  typeScale: ProfileTypeScale;
  linkTreatment: ProfileLinkTreatment;
  nameColor: string;
  bioColor: string;
}
```

`nameColor` and `bioColor` are resolved only from the finite curated palette or
from a validated six-digit hex value. They must never contain a user-supplied
CSS fragment.

## Curated palette and defaults

The controls use these palette values on normal Warm Studio surfaces:

| Choice | Name text | Bio / role text | Hover/focus name |
| --- | --- | --- | --- |
| Default | `#2c2420` | `#74665d` | Default |
| Coral | `#a84431` | `#a84431` | Coral |
| Jade | `#3e806d` | `#3e806d` | Jade |
| Ink | `#2c2420` | `#2c2420` | Ink |

The `default` choice is field-aware so existing Warm Studio profiles retain
their current ink name and muted bio. The `ink` choice is intentionally
available for the secondary line when an owner wants a darker bio/role. The
curated values are fixed product tokens, not user-editable hex values.

Custom values must be six-digit RGB hex strings with a leading `#`, such as
`#BD9D1F`. The parser accepts upper- or lower-case input and stores a canonical
lower-case value such as `#bd9d1f`.

## Editor experience

Add an Identity colors subsection to the existing Warm Studio Style section.
It contains two independent rows:

- `Name` — primary identity.
- `Bio / role` — secondary identity.

Each row contains the curated circles in the order Default, Coral, Jade, Ink,
followed by a custom circle. The circles have no adjacent visible labels. Each
button exposes a complete accessible name such as “Coral name color” and shows
the same short color name in a tooltip on hover or keyboard focus. The selected
circle has the existing visible focus/selection ring treatment.

The custom control is a multicolor circle with a centered plus sign. It has an
accessible name such as “Choose custom name color”, `aria-haspopup="dialog"`,
and an `aria-expanded` state. Pressing it opens the picker anchored to that
row. The picker contains:

1. A saturation/value field.
2. A vertical hue rail.
3. A current-color preview pill.
4. A plain hex input immediately to the right of the pill.
5. A concise readability message when the value is invalid or fails contrast.

There is no “hex”, “RGB”, or other format dropdown. The hex input always
contains the six-digit value and is labelled for the active identity field.

The picker opens at the active custom value when one exists, or at the resolved
value of the selected curated choice otherwise. Moving the picker updates the
local preview and commits a custom choice only when the resulting hex is valid
and readable. Choosing a curated circle replaces the active custom choice;
choosing Default clears the corresponding persisted field. Escape and an
outside click close the picker without changing a value that has not passed
validation.

The picker must remain usable without a pointer. The saturation/value field and
hue rail expose keyboard-operable range semantics, the hex input is a normal
text field, and focus returns to the custom trigger when the dialog closes.

## Rendering behavior

Apply the resolved name color only to the Warm Studio profile name heading and
the resolved bio color only to the Warm Studio `bio` paragraph. Keep all other
existing classes, spacing, type scale, accent behavior, link treatment, and
contact styling unchanged.

When a Warm Studio background image is configured, ignore the selected identity
colors at render time and retain the current white identity treatment with its
existing text shadows. This guarantees readability over unknown imagery while
preserving the saved choices for the next normal-surface view.

Legacy profiles continue using their existing theme classes, even if malformed
identity-color data is encountered at runtime. A malformed optional identity
color must fall back to that field’s default during projection/preview rather
than removing the otherwise valid Warm Studio customization. Server-side
validation still rejects malformed values on save or publish.

Use inline `style.color` values only after resolving through the finite palette
or the strict hex validator. Do not construct Tailwind class names from profile
data.

## Validation, accessibility, and security

Validate identity colors in the shared profile customization rules and the
Convex validator boundary.

- Accept only `preset` values `default`, `coral`, `jade`, and `ink`.
- Accept only `kind: "custom"` values matching `^#[0-9A-Fa-f]{6}$`.
- Reject alpha, shorthand hex, named colors, CSS functions, whitespace, and
  any extra keys in the persisted color choice.
- Require a WCAG 2.2 AA contrast ratio of at least 4.5:1 for both identity
  fields against both normal Warm Studio surfaces `#fbf6ef` and `#fffdf9`.
- Prevalidate every curated value against both surfaces before exposing it.
- Return field-specific publication errors for invalid or low-contrast values.
- Keep custom color strings out of class-name construction and unsanitized CSS.
- Give every swatch a meaningful accessible name even though its visual label
  is hidden until hover/focus.
- Keep the picker trigger, picker controls, and hex field keyboard accessible.
- Expose validation errors through `role="alert"` or an equivalent labelled
  error relationship and do not silently discard a typed invalid value.
- Preserve existing focus-visible styles and respect reduced-motion settings
  for picker transitions.

## Persistence and publication

Identity colors are part of the existing `customization` object, so no new
database table or migration is needed. The existing profile save and publish
mutations must continue to:

- validate the nested color shape before accepting a draft;
- keep color changes private in the draft projection;
- include colors in `hasUnpublishedChanges` comparisons;
- copy colors into the published snapshot on publish; and
- expose only the published colors through direct public and active-card
  projections.

The editor preview resolves colors from the current draft, including unsaved
changes. Saving a draft must not change what public visitors see. Publishing
must make the same resolved values available to direct slug and active-card
rendering. Existing profiles with no `identityColors` object remain valid and
render with current defaults.

## Acceptance criteria

### Editor

- Warm Studio shows two independent identity-color rows.
- The compact rows show circles only; color names appear on hover/focus and in
  accessible names.
- Curated selection updates only its own identity field.
- The multicolor plus circle opens the saturation/value, hue, preview-pill, and
  hex-input picker.
- The current-color pill is immediately left of the hex input.
- The picker contains no color-format dropdown.
- Invalid or low-contrast hex input remains visible with a useful error and
  cannot be persisted.
- Keyboard users can select swatches, operate picker controls, edit hex, close
  the picker, and return focus to the trigger.

### Rendering

- Name and bio use their independently resolved colors on a normal Warm Studio
  surface.
- Links, buttons, contact actions, section copy, avatar styling, and other
  labels retain their existing colors.
- A background-image Warm Studio profile uses the existing white identity text,
  regardless of saved identity-color choices.
- Legacy profile themes are unchanged.
- Editor preview, direct public profile, and active-card profile use the same
  published presentation after publication.

### Data and regression safety

- Existing customization objects without identity colors normalize successfully.
- Invalid preset, malformed hex, low-contrast hex, and extra-key values are
  rejected at the shared and Convex validation boundaries.
- Draft-only colors do not appear in public profile or card projections.
- Published colors survive a reload and are included in the published snapshot.
- Existing profile customization, media, save/publish, and card-path tests
  remain green.

## Deferred extension points

The `identityColors` boundary can support a future controlled per-element color
system, but that work requires a separate design. The follow-up must define
which elements are allowed, how many choices are exposed, whether background
surfaces can vary, and how contrast is checked for each element. It must not
silently expand this release’s identity-only behavior.
