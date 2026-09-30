# Tapit Warm Editorial Whole-Website Redesign

**Status:** Approved for implementation
**Date:** 2026-09-30
**Selected direction:** Option 2, Warm Editorial
**Visual reference:** [Selected profile-editor prototype](../../design-references/tapit-warm-editorial-profile-editor.png)

## Intent

Give Tapit's existing website a more modern, refined visual identity across every current page and state. Tapit helps professionals and small businesses maintain a phone-first digital profile that visitors can open from an NFC card, QR code, or direct link. The redesign should make customer editing feel clear and considered, public profiles easy to scan, and administrator tools easy to operate.

The user selected the Warm Editorial profile-editor concept as the visual anchor. Carry its warm paper surfaces, forest-green actions, restrained clay accents, editorial page headings, and clean sans-serif controls through the existing product. The prototype is a visual reference, not a literal specification for every screen.

## Assumptions

- This is a presentation redesign of the existing Tapit application, not a separate product or route.
- All current route families and their responsive, loading, empty, unavailable, error, and confirmation states are in scope.
- Preserve current routes, content meaning, permissions, data, authentication, and behavior.
- Use the existing customer and administrator navigation destinations. The prototype's `Overview` item is illustrative; do not add an overview destination or change `/app`'s current redirect behavior.
- Keep customer-selected public-profile themes independent of the Tapit application palette.

## Goals and success criteria

- Establish one coherent, warm visual system across marketing, legal, authentication, public profiles, the customer workspace, card building, and administrator operations.
- Make titles, form groups, status, and next actions easy to understand at a glance.
- Keep the public profile phone-first and focused on identity, enabled destinations, and the existing Save contact action.
- Give customer forms and live previews a clear relationship on both desktop and mobile.
- Make administrator records and status distinctions scannable without turning the product into a generic admin template.
- Keep all existing states, dialogs, forms, tables, and actions usable with keyboard and touch input.
- Meet the product's WCAG 2.2 AA target, including text/control contrast, focus visibility, labels, status cues, and reduced-motion behavior.

## Design direction: Warm Editorial

Use an understated natural-paper canvas with warm white content surfaces, deep forest-green actions, soft sage supporting tones, and restrained clay details. Make whitespace, alignment, and type establish hierarchy before adding borders or elevation. Use thin warm-gray separators and moderate corner radii. Keep long-form text readable and app controls crisp.

The selected prototype suggests these starting tokens. Treat them as candidates and verify every text, control, focus, error, status, disabled, and customer-theme combination before implementation:

| Token           | Starting value |
| --------------- | -------------- |
| Page canvas     | `#F0EDE5`      |
| Primary surface | `#FFFDF8`      |
| Soft surface    | `#F7F3E9`      |
| Main text       | `#28352C`      |
| Muted text      | `#5E6B63`      |
| Border          | `#E6E0D3`      |
| Accent          | `#315E48`      |
| Strong accent   | `#244635`      |
| Soft accent     | `#E5EADF`      |
| Warm accent     | `#C89961`      |

Use a restrained system serif stack for major page headings and the existing system sans-serif stack for body text, fields, navigation, statuses, and buttons. Keep to two font families and add no font dependency. Use a 16–20px radius range for prominent surfaces and smaller radii for controls. Use shadows sparingly. Respect reduced-motion preferences. The muted text token is darkened from its prototype candidate to meet AA contrast on the warm canvas.

## Scope

Restyle all existing product surfaces without changing their purposes or route contracts:

- **Marketing and legal:** `/`, `/privacy`, and `/terms`, including the public header and footer.
- **Authentication and setup:** `/login`, `/setup/[token]`, and `/onboarding`, including validation, invitation states, and loading feedback.
- **Public profile paths:** `/<slug>`, `/c/[cardToken]`, plus published, unpublished, inactive-card, not-found, temporary-error, and loading states.
- **Customer workspace:** `/app` (redirects to `/app/profile`), `/app/profile`, `/app/customize`, `/app/links`, `/app/analytics`, `/app/account`, and `/app/account/build-card`, including shared navigation, preview/editor flows, and account actions.
- **Standalone card builder:** `/build-card`.
- **Administrator workspace:** `/admin` (redirects to `/admin/customers`), `/admin/customers`, `/admin/profiles`, `/admin/cards`, `/admin/analytics`, `/admin/audit-log`, and `/admin/settings`, including existing detail views, tables, forms, filters, and confirmations.
- **Shared UI:** buttons, fields, notices, status indicators, navigation, tables, dialogs, media previews, empty/loading/error/access states, and desktop/tablet/mobile variants.

The list above covers current application routes; implementation must confirm the route inventory against `src/app` before edits. Do not add a dashboard, new routes, or new capabilities.

## Surface requirements

### Marketing and legal

Apply an editorial heading hierarchy, restrained natural palette, and generous reading width. Keep existing copy meaning, section order, links, calls to action, and footer destinations. Legal pages should prioritize readable line length, clear heading levels, lists, and comfortable mobile spacing.

### Authentication and setup

Use a focused warm surface without workspace navigation. Keep sign-in, signup, invited setup, and onboarding states distinct. Preserve all labels, input types, validation, recovery feedback, loading states, and callback destinations. Do not introduce new claims or marketing copy.

### Public profiles and resolver states

Keep published profiles phone-first, fast to scan, and focused on the owner's identity and enabled links. Preserve Save contact, contact actions, consent behavior, link tracking, customer theme selection, and direct/card URL presentation parity. Apply Warm Editorial to Tapit-owned page framing and controls only; do not override the customer's chosen public profile style or accent color.

Unavailable, inactive-card, unpublished, and suspended states must not reveal former or unpublished identity or profile content. Preserve safe copy and existing recovery paths.

### Customer workspace

Keep the existing customer destinations and emphasize the current task, profile status, draft state, and publication action. Use readable form grouping, restrained dividers, and a responsive live preview. Keep profile identity, URL, media, appearance, and publication controls clear. Keep Links ordering, enabled state, keyboard alternatives, and save/publish behavior unchanged. Analytics remain aggregated. Account and card-building screens use the same field, confirmation, and feedback patterns while preserving their current actions.

### Administrator workspace

Use the same palette and typography as the customer product while maintaining clear operations context. Make existing customer, profile, and card tables scannable through hierarchy, column spacing, filters, labels, status text, and row actions. Preserve existing detail views and forms. Keep consequential actions such as suspend, unpublish, deactivate, replace, and deletion handling explicit and distinguishable from routine navigation.

### Shared components and states

Apply consistent control sizing, focus, disabled, selected, error, warning, success, and confirmation states. Pair color with text or icons. Preserve dialog focus management and announcement behavior. Keep empty, loading, access-denied, not-found, and failure states specific to their existing context.

## Responsive and accessibility requirements

- Keep public profiles legible from 320 CSS pixels upward, with no horizontal scrolling for primary content or contact actions.
- Preserve the existing customer/admin navigation models while refining touch targets, focus order, and responsive transitions.
- At narrow widths, stack editor groups intentionally and keep draft/publication controls reachable. Provide an intentional preview action or placement without hiding status or save/publish actions.
- Administrator records must remain understandable on phones; prioritize columns or use an accessible row layout instead of relying on a clipped table alone.
- Use semantic landmarks, headings, tables, lists, links, buttons, and labelled fields. Associate help and validation feedback with controls.
- Maintain visible keyboard focus, non-color status cues, logical focus order, reduced-motion support, and descriptive image semantics.

## Product and behavior constraints

- Do not change authentication, roles, account lifecycle, ownership, route access, or Convex/API contracts.
- Keep published-only public projections, explicit draft saving and publishing, and existing privacy boundaries.
- Preserve administrator ownership of card registration, assignment, deactivation, and replacement.
- Preserve analytics aggregation and consent behavior.
- Preserve profile fields, supported links, card generation, existing content meaning, and customer-selected profile themes.
- Do not add billing, teams, visitor accounts, dashboard routes, new product features, new profile themes, or third-party component libraries.
- Do not add custom font or UI-library dependencies.

## Implementation boundaries and review

This spec authorizes a visual and responsive redesign only after it is reviewed and approved. The implementation plan must inventory route components and shared styles, map the Warm Editorial tokens to the actual codebase, and split work into reviewable route-family slices. It must include browser review of representative desktop and mobile pages, a pass through every current route/state family, `npm run verify`, and a final check that behavior and protected data boundaries remain unchanged.

No code changes are included in this design document. The generated profile-editor image is the selected visual anchor; route-specific layouts can adapt the same system to their existing jobs.
