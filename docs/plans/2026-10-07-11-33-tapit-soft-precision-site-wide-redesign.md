# Tapit Soft Precision Site-wide Redesign Implementation Plan

> **For implementers:** Follow repository instructions and execute the tasks in order. Use checkbox steps to track progress.

**Goal:** Apply the approved Soft Precision identity across Tapit public, authentication, customer workspace, and administrator surfaces while preserving current product behavior.

**Architecture:** Update the shared color and control system first, then restyle shells and route families in focused slices. Keep the current Next.js routes, authorization, publication rules, public projection, and existing customer-selected profile themes intact. Add only the optional Custom profile appearance and validated palette fields needed by the requested Custom preset. Use the existing local demo E2E suite for flow and responsive evidence.

**Tech Stack:** Next.js 16.3.5 App Router, React 19.3.0, Tailwind CSS 4.3.3, `@phosphor-icons/react` ^2.1.10, Playwright 1.63.0, and `@axe-core/playwright` ^4.13.0.

**Spec:** [Tapit Soft Precision Site-wide Redesign](../superpowers/specs/2026-10-07-tapit-soft-precision-site-wide-redesign-design.md)

## Global Constraints

- Use the approved Soft Precision starting values: canvas `#f4f6fa`, main text `#1b2433`, muted text `#687487`, surface `#ffffff`, border `#e0e5ed`, accent `#3f6de8`, strong accent `#315fe4`, and soft accent `#e8edf9`. Validate rendered contrast and focus treatment against WCAG 2.2 AA; adjust a semantic token only when needed and record the final value in `docs/DESIGN.md`.
- Keep the system sans-serif stack. Add no hosted font, component library, design dependency, route, dashboard, or product capability beyond the requested selectable Custom preset.
- Preserve every route, redirect, route destination, permission, account lifecycle, ownership rule, backend behavior, existing data contract, and confirmation step. The sole data extension is optional validated Custom appearance/palette data. `/app` must continue to redirect to `/app/profile`; `/admin` must continue to redirect to `/admin/customers`.
- Use Soft Precision as the default Paper theme in public profiles and the phone preview. New profiles and demo seeds start on Paper without Warm Studio customization; explicitly selected Moss, Night, Warm Studio, or Custom appearance choices may override the default. Preserve saved themes and customization on existing profiles.
- Keep drafts private until the existing publish action succeeds. Preserve the current public profile projection, inactive-card handling, unavailable-profile privacy, and admin-owned card registration, assignment, deactivation, and replacement.
- Preserve analytics aggregation and consent behavior. Do not add visitor-level tracking, invent performance claims, or expose seeded fixtures as customer-outcome evidence.
- Keep existing copy meaning, legal text, product facts, assets, CTA destinations, form semantics, and link behavior. Do not add unsupported claims.
- Keep public identity and primary actions immediately available; do not hide visitor-critical content behind scroll observers. Keep decorative motion restrained and respect reduced-motion and reduced-transparency preferences.
- Support 320 CSS pixels through desktop widths with no required horizontal scrolling. Reflow workspace previews, forms, navigation, tables, dialogs, and states. Primary touch controls must be at least 44 CSS pixels high.
- Limit `convex/` and `src/lib/` changes to the optional Custom appearance/palette validation, persistence, and rendering needed by the requested preset. Do not change route handlers or generated files. Do not rewrite the historical Quiet Precision, Warm Editorial, or Premium Conversion documents; the approved Soft Precision spec supersedes their visual direction.
- Preserve the existing untracked `design/mockups/tapit-identity-round-01/`, `design/mockups/tapit-identity-round-02/`, and `design/mockups/tapit-identity-round-03/` assets.

## Review Focus

- **Theme isolation and route parity:** Confirm Paper defaults to Soft Precision, explicitly selected Moss, Night, Warm Studio, and Custom appearances override it, and direct slug and active card paths render the same profile. Add assertions in Tasks 5 and 6.
- **Protected state content:** Confirm unpublished, unavailable, inactive-card, loading, and error states reveal no protected profile details. Add or retain assertions in Task 5.
- **Narrow and intermediate layouts:** Confirm navigation, editor actions, previews, dialogs, and admin records remain reachable without horizontal overflow at 320px and intermediate widths. Cover route-owned flows in Tasks 2–10 and cross-check in Task 11.
- **Draft and consequential actions:** Confirm draft edits remain private until publish succeeds and account/card actions retain existing confirmation and ownership behavior. Cover in Tasks 6–9.
- **Accessibility and preferences:** Confirm visible keyboard focus, non-color status cues, accessible dialog behavior, touch target size, readable contrast, and content availability with reduced motion. Cover in Tasks 1 and 11.

## File Map

| Area                                          | Existing files and responsibility                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens and controls                           | `src/app/globals.css`; `src/components/ui/{Button,Field,Panel,Notice,StatusBadge,ConfirmDialog}.tsx` define the shared visual tokens and controls.                                                                                                                                                                                                                                              |
| Shared shells                                 | `src/components/layout/{AppShell,SidebarNav,CustomerShell,AdminShell,Brand,PageContainer}.tsx` and `src/components/layout/navigation.ts` define customer/admin layout and navigation. `src/components/layout/PublicHeader.tsx` defines public header navigation.                                                                                                                                |
| Marketing and legal                           | `src/app/page.tsx`, `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, `src/components/marketing/ScrollReveal.tsx` define public content, legal reading layouts, and decorative reveal motion.                                                                                                                                                                                               |
| Authentication                                | `src/app/(auth)/login/page.tsx`, `src/app/(auth)/setup/[token]/page.tsx`, `src/app/onboarding/page.tsx`; `src/components/auth/{AuthShell,LoginForm,GoogleLoginForm,SetupForm,OnboardingForm,AuthLoadingState}.tsx`.                                                                                                                                                                             |
| Public profiles and states                    | `src/app/[slug]/{page,loading,error,not-found}.tsx`, `src/app/c/[cardToken]/page.tsx`; `src/components/profile/{PublicProfile,PublicProfileScreen,CardResolverClient,ProfileContactStrip,ProfileMediaSurface,ProfileSectionDisclosure,ProfileSlideshow,AnalyticsConsent,UnpublishedCardClaim}.tsx`; `src/components/state/StatePage.tsx`.                                                       |
| Customer profile and links                    | `src/app/app/profile/{page,loading,error}.tsx`, `src/app/app/customize/{page,loading,error}.tsx`, `src/app/app/links/page.tsx`; `src/components/forms/{ProfileWorkspaceFrame,ProfileEditor,ProfileDetailsEditor,ProfileCustomizationEditor,ProfileMediaEditor,ProfilePublicationPanel,ProfileImageCropDialog,LinksWorkspace,LinksEditor}.tsx`; `src/components/workspace/WorkspacePreview.tsx`. |
| Customer account, analytics, and card builder | `src/app/app/analytics/page.tsx`, `src/app/app/account/page.tsx`, `src/app/app/account/build-card/page.tsx`, `src/app/build-card/page.tsx`; `src/components/analytics/CustomerAnalytics.tsx`, `src/components/forms/AccountSettings.tsx`, `src/components/card-builder/{BuildCardExperience,CardPreviewDialog}.tsx`, `src/components/qr/QrControls.tsx`.                                        |
| Administrator                                 | `src/app/admin/{customers,profiles,cards,analytics,audit-log,settings}/page.tsx`; `src/components/admin/{CustomersManager,ProfilesManager,ProfileDetails,AdminProfileContentEditor,CardsManager,AdminAnalytics,AuditLog,SettingsManager,AdminPageHeader}.tsx`.                                                                                                                                  |
| E2E and product design record                 | `e2e/{focus-styles,accessibility,smoke,signup,public-profile,profile-destination,customer,admin,ui-redesign-artifacts}.spec.ts`; `docs/DESIGN.md` records the settled product design system.                                                                                                                                                                                                    |

`src/app/app/page.tsx` and `src/app/admin/page.tsx` are existing redirects and are not redesign destinations. Keep their current targets. The route families above are the full visual scope; add no routes or endpoints. The existing schema and validation files may receive only the Custom appearance fields listed in Task 6.

## Implementation Prerequisites

1. Continue from the approved spec and mockup in the current worktree. Preserve unrelated untracked mockups and stage only files owned by the redesign if staging is later requested.
2. Before editing application code, read the relevant installed Next.js guide under `node_modules/next/dist/docs/`; this project uses a breaking Next.js version.
3. Use `NEXT_PUBLIC_DEMO_MODE=true` local/demo E2E only. Do not use live E2E, hosted demo, Preview, Production, or account provisioning for this redesign.
4. Use the existing local/demo E2E suite as the primary behavioral proof. Use the existing unit-test suite for focused customization validation and component contracts; add no test infrastructure. Run `npm run verify` during final implementation verification as required by `CODING_STANDARDS.md`.
5. Keep backend work within the approved Custom appearance extension: optional validated theme/palette fields only; do not change endpoints, authorization, lifecycle, or publication behavior.
6. Update `e2e/ui-redesign-artifacts.spec.ts` output from `test-results/premium-conversion-ui/` to `test-results/soft-precision-site/`; keep generated screenshots out of source control.

## Tasks

### Task 1: Establish Soft Precision tokens and shared controls

**Files:**

- Modify: `src/app/globals.css`
- Modify: `src/components/ui/Button.tsx`, `src/components/ui/Field.tsx`, `src/components/ui/Panel.tsx`, `src/components/ui/Notice.tsx`, `src/components/ui/StatusBadge.tsx`, `src/components/ui/ConfirmDialog.tsx`
- Test: `e2e/focus-styles.spec.ts`

**Interfaces:**

- Consumes the existing `--tapit-*` variables and Tailwind aliases in `globals.css`.
- Produces the Soft Precision semantic tokens and shared focus, surface, border, radius, field, button, notice, status, and confirmation-dialog treatments for later tasks.

- [x] **Step 1: Update the focused E2E expectations.** Change the existing focus and root-token assertions to the approved canvas/accent values; retain checks for visible keyboard focus and non-orange focus states.
- [x] **Step 2: Run the focused E2E check before styling.** Run `npm run test:e2e:demo -- --grep="form focus indicators stay within the Soft Precision theme"`. Expected: the updated palette assertion fails against the current rendered palette.
- [x] **Step 3: Apply the approved semantic tokens and control treatments.** Preserve component props, labels, disabled behavior, status text, and dialog focus handling. Use restrained elevation and reserve stronger shadows for large surfaces.
- [x] **Step 4: Run focused focus and accessibility E2E.** Expected: 7 focused tests passed in the implementation worktree and again after integration in this worktree. Axe required a stronger semantic accent text role (`#315fe4`) and deeper muted text (`#626f82`) to meet AA on the new canvas and existing mint surface.

### Task 2: Restyle customer and administrator shells

**Files:**

- Modify: `src/components/layout/AppShell.tsx`, `src/components/layout/SidebarNav.tsx`, `src/components/layout/CustomerShell.tsx`, `src/components/layout/AdminShell.tsx`, `src/components/layout/Brand.tsx`, `src/components/layout/PageContainer.tsx`, `src/components/layout/navigation.ts`
- Test: `e2e/customer.spec.ts`, `e2e/admin.spec.ts`

**Interfaces:**

- Consumes Task 1 tokens and controls plus existing role-specific route lists, guards, account menus, draft-save navigation behavior, and responsive menu behavior.
- Produces a shared Soft Precision shell with distinct customer/admin task labels and correct active-route states.

- [x] **Step 1: Add or update shell assertions.** Cover customer and admin destinations, selected navigation state, mobile menu open/close, Escape, focus return, touch target size, and no horizontal overflow at 320px, 390px, and desktop width.
- [x] **Step 2: Run the focused shell E2E before styling.** The baseline exposed 331px document width at a 320px customer profile viewport; admin and shared mobile keyboard navigation passed.
- [x] **Step 3: Restyle desktop and phone navigation.** Applied white navigation surfaces, a rounded blue brand mark, calm selected states, touch-sized controls, a softly elevated mobile header, and a rounded drawer. Preserved session gates, route destinations, and draft-save navigation behavior.
- [x] **Step 4: Re-run shell E2E.** After the Task 6 grid fix, customer and admin responsive navigation checks pass at 320px and wider.

### Task 3: Restyle marketing and legal pages

**Files:**

- Modify: `src/app/page.tsx`, `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, `src/components/layout/PublicHeader.tsx`
- Modify: `src/components/marketing/ScrollReveal.tsx`
- Test: `e2e/smoke.spec.ts`

**Interfaces:**

- Consumes Task 1 tokens and the existing product copy, artwork, header destinations, footer, and legal text.
- Produces the selected centered marketing promise above the profile specimen and consistent public/legal layouts without changing copy meaning or destinations.

- [x] **Step 1: Add or update public-page assertions.** Check the selected hero hierarchy and profile specimen are available without a scroll reveal, existing CTA destinations, legal links, and no horizontal overflow at 320px, 390px, and desktop widths.
- [x] **Step 2: Run the smoke E2E before styling.** Run `npm run test:e2e:demo -- --grep="homepage|landing|public navigation|mobile navigation|visitors can reach"`. Expected: existing content and route destinations pass; new layout checks capture the current baseline.
- [x] **Step 3: Restyle the public header, home page, footer, legal reading layouts, and decorative reveals.** Keep existing assets and all existing copy; use comfortable line length, restrained elevation, rounded controls, responsive spacing, and immediate access to the hero promise and profile specimen.
- [x] **Step 4: Re-run the smoke E2E.** Run `npm run test:e2e:demo -- --grep="homepage|landing|public navigation|mobile navigation|visitors can reach"`. Expected: hierarchy, existing links, legal destinations, and responsive layout assertions pass.

### Task 4: Restyle login, setup, and onboarding

**Files:**

- Modify: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/setup/[token]/page.tsx`, `src/app/onboarding/page.tsx`
- Modify: `src/components/auth/AuthShell.tsx`, `src/components/auth/LoginForm.tsx`, `src/components/auth/GoogleLoginForm.tsx`, `src/components/auth/SetupForm.tsx`, `src/components/auth/OnboardingForm.tsx`, `src/components/auth/AuthLoadingState.tsx`
- Test: `e2e/signup.spec.ts`

**Interfaces:**

- Consumes Task 1 controls and existing auth modes, `next` return path, invitation states, validation, loading, and recovery behavior.
- Produces a consistent authentication and setup presentation with no workspace navigation and unchanged auth transitions.

- [x] **Step 1: Add or update auth assertions.** Cover login, signup, setup, labels, validation/recovery states, and no horizontal overflow at 320px, 390px, and desktop width.
- [x] **Step 2: Run auth E2E before styling.** Run `npm run test:e2e:demo -- --grep="authentication and setup screens|customer signup starts"`. Expected: current auth behavior and destinations pass; new layout checks capture the baseline.
- [x] **Step 3: Restyle auth composition and states.** Use shared fields, buttons, notices, and focus treatment while preserving form semantics, role restrictions, invitation behavior, and callback destinations.
- [x] **Step 4: Re-run auth and accessibility E2E.** Run `npm run test:e2e:demo -- --grep="authentication and setup screens|customer signup starts|no automated accessibility violations"`. Expected: existing validation and auth journeys remain operable with accessible names and focus.

### Task 5: Restyle public profiles, card resolution, and state pages

**Files:**

- Modify: `src/app/[slug]/page.tsx`, `src/app/[slug]/loading.tsx`, `src/app/[slug]/error.tsx`, `src/app/[slug]/not-found.tsx`, `src/app/c/[cardToken]/page.tsx`
- Modify: `src/components/profile/PublicProfile.tsx`, `src/components/profile/PublicProfileScreen.tsx`, `src/components/profile/CardResolverClient.tsx`, `src/components/profile/ProfileContactStrip.tsx`, `src/components/profile/ProfileMediaSurface.tsx`, `src/components/profile/ProfileSectionDisclosure.tsx`, `src/components/profile/ProfileSlideshow.tsx`, `src/components/profile/AnalyticsConsent.tsx`, `src/components/profile/UnpublishedCardClaim.tsx`, `src/components/state/StatePage.tsx`
- Test: `e2e/public-profile.spec.ts`

**Interfaces:**

- Consumes the existing published-only projection, customer theme, card resolver, consent, vCard, link tracking, and fixed safe state copy.
- Produces a focused phone-first profile and coherent loading, error, unavailable, unpublished, inactive-card, and not-found presentations with unchanged privacy boundaries.

- [x] **Step 1: Add or update responsive and privacy assertions.** Cover 320px and 390px; direct slug and active-card parity; customer theme isolation; enabled destinations and Save contact; and absence of identity/details on unavailable or inactive paths.
- [x] **Step 2: Run public-profile E2E before styling.** Run `npm run test:e2e:demo -- --grep="public profile|direct and active card|inactive cards never|unavailable profiles do not|vCard export|published phone-only|demo card claim"`. Expected: existing routing, privacy, theme, and visitor-action behavior passes; new layout checks establish the baseline.
- [x] **Step 3: Restyle the profile and resolver states.** Keep identity and primary actions immediately available, preserve existing selected themes, and use shared Tapit colors only around the profile surface.
- [x] **Step 4: Re-run profile and accessibility E2E.** Run `npm run test:e2e:demo -- --grep="public profile|direct and active card|inactive cards never|unavailable profiles do not|vCard export|published phone-only|demo card claim|no automated accessibility violations|published profile disclosure"`. Expected: theme isolation and direct/card parity hold, safe states reveal no profile details, and profile actions remain usable.

### Task 6: Restyle customer profile editing, customization, and links

**Files:**

- Modify: `src/app/app/profile/page.tsx`, `src/app/app/profile/loading.tsx`, `src/app/app/profile/error.tsx`, `src/app/app/customize/page.tsx`, `src/app/app/customize/loading.tsx`, `src/app/app/customize/error.tsx`, `src/app/app/links/page.tsx`
- Modify: `src/components/forms/ProfileWorkspaceFrame.tsx`, `src/components/forms/ProfileEditor.tsx`, `src/components/forms/ProfileDetailsEditor.tsx`, `src/components/forms/ProfileCustomizationEditor.tsx`, `src/components/forms/ProfileMediaEditor.tsx`, `src/components/forms/ProfilePublicationPanel.tsx`, `src/components/forms/ProfileImageCropDialog.tsx`, `src/components/forms/LinksWorkspace.tsx`, `src/components/forms/LinksEditor.tsx`, `src/components/workspace/WorkspacePreview.tsx`
- Modify: `convex/schema.ts`, `convex/validators.ts`, `src/lib/profile-customization.ts`, `src/lib/domain/index.ts`, `src/lib/profile-workspace.ts` for the optional Custom appearance and palette contract only.
- Test: `e2e/customer.spec.ts`

**Interfaces:**

- Consumes Task 1 controls and Task 2 shell plus existing draft-save context, validators, theme values, media upload/crop, link ordering, preview, and publish panel.
- Produces clear profile/customization/link workspaces with responsive previews and scannable link rows. Paper is the default, other presets keep their appearance, and Custom colors validate and persist in the draft until publication.

- [x] **Step 1: Add or update editor assertions.** Cover profile, customize, and links at 320px, 390px, intermediate width, and desktop; verify all presets, Custom palette validation and persistence, preview access, save/publish controls, and keyboard-operated link reordering.
- [x] **Step 2: Run customer editor E2E before styling.** Run `npm run test:e2e:demo -- --grep="editor actions stay|profile preview can|profile draft actions|customize keeps|customize does not|customer drafts stay private|customer customization drafts|link table contains|link drag handles|refreshed profile editor|customer workspace navigation uses"`. Expected: existing edit, ordering, and publish flows pass; new responsive assertions establish the baseline.
- [x] **Step 3: Restyle the editor and preview hierarchy.** Group fields by task, make status and publish action easy to find, and reflow previews rather than shrinking them. Keep move-up/move-down controls available without drag-only interaction.
- [x] **Step 4: Re-run editor, public-profile, and accessibility E2E.** Run `npm run test:e2e:demo -- --grep="editor actions stay|profile preview can|profile draft actions|customize keeps|customize does not|customer drafts stay private|customer customization drafts|link table contains|link drag handles|refreshed profile editor|customer workspace navigation uses|public profile|direct and active card|inactive cards never|unavailable profiles do not|no automated accessibility violations|published profile disclosure"`. Expected: draft edits stay private until publish succeeds and all editing actions remain reachable.

### Task 7: Restyle customer analytics, account, and card building

**Files:**

- Modify: `src/app/app/analytics/page.tsx`, `src/app/app/account/page.tsx`, `src/app/app/account/build-card/page.tsx`, `src/app/build-card/page.tsx`
- Modify: `src/components/analytics/CustomerAnalytics.tsx`, `src/components/forms/AccountSettings.tsx`, `src/components/card-builder/BuildCardExperience.tsx`, `src/components/card-builder/CardPreviewDialog.tsx`, `src/components/qr/QrControls.tsx`
- Test: `e2e/customer.spec.ts`

**Interfaces:**

- Consumes existing aggregate analytics ranges, account update/unpublish/delete semantics, card validation, QR generation, and the embedded versus standalone builder route context.
- Produces readable analytics and account tasks plus consistent card-builder layouts with unchanged data and action contracts.

- [x] **Step 1: Add or update customer utility assertions.** Cover real aggregate data versus the existing empty state, range controls, account confirmations, embedded and standalone builders, and no horizontal overflow at 320px, 390px, and desktop width.
- [x] **Step 2: Run customer utility E2E before styling.** Run `npm run test:e2e:demo -- --grep="customer build card|standalone card builder|active-card QR|customer analytics and account controls|customer can unpublish|customer utility workspaces"`. Expected: existing analytics, account, and builder behavior passes; responsive assertions establish the baseline.
- [x] **Step 3: Restyle utility pages.** Clarify aggregate metric hierarchy without visitor-level data; distinguish routine settings from consequential actions; preserve confirmation naming and focus; keep QR preview and builder actions responsive.
- [x] **Step 4: Re-run customer and accessibility E2E.** Run `npm run test:e2e:demo -- --grep="customer build card|standalone card builder|active-card QR|customer analytics and account controls|customer can unpublish|customer utility workspaces|no automated accessibility violations|published profile disclosure"`. Expected: analytics remain truthful, account actions remain explicit, and QR/card previews are operable.

### Task 8: Restyle administrator customer and profile operations

**Files:**

- Modify: `src/app/admin/customers/page.tsx`, `src/app/admin/profiles/page.tsx`
- Modify: `src/components/admin/CustomersManager.tsx`, `src/components/admin/ProfilesManager.tsx`, `src/components/admin/ProfileDetails.tsx`, `src/components/admin/AdminProfileContentEditor.tsx`
- Test: `e2e/admin.spec.ts`

**Interfaces:**

- Consumes Task 1 controls and Task 2 admin shell plus existing account creation/invitations, profile search, details, editing, role gates, and status semantics.
- Produces compact, scannable customer/profile operations with accessible search, status, row actions, tabs, and save/publish controls.

- [x] **Step 1: Add or update customer/profile assertions.** Cover creation/invitation, search/status, detail tabs, profile editing, accessible status text, and no horizontal overflow at 320px, 390px, and desktop.
- [x] **Step 2: Run focused admin E2E before styling.** Run `npm run test:e2e:demo -- --grep="administrator edits and publishes|administrator sidebar preserves|administrator records and governance pages|administrator records and governance details|administrator profile registry|administrator can create and inspect"`. Expected: current admin behavior passes; new narrow-layout assertions establish the baseline.
- [x] **Step 3: Restyle customer and profile records.** Use readable compact rows and quiet borders; keep search, filters, identity, status, and consequential actions easy to find without changing permissions or behavior.
- [x] **Step 4: Re-run admin and accessibility E2E.** Run `npm run test:e2e:demo -- --grep="administrator edits and publishes|administrator sidebar preserves|administrator records and governance pages|administrator records and governance details|administrator profile registry|administrator can create and inspect|no automated accessibility violations|administrator profile analytics dialog"`. Expected: existing invitation, profile inspection, and editing flows stay operable by keyboard and touch.

### Task 9: Restyle administrator card registry

**Files:**

- Modify: `src/app/admin/cards/page.tsx`, `src/components/admin/CardsManager.tsx`
- Test: `e2e/admin.spec.ts`

**Interfaces:**

- Consumes existing admin-only registration, assignment, deactivation, replacement, QR preview/download, audit, and confirmation behavior.
- Produces a compact card registry that makes identifiers, assignment, status, search/filter, and consequential row actions easy to scan.

- [x] **Step 1: Add or update card registry assertions.** Cover registration/assignment, inactive/replaced status, confirmation text, search/filter, QR controls, and responsive reachability at 320px, 390px, and desktop.
- [x] **Step 2: Run focused card E2E before styling.** Run `npm run test:e2e:demo -- --grep="administrator registers, assigns, replaces, deactivates, and audits cards"`. Expected: existing card lifecycle and confirmation behavior passes; new layout assertions establish the baseline.
- [x] **Step 3: Restyle card rows and detail controls.** Keep destructive/consequential actions visibly distinct and text-labeled; preserve administrator ownership and existing audit entries.
- [x] **Step 4: Re-run admin and accessibility E2E.** Run `npm run test:e2e:demo -- --grep="administrator registers, assigns, replaces, deactivates, and audits cards|administrator profile analytics dialog|no automated accessibility violations"`. Expected: card lifecycle, confirmations, QR actions, and focus behavior remain intact.

### Task 10: Restyle administrator analytics, audit log, and settings

**Files:**

- Modify: `src/app/admin/analytics/page.tsx`, `src/app/admin/audit-log/page.tsx`, `src/app/admin/settings/page.tsx`
- Modify: `src/components/admin/AdminAnalytics.tsx`, `src/components/admin/AuditLog.tsx`, `src/components/admin/SettingsManager.tsx`, `src/components/admin/AdminPageHeader.tsx`
- Test: `e2e/admin.spec.ts`

**Interfaces:**

- Consumes existing cross-customer aggregate queries, audit history, settings fields, role gates, pagination, and status language.
- Produces readable dense operations views with text alongside color for every status and no invented metrics.

- [x] **Step 1: Add or update operations assertions.** Cover aggregate analytics and empty states, audit rows/details, settings controls, status text, keyboard focus, and no horizontal overflow at 320px, 390px, and desktop.
- [x] **Step 2: Run focused admin E2E before styling.** Run `npm run test:e2e:demo -- --grep="administrator analytics, audit, and settings|administrator can expand audit entries|administrator can inspect only the selected profile analytics"`. Expected: current analytics, audit, and settings behavior passes; new responsive assertions establish the baseline.
- [x] **Step 3: Restyle the dense admin pages.** Use compact rows and quiet borders; make filters, pagination where present, and settings actions easy to find; keep consequences and confirmations clear.
- [x] **Step 4: Re-run admin and accessibility E2E.** Run `npm run test:e2e:demo -- --grep="administrator analytics, audit, and settings|administrator can expand audit entries|administrator can inspect only the selected profile analytics|administrator profile analytics dialog|no automated accessibility violations"`. Expected: aggregate data remains accurate, status meaning does not rely on color, and settings remain keyboard operable.

### Task 11: Cross-surface responsive review, screenshots, and design record

**Files:**

- Modify: `e2e/accessibility.spec.ts`, `e2e/ui-redesign-artifacts.spec.ts`, `docs/DESIGN.md`
- Verify without changing: all route-family E2E files listed above, including `e2e/profile-destination.spec.ts`, and redirects at `/app` and `/admin`.

**Interfaces:**

- Consumes all previous tasks and the approved Soft Precision mockup.
- Produces final route-family evidence, repeatable screenshots under `test-results/soft-precision-site/`, and a product design record for the settled palette, type, spacing, elevation, accessibility, and theme-isolation rules.

- [x] **Step 1: Complete the route and state accessibility matrix.** Extend the existing accessibility E2E only where coverage is missing for landmarks/headings, labelled controls, visible focus, text-backed statuses, dialog behavior, no overflow at 320px and intermediate widths, and the `/app` and `/admin` redirect targets. Keep the existing profile destination redirect flow in `e2e/profile-destination.spec.ts` green.
- [x] **Step 2: Verify preference and primary-control behavior.** Run reduced-motion E2E and confirm identity/actions remain visible without animation; inspect reduced-transparency fallback and primary control heights against the 44px requirement.
- [x] **Step 3: Refresh the redesign screenshot artifact.** Change its output directory to `test-results/soft-precision-site/`; capture marketing, profile, login, card builder, customer editor, Custom preset, and admin profile views at desktop/mobile viewports. Inspect the captures and keep generated files ignored.
- [x] **Step 4: Update `docs/DESIGN.md`.** Record the validated final tokens and the distinction between Tapit UI colors and customer-selected public profile themes.
- [x] **Step 5: Run the full local/demo E2E suite.** Run `npm run test:e2e:demo -- --workers=1`. Result: 98 passed and 1 skipped in Chromium demo mode; responsive screenshot artifacts were captured.
- [x] **Step 6: Run repository verification.** `npm run verify` passed: Prettier, ESLint (0 errors, 3 warnings), TypeScript, 449 unit tests across 50 files, and the production build.

## Self-review

- **Spec coverage:** Every route family, shell, shared state, card builder, and acceptance boundary is assigned to a task; redirects and backend behavior are explicitly preserved.
- **Step clarity:** Each route slice has an assertion, a focused baseline run, a bounded visual change, and a targeted rerun. Cross-surface checks are reserved for the final task.
- **Interfaces:** Later tasks consume the shared tokens and shells produced by Tasks 1 and 2; public profiles preserve existing customer-selected themes and support the requested optional Custom palette.
- **Behavior coverage:** Theme isolation, protected states, draft publication, administrator ownership, status text, responsive reachability, and reduced-motion behavior are assigned to owning tasks.
- **Scope:** The plan changes presentation, E2E assertions/artifacts, and the design record, plus the requested persisted Custom preset. It introduces no new route, dependency, unrelated product behavior, or production verification.
