# Public profile customization design

Status: approved for implementation planning
Date: 2026-09-23

## Outcome

Give Tapit profile owners a more expressive public profile without turning the
product into an unrestricted page builder. Version 1 adds a guided Warm Studio
preset, safe visual controls, an automatic contact strip, one optional
About-or-Services section, and a live preview that remains faithful to the
published public profile.

The feature applies only to the public digital profile. Direct profile URLs
and active NFC/QR card paths continue to render the same published profile.
Physical card artwork, QR design, background images, slideshows, and richer
media layouts remain separate future work.

## Decisions from brainstorming

- Use the bounded structured customization approach rather than a general
  block builder.
- Ship Warm Studio as the first curated preset.
- Let owners choose from curated accents, typography scales, and link/button
  treatments; do not accept arbitrary CSS, fonts, or custom hex values.
- Show email, phone, and website automatically in a compact contact strip when
  those fields are populated. Owners do not configure the strip's visibility
  or order.
- Let owners select one existing enabled link as the featured CTA.
- Support one optional About or Services section, rendered as a collapsed
  accessible disclosure. The owner chooses either About or Services, not both.
- Keep the profile editor as a split workspace with a guided set of sections.
  The sections are freely navigable rather than a locked wizard.
- Preserve existing published appearances until an owner opts into the new
  customization and publishes it.
- Keep the existing draft/published privacy boundary and publication rules.

## Version 1 scope

### Included

- Warm Studio preset with curated visual controls.
- Curated accent palette.
- Compact, comfortable, and editorial typography scales.
- Approved link/button treatments.
- Links-first or section-first content order.
- Featured CTA selection from the existing link list.
- Automatic email, phone, and website contact strip.
- One About or Services section with structured content.
- Collapsed public disclosure for the optional section.
- Split editor with guided sections and a live phone/desktop preview.
- Live Convex and local demo support using the same domain rules.
- Legacy appearance fallback for existing profiles.

### Deferred

- Optional rich contact panel as a future enhancement.
- User-uploaded background images.
- Image backgrounds and slideshows.
- Galleries, testimonials, arbitrary media blocks, and freeform block order.
- Custom fonts, arbitrary colors, custom CSS, and unrestricted layout editing.
- Physical card artwork, QR artwork, and card ordering.

## User experience

### Editor layout

`/app/profile` becomes a two-column workspace on large screens and a stacked
layout on smaller screens.

The left side contains guided sections:

1. Identity
2. Contact and links
3. About or Services
4. Style
5. Review and publish

Owners can open any section in any order. The guide provides structure without
blocking access to other fields.

The right side contains the existing live preview surface, updated to render
the draft through the same public-profile presentation components. Phone and
desktop preview modes remain available. On small screens the editor appears
first and the preview follows it.

The persistent action area continues to separate Save draft from Publish. It
shows whether changes are unsaved, saved, or ready to publish. Preview changes
are local draft changes and never become public without an explicit publish.

### Style controls

The Style section exposes only supported values:

- Preset: `Warm Studio` for new profiles.
- Accent: the curated Coral, Jade, or Ink palette.
- Type scale: Compact, Comfortable, or Editorial.
- Link/button treatment: approved filled or outlined treatments.
- Content order: Links first or About/Services first.

The selected values map to Tapit-owned design tokens. They do not generate
inline user CSS or arbitrary styles. Save contact follows the selected action
treatment while retaining its semantic distinction from external links.

### Contact and links

The contact strip is derived from the existing profile fields:

- Email becomes a mail action.
- Phone becomes a telephone action.
- Website becomes a website action.

Only populated fields are shown. The strip is omitted when no contact field is
available. Social destinations and other links remain in the existing ordered
link list and retain their existing icon support.

The owner may select one existing enabled link as the featured CTA. The
featured link receives the selected prominent treatment while remaining part
of the normal link data and validation flow. If it is later disabled or
removed, the profile falls back to the ordinary link list and the editor shows
a review warning; the profile does not become impossible to publish.

### About or Services

The owner may enable one optional section and choose its type:

- About: short body copy.
- Services: short introduction plus up to three service labels.

The public profile displays one collapsed disclosure row labeled About or
Services. Its body uses semantic disclosure behavior, keyboard support, visible
focus, and reduced-motion-safe transitions. The profile remains compact until
the visitor chooses to expand it.

### Public profile order

The default Warm Studio presentation is:

1. Identity and profile image/logo.
2. Automatic contact strip, when available.
3. Featured CTA, when selected.
4. Ordered link list.
5. Optional collapsed About/Services disclosure.
6. Save contact, when enough contact data exists for a vCard.

The selected content-order control moves the link list relative to the
optional About/Services disclosure. Identity and the automatic contact strip
remain at the top for scanability; the contact strip's field order is fixed.

## Data model

Add an optional structured customization object to `ProfileContent` and the
published profile snapshot. The conceptual shape is:

```ts
customization?: {
  preset: "warm-studio";
  accent: "coral" | "jade" | "ink";
  typeScale: "compact" | "comfortable" | "editorial";
  linkTreatment: "filled" | "outlined";
  contentOrder: "links-first" | "section-first";
  featuredLinkId?: string;
  section?: {
    kind: "about" | "services";
    body: string;
    items?: string[];
  };
}
```

The Coral, Jade, and Ink token values may be tuned to meet contrast checks, but
the allowed set remains finite and server-validated.

Section constraints:

- About body: nonblank and at most 280 characters.
- Services body: nonblank and at most 160 characters.
- Services items: zero to three nonblank labels, each at most 60 characters.
- About sections do not use `items`.
- An absent section means no About/Services disclosure is rendered.

The existing `theme` field remains as a legacy fallback during rollout. When
`customization` exists, it takes precedence. Existing profiles without it
continue rendering their current legacy theme. New profile creation paths and
demo fixtures initialize Warm Studio customization.

No destructive backfill is required. The optional fields allow old documents,
old published snapshots, and existing tests to remain readable while the new
editor progressively adds customization.

## Data flow and boundaries

The flow remains:

`ProfileEditor draft state`
→ `ProfileContent customization`
→ `profile presentation resolver`
→ `PublicProfile`

For live accounts, Save draft and Publish continue using the authenticated
Convex profile mutations. For local demo mode, the demo store persists the
same typed content shape. The renderer and validation rules are shared.

The public profile and card resolver continue to use the published projection.
The card resolver does not gain a second visual treatment; its active result
passes the same profile projection to `PublicProfile`.

The main boundaries are:

- Domain types and pure validation define the customization contract.
- Convex schema and validators enforce the contract at persistence boundaries.
- A presentation resolver converts legacy or customized content into safe
  render tokens.
- Public profile components render identity, contact strip, links, disclosure,
  and save-contact behavior.
- Editor components own guided editing and preview state but do not decide
  public visibility or authorization.

The existing large profile editor should be split along these boundaries as
part of the feature so demo and live paths do not develop separate behavior.

## Validation and error handling

Draft validation checks:

- Customization enum values are supported.
- Section text and item lengths are within limits.
- About and Services shapes match their selected kind.
- Existing profile/link safety rules continue to run.

Publication validation additionally checks the existing required name and
enabled-link rules, account/profile access, slug immutability, and card claim
requirements. A missing featured link is a warning/fallback, not a publication
blocker.

Errors appear next to the relevant guided section and in the existing
publication summary. Save failures preserve the user's local draft and use the
existing retryable error treatment. Preview rendering has defensive fallbacks:
unknown or absent customization uses the legacy theme or Warm Studio default
as appropriate, never user-supplied CSS.

The server remains authoritative. Client controls improve feedback but cannot
bypass Convex authorization, validator checks, draft privacy, or publication
rules.

## Accessibility and responsive behavior

- Use native or equivalent disclosure semantics for About/Services.
- Keep every editor control keyboard operable with visible focus.
- Preserve minimum touch-target sizing and readable text at phone widths.
- Ensure contact actions have explicit accessible names, not icon-only labels.
- Keep contrast valid for every curated accent, type scale, and link treatment.
- Honor `prefers-reduced-motion` for preview and disclosure transitions.
- Keep the preview from trapping focus or interfering with editor navigation.
- Verify the profile at approximately 390px, 768px, and 1440px widths.

## Testing and acceptance

### Domain and component tests

- Validate each supported customization value and reject unsupported values.
- Validate About/Services constraints and content ordering.
- Verify legacy theme fallback and Warm Studio precedence.
- Verify automatic contact-strip derivation and omission when empty.
- Verify featured-link fallback after disable/delete.
- Render the public profile with each control combination used in Version 1.
- Verify collapsed disclosure semantics and keyboard behavior.

### Convex and integration tests

- Save customization into a draft without changing the published snapshot.
- Publish customization into the published snapshot.
- Read customized content through direct public profile queries.
- Read the same customized content through an active card resolver.
- Keep existing profiles on their legacy appearance until opt-in publication.
- Enforce customer ownership and preserve administrator behavior.
- Preserve demo/live parity for defaults and validation.

### End-to-end acceptance flow

1. Open a customer profile with the new editor.
2. Choose Warm Studio controls and populate contact fields to verify the
   automatic contact strip.
3. Select a featured link and enable either About or Services.
4. Save a draft and verify the visitor still sees the prior published profile.
5. Publish and verify the direct profile URL shows the new presentation.
6. Verify an active card path shows the same presentation.
7. Disable or remove the featured link and verify the normal link list remains usable.
8. Exercise keyboard navigation, mobile layout, loading, validation, and
   reduced-motion states.

Existing profile, link, public-profile, card-resolver, accessibility, and live
E2E suites remain required acceptance gates.

## Future extension points

The structured customization boundary leaves room for later additions without
making Version 1 a block builder:

- An opt-in contact panel can sit alongside the automatic contact strip.
- A media presentation model can add a background image or slideshow.
- Additional curated presets can reuse the same token contract.
- Additional typed sections can be added after observing how owners use the
  first About/Services section.

Those additions require their own design and publication/privacy review before
they are added to the schema.
