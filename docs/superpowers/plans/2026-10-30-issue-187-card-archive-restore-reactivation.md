# Card Archive, Restore, and Reactivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators archive inactive/replaced cards, restore them to their prior state, and reactivate them with a separate fresh claim-code flow, while allowing multiple active or claimable cards on one profile.

**Architecture:** Keep archived cards in the existing card record with optional `archivedAt`; archive and restore do not alter status, profile, token, or claim history. Add administrator- and scope-checked Convex mutations and mirror their transitions in local demo state. Extend both registry paths with Archived, Remove, Restore, and Reactivate controls; keep claim-code generation separate and preserve existing replacement semantics for the specific card being replaced.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Convex schema and mutations, browser-local demo store, Vitest + `convex-test`, Playwright local-demo E2E.

---

## File map

| File                                                           | Responsibility in this change                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `convex/schema.ts`                                             | Optional persisted `cards.archivedAt` timestamp.                                                                                                 |
| `convex/cards.ts`                                              | Include archive metadata in the admin list; add archive, restore, and reactivate mutations; allow multiple attach/assign operations per profile. |
| `convex/integration/card-archive-restore-reactivation.test.ts` | Authorization, transition, token, audit, sibling-card, and claim-code lifecycle integration coverage.                                            |
| `convex/integration/card-claiming.test.ts`                     | Regression coverage for multiple attached cards and fresh-code claim behavior after reactivation.                                                |
| `src/lib/domain/index.ts`                                      | Shared optional `CardRecord.archivedAt` type. Keep reactivation separate from generic assignment transitions.                                    |
| `src/lib/demo/fixtures.ts`                                     | Demo card type inherits the archive timestamp and continues to carry its claim state.                                                            |
| `src/lib/demo/store.ts`                                        | Validate an optional finite `archivedAt`; continue to load older records where the field is absent.                                              |
| `src/components/admin/CardsManager.tsx`                        | Archived filter/counts and lifecycle controls in both demo and Convex runtime paths; remove the second-card UI blocker.                          |
| `src/components/admin/AuditLog.tsx`                            | Human-readable archive, restore, and reactivate event names.                                                                                     |
| `tests/unit/demo-storage-store.test.ts`                        | Backward compatibility and timestamp validation for saved demo state.                                                                            |
| `e2e/admin.spec.ts`                                            | Admin lifecycle UI and local-demo state flow.                                                                                                    |
| `docs/spec.md`                                                 | Replace FR-028 and add explicit archive/reactivation/multi-card acceptance criteria.                                                             |
| `docs/plan.md`                                                 | Remove the obsolete blanket prohibition on reactivation.                                                                                         |
| `docs/CHANGELOG.md`                                            | Record the user-visible registry and reactivation behavior.                                                                                      |

The approved design is `docs/superpowers/specs/2026-10-30-issue-187-card-archive-restore-reactivation-design.md`. #195's acceptance criteria were expanded during design approval to allow multiple active/claimable cards and independent sibling state; preserve that decision while implementing this plan. #196's lost-card flow and #191's reassignment flow remain out of scope.

## Execution prerequisites

- [ ] Read `CODING_STANDARDS.md` and the approved design above.
- [ ] This worktree has `package-lock.json` but no `node_modules`; run `npm ci` before tests or code changes so the pinned Next.js guide is available.
- [ ] Before editing Convex code, read `convex/_generated/ai/guidelines.md`.
- [ ] Before editing Next.js code, inspect the relevant Next.js guide under `node_modules/next/dist/docs/` from this worktree. Follow its current client-component guidance.
- [ ] Keep `NEXT_PUBLIC_DEMO_MODE=true` for local work. Do not run E2E, seed, or repair commands against Production.

## Task 1: Add failing Convex lifecycle integration coverage

**Files:**

- Create: `convex/integration/card-archive-restore-reactivation.test.ts`

- [ ] **Step 1: Add a fixture for an admin, owner, profile, and inactive/replaced cards.** Reuse the identity and `convexTest` setup pattern in `convex/integration/card-claiming.test.ts`. Include one published profile and one draft/unpublished profile so both target statuses can be asserted.

- [ ] **Step 2: Add failing authorization and transition tests.** For each new mutation, assert that a customer and an admin from a different scope are rejected. Assert archive accepts only visible `inactive`/`replaced` cards, restore accepts only archived cards, and reactivate accepts only visible `inactive`/`replaced` cards with an active same-scope owner and an existing same-scope profile.

  Use explicit transition assertions such as:

  ```ts
  await expect(admin.mutation(api.cards.archive, { cardId })).resolves.toBeNull();
  await expect(admin.mutation(api.cards.archive, { cardId })).rejects.toThrow();
  await expect(admin.mutation(api.cards.restore, { cardId })).resolves.toBeNull();
  ```

- [ ] **Step 3: Add failing persistence, resolver, token-reservation, and audit assertions.** After archive, inspect the database record and assert that only `archivedAt` and `updatedAt` change; status, token, profile assignment, claim fields, and existing audit/challenge rows remain. Assert `cards.resolve` still reports `inactive`, registering the same token still rejects, restore clears `archivedAt`, and the restored resolver is still inactive. Assert the three distinct audit actions are written.

- [ ] **Step 4: Add failing reactivation and fresh-claim assertions.** For a published profile expect `active`; for an unpublished profile expect `claimable`. Seed an old code hash, claimed timestamp, and a pending challenge; after reactivation assert the claimed timestamp is cleared and the old code/challenge cannot be used. Before fresh-code generation, assert the card is already reactivated with its old claim state invalidated. Generate a new code through `api.cards.generateClaimCode`, then verify and complete it through the existing `api.cardClaims` flow.

- [ ] **Step 5: Run the focused integration test and confirm it fails on missing API/behavior.**

  Run: `npm test -- convex/integration/card-archive-restore-reactivation.test.ts`

  Expected: FAIL because archive/restore/reactivate are not implemented yet.

## Task 2: Add the archive field and implement Convex lifecycle mutations

**Files:**

- Modify: `convex/schema.ts`
- Modify: `convex/cards.ts`
- Test: `convex/integration/card-archive-restore-reactivation.test.ts`

- [ ] **Step 1: Add the optional schema field and list validator field.** Add `archivedAt: v.optional(v.number())` to the `cards` table in `convex/schema.ts` and the handwritten result object for `cards.adminList` in `convex/cards.ts`. The paginated result validator derives from the schema. Do not add an index or migration: cards remain listed and filtered in the admin client, and existing records omit the optional field.

- [ ] **Step 2: Implement archive.** Export `cards.archive` with `{ cardId: v.id("cards") }` arguments and `v.null()` return. Call `requireAdministrator`, enforce `sameScope`, and reject a card that is already archived or whose status is not `inactive`/`replaced`. Patch `archivedAt` and `updatedAt`; preserve every other card field. Insert `card.archived` with the card, profile, actor, timestamp, and before/after state.

- [ ] **Step 3: Implement restore.** Export `cards.restore` with the same argument and return validators. Require an archived card in the admin's scope. Clear `archivedAt`, update `updatedAt`, and leave status, assignment, claim fields, and token untouched. Insert a `card.restored` audit event.

- [ ] **Step 4: Implement reactivate as a separate validated transition.** Export `cards.reactivate`. Require an unarchived inactive/replaced card, same-scope profile and active same-scope owner. Choose `active` only when the profile is currently published and has valid published content; otherwise choose `claimable`, matching attachment's profile-state rule. Preserve token, profile, replacement history, and all sibling cards. Set `claimCodeInvalidatedAt` and `updatedAt`, clear `claimCodeClaimedAt`, and leave historical challenge rows and audit entries intact. Insert `card.reactivated` with the prior and new status.

- [ ] **Step 5: Run the focused Convex integration test and confirm it passes.**

  Run: `npm test -- convex/integration/card-archive-restore-reactivation.test.ts`

  Expected: PASS, including admin/scope checks, invalid transitions, retained token/status/history, resolver behavior, and stale/fresh claim behavior.

## Task 3: Allow multiple active/claimable cards per profile

**Files:**

- Modify: `convex/cards.ts`
- Modify: `convex/integration/card-claiming.test.ts`
- Test: `convex/integration/card-archive-restore-reactivation.test.ts`

- [ ] **Step 1: Add failing attach/assign tests.** For a published profile, register and `assign` two cards and assert both become active. For a draft profile, register and `attach` two cards and assert both become claimable. Assert each URL resolves according to that card's status, and attaching/reactivating one card leaves sibling token, status, and claim fields unchanged.

- [ ] **Step 2: Run the focused test to confirm the existing sibling-card rejection fails the new assertions.**

  Run: `npm test -- convex/integration/card-claiming.test.ts convex/integration/card-archive-restore-reactivation.test.ts`

  Expected: FAIL on the current `That profile already has an attached card.` checks.

- [ ] **Step 3: Remove only the one-active/claimable-card rejection from `cards.attach` and `cards.assign`.** Keep registered-card checks, administrator checks, owner/profile scope checks, profile validation, and audit writes. Do not change `cards.replace`'s explicit behavior: replacing a selected active card still marks that selected card `replaced`; unrelated sibling cards remain untouched.

- [ ] **Step 4: Run the focused tests again.**

  Run: `npm test -- convex/integration/card-claiming.test.ts convex/integration/card-archive-restore-reactivation.test.ts`

  Expected: PASS with multiple cards assigned to the same profile and independent sibling state.

- [ ] **Step 5: Commit the verified Convex milestone.**

  ```bash
  git add convex/schema.ts convex/cards.ts convex/integration/card-archive-restore-reactivation.test.ts convex/integration/card-claiming.test.ts
  git commit -m "feat(cards): add archive and reactivation mutations"
  ```

## Task 4: Add demo storage compatibility

**Files:**

- Modify: `src/lib/domain/index.ts`
- Modify: `src/lib/demo/fixtures.ts`
- Modify: `src/lib/demo/store.ts`
- Modify: `tests/unit/demo-storage-store.test.ts`

- [ ] **Step 1: Add storage tests before changing the card type.** Add one test that loads a saved card with `archivedAt: 123` and preserves it, one that accepts an older saved card without `archivedAt`, and one that treats an invalid JSON timestamp such as `archivedAt: "not-a-timestamp"` as malformed while preserving the raw saved bytes.

- [ ] **Step 2: Run the focused storage test and confirm the new-field case fails.**

  Run: `npm test -- tests/unit/demo-storage-store.test.ts`

  Expected: FAIL because the current demo-card validator does not validate `archivedAt`; the valid timestamp and legacy cases should already pass.

- [ ] **Step 3: Add `archivedAt?: number` to `CardRecord` and validate it in `isDemoCard`.** The exact validator clause is:

  ```ts
  value.archivedAt === undefined || isFiniteNumber(value.archivedAt);
  ```

  `DemoCard` inherits the field from `CardRecord`; do not add archive defaults to fixtures or rewrite old local storage records.

- [ ] **Step 4: Run the storage test and confirm all three cases pass.**

  Run: `npm test -- tests/unit/demo-storage-store.test.ts`

  Expected: PASS, including legacy records without `archivedAt`.

## Task 5: Add failing local-demo E2E coverage before UI changes

**Files:**

- Modify: `e2e/admin.spec.ts`
- Reference: `e2e/public-profile.spec.ts`
- Test: `e2e/admin.spec.ts`

- [ ] **Step 1: Add a failing E2E lifecycle scenario using the existing demo harness.** Use the `tapit:demo-state:v1` seeding pattern already present in `e2e/admin.spec.ts` to give one inactive and one replaced target a prior claim state, plus same-profile active/claimable siblings. Keep the seed deterministic; sign in with `signInAsAdmin(page)`. Include one case where the profile is published and reactivation yields `active`, and one where the profile is not published and reactivation yields `claimable`.

- [ ] **Step 2: Cover Remove, Archived, and Restore.** Assert Remove is absent for active/claimable cards and appears for both visible inactive and replaced cards. Confirm the archive dialog describes retained token/inactive URL, archive each row, and verify the normal registry count/results lose them while Archived shows them. Restore both and verify each original status returns and each `/c/<token>` still shows “This card is inactive”. Attempting to register an archived token must still show the duplicate-registration message.

- [ ] **Step 3: Cover Reactivate with independent siblings and claim state.** Keep one active and one claimable sibling on the same profile in the seeded case; assert their statuses, tokens, and public URLs are unchanged. Assert the old code is rejected during verification and Reactivate does not automatically generate a code. The Convex integration test from Task 1 must also prove a challenge created before Reactivate cannot be completed afterward.

- [ ] **Step 4: Use the existing Generate claim code flow after Reactivate.** Generate a fresh code, complete the demo owner claim using the existing flow referenced in `e2e/public-profile.spec.ts`, and assert the target is claimed while sibling claim state is unchanged. Verify the audit log shows archive, restore, reactivate, and the existing claim-code-generated label.

- [ ] **Step 5: Run the focused E2E and confirm it fails before UI changes.**

  Run: `npm run test:e2e:demo -- e2e/admin.spec.ts --grep "archive|restore|reactivate"`

  Expected: FAIL because the Archived filter and lifecycle controls are not implemented yet.

## Task 6: Build the Archived filter and actions in both registry paths

**Files:**

- Modify: `src/components/admin/CardsManager.tsx`
- Modify: `src/components/admin/AuditLog.tsx`

- [ ] **Step 1: Extend the card filter/count contract.** Add `archived` to `CardFilter`; include `archivedAt` in `CardGroupSource`; classify archived cards before status groups. `All`, `Unclaimed`, `Claimed`, and `Inactive` counts/results exclude archived rows, while `Archived` counts/results include only archived rows. Keep archived records in the Convex paginated result and local `state.cards` so token uniqueness remains intact.

- [ ] **Step 2: Wire the Convex path to the three mutations.** In `LiveCardsManager`, add mutation hooks for `api.cards.archive`, `api.cards.restore`, and `api.cards.reactivate`; use the existing `run()` helper for pending/success/error feedback. Show Remove beside Copy link only on visible inactive/replaced cards, Restore only in Archived, and Reactivate only on visible inactive/replaced cards. Remove the second-card warning and disabled assignment control so a registered card can be attached to a profile that already has active/claimable cards.

- [ ] **Step 3: Wire matching local-demo transitions.** Remove sets `archivedAt` and records `card.archived`; Restore clears only `archivedAt` and records `card.restored`; Reactivate preserves card/profile/token, uses the profile's current state to choose `active`/`claimable`, invalidates the prior code, clears the old claimed timestamp and pending demo challenge, and records `card.reactivated`. Remove the card ID from the owner's current `claimedCardIds` on reactivation so demo owner access mirrors Convex claim state; preserve all prior audit events.

- [ ] **Step 4: Add action confirmations and feedback.** Remove confirmation must explain that the token remains reserved and the URL stays inactive. Reactivate confirmation must explain that the URL may show the published profile again and the owner needs a new claim code. Restore is direct and must preserve the existing `inactive`/`replaced` status. On reactivation, clear any displayed in-memory old claim code so the existing Generate claim code action is offered separately.

- [ ] **Step 5: Add readable audit labels.** In `src/components/admin/AuditLog.tsx`, map `card.archived`, `card.restored`, and `card.reactivated` to “Card archived”, “Card restored”, and “Card reactivated”. Keep fresh code issuance under the existing `card.claim_code_generated` event.

- [ ] **Step 6: Re-run the E2E from Task 5 and confirm it passes.**

  Run: `npm run test:e2e:demo -- e2e/admin.spec.ts --grep "archive|restore|reactivate"`

  Expected: PASS for the local-demo registry behavior, counts, status preservation, sibling independence, and fresh-code claim flow. Playwright writes `test-results/e2e-results.json` and retains a trace on failure; the Convex path is covered by the integration tests.

- [ ] **Step 7: Commit the verified registry milestone.**

  ```bash
  git add src/lib/domain/index.ts src/lib/demo/fixtures.ts src/lib/demo/store.ts src/components/admin/CardsManager.tsx src/components/admin/AuditLog.tsx tests/unit/demo-storage-store.test.ts e2e/admin.spec.ts
  git commit -m "feat(cards): add archive and reactivation controls"
  ```

## Task 7: Update product requirements and user-visible documentation

**Files:**

- Modify: `docs/spec.md`
- Modify: `docs/plan.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Replace FR-028.** State that administrators may reactivate visible inactive/replaced cards assigned to an eligible profile; reactivation preserves token/profile, selects active versus claimable from profile state, invalidates prior claim state, and requires a separate fresh one-time code.

- [ ] **Step 2: Add explicit requirements and acceptance criteria.** Add these requirements after FR-064:

  ```md
  - **FR-065:** Administrators shall archive inactive or replaced cards without deleting their record, token, assignment, claim history, or audit history; restoring shall clear only the archive timestamp.
  - **FR-066:** A profile may have multiple active or claimable cards, and changing one card shall not change the status, URL, or claim history of its siblings.
  ```

  Add these acceptance criteria after AC-051:

  ```md
  - **AC-052:** Given an administrator archives an inactive or replaced card, when they open Archived and restore it, then the token and history remain reserved, the prior status returns, and the URL remains inactive.
  - **AC-053:** Given an administrator reactivates a visible inactive or replaced card, when reactivation succeeds, then its status follows the current profile state, old claim state is invalidated, and a separate fresh one-time code can be generated and claimed.
  - **AC-054:** Given multiple active or claimable cards are assigned to one profile, when an administrator reactivates one card, then every sibling card keeps its own status, URL behavior, and claim state.
  ```

  Keep the existing inactive/replaced visitor behavior unchanged.

- [ ] **Step 3: Reconcile `docs/plan.md`.** Replace the line-236 blanket “reactivation of retired cards” prohibition with the approved eligibility and claim-reset rule. Replace the line-589 blanket prohibition on reactivation/reassignment with a rule that prevents reassignment of inactive/replaced cards while permitting the dedicated admin reactivation transition. Do not change visitor-facing no-reactivation guidance in `docs/DESIGN.md` if it remains scoped to visitors.

- [ ] **Step 4: Add a dated `docs/CHANGELOG.md` entry** describing the Archived view, reversible archive/restore, reactivation, separate claim-code generation, and support for multiple cards per profile. Keep older entries as historical release notes.

## Task 8: Run focused regression and repository verification

**Files:**

- Verify: all files above

- [ ] **Step 1: Run focused storage and Convex tests.**

  Run: `npm test -- tests/unit/demo-storage-store.test.ts convex/integration/card-archive-restore-reactivation.test.ts convex/integration/card-claiming.test.ts`

  Expected: PASS.

- [ ] **Step 2: Run focused admin local-demo E2E.**

  Run: `npm run test:e2e:demo -- e2e/admin.spec.ts --grep "archive|restore|reactivate|registers, assigns, replaces"`

  Expected: PASS against the deterministic local demo on the configured non-production local server.

- [ ] **Step 3: Run repository verification.**

  Run: `npm run verify`

  Expected: design check, format check, lint, typecheck, all unit/Convex tests, and build pass. Fix any failures in the changed paths, then repeat the failing command and `npm run verify`.

- [ ] **Step 4: Review the final diff against the approved spec.** Confirm no card record, token, old audit event, or historical Convex claim-challenge row is deleted; only the Reactivated card's current claim state changes; every registry filter/count excludes archived cards except Archived; and no Production deployment or data was touched.
