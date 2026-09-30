# Quiet Precision Whole UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Quiet Precision design system to Tapit's existing public, customer, administrator, authentication, and card-builder screens while preserving product behavior.

**Architecture:** Establish the shared visual tokens and primitives first, then restyle the shared shells and each existing route family in focused slices. Keep current Next.js routes, business logic, profile-theme behavior, permissions, and public privacy projections unchanged; use the existing demo E2E suite to protect flows and capture a repeatable responsive screenshot artifact.

**Tech Stack:** Next.js 16.3.5 App Router, React 19.3.0, Tailwind CSS 4.3.3, `@phosphor-icons/react` ^2.1.10, Playwright 1.63.0, `@axe-core/playwright` ^4.13.0.

**Spec:** [`docs/superpowers/specs/2026-09-30-12-32-quiet-precision-whole-ui-redesign-design.md`](../specs/2026-09-30-12-32-quiet-precision-whole-ui-redesign-design.md)

## Global Constraints

- Do not change authentication, roles, account lifecycle, ownership, or route access.
- Keep the public profile readable without sign-in or app installation. Visitors see published content only.
- Keep draft saving and publication explicit. A draft or unpublished profile must not become public through a visual or routing change.
- Preserve inactive-card and unavailable-profile privacy boundaries; do not show former or unpublished profile content on those pages.
- Preserve administrator ownership of card registration, assignment, deactivation, and replacement. Do not add customer card-management controls.
- Preserve auditability and clear confirmation for destructive or consequential administrator actions.
- Keep analytics aggregated and preserve existing consent and privacy behavior.
- Preserve current profile fields, supported links, card generation behavior, and customer-controlled profile theme semantics.
- Do not add billing, teams, visitor accounts, rich content, or new backend capabilities.
- Meet WCAG 2.2 AA as defined in the current product design requirements.
- The selected direction does not add fonts, dependencies, or a new theme catalog.
- Do not add dashboard routes, features, or navigation destinations. The mockup's dashboard overview is exploratory only; `/app` continues to redirect to `/app/profile`.
- Keep `NEXT_PUBLIC_DEMO_MODE=true` locally. Use `npm run test:e2e:demo` for E2E. Never use Production for E2E or provisioning.
- For Convex behavior, do not edit Convex files in this visual redesign. If implementation discovery makes a Convex edit unavoidable, stop and read `convex/_generated/ai/guidelines.md` before proceeding.
- Read the relevant Next.js guide from `node_modules/next/dist/docs/` before writing code; the installed Next.js version has project-specific breaking changes.
- Prefer E2E coverage as the sole new testing mechanism. Run `npm run verify` before claiming implementation completion; keep local/demo, Preview/Production, and physical-device evidence separate.

---

## File Map

| Area                                      | Existing files and responsibility                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tokens and common controls                | `src/app/globals.css`; `src/components/ui/Button.tsx`, `Field.tsx`, `Panel.tsx`, `Notice.tsx`, `StatusBadge.tsx`, `Icon.tsx`, `ConfirmDialog.tsx`                                                                                                                                                                                                                                                                                                            |
| Shared layout                             | `src/components/layout/AppShell.tsx`, `SidebarNav.tsx`, `CustomerShell.tsx`, `AdminShell.tsx`, `AuthShell.tsx`, `PublicHeader.tsx`, `Brand.tsx`, `PageContainer.tsx`, `navigation.ts`                                                                                                                                                                                                                                                                        |
| Marketing and legal                       | `src/app/page.tsx`, `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`                                                                                                                                                                                                                                                                                                                                                                                     |
| Authentication                            | `src/app/(auth)/login/page.tsx`, `src/app/(auth)/setup/[token]/page.tsx`, `src/app/onboarding/page.tsx`; `src/components/auth/{LoginForm,GoogleLoginForm,SetupForm,OnboardingForm,AuthLoadingState}.tsx`                                                                                                                                                                                                                                                     |
| Public profile and states                 | `src/app/[slug]/{page,loading,error,not-found}.tsx`, `src/app/c/[cardToken]/page.tsx`; `src/components/profile/{PublicProfile,PublicProfileScreen,CardResolverClient,ProfileContactStrip,ProfileMediaSurface,ProfileSectionDisclosure,ProfileSlideshow,AnalyticsConsent,UnpublishedCardClaim}.tsx`; `src/components/state/StatePage.tsx`                                                                                                                     |
| Customer profile and links                | `src/app/app/profile/page.tsx`, `profile/{loading,error}.tsx`, `customize/page.tsx`, `customize/{loading,error}.tsx`, `links/page.tsx`; `src/components/forms/ProfileWorkspaceFrame.tsx`, `ProfileEditor.tsx`, `ProfileDetailsEditor.tsx`, `ProfileCustomizationEditor.tsx`, `ProfileMediaEditor.tsx`, `ProfilePublicationPanel.tsx`, `ProfileImageCropDialog.tsx`, `LinksWorkspace.tsx`, `LinksEditor.tsx`; `src/components/workspace/WorkspacePreview.tsx` |
| Customer account, analytics, card builder | `src/app/app/analytics/page.tsx`, `src/app/app/account/page.tsx`, `src/app/app/account/build-card/page.tsx`, `src/app/build-card/page.tsx`; `src/components/analytics/CustomerAnalytics.tsx`, `src/components/forms/AccountSettings.tsx`, `src/components/card-builder/BuildCardExperience.tsx`, `CardPreviewDialog.tsx`, `src/components/qr/QrControls.tsx`                                                                                                 |
| Administrator                             | `src/app/admin/customers/page.tsx`, `profiles/page.tsx`, `cards/page.tsx`, `analytics/page.tsx`, `audit-log/page.tsx`, `settings/page.tsx`; `src/components/admin/CustomersManager.tsx`, `ProfilesManager.tsx`, `ProfileDetails.tsx`, `AdminProfileContentEditor.tsx`, `CardsManager.tsx`, `AdminAnalytics.tsx`, `AuditLog.tsx`, `SettingsManager.tsx`                                                                                                       |
| E2E coverage                              | `e2e/{focus-styles,accessibility,smoke,signup,public-profile,customer,admin}.spec.ts`; shared local demo helpers in `e2e/support/demo-harness.ts`                                                                                                                                                                                                                                                                                                            |
| Product design record                     | `docs/DESIGN.md`                                                                                                                                                                                                                                                                                                                                                                                                                                             |

`src/app/app/page.tsx` and `src/app/admin/page.tsx` are redirects. Keep their existing destinations. `convex/`, `src/lib/`, generated files, and route handlers are outside the planned change set.

## Implementation Prerequisites

1. Start from `feature/quiet-precision-ui-redesign`, created at the approved spec commit `02b243f`. Keep `docs/quiet-precision-ui-redesign` at that same commit as the original approved-spec branch. Preserve the saved reference asset and this plan.
2. Run `npm ci` if `node_modules/next` is absent. Locate the installed styling guide with `rg --files node_modules/next/dist/docs | rg -i '(css|styling|tailwind)'` and read the relevant guide before changing app code.
   Install dependencies inside each Git worktree; Next rejects a `node_modules` symlink that points outside the worktree root.
3. Keep E2E local/demo-only. Do not use `npm run test:e2e:live`, hosted demo, Preview, Production, or account provisioning for this redesign.
4. Use existing demo fixtures and route flows. Update selectors only when accessible names or structure intentionally change; preserve their meaning and keyboard operation.
5. For parallel implementation, keep file ownership disjoint: root owns `e2e/accessibility.spec.ts`; Task 5 owns `e2e/public-profile.spec.ts`; Tasks 6–7 share `e2e/customer.spec.ts` and `QrControls.tsx` under one customer owner; Tasks 8–10 share `e2e/admin.spec.ts` under one administrator owner.

## Tasks

### Task 1: Establish Quiet Precision tokens and shared controls

**Files:**

- Modify: `src/app/globals.css`
- Modify: `src/components/ui/Button.tsx`
- Modify: `src/components/ui/Field.tsx`
- Modify: `src/components/ui/Panel.tsx`
- Modify: `src/components/ui/Notice.tsx`
- Modify: `src/components/ui/StatusBadge.tsx`
- Modify: `src/components/ui/ConfirmDialog.tsx`
- Modify: `e2e/focus-styles.spec.ts`

**Interfaces:**

- Consumes: existing `--tapit-*` CSS variables and Tailwind aliases in `globals.css`.
- Produces: the approved palette variables and consistent focus, border, radius, surface, button, field, notice, status, and dialog treatments for later tasks.

- [x] **Step 1: Read the installed Next.js CSS guide.** Installed dependencies and read `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`; retained the existing App Router global CSS import and Tailwind CSS 4 setup.
- [x] **Step 2: Update the E2E focus-token expectation first.** `e2e/focus-styles.spec.ts` now checks the rendered Quiet Precision accent `#236D54` case-insensitively and verifies focus resolves to the same accent.
- [x] **Step 3: Run the focused E2E check before changing styles.** `npm run test:e2e:demo -- --project=chromium e2e/focus-styles.spec.ts` failed on the old rendered `#187461` accent as expected.
- [x] **Step 4: Set the starting palette in `globals.css`.** Applied the Quiet Precision palette, using `#626F67` for muted text so it meets 4.5:1 contrast on white, canvas, and soft surfaces; retained the system font stack and Tailwind variable mappings.
- [x] **Step 5: Restyle the shared controls.** Aligned buttons, fields, panels, notices, statuses, and confirmation dialog to the shared palette and moderate radii while retaining props, labels, disabled behavior, status text, and dialog focus handling.
- [x] **Step 6: Run focused E2E and inspect the diff.** `npm run test:e2e:demo -- --project=chromium e2e/focus-styles.spec.ts e2e/accessibility.spec.ts` passed 6/6; `npx prettier --check` on the touched code and `git diff --check` passed.
- [x] **Step 7: Commit the completed foundation.** Commit `20e487f` (`style: establish quiet precision UI tokens`), staging only the listed implementation and E2E files.

### Task 2: Restyle customer, admin, and mobile navigation shells

**Files:**

- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/SidebarNav.tsx`
- Modify: `src/components/layout/CustomerShell.tsx`
- Modify: `src/components/layout/AdminShell.tsx`
- Modify: `src/components/layout/Brand.tsx`
- Modify: `src/components/layout/PageContainer.tsx`
- Modify: `src/components/layout/navigation.ts`
- Modify: `e2e/customer.spec.ts`
- Modify: `e2e/admin.spec.ts`

**Interfaces:**

- Consumes: Task 1 tokens and shared controls; existing customer/admin route arrays, before-navigation draft save, session guards, account menus, and responsive menu behavior.
- Produces: visually unified customer and operations shells with distinct role-specific navigation, accurate active states, and responsive access to every current destination.

- [x] **Step 1: Add E2E coverage for shell behavior before restyling.** Added a real-browser assertion for the approved soft sidebar surface. It failed against the old white surface before shell styling; existing E2E already covered role destinations, the compact rail, mobile menu, Escape, focus return, and 390px overflow.
- [x] **Step 2: Run the targeted shell checks.** The focused customer/admin sidebar tests passed 2/2 after styling, covering grouped destinations, selected role navigation, keyboard and mobile menu behavior, and 390px overflow.
- [x] **Step 3: Restyle the desktop shell.** Applied the Quiet Precision soft navigation surface, restrained shadow, compact selected item, updated brand treatment, and expanded content width; customer/admin destinations and route logic are unchanged.
- [x] **Step 4: Restyle compact and phone navigation.** Kept the existing compact rail and focus managed mobile drawer; the 390px E2E journey confirms reachable controls, focus return, and no horizontal overflow.
- [x] **Step 5: Re-run shell and accessibility E2E.** Focused customer/admin navigation passed 2/2 and the full accessibility E2E file passed 5/5.
- [x] **Step 6: Commit the shell slice.** Commit `028f354` (`style: refine responsive workspace navigation`), staging only the shell and customer E2E files.

### Task 3: Redesign marketing and legal pages

**Files:**

- Modify: `src/app/page.tsx`
- Modify: `src/app/privacy/page.tsx`
- Modify: `src/app/terms/page.tsx`
- Modify: `src/components/layout/PublicHeader.tsx`
- Modify: `e2e/smoke.spec.ts`

**Interfaces:**

- Consumes: Task 1 primitives and Task 2 brand tokens; existing marketing content, image assets, footer destinations, legal copy, and route URLs.
- Produces: a cohesive public-facing marketing and legal experience with unchanged copy meaning and navigation targets.

- [x] **Step 1: Add E2E layout checks before editing.** In `e2e/smoke.spec.ts`, verify the homepage has no horizontal overflow at 390px and 1280px, the header navigation remains usable, and Privacy and Terms links still reach their existing pages.
- [x] **Step 2: Run the smoke check.** Run `npm run test:e2e:demo -- --project=chromium e2e/smoke.spec.ts`. Expected: current copy, header links, and legal destinations pass at the tested widths.
- [x] **Step 3: Restyle the public header, homepage, and footer.** Use the existing hero image, profile-card asset, sections, headings, links, and footer content; adjust visual hierarchy, width, spacing, color, and phone layout without adding sections, pricing, or new calls to action.
- [x] **Step 4: Restyle Privacy and Terms reading layouts.** Preserve legal wording and links while applying the public header, readable line length, heading levels, lists, and mobile spacing.
- [x] **Step 5: Run the smoke E2E suite.** Run `npm run test:e2e:demo -- --project=chromium e2e/smoke.spec.ts`; expected: all existing content and link assertions pass at desktop/mobile widths.
- [x] **Step 6: Commit the public-site slice.** Stage only the listed files and commit as `style: refresh public site and legal pages`.

### Task 4: Restyle login, setup, and onboarding

**Files:**

- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/setup/[token]/page.tsx`
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/components/auth/AuthShell.tsx`
- Modify: `src/components/auth/LoginForm.tsx`
- Modify: `src/components/auth/GoogleLoginForm.tsx`
- Modify: `src/components/auth/SetupForm.tsx`
- Modify: `src/components/auth/OnboardingForm.tsx`
- Modify: `src/components/auth/AuthLoadingState.tsx`
- Modify: `e2e/signup.spec.ts`

**Interfaces:**

- Consumes: Task 1 fields, buttons, notices, and focus styles; Task 3 brand tokens; existing auth modes, `next` return path, invitation states, form validation, and loading behavior.
- Produces: consistent sign-in, signup, setup, onboarding, and authentication-loading screens without changing auth transitions or form semantics.

- [x] **Step 1: Add E2E checks for auth form layout and states.** Extend `e2e/signup.spec.ts` to check login, signup, and setup content at 390px and 1280px with no horizontal overflow; retain exact accessible field labels and validation assertions.
- [x] **Step 2: Run the auth and accessibility checks before styling.** Run `npm run test:e2e:demo -- --project=chromium e2e/signup.spec.ts e2e/accessibility.spec.ts`. Expected: sign-in, signup, setup, labels, and current recovery messages remain present at the measured widths.
- [x] **Step 3: Apply the auth shell and form visual system.** Restyle panel width, heading hierarchy, field groups, password guidance, validation, provider action, submit state, and loading feedback; preserve signup/sign-in switching and callback destinations.
- [x] **Step 4: Re-run auth E2E.** Run `npm run test:e2e:demo -- --project=chromium e2e/signup.spec.ts e2e/accessibility.spec.ts`; expected: signup, existing-account login, one-time setup, and axe assertions pass.
- [x] **Step 5: Commit the auth slice.** Stage only the listed files and commit as `style: refine authentication and setup screens`.

### Task 5: Restyle public profiles and resolver states

**Files:**

- Modify: `src/app/[slug]/page.tsx`
- Modify: `src/app/[slug]/loading.tsx`
- Modify: `src/app/[slug]/error.tsx`
- Modify: `src/app/[slug]/not-found.tsx`
- Modify: `src/app/c/[cardToken]/page.tsx`
- Modify: `src/components/profile/PublicProfile.tsx`
- Modify: `src/components/profile/PublicProfileScreen.tsx`
- Modify: `src/components/profile/CardResolverClient.tsx`
- Modify: `src/components/profile/ProfileContactStrip.tsx`
- Modify: `src/components/profile/ProfileMediaSurface.tsx`
- Modify: `src/components/profile/ProfileSectionDisclosure.tsx`
- Modify: `src/components/profile/ProfileSlideshow.tsx`
- Modify: `src/components/profile/AnalyticsConsent.tsx`
- Modify: `src/components/profile/UnpublishedCardClaim.tsx`
- Modify: `src/components/state/StatePage.tsx`
- Modify: `e2e/public-profile.spec.ts`

**Interfaces:**

- Consumes: existing published-only profile projection, customer-selected profile theme, card resolver, consent control, vCard export, link tracking, and state-page copy.
- Produces: a refined phone-first profile and coherent published/unavailable/inactive/error/loading states with the same privacy boundary and actions.

- [x] **Step 1: Add responsive and state-preservation E2E assertions first.** Extend `e2e/public-profile.spec.ts` to check 320px and 390px widths, direct URL/card resolver presentation parity, a published profile's enabled links and Save contact, and that inactive/unavailable states do not reveal profile identity. Keep the assertions semantic.
- [x] **Step 2: Run the public-profile E2E tests before styling.** Run `npm run test:e2e:demo -- --project=chromium e2e/public-profile.spec.ts e2e/accessibility.spec.ts`. Expected: current privacy, direct/card parity, and public actions pass at the added viewport sizes.
- [x] **Step 3: Restyle the published profile.** Apply clearer identity hierarchy, readable name/role/bio, accessible profile image, ordered link controls, Save contact, and existing optional contact sections; keep customer profile themes and direct/card URL parity intact.
- [x] **Step 4: Restyle resolver and state pages.** Use the same typography, spacing, and controlled status treatment while retaining fixed safe copy on inactive/unavailable paths and the current friendly recovery route on errors.
- [x] **Step 5: Run public-profile and accessibility E2E.** Run `npm run test:e2e:demo -- --project=chromium e2e/public-profile.spec.ts e2e/accessibility.spec.ts`; expected: the public profile remains scan-friendly at narrow widths, states disclose no private data, and existing publish/claim/vCard flows pass.
- [x] **Step 6: Commit the public-profile slice.** Stage only the listed files and commit as `style: refine public profile and resolver states`.

### Task 6: Restyle customer profile editing, customization, and links

**Files:**

- Modify: `src/app/app/profile/page.tsx`
- Modify: `src/app/app/profile/loading.tsx`
- Modify: `src/app/app/profile/error.tsx`
- Modify: `src/app/app/customize/page.tsx`
- Modify: `src/app/app/customize/loading.tsx`
- Modify: `src/app/app/customize/error.tsx`
- Modify: `src/app/app/links/page.tsx`
- Modify: `src/components/forms/ProfileWorkspaceFrame.tsx`
- Modify: `src/components/forms/ProfileEditor.tsx`
- Modify: `src/components/forms/ProfileDetailsEditor.tsx`
- Modify: `src/components/forms/ProfileCustomizationEditor.tsx`
- Modify: `src/components/forms/ProfileMediaEditor.tsx`
- Modify: `src/components/forms/ProfilePublicationPanel.tsx`
- Modify: `src/components/forms/ProfileImageCropDialog.tsx`
- Modify: `src/components/forms/LinksWorkspace.tsx`
- Modify: `src/components/forms/LinksEditor.tsx`
- Modify: `src/components/workspace/WorkspacePreview.tsx`
- Modify: `e2e/customer.spec.ts`

**Interfaces:**

- Consumes: Task 1 controls, Task 2 customer shell, existing draft-save context, validators, profile customization/theme values, image upload/crop flow, link ordering, and publish panel.
- Produces: customer editing workspaces that clarify fields, preview, autosave/draft state, validation, and publish actions without altering persistence or publication rules.

- [x] **Step 1: Add E2E checks before editing.** Extend `e2e/customer.spec.ts` for `/app/profile`, `/app/customize`, and `/app/links` at 390px and 1467px; assert no horizontal overflow, preview visibility, reachable Save draft/Publish controls, and keyboard link ordering.
- [x] **Step 2: Run customer E2E before styles.** Run `npm run test:e2e:demo -- --project=chromium e2e/customer.spec.ts e2e/public-profile.spec.ts`. Expected: current editor, keyboard ordering, and published-version behavior pass at the added viewport sizes.
- [x] **Step 3: Refine Profile and Customize composition.** Group identity, public URL, media, appearance, and publication controls by purpose; keep preview available at desktop and provide an intentional compact preview action on phones without hiding save/publish state.
- [x] **Step 4: Refine Links management.** Make each link's label, URL, icon, enabled state, and move controls easy to scan. Keep move-up/move-down keyboard alternatives and explicit save/publish behavior.
- [x] **Step 5: Re-run editor E2E.** Run `npm run test:e2e:demo -- --project=chromium e2e/customer.spec.ts e2e/public-profile.spec.ts e2e/accessibility.spec.ts`; expected: draft edits remain private until publish, preview reflects the correct version, and the full editor is keyboard accessible.
- [x] **Step 6: Commit the profile-editing slice.** Stage only the listed files and commit as `style: refine profile and links workspaces`.

### Task 7: Restyle customer analytics, account, and card building

**Files:**

- Modify: `src/app/app/analytics/page.tsx`
- Modify: `src/app/app/account/page.tsx`
- Modify: `src/app/app/account/build-card/page.tsx`
- Modify: `src/app/build-card/page.tsx`
- Modify: `src/components/analytics/CustomerAnalytics.tsx`
- Modify: `src/components/forms/AccountSettings.tsx`
- Modify: `src/components/card-builder/BuildCardExperience.tsx`
- Modify: `src/components/card-builder/CardPreviewDialog.tsx`
- Modify: `src/components/qr/QrControls.tsx`
- Modify: `e2e/customer.spec.ts`

**Interfaces:**

- Consumes: shared shell and controls; existing aggregate analytics queries/time ranges, account update/deletion/unpublish semantics, card design validation, QR generation, and build-card route differences.
- Produces: readable analytics, safe account settings, and consistent standalone/embedded card-builder screens without changing data or action contracts.

- [x] **Step 1: Add customer-utility E2E assertions.** Extend `e2e/customer.spec.ts` to check analytics time-range controls, account unpublish/delete confirmation naming, the authenticated Build card route, and 390px/1280px overflow on these screens.
- [x] **Step 2: Run the customer utility checks before styling.** Run `npm run test:e2e:demo -- --project=chromium e2e/customer.spec.ts`. Expected: current analytics, account, and card-builder flows pass at the added viewport sizes.
- [x] **Step 3: Restyle analytics and account controls.** Clarify metric hierarchy and range selection without adding visitor-level data; separate routine account settings from unpublish and deletion actions, preserving confirmation copy and focus behavior.
- [x] **Step 4: Restyle card-builder surfaces.** Align editor, preview, QR options, and dialogs with the shared system. Preserve validation and the embedded `/app/account/build-card` shell versus standalone `/build-card` public header behavior.
- [x] **Step 5: Re-run customer utility E2E and accessibility checks.** Run `npm run test:e2e:demo -- --project=chromium e2e/customer.spec.ts e2e/accessibility.spec.ts`; expected: account actions remain explicit, QR/card previews work, and all controls retain accessible labels and focus.
- [x] **Step 6: Commit the customer utility slice.** Stage only the listed files and commit as `style: refine analytics account and card builder`.

### Task 8: Restyle administrator customers and profiles

**Files:**

- Modify: `src/app/admin/customers/page.tsx`
- Modify: `src/app/admin/profiles/page.tsx`
- Modify: `src/components/admin/CustomersManager.tsx`
- Modify: `src/components/admin/ProfilesManager.tsx`
- Modify: `src/components/admin/ProfileDetails.tsx`
- Modify: `src/components/admin/AdminProfileContentEditor.tsx`
- Modify: `e2e/admin.spec.ts`

**Interfaces:**

- Consumes: Task 1 controls and Task 2 administrator shell; existing customer creation/invitation, profile registry/search, profile details tabs, profile content editor, role gates, and status semantics.
- Produces: scannable customer/profile operations with accessible filtering, record status, detail inspection, and profile editing.

- [x] **Step 1: Add customer/profile viewport assertions first.** In `e2e/admin.spec.ts`, check Customers and Profiles at 390px and 1280px, verify search and status text remain available, and open the existing profile detail tabs by their accessible names.
- [x] **Step 2: Run the focused admin journeys.** Run `npm run test:e2e:demo -- --project=chromium e2e/admin.spec.ts e2e/accessibility.spec.ts`. Expected: invitation creation, profile inspection, and profile editing still pass before restyling.
- [x] **Step 3: Restyle the customer page.** Make account creation, invitation state, search, customer identity, and row actions read in a clear order. Preserve current forms, invitation outcomes, and admin-only access.
- [x] **Step 4: Restyle the profile registry and detail editor.** Clarify profile status, customer association, searchable rows, tabs, field groups, and save/publish controls. Preserve all current fields, audit links, and publication/suspension rules.
- [x] **Step 5: Re-run admin E2E.** Run `npm run test:e2e:demo -- --project=chromium e2e/admin.spec.ts e2e/accessibility.spec.ts`; expected: customer creation and profile detail/editor actions remain operable by keyboard at desktop and phone widths.
- [x] **Step 6: Commit the customer/profile admin slice.** Stage only the listed files and commit as `style: refine admin customer and profile views`.

### Task 9: Restyle card registry operations

**Files:**

- Modify: `src/app/admin/cards/page.tsx`
- Modify: `src/components/admin/CardsManager.tsx`
- Modify: `e2e/admin.spec.ts`

**Interfaces:**

- Consumes: shared admin shell and controls; existing unique card URL validation, assignment, QR preview/download, replacement, deactivation, and audit-link behavior.
- Produces: a clear card registry with readable assignment/status context and correctly named confirmation, preview, and download actions.

- [x] **Step 1: Add card-operation viewport assertions first.** In `e2e/admin.spec.ts`, verify card registration validation, duplicate rejection, assignment context, QR preview/download controls, and replacement/deactivation confirmation at 390px and 1280px.
- [x] **Step 2: Run the focused card E2E flow.** Run `npm run test:e2e:demo -- --project=chromium e2e/admin.spec.ts`. Expected: the existing register/assign/replace/deactivate/audit journey and its privacy assertions pass before the styling pass.
- [x] **Step 3: Restyle the card registry and QR controls.** Improve table/form grouping, assignment and replacement relationship, status readability, QR preview, and PNG/SVG actions. Keep confirmation text naming the exact card and its immediate inactive effect.
- [x] **Step 4: Re-run card and accessibility E2E.** Run `npm run test:e2e:demo -- --project=chromium e2e/admin.spec.ts e2e/accessibility.spec.ts`; expected: invalid and duplicate URLs are still refused and confirmed card actions retain keyboard focus behavior.
- [x] **Step 5: Commit the card registry slice.** Stage only the listed files and commit as `style: refine admin card registry`.

### Task 10: Restyle administrator analytics, audit log, and settings

**Files:**

- Modify: `src/app/admin/analytics/page.tsx`
- Modify: `src/app/admin/audit-log/page.tsx`
- Modify: `src/app/admin/settings/page.tsx`
- Modify: `src/components/admin/AdminAnalytics.tsx`
- Modify: `src/components/admin/AuditLog.tsx`
- Modify: `src/components/admin/SettingsManager.tsx`
- Modify: `e2e/admin.spec.ts`

**Interfaces:**

- Consumes: shared admin shell and controls; existing aggregate metrics/filters, audit events, support destination, and settings save feedback.
- Produces: readable analytics and governance pages with consistent metric, filter, event, empty, and save states.

- [x] **Step 1: Add analytics/governance viewport assertions first.** In `e2e/admin.spec.ts`, verify aggregate-only metrics, time-range filters, audit actor/action/time fields, settings field labels, and save feedback at 390px and 1280px.
- [x] **Step 2: Run focused admin E2E.** Run `npm run test:e2e:demo -- --project=chromium e2e/admin.spec.ts e2e/accessibility.spec.ts`. Expected: authorized aggregate analytics, audit history, and settings save journeys pass before styling.
- [x] **Step 3: Restyle analytics and audit pages.** Improve metric grouping, filter placement, chart/table labels, and audit-row scanning while retaining aggregate-only data and existing filter behavior.
- [x] **Step 4: Restyle the settings page.** Apply shared field, save, and feedback patterns to the existing support/contact destination setting; do not add platform settings.
- [x] **Step 5: Re-run focused admin and accessibility E2E.** Run `npm run test:e2e:demo -- --project=chromium e2e/admin.spec.ts e2e/accessibility.spec.ts`; expected: analytics remain aggregated, audit fields remain visible, and settings saves produce the existing result.
- [x] **Step 6: Commit the analytics/governance slice.** Stage only the listed files and commit as `style: refine admin analytics and governance`.

### Task 11: Capture responsive evidence and update the design record

**Files:**

- Create: `e2e/ui-redesign-artifacts.spec.ts`
- Modify: `e2e/support/demo-harness.ts` to export and reuse `signInAsAdmin` with the existing demo credentials; update `e2e/admin.spec.ts` to import the helper
- Modify: `docs/DESIGN.md`
- Generated, do not commit: `test-results/ui-redesign/`

**Interfaces:**

- Consumes: completed route-family designs and existing demo fixture data/helpers.
- Produces: a repeatable screenshot set, JSON E2E report, route-wide accessibility evidence, and a current design record that documents Quiet Precision as implemented.

- [x] **Step 1: Add a route-wide visual artifact E2E.** Create stable Playwright cases for homepage desktop/mobile, public profile mobile, login mobile, customer profile editor desktop/mobile, and administrator profiles desktop/mobile. Save screenshots as `landing-desktop.png`, `landing-mobile.png`, `public-profile-mobile.png`, `login-mobile.png`, `customer-profile-desktop.png`, `customer-profile-mobile.png`, `admin-profiles-desktop.png`, and `admin-profiles-mobile.png`. Reuse `signInAsCustomer` and the extracted `signInAsAdmin` helper. The admin helper signs in as `admin@tapit.local` with the demo password `tapit-demo` and verifies `/admin/customers`.
- [x] **Step 2: Create the artifact directory.** Run `mkdir -p test-results/ui-redesign` before Playwright so every named screenshot has an existing parent directory.
- [x] **Step 3: Capture local demo evidence.** Run `PLAYWRIGHT_JSON_OUTPUT_FILE=test-results/ui-redesign/e2e-results.json npm run test:e2e:demo -- --project=chromium e2e/ui-redesign-artifacts.spec.ts e2e/accessibility.spec.ts`; expected: screenshots and JSON report are written, all selected routes load, and axe reports no new violations. Keep screenshots and reports out of git.
- [x] **Step 4: Review coverage and update `docs/DESIGN.md`.** Replace the unspecified visual tokens and typeface notes with the contrast-checked values, shell breakpoint/navigation decisions, typography rules, and public/customer/admin component patterns that are actually implemented. Keep established behavior and route documentation accurate.
- [x] **Step 5: Run full local verification serially.** Run `npm run test:e2e:demo`, then `npm run verify`; do not run Next-backed checks concurrently because they share `.next/`. Confirm `NEXT_PUBLIC_DEMO_MODE=true` locally and do not use Production for any E2E or provisioning.
- [ ] **Step 6: Review phone behavior separately.** Not run: no physical-device pass was available. Local browser evidence is recorded separately; no Preview/Production acceptance is claimed.
- [x] **Step 7: Commit the final UI evidence and design record.** Stage the new E2E spec/helper, `docs/DESIGN.md`, and any required E2E updates only; leave generated screenshots/reports untracked or ignored; commit as `test: record quiet precision UI evidence`.

Implementation completed on 2026-09-30. The integrated local demo suite passed 59 tests with one hosted-demo-only skip; the final screenshot/accessibility suite passed 10 tests; `npm run verify` completed formatting, lint, typecheck, 452 unit tests, and production build. Independent review found no material regressions. Screenshots and the JSON report are saved under ignored `test-results/ui-redesign/`. Physical-device and Preview/Production acceptance were not run.

## Coverage Review

| Spec requirement                                                             | Plan task |
| ---------------------------------------------------------------------------- | --------- |
| Quiet Precision tokens, shared controls, no new fonts/dependencies           | 1         |
| Customer/admin shells and current routes                                     | 2         |
| Marketing site and legal pages                                               | 3         |
| Login, setup, onboarding, auth loading and validation                        | 4         |
| Published profile and safe resolver/error states                             | 5         |
| Profile, customization, media, links, draft, preview, publish                | 6         |
| Analytics, account, deletion/unpublish, standalone and embedded card builder | 7         |
| Customers and profiles administration                                        | 8         |
| Card registry and QR operations                                              | 9         |
| Admin analytics, audit log, and settings                                     | 10        |
| Responsive route coverage, accessibility, screenshots, and design docs       | 11        |

## Execution Handoff

This plan creates no implementation changes by itself. When implementation is authorized, use one task at a time and preserve the listed route and product invariants. Keep all E2E and provisioning in the guarded local demo unless the user separately authorizes a non-production live run.
