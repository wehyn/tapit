# Customer Editing Workbench Hierarchy

Date: 2026-10-14
Status: Draft for review

## Goal

Make it easy for a customer to edit profile content, appearance, and links, see what is published, and preview the pending result without scrolling through a long, mixed form.

## Design

Keep the existing Profile, Customize, and Links routes. Organize Profile fields by task: Basics (photo, name, bio or role), Contact (email, phone, website), Profile link (public URL, slug, and destination behavior), and optional About/Services content. Keep the empty About/Services state compact. Keep Featured link selection with the link list in Links so link choices have one editing home. The Links editor treats link rows and the featured-link choice as one draft and saves both atomically.

Keep the current Overview, Identity, Media, and Layout customization categories and all existing settings. Make all category names discoverable at phone width. Put secondary appearance adjustments such as accent, type scale, and contact-button treatment under one collapsed Fine tune disclosure; selecting a preset remains the main, low-effort path.

On Profile, Customize, and Links, place the live draft preview beside the editor at 1280 CSS pixels and wider when the editor can retain a readable width. At narrower widths, provide an Edit/Preview view switch that keeps the current draft and returns to the same editing state. Use the existing WorkspacePreview and public-profile projection.

Show the full save/publish action bar only while the draft is dirty or a save/publish operation is in progress. Keep a compact saved/dirty status near the page heading. Remove repeated clean publication status from the bottom of Profile while retaining validation and publication errors there.

## Scope

- Customer routes: /app/profile, /app/customize, /app/links.
- Presentation, field grouping, preview placement, and action visibility only.
- Keep each current route and its customer-only access boundary.

## Constraints

- Preserve draft-save navigation interception, profile validation, image/media upload safeguards, save/publish behavior, and private-draft preview semantics.
- Featured link remains the same field in ProfileCustomization; only its editor location moves. Preserve the non-blocking missing/disabled selection state and its explicit clear action.
- Extend the existing links.replaceDraft mutation with an optional featured-link value: omitted means leave the current selection unchanged, null clears it, and a string selects it. Validate a newly selected id against the enabled links in the same submitted list; save the links and selection in one transaction and one draft-revision increment.
- Preserve the existing profile.links_updated audit event for link-list and featured-link changes, with before/after details that make a featured-only change understandable. When a legacy profile has no customization object, initialize the same appearance defaults used by the existing Profile editor so selecting a featured link does not change its appearance.
- Preserve docs/superpowers/specs/2026-10-13-profile-content-row-order-design.md. This work does not change that design's public profile block-order contract or its stored customization field.
- Do not change the database schema, add a mutation endpoint, change authentication or account lifecycle, alter card ordering, or change analytics collection. The optional field on the existing links mutation is the only approved API-surface change.

## Acceptance criteria

1. Profile content appears once under the section that explains it; Featured link selection is available from Links and produces the same public profile after publish.
2. Selecting, clearing, or retaining a featured link saves atomically with link changes. Missing or disabled current selections remain non-blocking and can be cleared; newly selected ids must refer to enabled submitted links.
3. Empty About/Services content does not occupy a fully expanded editor panel.
4. At 1280 × 800, Profile, Customize, and Links show the editor and preview together without making the editor narrower than 32rem. Below that width, the Edit/Preview switch is operable and preserves the draft.
5. At 390 CSS pixels, all Customize category labels are fully visible or the horizontal-scroll affordance is clear; the page has no horizontal overflow.
6. A clean, idle Links page has no disabled fixed Save draft/Publish bar. Editing or an in-flight operation reveals the full action bar and enough bottom space to reach every link row.
7. The customer sees one clear current save/publication status; validation errors and publication blockers remain visible.
8. Existing keyboard and non-drag link-reordering controls remain available.

## Implementation boundary

No database-schema change, new mutation endpoint, access-model change, or physical-card-ordering change. Public profile projection behavior and draft/publish rules stay the same; the existing links mutation atomically writes the already-supported featuredLinkId field and retains its audit record.
