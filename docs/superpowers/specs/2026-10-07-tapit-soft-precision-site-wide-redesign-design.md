# Tapit Soft Precision Site-wide Redesign

**Status:** Approved for implementation
**Date:** 2026-10-07
**Selected direction:** Round 03 · 01 — Soft Precision
**Design reference:** [Site-wide Soft Precision mockup](../../../design/mockups/tapit-soft-precision-site/index.html)

## Intent

Carry the selected Soft Precision identity across Tapit's existing public site, profile experience, customer workspace, and administrator tools. The redesign should feel like one product while letting each audience complete its existing task with the right amount of visual density.

The approved mockup is a direction reference, not a request to copy its static controls literally. It shows representative screens for the home page, a public profile, profile editing, link management, customer analytics, customer accounts, and card operations. All other existing routes and states must follow the same system.

## Audiences and goals

- **Visitors:** understand a profile quickly and take the intended contact or link action.
- **Profile owners:** keep their details current, control how their profile appears, and publish changes with confidence.
- **Tapit operators:** find accounts, profiles, and cards quickly and distinguish routine actions from consequential ones.

The design priority is clear action and legible hierarchy first, consistent identity second, and decorative polish third. Admin and editor screens can be denser than public screens, but must remain easy to scan.

## Direction: Soft Precision

Use the selected Round 03 direction: generous spacing, a centered product promise on the marketing page, a softly elevated profile specimen, rounded controls, and a cool blue accent. The visual reference uses:

| Role          | Starting value       |
| ------------- | -------------------- |
| Canvas        | <code>#f4f6fa</code> |
| Main text     | <code>#1b2433</code> |
| Muted text    | <code>#687487</code> |
| Surface       | <code>#ffffff</code> |
| Border        | <code>#e0e5ed</code> |
| Accent        | <code>#3f6de8</code> |
| Strong accent | <code>#315fe4</code> |
| Soft accent   | <code>#e8edf9</code> |

Treat these as candidates to validate in the implementation, especially for text, focus, status, and disabled states. Use the existing system sans-serif stack; do not add a hosted font or design dependency. Large profile surfaces may use the reference's generous rounding and restrained layered shadow. Workspace panels should rely more on spacing and quiet borders so repeated records do not become a stack of floating cards.

The default Paper public profile uses the Soft Precision palette. The Customize screen offers Soft Precision (Paper), Moss, Night, Warm Studio, and Custom presets. Moss, Night, Warm Studio, and Custom choices keep their own appearance when selected; changing presets applies only to the profile draft. New profiles and demo seeds start on Paper, while existing saved themes and customization remain intact.

## Scope

Restyle the presentation and interaction hierarchy of existing route families:

- **Marketing and legal:** <code>/</code>, <code>/privacy</code>, and <code>/terms</code>.
- **Authentication and setup:** <code>/login</code>, <code>/setup/[token]</code>, and <code>/onboarding</code>.
- **Public profiles and card paths:** <code>/:slug</code>, <code>/c/[cardToken]</code>, and their existing loading, error, unavailable, inactive-card, and not-found states.
- **Customer workspace:** <code>/app/profile</code>, <code>/app/customize</code>, <code>/app/links</code>, <code>/app/analytics</code>, <code>/app/account</code>, and <code>/app/account/build-card</code>.
- **Administration:** <code>/admin/customers</code>, <code>/admin/profiles</code>, <code>/admin/cards</code>, <code>/admin/analytics</code>, <code>/admin/audit-log</code>, and <code>/admin/settings</code>.
- **Standalone card builder:** <code>/build-card</code>.
- **Shared interface:** the public, customer, admin, and auth shells; controls; forms; previews; status messages; dialogs; tables; navigation; and empty, loading, access, and failure states.

Preserve the existing <code>/app</code> redirect to <code>/app/profile</code> and <code>/admin</code> redirect to <code>/admin/customers</code>. Do not add routes, dashboards, or navigation destinations.

## Surface requirements

### Public site and profiles

- Keep the marketing page's promise centered above the profile specimen, as shown in the selected mockup.
- Keep existing product facts, route semantics, and CTA destinations. The design pass does not reopen copy strategy.
- Keep public profiles phone-first, focused on identity, enabled destinations, and Save contact.
- Keep published-only visibility. Inactive, unpublished, unavailable, and error states must not expose protected profile details.
- Apply Tapit's visual system around a public profile without overwriting its selected profile theme or Custom palette.

### Customer workspace

- Keep customer and admin workspaces related through color, type, spacing, and control shape; distinguish them through navigation labels and task context.
- Make profile status, the current editing task, draft state, and publish action easy to find.
- Pair editing fields with a responsive profile preview where the existing flow provides one.
- Make link label, destination, enabled state, ordering, and add/remove actions scannable. Reordering must remain operable without drag-only interaction.
- Keep account and card-building tasks within their current routes and preserve their existing save, publish, and confirmation behavior.

### Administrator workspace

- Use compact, readable rows for customers, profiles, cards, analytics, audit history, and settings.
- Keep search, filters, status, row actions, and pagination (where present) easy to find.
- Use text alongside color for all statuses. Keep destructive or consequential actions visibly distinct and preserve their confirmation steps.
- Preserve the administrator's ownership of card registration, assignment, deactivation, and replacement.

### Authentication and supporting states

- Use the same type, color, field, button, and notice language without putting workspace navigation on sign-in or setup screens.
- Preserve existing validation, recovery, loading, access, and failure behavior. State screens should explain the current state and its available next step.

## Product and behavior constraints

This is a visual redesign of the current product. Preserve existing data and product contracts:

- Do not change authentication, roles, account lifecycle, ownership, route access, or endpoint behavior. Add only the optional persisted Custom appearance and palette fields required by the requested preset; validate the palette and keep existing saved documents compatible.
- Keep drafts private until the existing publish action succeeds.
- Preserve public profile projection, inactive-card handling, and unavailable-profile privacy. Use Paper/Soft Precision as the new-profile default; explicitly selected Moss, Night, Warm Studio, or Custom appearance choices override it.
- Preserve analytics aggregation and consent behavior. Do not add visitor-level tracking or invent performance numbers.
- Keep card assignment and lifecycle actions admin-owned. Preserve audit entries and confirmations.
- Do not add billing, teams, visitor accounts, profile themes beyond the requested Custom preset, rich content, or other product capabilities.
- Do not add copy or content claims that lack evidence. The design inspection had no supplied customer interviews or production analytics; seeded local fixtures are reference content, not proof of customer outcomes.

The earlier Quiet Precision, Warm Editorial, and Premium Conversion design documents and plans describe different visual choices. This spec supersedes their visual direction for the site-wide redesign if approved; their route, privacy, access, and behavior constraints remain applicable unless this spec explicitly changes them.

## Responsive and accessibility requirements

- Design from 320 CSS pixels upward. The page must not require horizontal scrolling at supported widths.
- Keep public identity and primary actions visible on phones. Reflow workspace previews, fields, and admin records instead of shrinking them to fit.
- Keep workspace navigation usable at phone and intermediate widths, with accessible names and a clear current destination.
- Maintain readable type, comfortable line height, and touch targets of at least 44 CSS pixels for primary controls.
- Meet the product's WCAG 2.2 AA target: semantic landmarks and headings, labelled controls, visible keyboard focus, logical focus order, non-color status cues, and accessible dialog behavior.
- Respect reduced-motion and reduced-transparency preferences. Content and actions must remain available without animation or transparency effects.

## Acceptance criteria

1. All existing route families use a coherent Soft Precision system while public, customer, admin, and auth surfaces retain task-appropriate hierarchy.
2. The marketing page follows the selected centered promise and profile-specimen direction; public profile pages remain focused and phone-first.
3. Customer and admin screens preserve their existing route destinations, permissions, publication rules, and operational behavior; existing profile data remains compatible with the optional Custom palette fields.
4. New profiles use Paper/Soft Precision by default; explicitly selected themes override it, and saved theme/customization choices remain unchanged.
5. All route families remain legible and operable from 320 CSS pixels through desktop widths, including forms, navigation, tables, previews, dialogs, and state screens.
6. Contrast, focus, statuses, and controls meet WCAG 2.2 AA, and key flows remain usable by keyboard and touch.
7. Analytics presentation uses only real aggregate data or a genuine empty state; no unverified performance claim is introduced.
8. No new route, dependency, or customer-data collection is introduced. The only data-contract extension is optional validated Custom appearance/palette data; the only default change is new profiles and demo seeds starting on Paper.

## Implementation boundary

This spec records the approved visual direction. The separate approved implementation plan covers product-code work, including only the requested optional Custom appearance/palette extension. This approval does not authorize deployment, external publishing, or changes to authentication and business rules.
