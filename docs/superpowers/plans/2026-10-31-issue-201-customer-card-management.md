# Customer Card Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` for task-by-task execution, or execute the tasks inline with checkpoints. Keep each task reviewable and preserve unrelated work.

**Goal:** Give every active customer a Cards workspace for their assigned cards, with owner controls for disabling, reporting lost, choosing the lost-card page, and starting eligible reactivation.

**Architecture:** Keep authorization and card transitions in the existing Convex backend and deterministic local-demo store. Add a customer-safe, paginated card projection and owner-only mutations; reuse the existing claim-code workflow after owner-started reactivation. Move the embedded card designer to `/app/card/order`, keep the printed order form at `/app/card/order-card`, and make `/app/card` the always-available assigned-card list.

**Tech Stack:** Next.js App Router, React, Convex, browser-local demo state, Vitest/convex-test, and Playwright.

**Design source:** `docs/superpowers/specs/2026-10-31-issue-201-customer-card-management-design.md` (approved in the conversation). The root `spec.md` describes issues #151–153; update the product requirements in `docs/spec.md` for #201.

---

## Scope and safeguards

- Return only cards assigned to the authenticated customer's own profile. Include unclaimed and archived assigned cards; exclude unassigned inventory and other profiles.
- Do not expose claim codes, hashes, challenges, or the internal `ownerDisabledAt` marker in the customer projection.
- Keep mutations server-authorized and recheck current ownership, status, scope, archive state, and correction state inside each write.
- Keep all owner changes isolated to one card. Preserve its permanent URL, profile assignment, and claim history except when reactivation intentionally invalidates the old claim.
- Missing `lostCardResolution` means the existing shared return-instructions page. Optional card fields need no data migration.
- Preserve administrator registry, assignment, claim-code, archive/restore, lost-card, and recovery controls. Admin actions clear customer-only reactivation provenance; admin recovery of a lost card clears its page preference.
- Before editing Convex code, read `convex/_generated/ai/guidelines.md`. Before editing code, reread `CODING_STANDARDS.md`. Before changing App Router files, read the relevant guide from the installed `node_modules/next/dist/docs/` tree; install dependencies first if that tree is absent. Do not hand-edit Convex generated files.
- In each task, add the listed focused regression test before the implementation, run its command once to observe the missing behavior, then implement the smallest change and rerun it for a pass. Keep the full repository gate until the final task.

## File map

- **Convex card contract, owner API, and public resolution:** `convex/schema.ts`, `convex/validators.ts`, `convex/cards.ts`; generate types with `npx convex codegen`.
- **Shared and local-demo card state:** `src/lib/domain/index.ts`, `src/lib/demo/fixtures.ts`, `src/lib/demo/store.ts`, and the demo card paths in `src/components/admin/CardsManager.tsx`.
- **Customer Cards experience and routes:** create `src/components/card-management/CustomerCardsExperience.tsx` and `src/app/app/card/order/page.tsx`; change `src/app/app/card/page.tsx`, `src/components/layout/navigation.ts`, `src/components/layout/WorkspaceShell.tsx`, and `next.config.ts`. Keep `src/app/app/card/order-card/page.tsx` and `OrderCardExperience` at their current route.
- **Public lost-card output and audit labels:** `src/components/profile/CardResolverClient.tsx` and `src/components/admin/AuditLog.tsx`.
- **Focused coverage:** create `convex/integration/card-customer-controls.test.ts`, `tests/unit/customer-cards.test.tsx`, and `tests/unit/demo-customer-card-controls.test.ts`; extend `tests/unit/demo-storage-store.test.ts`, `convex/integration/card-archive-restore-reactivation.test.ts`, and `convex/integration/card-routing.test.ts` where their existing fixtures fit.
- **Route and browser callers:** update the relevant assertions in `tests/unit/navigation.test.ts`, `tests/unit/workspace-nav.test.tsx`, `e2e/customer.spec.ts`, `e2e/signup.spec.ts`, `e2e/workspace-nav-regressions.spec.ts`, `e2e/ui-redesign-artifacts.spec.ts`, and `e2e/admin.spec.ts`. Existing payment-order E2E paths stay at `/app/card/order-card`.
- **Product docs:** `docs/spec.md`, `README.md`, and `docs/CHANGELOG.md`.

## Task 1: Add optional card fields to the shared and persisted contracts

**Files:**

- Modify: `convex/schema.ts`
- Modify: `convex/validators.ts`
- Modify: `src/lib/domain/index.ts`
- Modify: `src/lib/demo/fixtures.ts`
- Modify: `src/lib/demo/store.ts`
- Test: `tests/unit/demo-storage-store.test.ts`

- [ ] Add `lostCardResolution?: "return" | "inactive"` and `ownerDisabledAt?: number` to the card schema and `CardRecord`. Export one shared Convex validator for the preference and reuse it in the schema and later function validators:

```ts
export const lostCardResolutionValidator = v.union(v.literal("return"), v.literal("inactive"));
```

- [ ] Extend `isDemoCard` to accept only those two preference values and a finite `ownerDisabledAt`. Keep older records without either field valid and do not change the demo storage version.
- [ ] Add persistence assertions for a legacy card with both fields absent, a card with both supported values, and rejection of an invalid preference or timestamp.
- [ ] Run `npm test -- tests/unit/demo-storage-store.test.ts` and confirm the legacy, valid, and invalid-record cases pass. Run `npx convex codegen`; generated files must be produced by codegen, never edited by hand.

## Task 2: Add the paginated customer-owned Convex list

**Files:**

- Modify: `convex/cards.ts`
- Test: `convex/integration/card-customer-controls.test.ts`

- [ ] Add a paginated `cards.myCards` query using `paginationOptsValidator` and `paginationResultValidator`. Take no profile or account ID argument. Derive the signed-in account, require an active customer and valid owned profile, query the existing `by_profileId` index, and verify scope before projecting each row.
- [ ] Return only card ID, permanent URL, status, archive timestamp, lost-page choice (default absent values to `return`), and server-computed `canDisable`, `canMarkLost`, `canSetLostResolution`, and `canReactivate` booleans. Define a current claim as `claimCodeClaimedAt !== undefined && claimCodeInvalidatedAt === undefined`; use it with `status === "active"` for `canDisable`, and with `status !== "lost"` and no correction pending for `canMarkLost`. Never spread the stored card document or return claim hashes, codes, claim timestamps, challenges, or `ownerDisabledAt`.
- [ ] Add integration cases proving all assigned cards appear across pages, including unclaimed and archived records, while unassigned, cross-customer, and cross-scope cards do not. Reject missing, inactive, and admin identities; confirm the query accepts no client-selected profile.
- [ ] Assert the customer projection contains no claim secrets and that missing `lostCardResolution` is returned as `return`. Run `npx convex codegen`, then `npm test -- convex/integration/card-customer-controls.test.ts`.

## Task 3: Add customer disable, lost, and lost-page actions

**Files:**

- Modify: `convex/cards.ts`
- Modify: `src/components/admin/AuditLog.tsx`
- Modify: `convex/integration/card-customer-controls.test.ts`

- [ ] Add `ownerDisable`, `ownerMarkLost`, and `ownerSetLostResolution` mutations. Each accepts a card ID (plus a `lostCardResolution` for mark-lost and preference changes), derives the active customer and profile from identity, and verifies assignment and scope inside the mutation.
- [ ] Allow disable only for an unarchived, active card with `claimCodeClaimedAt !== undefined`, `claimCodeInvalidatedAt === undefined`, and no correction pending; set `status: "inactive"` and `ownerDisabledAt`. Allow mark-lost for any assigned card with that current-claim predicate, provided it is not already lost and has no pending correction; preserve its archive state, set `status: "lost"`, save the selected page, and clear `ownerDisabledAt`. Allow page changes on any assigned card still marked lost, including an admin-marked unclaimed card; reject a pending correction.
- [ ] Make every mutation recheck the current status and correction request before writing. On failure, throw and leave the card unchanged. On success, patch only the selected card and write actor, profile, card, timestamp, and before/after values to audit.
- [ ] Add readable `AuditLog.tsx` labels for owner disable, owner mark-lost, and lost-page preference changes.
- [ ] Cover active-and-claimed-only disable; claimed lost-marking from active, inactive, claimable, replaced, and archived assigned cards; unclaimed and invalidated-claim rejection; correction-pending rejection; admin-lost unclaimed preference choice; audit fields; stale-action rejection; and sibling independence. Run `npx convex codegen`, then `npm test -- convex/integration/card-customer-controls.test.ts`.

## Task 4: Add owner reactivation and preserve admin/public lifecycle behavior

**Files:**

- Modify: `convex/cards.ts`
- Modify: `src/components/profile/CardResolverClient.tsx`
- Modify: `convex/integration/card-customer-controls.test.ts`
- Modify: `convex/integration/card-archive-restore-reactivation.test.ts`
- Modify: `convex/integration/card-routing.test.ts`

- [ ] Add `ownerReactivate`. Require the card to remain assigned to the current owner, be inactive, have `ownerDisabledAt`, be unarchived, and have no pending correction. Mirror existing admin reactivation validation for profile scope and valid published content. Set it to `active` for a valid published profile or `claimable` otherwise; invalidate old claim eligibility, clear claim completion and `ownerDisabledAt`, and preserve card ID, URL, and assignment.
- [ ] Prove the prior code and challenge cannot reactivate the card, admin code generation remains the only way to issue a fresh code, and the card URL returns profile content only after that code is successfully claimed. Reject admin-disabled, lost, archived, stale, correction-pending, and invalid-published-content owner reactivation attempts without writes.
- [ ] In admin deactivation, marking lost, and reactivation, clear `ownerDisabledAt`. On administrator recovery of a lost card, also clear `lostCardResolution` so the next lost event defaults to shared return instructions. Keep existing admin eligibility guards, actions, and audit records.
- [ ] In both resolver paths, map `lostCardResolution: "inactive"` to the existing neutral inactive result/page; otherwise keep the current lost return page and shared instructions/support fallback. A missing preference remains the legacy return page. Branch before profile lookup and expose no profile or owner data.
- [ ] Cover both lost-page modes, legacy preference default, no profile-shaped resolver fields, admin preference reset, fresh-claim reactivation, and sibling preservation. Run `npx convex codegen`, then `npm test -- convex/integration/card-customer-controls.test.ts convex/integration/card-archive-restore-reactivation.test.ts convex/integration/card-routing.test.ts`.

## Task 5: Mirror the owner list and transitions in local demo

**Files:**

- Modify: `src/lib/demo/store.ts`
- Modify: `src/lib/demo/fixtures.ts`
- Modify: `src/components/admin/CardsManager.tsx`
- Create: `tests/unit/demo-customer-card-controls.test.ts`
- Modify: `tests/unit/demo-card-setup.test.ts`
- Modify: `tests/unit/demo-card-owner-access-override.test.ts`

- [ ] Add `getMyDemoCards`, `disableMyDemoCard`, `markMyDemoCardLost`, `setMyLostDemoCardResolution`, and `startMyDemoCardReactivation`. Derive the active demo customer/profile from the session, then validate the latest state inside `updateDemoState`; never accept a profile ID from the customer component.
- [ ] Return only the same safe card fields and action booleans as Convex. Mirror Convex status, claim, archive, correction, audit, and reactivation rules. Owner reactivation must also remove that card ID from the customer's `claimedCardIds`; a successful fresh claim adds it back through the existing claim flow. Preserve deterministic demo behavior and keep claim codes/challenges out of the customer projection.
- [ ] Clear `ownerDisabledAt` when local admin actions deactivate, mark lost, or reactivate a card. Clear `lostCardResolution` when local admin recovery returns a lost card to service. Preserve current administrator controls and code generation.
- [ ] Test guest, admin, inactive-customer, and wrong-profile sessions for both list and mutation calls; assert no cards leak and no card/audit writes occur. Also test empty, unclaimed, archived, admin-lost, and claimed card fixtures; active-only disable; claimed lost-marking from active, inactive, claimable, replaced, and archived assigned cards; invalidated-claim and correction-pending rejection; both lost resolver choices and the legacy return default without profile data; audit values; fresh-code re-claim; invalid old code/challenge; removal and restoration of `claimedCardIds`; and sibling/access independence.
- [ ] Run `npm test -- tests/unit/demo-customer-card-controls.test.ts tests/unit/demo-card-setup.test.ts tests/unit/demo-card-owner-access-override.test.ts`.

## Task 6: Make `/app/card` the Cards workspace and move the designer

**Files:**

- Create: `src/components/card-management/CustomerCardsExperience.tsx`
- Modify: `src/app/app/card/page.tsx`
- Create: `src/app/app/card/order/page.tsx`
- Modify: `src/components/layout/navigation.ts`
- Modify: `src/components/layout/WorkspaceShell.tsx`
- Modify: `next.config.ts`
- Test: `tests/unit/customer-cards.test.tsx`
- Modify: `tests/unit/navigation.test.ts`
- Modify: `tests/unit/workspace-nav.test.tsx`
- Modify: `e2e/customer.spec.ts`
- Modify: `e2e/signup.spec.ts`
- Modify: `e2e/workspace-nav-regressions.spec.ts`
- Modify: `e2e/ui-redesign-artifacts.spec.ts`
- Modify: `e2e/admin.spec.ts`

- [ ] Replace the `/app/card` page's `BuildCardExperience` with `CustomerCardsExperience`. Use the paginated Convex query/mutations in live mode and the matching demo helpers in local-demo mode.
- [ ] Show every customer's Cards navigation item and change its label/tour copy to plural. Remove the `/app/card` owner-feature notice in both Demo and Live `WorkspaceShell` branches; keep the existing `/app/analytics` gate. A customer with no cards still sees `/app/card` and its empty state.
- [ ] Create `/app/card/order` to mount `<BuildCardExperience embedded />`. Leave `/app/card/order-card` and its printed order form untouched. Change the legacy `/app/account/build-card` redirect in `next.config.ts` to `/app/card/order`; keep the public `/build-card` route.
- [ ] Implement the cards list with permanent URL, current status, separate archive state and restore-by-admin guidance, lost-page choice, and the correct eligible actions. Add confirmation for disable/lost/reactivation, default the lost-page choice to return instructions, describe the required fresh admin code after reactivation, show success/error feedback, and provide **Order more cards** in both the populated and empty state. Do not render codes or claim internals.
- [ ] Update old route/nav expectations in the listed unit and E2E files. Retarget the existing builder assertion in `e2e/admin.spec.ts` to `/app/card/order` because the customer-owned list query is not an admin registry. Keep all printed-order form journeys at `/app/card/order-card`; keep the builder's order action directed there.
- [ ] Retarget the existing builder visual capture from `/app/card` to `/app/card/order` and add a Cards-list capture at `/app/card`, so both route surfaces remain represented.
- [ ] Add UI coverage for the empty state, assigned unclaimed and archived cards, safe URL/status display, action visibility, return-instructions default selection when marking lost, both lost-page options, fresh-code reactivation guidance, and order links. Verify keyboard access and responsive layout at 390px and 1280px widths. Run `npm test -- tests/unit/customer-cards.test.tsx tests/unit/navigation.test.ts tests/unit/workspace-nav.test.tsx`.

## Task 7: Update product docs and prove both customer paths

**Files:**

- Modify: `docs/spec.md`
- Modify: `README.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `e2e/customer.spec.ts`
- Modify: `e2e/public-profile.spec.ts`

- [ ] Replace the current `docs/spec.md` permission-table statement that customers have no Cards screen and rewrite AC-021 for own-profile assigned-card visibility, no inventory/reassignment access, and the new owner controls. Update FR-048, FR-073, and FR-074; add the customer listing, disable/lost eligibility, lost-page preference, reactivation, audit, sibling-isolation, and runtime-parity requirements after FR-082. Add acceptance criteria for those same behaviors and the route split.
- [ ] Update the README route map to describe `/app/card` (assigned Cards), `/app/card/order` (designer), and `/app/card/order-card` (printed order form). Correct the existing changelog note that says the builder moved to `/app/card`, then add a dated changelog entry when the feature is shipped.
- [ ] Add a deterministic demo journey titled `customer manages assigned cards` that proves a customer with no assigned cards gets the empty state and can reach ordering; a customer sees assigned unclaimed/archived cards without secrets; disable and lost actions change only the chosen card; an admin-lost unclaimed card allows page choice but not owner mark-lost; and owner reactivation requires a fresh admin code and claim.
- [ ] Add a public demo journey titled `lost card selection renders public page without profile data` that checks both lost-page choices and verifies neither response exposes profile or owner data.
- [ ] Run the focused journeys with `npm run test:e2e:demo -- e2e/customer.spec.ts --grep "customer manages assigned cards" --workers=1` and `npm run test:e2e:demo -- e2e/public-profile.spec.ts --grep "lost card selection renders public page without profile data" --workers=1`.
- [ ] Run `npm run verify` for the full repository gate (design rules, formatting, lint, typecheck, tests, and production build). Keep local verification on demo mode; do not run E2E or provisioning against Production.

## Acceptance coverage review

- Customer always sees `/app/card`, including an explicit empty state and order path: Tasks 5–6.
- All own assigned cards appear, including unclaimed and archived; no other profile or unassigned cards, no claim secrets: Tasks 2, 4–6.
- Disable and mark-lost require a current claim; lost-page preference can change on any assigned lost card: Tasks 2–6.
- Lost defaults to return instructions; inactive mode uses the neutral page without profile data: Tasks 3–6.
- Only owner-disabled cards can be owner-reactivated; admin provides a fresh code and the owner claims it: Tasks 4–6.
- Admin controls and fresh claim behavior remain intact; owner actions affect no siblings; audit and demo/Convex parity: Tasks 2–7.
- Route split, navigation, workspace gate, redirects, product requirements, and changelog: Tasks 6–7.

## Not included

- Customer card registration, assignment/reassignment, archive/restore, claim-code generation, or access to unassigned inventory.
- Automated reactivation code delivery, new notification channels, owner-specific return instructions, or new public card states.
- A migration/backfill for optional fields or a change to owner-feature eligibility rules.
