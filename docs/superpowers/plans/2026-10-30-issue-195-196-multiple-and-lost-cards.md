# Issues #195 and #196: Multiple Cards and Lost Card Return Flow Implementation Plan

> **For agentic workers:** Use subagent-driven-development or executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a profile use independent cards and give a lost card a private-data-free return page at its existing URL.

**Architecture:** Keep card state and assignment transitions in the existing Convex and deterministic demo paths. Adding a replacement creates a separate unclaimed card while leaving its predecessor unchanged. A lost status blocks public resolution; only the lost resolver result carries the return instructions or generic support fallback. Recovery uses fresh-claim behavior for assigned cards and returns unassigned cards to registered with old codes invalidated.

**Tech Stack:** Next.js 16 client components, React 19, Convex 1.45, browser-local demo state, Vitest/convex-test, Playwright.

**Design reference:** `docs/superpowers/specs/2026-10-30-issue-195-196-multiple-and-lost-cards-spec.md`.

---

## File map

- `convex/schema.ts`, `convex/validators.ts`, `src/lib/domain/index.ts`, `src/lib/demo/fixtures.ts`, and `src/lib/demo/store.ts` — add `lost` to the card contract and persisted demo validation.
- `convex/cards.ts` — keep replacement creation independent; add mark-lost and lost-card recovery behavior; return a narrowly scoped lost result from the public resolver.
- `convex/settings.ts`, `src/components/admin/SettingsManager.tsx`, and `src/lib/demo/fixtures.ts` — save scoped plain-text return instructions and use `mailto:officialntap.it@gmail.com` as the default site-wide support destination.
- `src/components/admin/CardsManager.tsx` and `src/components/admin/AuditLog.tsx` — use **Add replacement**, communicate that the old card stays active, add mark-lost/recovery controls, and show readable audit actions in both runtimes.
- `src/components/profile/CardResolverClient.tsx` and `src/components/state/StatePage.tsx` — show the dedicated lost-card page, avoid profile queries for lost cards, and use return instructions, configured support, or neutral fallback in that order.
- `convex/integration/remaining-operations.test.ts`, `convex/integration/card-claiming.test.ts`, `convex/integration/card-archive-restore-reactivation.test.ts`, and a focused `convex/integration/lost-cards.test.ts` — prove replacement, independent claims, lost, recovery, scope, correction, audit, and privacy rules.
- `tests/unit/cards-manager.test.tsx`, `tests/unit/demo-storage-store.test.ts`, `tests/unit/demo-card-setup.test.ts`, `tests/unit/demo-card-owner-access-override.test.ts`, `tests/unit/settings-manager.test.tsx`, and `tests/unit/public-hydration.test.ts` — prove demo persistence, independent claims, settings behavior, parity, sibling independence, and no profile lookup/render for lost cards.
- `e2e/admin.spec.ts` and `.agents/skills/verify-tapit/features/admin-cards.md` — document and drive the admin and public local-demo journey.
- `docs/spec.md` and `docs/CHANGELOG.md` — update product requirements and user-facing change notes.

## Sequencing

- Before Convex edits, reread `convex/_generated/ai/guidelines.md`; before code edits, reread `CODING_STANDARDS.md` and preserve unrelated changes.
- Add the `lost` validator before Convex mutations, then run `npx convex codegen`; do not hand-edit generated files.
- Preserve the existing one-unassigned-card buyer-claim guard. This work changes admin assignment/replacement and lost-card recovery only.
- Keep mark-lost and recovery checks in the server mutation as well as the UI. In particular, reject cards with an open correction request, and do not permit recovery of archived cards until restored.
- No database backfill is required: `lostCardReturnInstructions` is optional and existing card records retain their current statuses.

## Task 1: Extend the shared card status contract

**Files:**

- Modify: `convex/schema.ts`
- Modify: `convex/validators.ts`
- Modify: `src/lib/domain/index.ts`
- Modify: `src/lib/demo/store.ts`
- Test: `tests/unit/demo-storage-store.test.ts`

- [ ] Add `lost` to the schema and `cardStatusValidator` unions, `CardStatus`, and the demo persisted-card status allowlist. Keep existing stored records valid and do not change the storage version.

```ts
export type CardStatus = "registered" | "claimable" | "active" | "inactive" | "replaced" | "lost";
```

- [ ] Add a focused persisted-state assertion in `tests/unit/demo-storage-store.test.ts` that a card with `status: "lost"` hydrates as supported and remains unchanged; add a negative assertion that an unknown status remains rejected.
- [ ] Run `npm test -- tests/unit/demo-storage-store.test.ts` and confirm the status-contract cases pass. Do not change generated Convex files manually.

## Task 2: Make “Add replacement” independent in Convex

**Files:**

- Modify: `convex/cards.ts`
- Modify: `convex/integration/card-claiming.test.ts`
- Modify: `convex/integration/remaining-operations.test.ts`
- Modify: `src/components/admin/AuditLog.tsx`

- [ ] Update the existing replacement integration case to assert that the original card remains active with the same ID, token, URL, assignment, and claim timestamp after a new replacement record is created. Assert the new card has the same profile assignment but no copied claim timestamp or code hash and resolves to the claim flow until its own claim completes.
- [ ] Change `cards.replace` to insert a new active card without copying `claimCodeClaimedAt`; remove the patch that marks the old card replaced. Keep duplicate URL/token validation and the correction-request guard. Record a truthful `card.replacement_added` audit entry for the new card, with no claim data.
- [ ] Add a Convex claim test with two cards assigned to one profile: claiming one changes only that card's claim state and access contribution, while the sibling remains unchanged. Retain the existing rejection for a second unassigned card claimed during recipient setup.
- [ ] Keep the existing profile-publication behavior for all attached claimable cards; add a regression assertion that a lost card is not returned to active/claimable by a later profile publication.

```ts
const newCardId = await ctx.db.insert("cards", {
  scope: oldCard.scope,
  cardUrl: args.newCardUrl,
  token: args.newToken,
  profileId: oldCard.profileId,
  status: "active",
  assignmentReason: "replacement",
  createdAt: now,
  updatedAt: now,
  assignedAt: now,
});
// Do not patch oldCard: its state and URL remain independently usable.
```

- [ ] Add `card.replacement_added` to the readable audit labels. Regenerate API types with `npx convex codegen` and run `npm test -- convex/integration/remaining-operations.test.ts`.

## Task 3: Mirror replacement behavior in local demo and both admin views

**Files:**

- Modify: `src/components/admin/CardsManager.tsx`
- Modify: `tests/unit/cards-manager.test.tsx`
- Modify: `tests/unit/demo-card-setup.test.ts`
- Modify: `e2e/admin.spec.ts`

- [ ] Change the demo replacement assertion: the old card remains active and retains claim state; the new card is independent and has no claim state. Keep stale-storage and correction-pending rejection coverage.
- [ ] Add a demo claim test with two admin-assigned cards on one profile. Claim one and assert the sibling status, token, URL, claim marker, and owner's existing card IDs do not change. Keep the second-unassigned-card buyer guard unchanged.
- [ ] In both demo and live UI paths, rename the action, confirmation title, and confirmation button to **Add replacement**. The confirmation says the existing card stays active and that the new card needs its own claim. Update success copy and avoid describing the old URL as inactive.
- [ ] In `replaceCard`, add only the new unclaimed card and its `card.replacement_added` audit event. Do not transition or otherwise modify the original card. Keep URL uniqueness checks and the correction-pending recheck inside the state update.
- [ ] Update the existing local-demo Playwright replacement journey to assert both URLs still resolve as expected: the old URL still serves the profile, while the new card enters its own claim flow. Assert the UI says **Add replacement** and the audit log describes adding it.
- [ ] Run `npm test -- tests/unit/cards-manager.test.tsx` and, during implementation verification, run the focused Playwright journey from `e2e/admin.spec.ts` through `npm run test:e2e:demo -- --grep "administrator registers cards, adds replacements, marks cards lost, and audits card actions" --workers=1`.

## Task 4: Add Convex lost-card transitions and recovery

**Files:**

- Modify: `convex/cards.ts`
- Modify: `convex/integration/card-claiming.test.ts`
- Modify: `convex/integration/card-archive-restore-reactivation.test.ts`
- Test: `convex/integration/lost-cards.test.ts`

- [ ] Add focused cases for marking registered, claimable, active, inactive, and replaced cards lost. For each case, assert only the selected card changes status, its token/URL/assignment/claim history remain, and an audit row records actor, event time, and before/after status.
- [ ] For a claimed active card, assert `api.admin.currentAccess` remains available after it is marked lost; losing the public route does not erase card-derived owner access.
- [ ] Assert unauthenticated/non-admin and cross-scope calls fail; an already-lost card fails; a card with `correctionRequestedAt` fails unchanged; and an archived card retains `archivedAt` when marked lost.
- [ ] Resolve a pending correction request and assert it does not implicitly mark the card lost; the administrator must still perform a separate status action.
- [ ] Add a `markLost` admin mutation. It accepts any in-scope card not already lost, rejects an open correction request, patches only `status` and `updatedAt`, and records `card.marked_lost`. Claim mutations continue to reject it through their existing eligible-status checks.
- [ ] Extend `cards.reactivate` to accept visible lost cards and return `registered` in its status union for unassigned recovery. An assigned lost card follows the existing active/claimable validation and fresh-claim invalidation path. An unassigned lost card returns to `registered`, sets `claimCodeInvalidatedAt`, clears claim completion, and requires later assignment plus a newly generated code. Reject recovery while `archivedAt` is set. Preserve the existing inactive/replaced reactivation behavior.
- [ ] Record recovery audit events for assigned and unassigned cards, including administrator and timestamp. Test recovery of an assigned card with a stale code/challenge and a fresh successful claim. Test recovery of an unassigned card and prove its former code remains unusable after assignment. Test that restoring an archived lost card leaves status `lost` until the explicit recovery action.
- [ ] Run `npx convex codegen`, then `npm test -- convex/integration/lost-cards.test.ts convex/integration/card-claiming.test.ts convex/integration/card-archive-restore-reactivation.test.ts`.

## Task 5: Mirror lost status and recovery in local demo

**Files:**

- Modify: `src/lib/domain/index.ts`
- Modify: `src/lib/demo/fixtures.ts`
- Modify: `src/lib/demo/store.ts`
- Modify: `src/components/admin/CardsManager.tsx`
- Test: `tests/unit/cards-manager.test.tsx`
- Test: `tests/unit/demo-card-owner-access-override.test.ts`

- [ ] Allow transitions from each non-lost status to `lost`; do not allow a second transition from `lost`. Ensure status-only loss does not remove a claimed card ID from the owner's access set.
- [ ] Add demo actions matching Convex: mark any non-lost card lost unless correction-pending; preserve archive timestamp and claims; recover an assigned card into active/claimable with old claim state cleared; recover an unassigned card into registered with its old code and pending challenge invalidated.
- [ ] In both `LiveCardsManager` and `DemoCardsManager`, show **Reactivate** for an unarchived assigned lost card. Confirm that the old claim is invalidated and a fresh code and claim are required. For an unassigned lost card, show **Recover**; confirm it returns to registered and needs assignment plus a new code. An archived lost card must be restored before either recovery action appears.
- [ ] In both admin views, include `lost` in visible status text, the All list, and registry search. A separate Lost filter is not required. Show Mark lost for any non-lost record, including archived records; disable it while a correction is pending. The confirmation names the card and explains that its URL will show the return page.
- [ ] Add matching `card.marked_lost` and recovery audit events. Recheck the latest demo state inside each `updateDemoState` callback so a newly pending correction or archived status prevents the transition without partial changes.
- [ ] Add assertions for siblings, owner access via the lost card, owner access via another claimed card or override, correction race rejection, archived recovery blocking, and the unassigned fresh-code recovery path.
- [ ] Run `npm test -- tests/unit/cards-manager.test.tsx tests/unit/demo-card-owner-access-override.test.ts`.

## Task 6: Store and edit return instructions

**Files:**

- Modify: `convex/settings.ts`
- Modify: `src/lib/demo/fixtures.ts`
- Modify: `src/lib/demo/store.ts`
- Modify: `src/components/admin/SettingsManager.tsx`
- Test: `convex/integration/remaining-operations.test.ts`
- Create: `tests/unit/settings-manager.test.tsx`

- [ ] Add optional `lostCardReturnInstructions` to demo state and validate it as a string when present. Empty or whitespace-only text means no dedicated instructions.
- [ ] Change the default site-wide support destination in `convex/settings.ts` and the local demo fixture from `mailto:support@example.test` to `mailto:officialntap.it@gmail.com`. Keep an administrator-saved support destination as the override. This contact also remains the generic support destination for existing support links.
- [ ] Add admin-only Convex read/write operations using a distinct scoped settings key. Trim on save, store plain text, record before/after and actor in the existing audit log, and reject writes from non-admin or other scopes.
- [ ] Add a textarea under Admin Settings in local demo and live mode. Explain that anyone scanning a lost card can read it. Save and audit with parity across both modes.
- [ ] Add a `SettingsManager` unit case that saves and clears return instructions; add matching demo coverage. Assert scope isolation, authorization, trimming, support-default behavior, and audit details in Convex. Run `npm test -- convex/integration/remaining-operations.test.ts tests/unit/settings-manager.test.tsx`.

## Task 7: Add the private-data-free lost resolver result and page

**Files:**

- Modify: `convex/cards.ts`
- Modify: `src/components/profile/CardResolverClient.tsx`
- Modify: `src/components/state/StatePage.tsx`
- Test: `convex/integration/lost-cards.test.ts`
- Test: `tests/unit/public-hydration.test.ts`
- Test: `tests/unit/public-profile-path-parity.test.tsx`

- [ ] Extend the resolver validator with a `lost` result containing only optional return instructions and optional generic support URL. For a lost card, look up only card-scoped instructions and the site-wide support destination, defaulting to `mailto:officialntap.it@gmail.com`. Include support URL only when instructions are empty. Do not load profile, owner, or published content. For every other status, return neither setting.
- [ ] In live `CardResolverClient`, render the dedicated lost page and call `profiles.mine` only when the resolver result is `active`; this skips the query during loading and for lost cards. In demo resolution, branch on lost status before looking up the assigned profile.
- [ ] Render the fixed finder message. Show plain-text return instructions when non-empty; otherwise link to the site-wide support destination; if it is unavailable, ask the finder to return the card to its issuing organization. Never render instruction text as HTML.
- [ ] Assert the lost result does not contain profile-shaped fields and that a lost public page contains no owner/profile data. Cover all three content choices: instructions, support fallback, neutral fallback. Assert a normal card result exposes neither setting.
- [ ] Keep the existing QR control test for a `lost` card and assert its output encodes the unchanged stored permanent URL.
- [ ] Run `npm test -- convex/integration/lost-cards.test.ts tests/unit/public-hydration.test.ts tests/unit/public-profile-path-parity.test.tsx`.

## Task 8: Update product requirements, E2E guide, and final validation

**Files:**

- Modify: `docs/spec.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `e2e/admin.spec.ts`
- Modify: `.agents/skills/verify-tapit/features/admin-cards.md`

- [ ] Replace the follow-up note in FR-076 with the approved lost-card requirements. Clarify FR-078 with the **Add replacement** behavior and add acceptance criteria for lost resolution/privacy, settings fallback, correction blocking, archived recovery, and fresh-claim recovery. Keep existing issue #190 buyer setup rules and the one-unassigned-card guard unchanged.
- [ ] Add a dated changelog entry for independent **Add replacement** behavior and the lost-card return flow.
- [ ] Add a deterministic local-demo browser journey that configures instructions, marks a selected assigned card lost, verifies the public return page has no profile data, verifies a sibling card still serves the profile, and recovers the lost card through a fresh claim. Cover the unassigned recovery path in integration/unit tests.
- [ ] Update the `verify-tapit` admin-cards instructions so they describe **Add replacement**, the unchanged old card, lost-card controls, and their focused proof command.
- [ ] Run `npm run typecheck`, `npm run design:check`, `npm test -- --run`, and the focused `verify-tapit` local-demo journeys for admin cards and public card resolution. Do not run E2E against Production.

## Spec coverage review

- #195 multiple assignment and sibling independence: Tasks 2–3 and 8.
- #195 replacement remains independent and requires its own claim: Tasks 2–3 and 8.
- #196 status, audit, open-correction block, archived handling, and both recovery paths: Tasks 4–5 and 8.
- #196 public privacy and support/instructions/neutral fallback: Tasks 6–7 and 8.
- Permanent URL and QR behavior: Tasks 2, 4, and 7; the lost status does not rewrite the stored URL.
- Existing customer setup guard, claim invalidation ordering, owner access, scoped settings, and local-demo/Convex parity: Tasks 4–7.
- Product documentation and browser proof: Task 8.

## Not included

- No `found` status, per-card contact destination, finder form, owner notification, or card-token rotation.
- No database migration or generated file hand edits.
- No change to customer-submitted correction behavior or buyer setup limits.
