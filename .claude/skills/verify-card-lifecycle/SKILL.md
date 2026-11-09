---
name: verify-card-lifecycle
description: Check changes to Tapit's physical-card lifecycle (status, claim code, claim challenge, correction, lost/replaced/reactivation) against a TLA+ model and the real card status machine. Use when touching cards.ts mutations, cardClaims.ts, cardCorrectionRequests.ts, or transitionCardStatus.
---

# Verify the card lifecycle

Use this when a change touches `transitionCardStatus` or `claimCodeState` in `src/lib/domain/state-machines.ts`, any mutation in `convex/cards.ts`, `convex/cardClaims.ts`, `convex/cardCorrectionRequests.ts`, the card branch of `publish` in `convex/profiles.ts`, or the `cards` and `cardClaimChallenges` fields in `convex/schema.ts`.

It extends `verify-card-claiming` (replay and invalidation of one challenge) to every way a card's status, code, owner and profile can change together.

## Property

A claim code gives at most one claim, and never after it was replaced or invalidated; a card with a pending correction cannot be changed; and a claimed card is never stuck waiting on a profile that is already published.

Harm if it breaks: someone claims a card with a code the administrator revoked, or a customer's card stays dark after they published their profile.

The rules are the `INVARIANTS` in `verification/card-lifecycle/CardLifecycle.cfg`, each commented in `CardLifecycle.tla`.

## Run

1. Run `/statechart` on `verification/card-lifecycle/CardLifecycle.tla` with config `CardLifecycle.cfg` and view `view.mjs`. This is the full check (772 states). Read broken rules from its report. For the picture, run it again with config `CardLifecycle.chart.cfg`: that config issues one code instead of two, so the chart stays under the chart budget. The chart config is for drawing only; the proof is the full run.
2. From the repository root run `npx vitest run --project unit tests/verification/card-lifecycle-model.test.ts`. It checks the real `transitionCardStatus` and `claimCodeState` against the answers the model assumes for each action.
3. Run `npm run test -- convex/integration/card-claiming.test.ts convex/integration/card-correction.test.ts convex/integration/card-customer-controls.test.ts convex/integration/card-routing.test.ts convex/integration/card-archive-restore-reactivation.test.ts` and `node scripts/verify-card-claim-model.mjs`.

## Reading a failure

- TLC breaks a rule: replay the path against the real mutations before concluding. A path that no real mutation sequence allows means a modelling error; fix the model, never the rule.
- The vitest check fails: the real status machine disagrees with an action of the model. Decide which is right; update the other; re-run TLC.
- Never loosen an invariant to make a run pass.

## Scope and assumptions

One card, one profile, one customer, one claim challenge slot, at most 2 codes issued. `published` and `peerLive` (another card of the same profile is active or claimable) are chosen freely by the environment. Each action is one mutation, one transaction. Left out: scopes and demo data, identities and authorization, rate limits, hashing, challenge expiry clocks (an expired challenge is just one that is never used), audit logs, archive and restore, account deletion retiring cards, the replacement card itself, and `lostCardResolution`.

Observed, not a rule: nothing limits a profile to one live card. `attach`, `assign`, `reassign`, `ownerReactivate` and `reactivate` never look for another active or claimable card on the profile; only `cardClaims.complete` (first assignment) and correction resolution refuse. `card-claiming.test.ts` reassigns a card onto a profile that already has a claimable card and expects success, so this is allowed today. If it should not be, add the rule `(hasProfile /\ Live(status)) => ~peerLive`; TLC then breaks it at once (one step: attach).

## Coverage record

- `src/lib/domain/state-machines.ts`: `transitionCardStatus` (all event types), `claimCodeState`.
- `convex/cards.ts`: `attach`, `assign`, `generateClaimCode`, `invalidateClaimCode`, `reassign`, `ownerDisable`, `ownerMarkLost`, `ownerReactivate`, `deactivate`, `markLost`, `reactivate`, `replace`.
- `convex/cardClaims.ts`: `verifyCode`, `complete`. `convex/cardCorrectionRequests.ts`: request and resolve. `convex/profiles.ts`: publish activating claimed claimable cards.
- `verification/card-lifecycle/` and `tests/verification/card-lifecycle-model.test.ts`.
- Sync commit: `91ec266c908683fc5f975b4a109148bf28e5fa4a`.

After any covered file changes, re-read the model against the new mutation guards, re-run all checks, and move the sync commit forward only once you have confirmed the model still describes the code at that commit.

## Proof the checks can fail

- Model: `CompleteClaim` without the `chalVer = ver` guard. TLC breaks `NoClaimOnDeadCode`: issue a code, verify it, issue a second code, claim with the old challenge.
- Code (scratch edit, then reverted): in `transitionCardStatus`, `reassign` allowed from `lost`, and `claimCodeState` testing `claimed` before `invalidated`. The vitest check failed on both.

For later drift checks, use `/maintain-formal-verification-skill`.
