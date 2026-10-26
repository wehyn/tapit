---
name: verify-card-claiming
description: Check changes to Tapit's claim-code verification and card-claim completion flow for replay and invalidation ordering bugs.
---

# Verify card claiming

Use this when changing `convex/cardClaims.ts`, `convex/cards.ts` claim-code mutations, or the `cards` and `cardClaimChallenges` fields in `convex/schema.ts`.

## Property

A claim challenge can commit at most one card claim, and a code invalidated before completion cannot be used to claim the card.

This protects card ownership from replay and from a stale challenge completing after an administrator invalidates its code.

## Run

From the repository root, run:

```sh
node scripts/verify-card-claim-model.mjs
npm run test -- convex/integration/card-claiming.test.ts
```

The first command explicitly explores the finite transition model and checks its invariants. The second exercises the real Convex mutations, including challenge replay, invalidation, ownership, and publication behavior. A failure in the model is a counterexample to the abstract transition rules. If the model passes but the Convex test fails, inspect the implementation/model mapping before changing the invariant.

## Scope and assumptions

The model explores every sequence up to six committed operations over one card and one challenge. `complete` and `invalidate` each represent a single atomic Convex mutation, matching the transaction boundary in `convex/cardClaims.ts` and `convex/cards.ts`. It abstracts identities, scopes, cryptographic hashes, rate limits, expiry clocks, profiles, and audit-log contents. The integration test covers several of those implementation details, but neither check proves Convex's runtime or distributed transaction implementation correct.

## Coverage record

- `convex/cardClaims.ts`: `complete` checks challenge use and card invalidation/claimed state, then marks the challenge used and the card claimed in the same mutation.
- `convex/cards.ts`: `invalidateClaimCode` marks the current code invalidated.
- `convex/integration/card-claiming.test.ts`: completion, replay, stale invalidated challenge, and ownership behavior.
- Sync commit: `25991f865cd81667bac09a438bca8a90ec9de907`.

After covered code changes, review the model against the new mutation boundaries and rerun both commands. Update the sync commit only after confirming the model and this record still describe the code at the new commit. For a TLA+ model, read each checker result with `/statechart`; this verifier uses an in-repository explicit-state explorer instead.

For later drift checks, use `/maintain-formal-verification-skill`.
