# Tapit Quiet Precision Whole UI Redesign

**Status:** Approved for implementation
**Date:** 2026-09-30
**Selected direction:** B — Quiet Precision
**Design reference:** [Quiet Precision mock designs](../../design-references/tapit-quiet-precision-mockups.html)

## Intent

Redesign Tapit's whole visual experience as one coherent product: the public website and profile pages, customer workspace, administrator tools, authentication and setup, card builder, and supporting states. The selected direction is **Quiet Precision**: calm, precise, current, and warm enough to feel human. It should make public profiles easy to scan, customer tasks easy to understand, and administrator records easy to operate.

The mockup is a visual reference for the direction, not a request to copy each sample screen literally. The `Customer overview` screen is exploratory: `/app` currently redirects to `/app/profile`, so this design does not add a new dashboard route or change navigation semantics by itself.

## Goals and success criteria

- Give all existing Tapit surfaces a consistent typography, color, spacing, component, and responsive system.
- Make the next useful action clear on public profiles, profile editing, link management, card operations, and account management.
- Give dense administrator tables and operational statuses a clear hierarchy without making the interface feel like a generic admin template.
- Preserve the public profile's mobile-first business-card experience and the distinct roles of customers, visitors, and administrators.
- Make desktop and mobile layouts feel intentionally designed, including navigation, forms, tables, previews, dialogs, loading, empty, and error states.
- Meet the existing WCAG 2.2 AA accessibility target, including keyboard access, visible focus, readable contrast, labels, and non-color status cues.
- Keep profile theme customization separate from Tapit's application UI palette.

Success means every current route family can be restyled using shared design rules without changing its underlying purpose, data, permissions, or customer-visible outcomes. The public profile, workspace, marketing site, and operations tools should look related while remaining appropriate to their users.

## Design direction: Quiet Precision

Use a bright neutral canvas with white content surfaces, a restrained green accent, crisp borders, quiet status colors, and deliberate whitespace. Favor compact but readable labels and data, generous page titles, and clear primary actions. Keep elevation light and rare; use surface contrast and spacing before shadows. Cards should have consistent but moderate rounding, and motion should remain subtle and respect reduced-motion settings.

The saved mockup supplies starting values for visual exploration:

| Token             | Starting value |
| ----------------- | -------------- |
| Page canvas       | `#EEF0ED`      |
| Primary surface   | `#FFFFFF`      |
| Secondary surface | `#F5F7F5`      |
| Main text         | `#17231E`      |
| Muted text        | `#78847D`      |
| Border            | `#E4E9E5`      |
| Accent            | `#236D54`      |
| Strong accent     | `#174D3B`      |
| Soft accent       | `#E4F1EA`      |

Treat these as design-token candidates, not unvalidated final values. Confirm contrast for text, controls, focus, errors, statuses, disabled states, and customer-selectable profile themes before implementation. Use the current system sans-serif stack for application UI unless implementation discovery shows an existing brand font contract. The selected direction does not add fonts, dependencies, or a new theme catalog.

## Scope

Redesign the presentation and interaction hierarchy for existing surfaces:

- **Marketing and legal:** `/`, `/privacy`, and `/terms`, including public navigation, page typography, content width, and responsive behavior.
- **Authentication and setup:** `/login`, `/setup/[token]`, and `/onboarding`, including form layouts, validation, feedback, and loading states.
- **Public profile paths:** `/<slug>`, `/c/[cardToken]`, and existing published, unavailable, inactive-card, not-found, and temporary-error states.
- **Customer workspace:** `/app/profile`, `/app/customize`, `/app/links`, `/app/analytics`, `/app/account`, and `/app/account/build-card`, including the shared workspace shell and existing preview/editor flows.
- **Administrator workspace:** `/admin/customers`, `/admin/profiles`, `/admin/cards`, `/admin/analytics`, `/admin/audit-log`, and `/admin/settings`, including the shared operations shell, lists, forms, profile details, and confirmations.
- **Standalone card builder:** `/build-card`.
- **Shared UI states and components:** buttons, links, fields, notices, status indicators, tables, dialogs, navigation, image previews, empty/loading/error/access states, and responsive variants.

The mockup's dashboard-like customer overview is not an approved new feature or route. Preserve the existing route structure and map the chosen visual patterns onto current screens unless a later approved design decision changes the information architecture.

## Product and behavior constraints

This is a visual redesign. Preserve the established product contracts documented in [Tapit design](../../DESIGN.md), [product specification](../../spec.md), and the existing route implementations.

- Do not change authentication, roles, account lifecycle, ownership, or route access.
- Keep the public profile readable without sign-in or app installation. Visitors see published content only.
- Keep draft saving and publication explicit. A draft or unpublished profile must not become public through a visual or routing change.
- Preserve inactive-card and unavailable-profile privacy boundaries; do not show former or unpublished profile content on those pages.
- Preserve administrator ownership of card registration, assignment, deactivation, and replacement. Do not add customer card-management controls.
- Preserve auditability and clear confirmation for destructive or consequential administrator actions.
- Keep analytics aggregated and preserve existing consent and privacy behavior.
- Preserve current profile fields, supported links, card generation behavior, and customer-controlled profile theme semantics.
- Do not add billing, teams, visitor accounts, rich content, or new backend capabilities.

## Surface requirements

### Public website and profile

The public website should express the same calm, precise brand through readable editorial hierarchy and consistent controls. Keep its current content and calls to action. Public profile pages remain phone-first, fast to scan, and focused on identity, enabled destinations, and Save contact. Keep the current profile theme controls independent of the application shell; the shell redesign must not silently replace customer-selected public appearance.

Inactive-card, unpublished/suspended-profile, unavailable, and service-error pages should use restrained Tapit branding and communicate the state without disclosing protected identity or profile data. Preserve the current card resolver and public URL semantics.

### Customer workspace

Keep customer and administrator workspaces visually related but clearly distinct. The customer shell should emphasize profile status and the current task, with direct routes to existing profile, customization, links, analytics, account, and build-card features. Profile editing should pair legible fields and grouped settings with a responsive preview. Draft, live, saving, saved, validation, and publication states must be distinguishable without relying on color alone.

Link management should make label, destination, enabled state, ordering, and add/edit actions easy to scan. Preserve keyboard-accessible movement controls. Account and build-card pages should use the same field, confirmation, and feedback patterns while retaining their existing behavior.

### Administrator workspace

Keep the operations shell distinct through concise section labels and clear page context, not a separate visual language. Make customer/profile/card records scannable with consistent columns, search/filter placement, status text, row actions, and pagination where already present. Preserve detail views and the profile editor's existing tabs. Clearly separate routine navigation from high-impact actions such as unpublish, suspend, deactivate, replace, and deletion handling.

### Authentication and supporting states

Login, setup, and onboarding should feel like part of the same service without inheriting workspace navigation. Keep forms focused, label every input, show specific validation and recovery feedback, and preserve all existing authentication mode distinctions. Loading, empty, no-access, not-found, and failure states should explain what happened and the available next action.

## Responsive behavior

- Design public profiles for narrow mobile viewports first; preserve visible identity and primary contact actions without horizontal scrolling.
- At desktop widths, customer and administrator shells may use a full sidebar. At medium widths, use a compact navigation treatment with accessible names. At phone widths, use the existing mobile navigation model refined for touch and keyboard access.
- Keep page headers, primary actions, forms, cards, and confirmation dialogs usable at 320 CSS pixels and above.
- Administrator tables must remain understandable on mobile through intentional column prioritization or an accessible alternate row treatment; do not rely on a clipped horizontal table as the only presentation.
- Editor preview must adapt to narrow screens without obscuring draft controls or status.

## Accessibility and interaction requirements

- Meet WCAG 2.2 AA as defined in the current product design requirements.
- Use semantic landmarks, headings, lists, table structures, buttons, links, and labelled form controls.
- Provide visible keyboard focus and logical focus order. All actions must work without hover, drag-only interaction, color recognition, or pointer precision.
- Pair every status color with text or an icon; maintain contrast for all states and themes.
- Associate validation errors and help text with their fields; announce asynchronous save, publish, and operation results.
- Keep confirmation-dialog focus behavior intact and return focus to the trigger when closed.
- Respect reduced-motion preferences and retain descriptive or decorative image semantics.

## Out of scope

- Product code, data model, API, auth, routing/permission logic, or business-rule changes.
- New dashboard routes, new product features, or changes to navigation destinations.
- New customer profile themes, custom fonts, design-library dependencies, or third-party component-library adoption.
- Copywriting or content strategy changes beyond short labels needed to clarify existing controls.
- E2E/unit-test work or live/production validation in this design-document stage.

## Reference and review boundary

The durable, interactive reference artifact is [docs/design-references/tapit-quiet-precision-mockups.html](../../design-references/tapit-quiet-precision-mockups.html). It contains switchable Quiet Precision, Warm Editorial, and Ink + Electric treatments plus representative customer, public, and admin screens. Quiet Precision is the approved direction for this spec; the other treatments remain comparison material only.

The user approved this direction and scope on 2026-09-30. Implementation follows the separate plan at `docs/superpowers/plans/2026-09-30-12-46-quiet-precision-whole-ui-redesign.md`.
