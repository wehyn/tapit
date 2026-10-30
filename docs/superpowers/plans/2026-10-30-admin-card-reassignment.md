# Admin Card Reassignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task by task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Let administrators reassign an active or claimable card to the correct profile while preserving its card record, token, URL, and status, revoking claim-derived access from the former profile owner, and requiring a fresh claim by the destination owner.

**Architecture:** Add a dedicated cards.reassign Convex mutation; the initial-attachment mutation remains unchanged. In one Convex transaction, validate the expected assignment and status, move the profile reference, clear old claim state, and write an audit record. Mirror that transition in the deterministic local demo, including removal of the card ID from the former owner's claimedCardIds. Add a per-card reassignment control and explicit old/new-profile confirmation to both /admin/cards implementations.

**Tech Stack:** Next.js 16 App Router, React 19, Convex 1.45, browser-local demo storage, Vitest/convex-test, Playwright.

---

## File map

- convex/cards.ts — add the admin-only reassign mutation. No schema change is needed: cards already store assignment and claim state, claim challenges are indexed by card, and audit rows have before/after fields.
- src/components/admin/CardsManager.tsx — add a destination selector, reassignment confirmation, and execution path to both DemoCardsManager and LiveCardsManager. Keep the existing initial-assignment restrictions for registered cards.
- src/components/admin/AuditLog.tsx — give card.reassigned a readable action label.
- convex/integration/card-claiming.test.ts — cover completed-claim revocation, pending-challenge invalidation, fresh claim, authorization, status checks, target profiles with another card, and the audit event.
- tests/unit/cards-manager.test.tsx — cover live and local-demo confirmation and mutation/state transitions.
- tests/unit/demo-card-owner-access-override.test.ts — protect the local-demo behavior for other claimed cards and the independent owner-access override.
- e2e/admin.spec.ts — add a local-demo admin journey that checks confirmation, preserved public URL, and the new audit entry.
- .agents/skills/verify-tapit/features/admin-cards.md — document the new journey and proof command.
- docs/spec.md — add the admin card-correction workflow and next functional requirement, FR-079.
- docs/CHANGELOG.md — add the user-visible behavior under the implementation date.

src/lib/demo/fixtures.ts already defines claim, challenge, and claimed-card fields on DemoCard and DemoCustomer. Keep those types and the Convex schema unchanged.

## Sequencing and ownership

- Complete the Convex mutation and its claim-state tests before changing either UI path. Claim invalidation and reassignment must remain atomic.
- Keep local-demo state changes in one updateDemoState call. Do not add the transferred card to the destination owner's claimedCardIds; only successful fresh claim completion does that.
- Keep reassignment eligibility separate from initial assignment. A destination with an existing active or claimable card is allowed for reassignment; the existing registered-card attachment rule stays unchanged pending issue #195.
- Do not modify generated Convex files by hand. Run npx convex codegen after adding the mutation and include generated changes only if codegen produces them.

## Task 1: Add failing Convex reassignment coverage

**Files:**

- Modify: convex/integration/card-claiming.test.ts

- [ ] **Step 1: Read the required guidance and inspect the clean worktree**

Run git status --short --branch and keep the worktree free of unrelated edits. Read CODING_STANDARDS.md and convex/_generated/ai/guidelines.md before editing Convex code. The claim-state change must preserve the invariant checked by scripts/verify-card-claim-model.mjs: a code invalidated before completion cannot claim the card.

- [ ] **Step 2: Add a completed-claim reassignment test**

In card-claiming.test.ts, seed an active administrator, a former owner with a published profile, a destination owner with a published profile, one card assigned to the former owner's profile, and one additional unclaimed active or claimable card assigned to the destination profile. Claim the first card through generateClaimCode, verifyCode, and complete before reassignment. Confirm api.admin.currentAccess reports card-owner features for the former owner before the change.

Call the new mutation with the card's expected source assignment and status:

```ts
await admin.mutation(api.cards.reassign, {
  cardId: ids.cardId,
  expectedProfileId: ids.formerProfileId,
  expectedStatus: "active",
  profileId: ids.destinationProfileId,
});
```

Assert the same card ID, token, URL, and active status remain; profileId now identifies the destination; the old claimCodeHash and claimCodeClaimedAt are absent; the former owner's currentAccess.hasCardOwnerFeatures is false; and the destination owner's access remains false until a fresh claim completes. Assert the destination may already have another card. Inspect the inserted card.reassigned audit row for the admin actor, card ID, and both old/new profile IDs in before/after; assert it contains no claim code.

- [ ] **Step 3: Add a pending-challenge reassignment test**

Seed a claimable card and two active customer owners with profiles. Generate a code, verify it as the former owner to create a pending challenge, then reassign the card. Assert the old code returns { ok: false } and completing the old challenge rejects. Generate a fresh code after reassignment and complete a claim as the destination owner; assert currentAccess.hasCardOwnerFeatures becomes true only after completion.

- [ ] **Step 4: Add rejection cases**

Assert a customer cannot call api.cards.reassign. Assert reassignment rejects inactive and replaced cards and rejects an expected source profile/status that no longer matches. After every rejected call, assert the saved profile assignment, status, and claim marker remain unchanged.

- [ ] **Step 5: Run the focused test and observe the missing mutation failure**

Run:

```bash
npm test -- convex/integration/card-claiming.test.ts
```

Expected: the new cases fail because api.cards.reassign is not implemented; existing card-claiming cases remain unchanged.

## Task 2: Implement the atomic Convex reassignment mutation

**Files:**

- Modify: convex/cards.ts
- Test: convex/integration/card-claiming.test.ts

- [ ] **Step 1: Add the dedicated mutation**

Export reassign with arguments cardId, expectedProfileId, expectedStatus (active or claimable), and destination profileId. Require requireAdministrator; load the card, both profiles, and the destination owner; check the admin's scope against each record; require the card to have the expected source profile and expected eligible status; require the destination profile and owner to pass the existing assignment scope and active-account rules. For a published destination, retain the existing published-content validation. Reject assigning the card to its current profile. Do not use the registered-only attach/assign mutations and do not run the one-card-per-profile query.

- [ ] **Step 2: Preserve identity and reset claim state in the same mutation**

Patch the existing card without changing its ID, token, URL, or eligible status. Update its profile assignment and timestamps. Invalidate its previous code and completed claim in that same patch:

```ts
await ctx.db.patch(card._id, {
  profileId: destination._id,
  assignedAt: now,
  updatedAt: now,
  claimCodeHash: undefined,
  claimCodeGeneratedAt: undefined,
  claimCodeExpiresAt: undefined,
  claimCodeInvalidatedAt: now,
  claimCodeClaimedAt: undefined,
});
```

Changing the card's claim hash/state makes every pending challenge for the old code unusable when cardClaims.complete checks the current card. Keep the assignment patch, access-revoking claim reset, and card.reassigned audit insert inside this one Convex mutation so any failure rolls all three back. Record the old and new profile names/IDs in audit before and after; never put a code or hash in the audit row.

- [ ] **Step 3: Regenerate API types and rerun the new cases**

Run:

```bash
npx convex codegen
npm test -- convex/integration/card-claiming.test.ts
```

Expected: codegen completes; the pending old challenge fails after reassignment; the fresh destination claim succeeds; prior owner access is removed; the new owner does not receive access before claiming; and all existing claim-flow assertions pass.

- [ ] **Step 4: Run the claim transition model**

Run:

```bash
node scripts/verify-card-claim-model.mjs
```

Expected: every explored sequence preserves single-use completion and invalidation-before-completion. If the model reports a counterexample, fix the mutation ordering and add the sequence to the integration coverage before proceeding.

- [ ] **Step 5: Commit the backend slice**

```bash
git add convex/cards.ts convex/integration/card-claiming.test.ts convex/_generated
git commit -m "feat(cards): add admin reassignment mutation"
```

## Task 3: Add local-demo reassignment UI and state transition

**Files:**

- Modify: src/components/admin/CardsManager.tsx
- Test: tests/unit/cards-manager.test.tsx
- Test: tests/unit/demo-card-owner-access-override.test.ts

- [ ] **Step 1: Add failing local-demo reassignment tests**

Use the deterministic mara-card-7f2q fixture and profile-claimable as a destination that already has a claimable card. In the local-demo manager, select the active card, choose the destination profile, and open the confirmation. Assert the dialog names the current and destination profiles, says a fresh claim is required, and confirms the card URL stays the same.

After confirmation, read the demo state and assert the original card ID, token, URL, and active status remain; its profileId is now profile-claimable; its claimedAt, claim code, and pending challenge fields are cleared; and customer-mara.claimedCardIds no longer includes this card ID. Keep any other IDs and cardOwnerAccessOverride unchanged. Assert the destination owner's claimed-card IDs do not include the reassigned card before that owner claims it. Also assert the control is available for claimable cards and absent for inactive/replaced cards.

Use these assertions against the state returned by getDemoState:

```ts
expect(reassignedCard).toMatchObject({
  id: "card-mara-active",
  token: "mara-card-7f2q",
  cardUrl: "/c/mara-card-7f2q",
  status: "active",
  profileId: "profile-claimable",
});
expect(reassignedCard).not.toHaveProperty("claimedAt");
expect(reassignedCard).not.toHaveProperty("claimChallenge");
expect(
  resolveDemoSessionAccess(after, { email: "mara@example.test", role: "customer" }),
).toMatchObject({
  kind: "active",
  hasCardOwnerFeatures: false,
});
```

- [ ] **Step 2: Add stale-challenge and independent-access assertions**

Use the claimable-card-demo fixture with a pending challenge, reassign it, and assert the old code/challenge cannot complete and the card remains claimable. Add session-access assertions through resolveDemoSessionAccess showing that the former owner loses access from the moved card, while access from another claimed card or cardOwnerAccessOverride remains effective.

- [ ] **Step 3: Run the local-demo tests and observe the missing-control failure**

Run:

```bash
npm test -- tests/unit/cards-manager.test.tsx tests/unit/demo-card-owner-access-override.test.ts
```

Expected: the new UI case fails because an active card has no reassignment control.

- [ ] **Step 4: Add the local-demo selector, confirmation, and state update**

In DemoCardsManager, add a destination selector scoped to the selected card and show Reassign card only when it has a profile and is active or claimable. Capture the expected source profile/status and both profile labels when confirmation opens. Extend the existing ConfirmDialog and confirmAction branch so the administrator sees the old and destination profiles, the retained URL, and the fresh-claim requirement.

Add a reassignDemoCard action. Re-read the card and destination immediately before updating. If the card or destination is missing, or the source/status changed, return the current state unchanged and show a review-again error. Otherwise update the card and remove only its ID from the former owner's claimedCardIds in the same updateDemoState call:

```ts
cards: current.cards.map((candidate) =>
  candidate.id === card.id
    ? {
        ...candidate,
        profileId: destination.id,
        claimCode: undefined,
        claimCodeExpiresAt: undefined,
        claimCodeInvalidatedAt: Date.now(),
        claimChallenge: undefined,
        claimChallengeExpiresAt: undefined,
        claimedAt: undefined,
      }
    : candidate,
),
customers: current.customers.map((customer) =>
  customer.id === formerProfile.ownerId
    ? {
        ...customer,
        claimedCardIds: (customer.claimedCardIds ?? []).filter((id) => id !== card.id),
      }
    : customer,
),
```

Keep the card's ID, token, cardUrl, and status. Add one card.reassigned audit entry with the current admin actor, card token, old and new profile labels/IDs, and timestamp. Preserve every unrelated card, challenge, customer field, and separate access override. Do not use transitionCard, which does not support same-status profile reassignment.

- [ ] **Step 5: Rerun the focused demo tests**

Run:

```bash
npm test -- tests/unit/cards-manager.test.tsx tests/unit/demo-card-owner-access-override.test.ts
```

Expected: local-demo manager tests pass; the old owner loses access only through the moved card; other-card and override access continue to work; and stale codes/challenges cannot complete.

## Task 4: Add reassignment UI to the live admin card manager

**Files:**

- Modify: src/components/admin/CardsManager.tsx
- Test: tests/unit/cards-manager.test.tsx

- [ ] **Step 1: Read the version-matched Next.js client-component guide**

If node_modules is absent, install locked dependencies with npm ci. Find and read the Client Components guide under node_modules/next/dist/docs/ before editing CardsManager.tsx, as required by AGENTS.md. Keep the existing use-client boundary and existing React event/state conventions.

- [ ] **Step 2: Add a focused live-mode UI test**

Extend the existing query/mutation stubs in cards-manager.test.tsx with api.cards.reassign. Render one active card assigned to profile A and profile B with an existing claimable card. Select B in the reassignment control and assert the confirmation shows both profiles and the unchanged token/URL. Confirm and assert the mutation receives the captured source profile/status and destination profile. Assert selecting a destination with an existing card is permitted in the reassignment flow.

The final mutation assertion must use the current card/profile identifiers from the fixture:

```ts
await waitFor(() =>
  expect(mutationHandlers.reassign).toHaveBeenCalledWith({
    cardId: "cards:active-card",
    expectedProfileId: "profiles:source",
    expectedStatus: "active",
    profileId: "profiles:destination",
  }),
);
```

- [ ] **Step 3: Run the focused live-mode test and observe the missing-control failure**

Run:

```bash
npm test -- tests/unit/cards-manager.test.tsx
```

Expected: the new live-mode reassignment case fails because active/claimable cards have no reassignment control.

- [ ] **Step 4: Add live-mode destination selection and stale-confirmation state**

Add live reassignment state containing the card ID/token, expected source profile ID, expected status, destination profile ID, and display names/slugs for both profiles. Show the action only when the selected card has a profile and status active or claimable. Exclude its current profile from destinations. Keep the existing registered-card attachment path and its one-card warning unchanged.

Use this eligibility check in LiveCardsManager:

```ts
const canReassign =
  card.profileId !== undefined && (card.status === "active" || card.status === "claimable");
```

Render the selected card action as:

```tsx
{
  canReassign ? (
    <Button onClick={() => openReassignment(card)} type="button" variant="secondary">
      Reassign card
    </Button>
  ) : null;
}
```

The confirmation must show current and destination profiles, state that the same card URL is retained, and state that old claim state is cleared and a fresh code is required. On confirmation, send the expected source/status to api.cards.reassign so the mutation rejects stale dialogs. Leave replacement, deactivation, and registered-card attachment controls unchanged.

- [ ] **Step 5: Wire live mutation results and fresh-code feedback**

Add useMutation(api.cards.reassign) to LiveCardsManager and call it through the existing run helper. On success, clear the confirmation and show that the card is assigned to the new profile and that an administrator can generate/share a fresh claim code with its owner. On failure, keep the card unchanged, retain the selected detail, and show the mutation error.

- [ ] **Step 6: Add the readable audit action**

In src/components/admin/AuditLog.tsx, map card.reassigned to Card reassigned to profile. Keep the old/new assignment visible from the event's before/after values. Do not add claim code or hash data to the audit display.

- [ ] **Step 7: Run the focused manager tests and static checks**

Run:

```bash
npm test -- tests/unit/cards-manager.test.tsx
npm run typecheck
npm run design:check
```

Expected: both runtime-mode controls render for active/claimable cards only, confirmation contains both profiles, the live mutation receives its expected-source guard, and static checks pass.

- [ ] **Step 8: Commit the UI slice**

```bash
git add src/components/admin/CardsManager.tsx src/components/admin/AuditLog.tsx tests/unit/cards-manager.test.tsx tests/unit/demo-card-owner-access-override.test.ts
git commit -m "feat(admin): reassign cards to profiles"
```

## Task 5: Add local-demo browser proof and product documentation

**Files:**

- Modify: e2e/admin.spec.ts
- Modify: .agents/skills/verify-tapit/features/admin-cards.md
- Modify: docs/spec.md
- Modify: docs/CHANGELOG.md

- [ ] **Step 1: Add an administrator browser journey**

Add a dedicated test titled administrator reassigns a misattached card without replacing it. Use only the deterministic local demo. Sign in as owner@example.test and publish the existing profile-claimable profile through the normal customer profile flow, leaving claimable-card-demo unclaimed. Sign in as the administrator and reassign the already-claimed mara-card-7f2q card to profile-claimable, which already has a claimable card. Assert the confirmation contains both profile names/slugs, the operation succeeds, the same /c/mara-card-7f2q path displays the destination profile, and /admin/audit-log shows the readable reassignment event with both assignments. This proves reassignment accepts a destination with another card without relaxing the registered-card attachment rule.

After signing in as the administrator and confirming the reassignment, verify the preserved path and audit result through the visible UI:

```ts
await expect(reassignmentDialog).toContainText("Mara Velasquez");
await expect(reassignmentDialog).toContainText("Claimed profile");
await reassignmentDialog.getByRole("button", { name: "Reassign card" }).click();
await page.goto("/c/mara-card-7f2q");
await expect(page.getByRole("heading", { name: "Claimed profile" })).toBeVisible();
await page.goto("/admin/audit-log");
await expect(page.getByText("Card reassigned to profile")).toBeVisible();
```

- [ ] **Step 2: Document the exact proof recipe**

In .agents/skills/verify-tapit/features/admin-cards.md, add the journey title, its active-card URL outcome, the old/new-profile confirmation, existing-destination-card behavior, and the audit assertion. Keep the note explicit that the proof is local demo only and proves no physical NFC encoding.

- [ ] **Step 3: Update product behavior and changelog**

Add a numbered workflow to docs/spec.md stating that administrators can reassign active or claimable cards with an explicit old/new profile confirmation; the token and URL stay fixed; claim codes/challenges and the previous card-derived owner access are invalidated; a fresh claim is required; other cards and separate grants remain; and inactive/replaced cards remain ineligible. Add FR-079 for the same behavior and keep existing FR-028's inactive/replaced restriction. Add a 2026-10-30 entry to docs/CHANGELOG.md describing the admin correction and fresh-claim behavior.

Use this requirement text:

```md
- **FR-079:** Administrators shall be able to reassign an active or claimable card to another profile without changing its token or URL. Reassignment shall require confirmation of the current and destination profiles, invalidate prior claim codes and challenges, remove card-derived access from the former profile owner, require a fresh claim by the destination profile owner, preserve access from other cards and separate grants, and record the administrator and both assignments in the audit log.
```

- [ ] **Step 4: Run the documented local-demo proof**

Run the new journey through the verification helper, using its exact title and a new run ID:

```bash
.claude/skills/verify-tapit/scripts/tapit-verify.sh prove "administrator reassigns a misattached card without replacing it" issue-191-card-reassignment
```

Expected: the local-demo journey passes and retains report.json and trace.zip under test-results/verify-tapit/issue-191-card-reassignment/. Do not use hosted demo or any deployed environment.

## Task 6: Run feature-wide verification and record the result

**Files:** No additional source files.

- [ ] **Step 1: Run the complete focused test set**

Run:

```bash
npm test -- tests/unit/cards-manager.test.tsx tests/unit/demo-card-owner-access-override.test.ts
npm test -- convex/integration/card-claiming.test.ts convex/integration/remaining-operations.test.ts convex/integration/auth-ownership.test.ts
node scripts/verify-card-claim-model.mjs
```

Expected: all focused tests pass and the claim model has no counterexample.

- [ ] **Step 2: Run repository verification**

Run:

```bash
npm run verify
```

Expected: design check, format check, lint, typecheck, Vitest/Convex integration tests, and build all pass. Do not run live E2E, provisioning, admin repair, or demo seeding against Production.

- [ ] **Step 3: Review the final diff and commit documentation/proof updates**

Run git diff --check and git status --short --branch. Confirm there is no schema change, no edit to claim completion semantics outside this reassignment transition, no relaxation of initial attachment, and no public exposure of claim data. Then commit:

```bash
git add e2e/admin.spec.ts .agents/skills/verify-tapit/features/admin-cards.md docs/spec.md docs/CHANGELOG.md
git commit -m "test(admin): verify card reassignment flow"
```

## Acceptance coverage

- Active and claimable eligibility, expected-source stale-dialog protection, and unchanged ID/token/URL/status: Tasks 1–4.
- Old code and challenge invalidation, completed claim revocation, fresh destination claim, and old/new owner access: Tasks 1–3.
- Destination already has an active or claimable card, without changing registered-card attachment behavior: Tasks 1 and 4.
- Server-side admin/scope checks, inactive/replaced rejection, and atomic audit event: Tasks 1–2.
- Local-demo parity, old owner's claimedCardIds cleanup, other-card/override access, UI confirmation, and public URL proof: Tasks 3–5.
- Product requirements, user-visible changelog, card-claim state model, and repository verification: Tasks 2, 5, and 6.

## Implementation status

- Backend mutation, claim transition coverage, admin UI for local demo and Convex, audit display, product documentation, and the local-demo browser scenario are implemented.
- The delegated backend task reports seven focused Convex integration tests, the claim model, TypeScript, formatting, and diff checks passed. Convex code generation was unavailable because `CONVEX_DEPLOYMENT` was unset.
- UI unit tests, the browser scenario, and full repository verification were not run.
