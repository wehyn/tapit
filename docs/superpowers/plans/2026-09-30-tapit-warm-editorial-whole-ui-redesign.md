# Tapit Warm Editorial Whole-Website Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry the selected Warm Editorial direction across every existing Tapit screen while preserving current routes, behavior, permissions, and data boundaries.

**Architecture:** Update global visual tokens and shared controls first, then apply the design to shared shells and each existing route family. Keep profile themes independent, preserve route and business logic, and use the local demo E2E suite plus a repeatable screenshot set to review the integrated result.

**Tech Stack:** Next.js 16.3.5 App Router, React 19.3.0, Tailwind CSS 4.3.3, Playwright 1.63.0, `@axe-core/playwright` ^4.13.0.

**Spec:** [`docs/superpowers/specs/2026-09-30-tapit-warm-editorial-whole-ui-redesign-design.md`](../specs/2026-09-30-tapit-warm-editorial-whole-ui-redesign-design.md)

## Global Constraints

- Do not change authentication, roles, account lifecycle, ownership, route access, or Convex/API contracts.
- Keep published-only public projections, explicit draft saving and publishing, and existing privacy boundaries.
- Preserve administrator ownership of card registration, assignment, deactivation, and replacement.
- Preserve analytics aggregation and consent behavior.
- Preserve profile fields, supported links, card generation, existing content meaning, and customer-selected profile themes.
- Do not add billing, teams, visitor accounts, dashboard routes, new product features, new profile themes, or third-party component libraries.
- Do not add custom font or UI-library dependencies.
- Keep `NEXT_PUBLIC_DEMO_MODE=true` locally. Use `npm run test:e2e:demo`; never use Production for E2E or provisioning.
- Do not edit Convex functions, `src/lib/`, route handlers, or generated files for this visual-only work.
- Read the relevant installed Next.js CSS guide from `node_modules/next/dist/docs/` before changing application code.
- Prefer E2E as the testing mechanism. Run `npm run verify` before claiming completion; keep demo, Preview/Production, and physical-device evidence separate.

## Review Focus

1. Customer-selected profile themes must survive direct and active-card navigation; update `e2e/public-profile.spec.ts` test `customized direct and active card paths preserve presentation parity`.
2. Inactive, unpublished, or suspended profiles must never reveal former or draft content; retain and verify `inactive cards never reveal their former profile and vCard includes approved profile fields` and `unavailable profiles do not reveal their previously published identity` in `e2e/public-profile.spec.ts`.
3. At narrow widths, navigation, dialogs, forms, and primary actions must stay reachable without horizontal overflow; pin this in the viewport checks in `e2e/customer.spec.ts`, `e2e/admin.spec.ts`, and `e2e/signup.spec.ts`.
4. Restyling must not change draft privacy, save-before-navigation, or explicit publication behavior; retain `customer drafts stay private until link and profile publication` and `customer customization drafts stay private until the profile is published` in `e2e/customer.spec.ts`.
5. Administrator actions must retain their target-specific confirmations, audit trail, and aggregate-only analytics; retain the card lifecycle, moderation, analytics, and audit journeys in `e2e/admin.spec.ts`.

---

## File Map

| Area                       | Files and responsibility                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tokens and controls        | `src/app/globals.css`; `src/components/ui/{Button,Field,Panel,Notice,StatusBadge,ConfirmDialog}.tsx`; `e2e/focus-styles.spec.ts`                                                                                                                                                                                                                                         |
| Shared shells              | `src/components/layout/{AppShell,SidebarNav,CustomerShell,AdminShell,Brand,PageContainer,PublicHeader}.tsx`; `navigation.ts`; `e2e/customer.spec.ts`; `e2e/admin.spec.ts`                                                                                                                                                                                                |
| Marketing and legal        | `src/app/page.tsx`, `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`; `e2e/smoke.spec.ts`                                                                                                                                                                                                                                                                            |
| Authentication             | `src/app/(auth)/login/page.tsx`, `src/app/(auth)/setup/[token]/page.tsx`, `src/app/onboarding/page.tsx`; `src/components/auth/{AuthShell,LoginForm,GoogleLoginForm,SetupForm,OnboardingForm,AuthLoadingState}.tsx`; `e2e/signup.spec.ts`                                                                                                                                 |
| Public profiles and states | `src/app/[slug]/{page,loading,error,not-found}.tsx`, `src/app/c/[cardToken]/page.tsx`; `src/components/profile/*.tsx`; `src/components/state/StatePage.tsx`; `e2e/public-profile.spec.ts`                                                                                                                                                                                |
| Customer editor and links  | `src/app/app/profile/*`, `src/app/app/customize/*`, `src/app/app/links/page.tsx`; `src/components/forms/{ProfileWorkspaceFrame,ProfileEditor,ProfileDetailsEditor,ProfileCustomizationEditor,ProfileMediaEditor,ProfilePublicationPanel,ProfileImageCropDialog,LinksWorkspace,LinksEditor}.tsx`; `src/components/workspace/WorkspacePreview.tsx`; `e2e/customer.spec.ts` |
| Customer utilities         | `src/app/app/analytics/page.tsx`, `src/app/app/account/*`, `src/app/build-card/page.tsx`; `src/components/analytics/CustomerAnalytics.tsx`, `src/components/forms/AccountSettings.tsx`, `src/components/card-builder/*.tsx`, `src/components/qr/QrControls.tsx`; `e2e/customer.spec.ts`                                                                                  |
| Administrator              | `src/app/admin/*/page.tsx`; `src/components/admin/*.tsx`; `e2e/admin.spec.ts`                                                                                                                                                                                                                                                                                            |
| Integrated evidence        | `e2e/ui-redesign-artifacts.spec.ts`, `docs/DESIGN.md`; generated files under ignored `test-results/warm-editorial-redesign/`                                                                                                                                                                                                                                             |

`src/app/app/page.tsx` redirects to `/app/profile`; `src/app/admin/page.tsx` redirects to `/admin/customers`. Preserve both redirects. The illustrative `Overview` item in the selected image is not a new route or navigation destination.

## Implementation Prerequisites

1. **Done:** Rechecked repository state and preserved the three approved untracked design artifacts. Created and verified local branch `feature/tapit-warm-editorial-redesign` at base `63aef8eef7137094470900d117b2e80532e7e8ac`.
2. **Done:** Ran `npm ci` (exit 0; 641 packages; npm reported two dependency advisories) and read `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` before UI edits. The root layout imports `src/app/globals.css`; keep global CSS truly global and continue using the existing Tailwind utilities.
3. Keep all browser flows and fixtures in local demo mode. Do not run live E2E, provision accounts, or use Preview/Production for this redesign.
4. Run Next-backed E2E and build commands serially because they share `.next/`.

## Tasks

### Task 1: Apply Warm Editorial tokens and shared controls

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

- Consumes: existing `--tapit-*` CSS variables, Tailwind aliases, and shared component props.
- Produces: contrast-checked Warm Editorial tokens, a heading-only serif style, and consistent button, field, panel, notice, status, dialog, and focus treatments.

- [x] **Step 1: Add the E2E expectation first.** Update `form focus indicators stay within the Tapit green theme` in `e2e/focus-styles.spec.ts` to assert the chosen forest accent `#315E48`, the computed focus color, and that a major page heading uses the serif display style while inputs and buttons remain sans-serif.
- [x] **Step 2: Run the focused style check before editing.** Run `npm run test:e2e:demo -- --project=chromium e2e/focus-styles.spec.ts`. Expected: the old Quiet Precision token assertion fails against the Warm Editorial expectation. Confirmed RED at the missing serif heading; GREEN plus axe passed 6/6.
- [x] **Step 3: Update shared tokens and controls.** Set the canvas `#F0EDE5`, surface `#FFFDF8`, soft surface `#F7F3E9`, ink `#28352C`, AA-adjusted muted text `#5E6B63`, line `#E6E0D3`, accent `#315E48`, strong accent `#244635`, soft accent `#E5EADF`, and warm accent `#C89961`. Define a `.tapit-display` heading style with `Georgia, "Times New Roman", serif`; keep body and control text in the current system sans stack. Preserve separate success, warning, and danger meanings. Validate contrast and adjust any candidate token that misses WCAG 2.2 AA.
- [x] **Step 4: Re-run focused E2E and accessibility.** Run `npm run test:e2e:demo -- --project=chromium e2e/focus-styles.spec.ts e2e/accessibility.spec.ts`. Expected: token/focus assertions and existing accessibility journeys pass. Fresh result: 6 passed; one muted-token contrast adjustment raised the previous 4.49:1 result above the AA threshold.
- [x] **Step 5: Commit the shared foundation.** Committed the shared tokens, controls, auth heading, shell, and E2E base as `3fc532d` (`style: establish warm editorial foundation`).

### Task 2: Restyle customer and administrator shells

**Files:**

- Modify: `src/components/layout/{AppShell,SidebarNav,CustomerShell,AdminShell,Brand,PageContainer}.tsx`
- Modify: `src/components/layout/navigation.ts`
- Modify: `e2e/customer.spec.ts`
- Modify: `e2e/admin.spec.ts`

**Interfaces:**

- Consumes: Task 1 tokens and current customer/admin navigation arrays, active-route matching, save-before-navigation handling, mobile drawer, and footer controls.
- Produces: coordinated warm workspace shells with role-specific navigation and unchanged destinations, menu focus behavior, and responsive access.

- [x] **Step 1: Update the shell E2E assertions first.** In `e2e/customer.spec.ts`, update `customer sidebar uses the Quiet Precision surface and stays grouped across desktop and mobile` to assert the Warm Editorial surface and existing destinations. In `e2e/admin.spec.ts`, retain checks for operations and governance destinations and add the warm shell surface at desktop and 390px.
- [x] **Step 2: Run focused shell journeys.** Run `npm run test:e2e:demo -- --project=chromium e2e/customer.spec.ts e2e/admin.spec.ts`. Expected: the new visual-token assertions fail while route and menu behavior remains covered. Confirmed RED on the existing cool sidebar surface; after styling, the two navigation tests passed.
- [x] **Step 3: Restyle the shared shells.** Apply the paper/forest palette, editorial page headings, warm separators, and restrained surfaces. Keep compact desktop navigation, mobile drawer semantics, before-navigation draft saving, active destinations, and `/app` and `/admin` redirects unchanged. Do not add `Overview`.
- [x] **Step 4: Re-run shell and accessibility checks.** Run the same focused E2E files plus `e2e/accessibility.spec.ts`. Expected: navigation, keyboard focus, Escape/focus return, and 390px layouts pass. Fresh navigation result: 2 passed; accessibility/focus result: 6 passed.
- [x] **Step 5: Commit the shell slice.** Included with shared foundation commit `3fc532d` (`style: establish warm editorial foundation`).

### Task 3: Restyle the marketing and legal pages

**Files:**

- Modify: `src/app/page.tsx`
- Modify: `src/app/privacy/page.tsx`
- Modify: `src/app/terms/page.tsx`
- Modify: `src/components/layout/PublicHeader.tsx`
- Modify: `e2e/smoke.spec.ts`

**Interfaces:**

- Consumes: Task 1 tokens and Task 2 brand treatment; existing homepage content, hero assets, footer links, and legal copy.
- Produces: an editorial public site and readable legal pages with current copy meaning and destinations intact.

- [x] **Step 1: Add responsive assertions before styling.** Update `e2e/smoke.spec.ts` to verify the homepage headline, public navigation, privacy/terms destinations, and no horizontal overflow at 390px and 1280px.
- [x] **Step 2: Run the focused smoke check.** Run `npm run test:e2e:demo -- --project=chromium e2e/smoke.spec.ts`. Expected: existing content and navigation pass before the style update.
- [x] **Step 3: Apply the Warm Editorial layout.** Use serif display headings, warm page surfaces, readable widths, and simple dividers. Keep all copy, sections, hero/profile-card assets, links, calls to action, and responsive navigation behavior.
- [x] **Step 4: Re-run smoke and accessibility checks.** Run `e2e/smoke.spec.ts` with `e2e/accessibility.spec.ts`. Expected: headings, links, and page structure remain accessible without overflow.
- [x] **Step 5: Commit the public-site slice.** Commit only the listed files as `style: restyle public pages warm editorial`.

### Task 4: Restyle login, setup, and onboarding

**Files:**

- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/setup/[token]/page.tsx`
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/components/auth/{AuthShell,LoginForm,GoogleLoginForm,SetupForm,OnboardingForm,AuthLoadingState}.tsx`
- Modify: `e2e/signup.spec.ts`

**Interfaces:**

- Consumes: shared controls and public brand tokens; current auth modes, callback handling, setup invitations, validation, and loading states.
- Produces: focused authentication screens that belong to the same service without workspace navigation or auth-flow changes.

- [x] **Step 1: Add layout assertions first.** Update `authentication and setup screens fit narrow mobile and desktop widths` to assert the Warm Editorial heading/surface and retain every field label, mode switch, validation, and callback expectation at 390px and desktop width.
- [x] **Step 2: Run the auth and accessibility E2E checks.** Run `npm run test:e2e:demo -- --project=chromium e2e/signup.spec.ts e2e/accessibility.spec.ts`. Expected: existing auth behavior passes before restyling.
- [x] **Step 3: Apply the focused auth system.** Restyle form widths, heading hierarchy, fields, validation, provider button, recovery feedback, and loading presentation. Preserve all field types, labels, validation meaning, loading behavior, and destinations.
- [x] **Step 4: Re-run auth and accessibility E2E.** Expected: existing sign-in, setup, onboarding, and axe journeys pass at phone and desktop widths.
- [x] **Step 5: Commit the auth slice.** Commit only the listed files as `style: restyle auth warm editorial`.

### Task 5: Restyle public profiles and resolver states

**Files:**

- Modify: `src/app/[slug]/{page,loading,error,not-found}.tsx`
- Modify: `src/app/c/[cardToken]/page.tsx`
- Modify: `src/components/profile/*.tsx`
- Modify: `src/components/state/StatePage.tsx`
- Modify: `e2e/public-profile.spec.ts`

**Interfaces:**

- Consumes: existing published-only projection, card resolution, customer-selected theme, consent, contact actions, vCard export, link tracking, and fixed unavailable-state copy.
- Produces: a phone-first profile and matching branded loading, error, inactive-card, unavailable, and not-found states without changing privacy boundaries.

- [x] **Step 1: Add the visual and privacy assertions first.** Extend `e2e/public-profile.spec.ts` to assert warm Tapit-owned framing at 320px and 390px, preserve custom-theme presentation parity for direct/card paths, and retain the existing inactive/unavailable identity-disclosure assertions.
- [x] **Step 2: Run public-profile and accessibility checks.** Run `npm run test:e2e:demo -- --project=chromium e2e/public-profile.spec.ts e2e/accessibility.spec.ts`. Expected: the new application framing assertion fails against the old UI; publication and privacy checks remain active.
- [x] **Step 3: Apply the public-screen visual treatment.** Improve identity hierarchy, type, enabled-link controls, Save contact, Tapit-owned resolver framing, and friendly failure recovery. Do not override user-selected profile styles or reveal former/draft data.
- [x] **Step 4: Re-run profile and accessibility E2E.** Expected: direct/card parity, custom themes, vCard, consent, link actions, inactive privacy, and 320px usability pass.
- [x] **Step 5: Commit the public-profile slice.** Commit only the listed files as `style: restyle public profiles warm editorial`.

### Task 6: Restyle the customer profile, customization, and links workspaces

**Files:**

- Modify: `src/app/app/profile/*`, `src/app/app/customize/*`, `src/app/app/links/page.tsx`
- Modify: `src/components/forms/{ProfileWorkspaceFrame,ProfileEditor,ProfileDetailsEditor,ProfileCustomizationEditor,ProfileMediaEditor,ProfilePublicationPanel,ProfileImageCropDialog,LinksWorkspace,LinksEditor}.tsx`
- Modify: `src/components/workspace/WorkspacePreview.tsx`
- Modify: `e2e/customer.spec.ts`

**Interfaces:**

- Consumes: shared controls/shell, draft-save context, validation, profile media and crop flows, customer-selected appearance values, link ordering, publication panel, and preview.
- Produces: clear editing workspaces that pair fields and preview and keep save, draft, publication, and keyboard link-order actions reachable.

- [x] **Step 1: Add viewport and state assertions first.** Update the editor E2E coverage to assert warm headings/surfaces, no overflow at 390px and 1467px, visible phone preview at desktop, a reachable preview action on phones, and reachable Save draft/Publish controls. Retain the named draft privacy and keyboard ordering journeys.
- [x] **Step 2: Run the focused customer editor checks.** Run `npm run test:e2e:demo -- --project=chromium e2e/customer.spec.ts e2e/public-profile.spec.ts`. Expected: existing editor, preview, ordering, and publication assertions pass before the redesign.
- [x] **Step 3: Restyle Profile and Customize.** Group identity, URL, media, appearance, and publication controls with warm section headings and restrained separators. Keep the live preview paired with editing at desktop and accessible by the existing phone action.
- [x] **Step 4: Restyle Links.** Clarify labels, destinations, enabled state, ordering, and current add/edit actions. Retain keyboard move-up/move-down alternatives and save/publish semantics.
- [x] **Step 5: Re-run customer and accessibility E2E.** Run `e2e/customer.spec.ts`, `e2e/public-profile.spec.ts`, and `e2e/accessibility.spec.ts`. Expected: draft privacy, preview version, media retry/crop, publication, and keyboard behavior pass.
- [x] **Step 6: Commit the editor slice.** Commit only the listed files as `style: restyle profile and links warm editorial`.

### Task 7: Restyle customer analytics, account, and card-building screens

**Files:**

- Modify: `src/app/app/analytics/page.tsx`
- Modify: `src/app/app/account/page.tsx`
- Modify: `src/app/app/account/build-card/page.tsx`
- Modify: `src/app/build-card/page.tsx`
- Modify: `src/components/analytics/CustomerAnalytics.tsx`
- Modify: `src/components/forms/AccountSettings.tsx`
- Modify: `src/components/card-builder/*.tsx`
- Modify: `src/components/qr/QrControls.tsx`
- Modify: `e2e/customer.spec.ts`

**Interfaces:**

- Consumes: Task 1 controls and Task 2 shell; aggregate analytics, account update/deletion/unpublish rules, card generation/validation, QR controls, and embedded/standalone route differences.
- Produces: readable customer utility pages with explicit account actions and consistent embedded and standalone card-builder presentations.

- [x] **Step 1: Add utility viewport checks first.** Update customer E2E to assert warm surface, current analytics ranges, account action confirmations, authenticated Build card access, and no overflow at 390px and 1280px.
- [x] **Step 2: Run focused customer utility E2E.** Run `npm run test:e2e:demo -- --project=chromium e2e/customer.spec.ts`. Expected: current analytics, account, and card-builder behavior passes before styling.
- [x] **Step 3: Restyle analytics and account.** Clarify aggregate metric hierarchy and range controls. Separate routine account settings from Unpublish and deletion actions; preserve target-specific confirmation copy and focus behavior.
- [x] **Step 4: Restyle card-builder screens.** Apply shared typography, surfaces, inputs, preview, QR options, and dialog treatment. Preserve the embedded customer shell and standalone public header, validation, download, and card-generation behavior.
- [x] **Step 5: Re-run customer utility and accessibility E2E.** Expected: aggregate scope, account confirmations, QR preview/download, and keyboard focus remain correct.
- [x] **Step 6: Commit the customer-utility slice.** Commit only the listed files as `style: restyle customer utilities warm editorial`.

### Task 8: Restyle administrator customers and profiles

**Files:**

- Modify: `src/app/admin/customers/page.tsx`
- Modify: `src/app/admin/profiles/page.tsx`
- Modify: `src/components/admin/{CustomersManager,ProfilesManager,ProfileDetails,AdminProfileContentEditor}.tsx`
- Modify: `e2e/admin.spec.ts`

**Interfaces:**

- Consumes: shared admin shell/controls; existing invitations, customer records, profile search/status, detail tabs, editor fields, role gates, and publication/moderation behavior.
- Produces: scannable warm customer/profile operations with existing filters, details, and safe row actions.

- [x] **Step 1: Add viewport assertions first.** Extend administrator E2E to assert warm page hierarchy, 390px/1280px usability, searchable records, status text, invitation actions, and existing profile-detail tabs.
- [x] **Step 2: Run focused admin/accessibility checks.** Run `npm run test:e2e:demo -- --project=chromium e2e/admin.spec.ts e2e/accessibility.spec.ts`. Expected: current invitation and profile workflows pass before restyling.
- [x] **Step 3: Restyle Customers and Profiles.** Clarify page headings, filters, identity, status, tables, detail tabs, and editor groups. Keep customer invitations, role gates, audits, and publication/suspension semantics.
- [x] **Step 4: Re-run administrator E2E.** Expected: invitation setup, profile detail/editing, selected-record context, and phone-width layouts pass.
- [x] **Step 5: Commit the customer/profile administration slice.** Commit only the listed files as `style: restyle admin customers and profiles warm editorial`.

### Task 9: Restyle administrator card operations

**Files:**

- Modify: `src/app/admin/cards/page.tsx`
- Modify: `src/components/admin/CardsManager.tsx`
- Modify: `e2e/admin.spec.ts`

**Interfaces:**

- Consumes: shared admin controls and shell; unique card URL validation, assignment, QR preview/download, replacement/deactivation, and audit behavior.
- Produces: readable card operations with explicit assignment and status context and target-specific confirmations.

- [x] **Step 1: Add operation assertions first.** Extend the existing card lifecycle E2E to assert the register/assign/replace/deactivate flow, duplicate rejection, target-specific confirmation, audit entry, and 390px/1280px layouts.
- [x] **Step 2: Run the focused card journey.** Run `npm run test:e2e:demo -- --project=chromium e2e/admin.spec.ts`. Expected: current card behavior passes before styling.
- [x] **Step 3: Restyle card registry and QR controls.** Clarify form/table grouping, assignment relationship, status, QR preview, and downloads. Keep destructive consequences explicit and preserve exact card identity in confirmations.
- [x] **Step 4: Re-run card and accessibility E2E.** Expected: invalid/duplicate URLs remain refused and confirmed actions retain correct focus and audit behavior.
- [x] **Step 5: Commit the card-operations slice.** Commit only the listed files as `style: restyle admin cards warm editorial`.

### Task 10: Restyle administrator analytics, audit log, and settings

**Files:**

- Modify: `src/app/admin/analytics/page.tsx`
- Modify: `src/app/admin/audit-log/page.tsx`
- Modify: `src/app/admin/settings/page.tsx`
- Modify: `src/components/admin/{AdminAnalytics,AuditLog,SettingsManager}.tsx`
- Modify: `e2e/admin.spec.ts`

**Interfaces:**

- Consumes: shared admin shell and controls; current aggregate metrics/filters, audit events, support destination, and settings-save behavior.
- Produces: readable operations analytics and governance pages with the same data scope and actions.

- [x] **Step 1: Add analytics/governance assertions first.** Assert aggregate-only metrics, time ranges, audit actor/action/time fields, current settings labels/save feedback, and 390px/1280px layouts in `e2e/admin.spec.ts`.
- [x] **Step 2: Run focused administrator E2E.** Run `npm run test:e2e:demo -- --project=chromium e2e/admin.spec.ts e2e/accessibility.spec.ts`. Expected: current analytics, audit, and settings flows pass before styling.
- [x] **Step 3: Restyle analytics and audit.** Clarify metric groups, filter placement, charts/tables, and audit-row scanning without adding visitor-level data or new filters.
- [x] **Step 4: Restyle settings.** Apply shared field and save-feedback patterns to the existing support/contact destination setting only.
- [x] **Step 5: Re-run administrator and accessibility E2E.** Expected: aggregates stay scoped, audit fields remain visible, and settings preserve save behavior.
- [x] **Step 6: Commit the governance slice.** Commit only the listed files as `style: restyle admin governance warm editorial`.

### Task 11: Capture integrated responsive evidence and update the design record

**Files:**

- Modify: `e2e/ui-redesign-artifacts.spec.ts`
- Modify: `docs/DESIGN.md`
- Generated, do not commit: `test-results/warm-editorial-redesign/`

**Interfaces:**

- Consumes: completed route-family styling and existing demo sign-in helpers.
- Produces: a repeatable screenshot set, JSON E2E report, responsive/accessibility evidence, and a design record describing the implemented Warm Editorial system.

- [x] **Step 1: Update the screenshot artifact test.** Reuse existing landing desktop/mobile, public-profile mobile, login mobile, customer-profile desktop/mobile, and admin-profile desktop/mobile cases; write named PNGs under `test-results/warm-editorial-redesign/` and assert each page's primary heading before capture.
- [x] **Step 2: Create the evidence directory.** Run `mkdir -p test-results/warm-editorial-redesign` so Playwright can write every named screenshot.
- [x] **Step 3: Capture local demo evidence.** Run `PLAYWRIGHT_JSON_OUTPUT_FILE=test-results/warm-editorial-redesign/e2e-results.json npm run test:e2e:demo -- --project=chromium e2e/ui-redesign-artifacts.spec.ts e2e/accessibility.spec.ts`. Expected: all screenshot files and the JSON report exist and selected route accessibility checks pass.
- [x] **Step 4: Compare and document the result.** Compare the desktop customer profile-editor capture with the selected prototype and inspect the mobile captures for intentional responsive composition. Record contrast-checked Warm Editorial tokens, serif heading use, shared component treatments, current navigation breakpoints, and profile-theme independence in `docs/DESIGN.md`.
- [x] **Step 5: Walk every route family in local demo.** Confirm homepage/legal, login/setup, published and non-public profile states, customer editor/utilities, both card-builder routes, and administrator pages/states. Confirm `/app` and `/admin` retain their existing redirects.
- [x] **Step 6: Run integrated verification serially.** Run `npm run test:e2e:demo`, then `npm run verify`. Expected: E2E and the repository verification script complete successfully; no Production or physical-device claims are made.
- [ ] **Step 7: Commit the approved design record and evidence changes.** Commit the approved spec, plan, prototype reference, updated `TASKS.md`/`docs/DESIGN.md`, and E2E evidence assertions in scoped documentation and test commits. Keep generated screenshots and reports ignored.

## Coverage Review

| Spec requirement                                                         | Plan task |
| ------------------------------------------------------------------------ | --------- |
| Warm Editorial tokens, typography, shared controls, and AA accessibility | 1         |
| Customer/admin shells and route-preserving navigation                    | 2         |
| Marketing homepage and legal pages                                       | 3         |
| Login, invitation setup, onboarding, validation, and loading             | 4         |
| Published profile, card resolver, and safe public states                 | 5         |
| Profile editing, customization, preview, links, draft, and publish       | 6         |
| Customer analytics, account, and embedded/standalone card builder        | 7         |
| Administrator customers and profiles                                     | 8         |
| Administrator card lifecycle and QR                                      | 9         |
| Administrator analytics, audit log, and settings                         | 10        |
| Responsive route evidence, verification, and design documentation        | 11        |

## Execution Handoff

Implementation was completed on `feature/tapit-warm-editorial-redesign`, based on `63aef8e`. Route-family changes were integrated in focused commits and verified against the local demo. The approved visual reference, implementation record, route evidence, verification results, and generated screenshot location are recorded in this plan, [`TASKS.md`](../../../TASKS.md), and [`docs/DESIGN.md`](../../DESIGN.md). No Preview, Production, or physical-device validation is claimed.
