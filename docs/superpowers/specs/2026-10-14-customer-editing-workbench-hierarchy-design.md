# Customer Editing Workbench Hierarchy

Date: 2026-10-14
Status: Draft for review

## Goal

Make it easy for a customer to edit profile content, appearance, and links, see what is published, and preview the pending result without scrolling through a long, mixed form.

## Design

Keep the existing Profile, Customize, and Links routes. Organize Profile fields by task: Basics (photo, name, bio or role), Contact (email, phone, website), Profile link (public URL, slug, and destination behavior), and optional About/Services content. Keep the empty About/Services state compact. Keep Featured link selection with the link list in Links so link choices have one editing home.

Keep the current Overview, Identity, Media, and Layout customization categories and all existing settings. Make all category names discoverable at phone width. Put secondary appearance adjustments such as accent, type scale, and contact-button treatment under one collapsed Fine tune disclosure; selecting a preset remains the main, low-effort path.

On Profile, Customize, and Links, place the live draft preview beside the editor at 1280 CSS pixels and wider when the editor can retain a readable width. At narrower widths, provide an Edit/Preview view switch that keeps the current draft and returns to the same editing state. Use the existing WorkspacePreview and public-profile projection.

Show the full save/publish action bar only while the draft is dirty or a save/publish operation is in progress. Keep a compact saved/dirty status near the page heading. Remove repeated clean publication status from the bottom of Profile while retaining validation and publication errors there.

## Scope

- Customer routes: /app/profile, /app/customize, /app/links.
- Presentation, field grouping, preview placement, and action visibility only.
- Keep each current route and its customer-only access boundary.

## Constraints

- Preserve draft-save navigation interception, profile validation, image/media upload safeguards, save/publish behavior, and private-draft preview semantics.
- Featured link remains the same persisted selection; only its editor location moves.
- Preserve docs/superpowers/specs/2026-10-13-profile-content-row-order-design.md. This work does not change that design's public profile block-order contract or its stored customization field.
- Do not change schema, API, authentication, account lifecycle, card ordering, or analytics collection.

## Acceptance criteria

1. Profile content appears once under the section that explains it; Featured link selection is available from Links and produces the same public profile after publish.
2. Empty About/Services content does not occupy a fully expanded editor panel.
3. At 1280 × 800, Profile, Customize, and Links show the editor and preview together without making the editor narrower than 32rem. Below that width, the Edit/Preview switch is operable and preserves the draft.
4. At 390 CSS pixels, all Customize category labels are fully visible or the horizontal-scroll affordance is clear; the page has no horizontal overflow.
5. A clean, idle Links page has no disabled fixed Save draft/Publish bar. Editing or an in-flight operation reveals the full action bar and enough bottom space to reach every link row.
6. The customer sees one clear current save/publication status; validation errors and publication blockers remain visible.
7. Existing keyboard and non-drag link-reordering controls remain available.

## Implementation boundary

No changes to public profile appearance, profile projection data, persistence format, authorization, publication rules, or physical-card ordering.
