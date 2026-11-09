---
name: verify-card-lifecycle
description: Check changes to Tapit's physical-card lifecycle (status, claim code, claim challenge, correction, lost/replaced/reactivation) against a TLA+ model and the real card status machine. Use when touching cards.ts mutations, cardClaims.ts, cardCorrectionRequests.ts, or transitionCardStatus.
---

# Verify the card lifecycle

Use this when a change touches `transitionCardStatus` or `claimCodeState` in `src/lib/domain/state-machines.ts`, any mutation in `convex/cards.ts`, `convex/cardClaims.ts`, `convex/cardCorrectionRequests.ts`, the card branch of `publish` in `convex/profiles.ts`, or the `cards` and `cardClaimChallenges` fields in `convex/schema.ts`.

It extends `verify-card-claiming` (replay and invalidation of one challenge) to every way a card's status, code, owner and profile can change together.

## Property

A claim code gives at most one claim, and never after it was replaced or invalidated; a card with a pending correction cannot be changed and can always be resolved; and a claimed card is never stuck waiting on a profile that is already published.

Harm if it breaks: someone claims a card with a code the administrator revoked, or a customer's card stays dark after they published their profile.

The rules are the `INVARIANTS` in `verification/card-lifecycle/CardLifecycle.cfg`, each commented in `CardLifecycle.tla`.

## Run

1. Run `/statechart` on `verification/card-lifecycle/CardLifecycle.tla` with config `CardLifecycle.cfg` and view `view.mjs`. This is the full check (1,340 states). Read broken rules from its report. For the picture, run it again with config `CardLifecycle.chart.cfg`: that config issues one code instead of two and turns off `Churn` (the requester's profile gaining or losing a live card), so the chart stays under the chart budget. The chart config is for drawing only; the proof is the full run.
2. From the repository root run `npx vitest run --project unit tests/verification/card-lifecycle-model.test.ts`. It checks the real `transitionCardStatus` and `claimCodeState` against the answers the model assumes for each action.
3. Run `npm run test -- convex/integration/card-lifecycle-model.test.ts convex/integration/card-claiming.test.ts convex/integration/card-correction.test.ts convex/integration/card-customer-controls.test.ts convex/integration/card-routing.test.ts convex/integration/card-archive-restore-reactivation.test.ts` and `node scripts/verify-card-claim-model.mjs`.

## Fixed finding

Rule `CorrectionCanResolve`: a pending correction always has a usable code. `cards.reassign` had no pending-correction guard (every other card mutation has one), so an administrator could reassign a card while its owner's correction was open. Reassign retires the code, `correctAssignment` then rejects the retired code, and nothing could issue or invalidate a code while the correction was pending: the card was stuck "unavailable". TLC found it in 5 steps (attach, issue code, verify, request correction, reassign). `reassign` now refuses with "Resolve the pending assignment correction before reassigning this card."; `convex/integration/card-lifecycle-model.test.ts` replays it on the real mutations. The demo admin Reassign button and `reassignCard` in `CardsManager.tsx` got the same guard.

Second fixed finding, from review: `requestDeletion` and `approveDeletion` retired a card (`inactive`) without closing its pending correction, which then could never resolve (`correctAssignment` needs an active or claimable card, and every other card mutation refuses while the flag is set). Both now go through `retireCardsForDeletion` in `convex/customers.ts`, which clears `correctionRequestedAt` and marks open requests corrected. The model has the `RetireForDeletion` action; removing its `correction' = FALSE` breaks `CorrectionFreezesCard`. Known gap: the demo deletion paths (`AccountSettings.tsx`, `createDeletionTransition` in `src/lib/domain/index.ts`, `use-prepared-accounts.ts`) retire cards without touching demo correction requests.

## Reading a failure

- TLC breaks a rule: replay the path against the real mutations before concluding. A path that no real mutation sequence allows means a modelling error; fix the model, never the rule.
- The vitest check fails: the real status machine disagrees with an action of the model. Decide which is right; update the other; re-run TLC.
- Never loosen an invariant to make a run pass.

## Scope and assumptions

One card, one profile, one customer, one claim challenge slot, at most 2 codes issued. `published`, `peerLive` (another card of the same profile is active or claimable) and `reqPeer` (the correction requester's profile already has a live card, which makes `correctAssignment` refuse; covered by the "blocker" case in `card-correction.test.ts`, not by a TLC rule) are chosen freely by the environment. Each action is one mutation, one transaction. Left out: scopes and demo data (the demo store is not modelled), identities and authorization, rate limits, hashing, challenge expiry clocks (an expired challenge is just one that is never used), audit logs, archive and restore, the replacement card itself (only its effect on `peerLive`), and `lostCardResolution`.

Observed, not a rule: nothing limits a profile to one live card. `attach`, `assign`, `reassign`, `ownerReactivate` and `reactivate` never look for another active or claimable card on the profile; only `cardClaims.complete` (first assignment) and correction resolution refuse. `card-claiming.test.ts` reassigns a card onto a profile that already has a claimable card and expects success, so this is allowed today. If it should not be, add the rule `(hasProfile /\ Live(status)) => ~peerLive`; TLC then breaks it at once (one step: attach).

## Coverage record

- `src/lib/domain/state-machines.ts`: `transitionCardStatus` (all event types), `claimCodeState`.
- `convex/cards.ts`: `attach`, `assign`, `generateClaimCode`, `invalidateClaimCode`, `reassign`, `ownerDisable`, `ownerMarkLost`, `ownerReactivate`, `deactivate`, `markLost`, `reactivate`, `replace`.
- `replace` only inserts a second active card on the same profile and leaves the old card untouched (`remaining-operations.test.ts` asserts this); the model does the same. Status `replaced` is never written by a mutation today (`mark_replaced` is unused), so it only appears on legacy rows; the model keeps it for `reactivate`.
- `convex/cardClaims.ts`: `verifyCode`, `complete`. `convex/cardCorrectionRequests.ts`: request and resolve. `convex/profiles.ts`: publish activating claimed claimable cards. `convex/customers.ts`: `retireCardsForDeletion`, called by `requestDeletion` and `approveDeletion`.
- `verification/card-lifecycle/`, `tests/verification/card-lifecycle-model.test.ts`, `convex/integration/card-lifecycle-model.test.ts`.
- Sync commit: `aa04762d2741769d98c7e496f072ea97003e9851`.

After any covered file changes, re-read the model against the new mutation guards, re-run all checks, and move the sync commit forward only once you have confirmed the model still describes the code at that commit.

## Proof the checks can fail

- Model: `AdminReassign` without its `~correction` guard breaks `CorrectionCanResolve`; `CompleteClaim` without the `chalVer = ver` guard. TLC breaks `NoClaimOnDeadCode`: issue a code, verify it, issue a second code, claim with the old challenge.
- Code (scratch edit, then reverted): in `transitionCardStatus`, `reassign` allowed from `lost`, and `claimCodeState` testing `claimed` before `invalidated`. The vitest check failed on both.

For later drift checks, use `/maintain-formal-verification-skill`.
