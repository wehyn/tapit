# Tapit premium UI redesign plan

Status: approved for implementation
Date: 2026-09-14

## Outcome

Redesign the Tapit visual system and all existing UI surfaces into a cleaner,
modern, premium product experience with an Apple and Linear inspired level of
restraint. Preserve the current routes, product behavior, data rules, and
accessibility guarantees.

This is a visual overhaul of the existing application, not a framework or
information-architecture migration.

## Design direction

Working name: Quiet Signal

Design read: a premium digital identity product for independent professionals,
visitors, and platform operators. The visual language is quiet, precise, and
tactile, using product-led layouts instead of decorative dashboard patterns.

Design dials:

- DESIGN_VARIANCE: 6. Use measured asymmetry and split layouts while keeping
  forms and operational lists easy to scan.
- MOTION_INTENSITY: 4. Use short, purposeful transitions for navigation,
  preview changes, publishing, feedback, and dialogs.
- VISUAL_DENSITY: 3. Keep public and customer surfaces airy. Allow more
  information in admin lists without turning them into spreadsheets.

Inspiration is directional only. Do not copy Apple or Linear branding, logos,
components, or proprietary interaction details.

### Landing hero reference alignment

The supplied Tapit reference is the source of truth for the landing-page
composition. The first viewport should read as an image-led editorial scene,
not as a dashboard preview:

- Use a full-bleed off-white photographic atmosphere with a pale stone surface
  and a soft plant silhouette on the right.
- Keep the header quiet: a plain Tapit wordmark, four lightweight navigation
  links, Sign in, and one jade View demo profile button.
- Anchor the left side with the small all-caps eyebrow, the two-line display
  message “Share one profile. Update it anytime.”, a short supporting sentence,
  and one jade CTA.
- Float a tall, white, slightly rotated profile card over the stone surface.
  Make the object read as a real photographed card with physical thickness,
  tactile surface texture, perspective, and contact shadow. Keep the visual
  card as a generated transparent cutout, with descriptive alternative text
  and the surrounding CTA and route behavior in HTML. Keep the full card
  silhouette inside the first viewport by sizing it against available hero
  height and using contain-fit behavior.
- Keep the hero spacious and low-contrast. The atmosphere supplies depth;
  borders, shadows, and motion should remain restrained.

The implemented reference assets live in `public/images/`:
`tapit-hero-atmosphere.png` supplies the scene and
`tapit-profile-card-cutout-v3.png` supplies the photographed physical card. It is an isolated cutout of the full-width card reference, with transparent padding so the rounded right edge and physical side remain visible when the hero uses `object-contain`.

## Visual system

### Palette

Use one cool neutral family and one Tapit jade accent across the application.

- Ink: `#151918`
- Muted ink: `#687571`
- Paper: `#F6F8F7`
- Surface: `#FFFFFF`
- Soft surface: `#E9EEEC`
- Hairline: `#D6DEDA`
- Jade accent: `#187461`
- Strong jade: `#0F5A4A`
- Soft jade: `#DCEFE9`
- Focus: retain a high-contrast warm focus token, or replace it with an
  equally visible accessible token after contrast verification.
- Danger: use a restrained red that is readable against the same cool neutral
  surfaces.

Do not introduce purple-blue AI gradients, rainbow gradients, neon glows, or
multiple competing accents. Use dark mode tokens only as a coordinated theme,
not as random inverted sections.

### Typography

- Replace the global Arial stack with a refined sans-serif using Next.js font
  loading or a self-hosted font. Prefer Geist or a similarly proportioned
  grotesk after checking local availability.
- Use sentence case for headings and labels.
- Use tighter tracking and line height for display headings.
- Keep body copy readable and limited to approximately 65 characters per line.
- Use medium and semibold weights for hierarchy instead of relying only on
  regular and bold.

### Shape and material

- Use a consistent 12px radius for panels, fields, rows, and control surfaces.
- Reserve full pills for primary actions and compact segmented controls.
- Prefer solid surfaces and hairline dividers. Use soft shadows only where a
  surface must float above another surface.
- Use restrained frosted-glass treatment only for floating preview or command
  controls, with a solid fallback for reduced transparency.
- Remove nested card-on-card patterns wherever spacing or dividers can carry
  the hierarchy.

### Interaction

- Add clear hover, active, disabled, loading, empty, error, and focus states.
- Keep all touch targets at least 44px, targeting 48px for primary controls.
- Use transform and opacity for motion. Honor `prefers-reduced-motion`.
- Keep destructive actions visually separated and require the existing
  confirmation flows.
- Replace handwritten glyph icons with one consistent allowed icon family,
  after verifying the dependency and keeping the existing semantic labels.

## Surface map

### Public and entry surfaces

- `/`: landing page with an editorial hero, one primary action, and a product
  preview that explains the one-tap identity workflow.
- `/[slug]`: mobile-first profile page with an identity block, link rail, and
  one clear Save contact action. The profile itself should not feel like a
  generic card inside an empty page.
- `/c/[cardToken]`: preserve active resolution and show the same profile
  treatment for active cards.
- inactive card, unavailable profile, loading, not-found, and error states:
  use the same Tapit state language without revealing private or former
  profile content.
- `/login` and `/setup/[token]`: use a calm, asymmetric auth layout with clear
  labels, one primary action, and direct errors.

### Customer workspace

- `/app/profile`: split editing workspace. Keep identity fields on the left,
  live phone or desktop preview on the right, and draft versus published state
  visible at all times.
- `/app/links`: list-first sortable editor. Use clear row hierarchy, label,
  destination, enabled state, reorder affordance, and a persistent draft /
  publish action area.
- `/app/analytics`: one readable trend visualization, a compact engagement
  summary, and a plain-language privacy explanation. Avoid a wall of KPI cards.
- `/app/account`: group account, password, support, and deletion actions with
  the same state and confirmation treatment.
- Customer navigation must continue to exclude Cards.

### Administrator console

- `/admin/customers`: searchable list-first registry with a compact create
  action and optional selected-customer detail panel.
- `/admin/profiles`: searchable profile operations with publication and
  suspension state made clear in each row.
- `/admin/cards`: register-card command bar, card registry, QR detail panel,
  download actions, replacement flow, and separated deactivation action.
- `/admin/analytics`: reuse the analytics visual language while adding
  authorized cross-customer scope and operational status.
- `/admin/audit-log`: readable chronological history with proportional filters,
  not a decorative data table.
- `/admin/settings`: focused settings form with clear status and support
  destination controls.

## Implementation order

### Phase 1: shared design system

Own and update the global tokens, font loading, shared layout shell, brand
mark, buttons, fields, panels, notices, status badges, icon mapping, focus
styles, responsive container rules, reduced-motion rules, and shared loading
patterns. Do not change route behavior.

### Phase 2: public surfaces

Redesign the home page, public profile, card resolver states, unavailable and
not-found states, loading and error surfaces, login, and setup. Preserve
metadata, noindex behavior, link tracking, vCard generation, and privacy
boundaries.

### Phase 3: customer workspace

Redesign the customer shell and profile editor first, then links, analytics,
and account. Preserve draft privacy, publication validation, slug locking,
link validation, ordering behavior, and deletion confirmation.

### Phase 4: administrator console

Redesign the admin shell and customers page first, then profiles, cards, QR
downloads, analytics, audit log, and settings. Preserve role guards, audit
records, duplicate card validation, replacement behavior, and moderation
privacy.

### Phase 5: visual and accessibility QA

Run the full test suite and inspect the real application at 390px, 768px, and
1440px. Verify keyboard navigation, focus visibility, reduced motion, loading,
error, empty, inactive-card, unavailable-profile, and confirmation-dialog
states. Compare the result to the generated visual references and fix drift.

## File ownership and delegation boundaries

- Shared design system owner: `src/app/globals.css`, shared layout files, and
  shared UI components under `src/components/layout` and `src/components/ui`.
- Public surface owner: `src/app/page.tsx`, public route files, profile and
  state components, and auth presentation files.
- Customer surface owner: customer shell and customer form, analytics, and
  account components.
- Admin surface owner: admin shell and admin management components.
- Test and review owners: read-only verification and independent diff review.

No two workers may edit the same file. Shared components must stabilize before
surface workers begin. The root integrator owns architecture, integration,
conflict resolution, and final verification.

## Behavior that must not regress

- Existing routes, redirects, and metadata behavior.
- Customer and administrator authentication guards.
- Draft content remaining private until explicit publication.
- Stable slug immutability after publication.
- Safe link schemes and validation errors.
- Active, inactive, replaced, and unavailable card/profile privacy behavior.
- QR download formats and filenames.
- Aggregate analytics scope and privacy wording.
- Customer isolation and the absence of a customer Cards navigation item.
- Existing audit logging and destructive-action confirmation.
- Semantic markup, keyboard operation, focus restoration, and WCAG 2.2 AA
  baseline.

## Acceptance checks

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- relevant Playwright smoke, public profile, customer, admin, and accessibility
  suites
- manual screenshots at 390px, 768px, and 1440px for public, customer, and
  admin surfaces
- keyboard-only checks for navigation, forms, links, dialogs, toggles, and
  destructive actions
- reduced-motion checks with `prefers-reduced-motion: reduce`
- loading, empty, error, inactive-card, unavailable-profile, and unpublished
  profile checks
- final diff review for unrelated changes and overlapping worker edits

## Visual references

Eight horizontal references were generated for the approved direction. They
are preview-only and remain outside the repository under:

`/home/dei/.codex/generated_images/01a09f6f-cef8-76e1-8949-390e3f7e2627/`

The corrected landing hero reference is the output named
`exec-01997bf9-eec4-4204-a63a-d3f43b4cb96b.png`. The remaining references map
to the public profile, profile editor, links, analytics, admin customers, card
registry, and authentication surfaces in that order.
