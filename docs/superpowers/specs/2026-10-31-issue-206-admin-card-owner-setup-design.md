# Issue #206: Resolve Claimed Admin Cards to Owner Setup

**Status:** Approved design; note for review
**Date:** 2026-10-31
**Issue:** [#206 — Resolve claimed admin cards to the owner setup screen](https://github.com/wehyn/tapit/issues/206)
**Related:** [#203 — Allow all active roles to claim assigned cards](https://github.com/wehyn/tapit/issues/203)

## Problem

After #203, an active administrator can claim a card assigned to their own profile. If that profile is unpublished, the card remains `claimable` with a claimed code. `cards.resolve` still requires the owner account to have role `customer`, so the admin sees `unavailable` when reopening the card. The local demo resolver already allows the active profile owner through this state.

## Decision

For an already-claimed `claimable` card, return `ownerSetup` to the authenticated account when it is active, its profile ID matches the card's profile ID, the profile belongs to that account, and the account shares scope with both the card and profile. The account role does not change this decision.

Keep the response limited to `{ status: "ownerSetup" }`. Unauthenticated, inactive, non-owning, and cross-scope accounts continue to receive `{ status: "unavailable" }`; no private profile content is returned by this resolver branch.

## Approaches considered

- **Remove the role-only predicate in `cards.resolve` — selected.** This aligns resolution with the all-active-roles claim flow from #203 while preserving the existing ownership and scope checks.
- **Add a customer/admin allowlist.** This works for current roles but repeats role policy in another place.
- **Extract a shared authorization helper.** This adds a broader change for a single role predicate.

## Scope and verification

- Update only the claimed-card owner check in `convex/cards.ts`.
- Keep `CardResolverClient` and the local demo resolver unchanged; both already route an authorized owner to the code-free continuation.
- Extend the admin claim integration coverage in `convex/integration/card-claiming.test.ts`: assert `ownerSetup` for an active admin after claiming their own unpublished card, and assert `unavailable` for signed-out access, an inactive owner account, a non-owning admin, and a cross-scope account.
- Preserve the existing account, profile ID, owner ID, and scope checks. No schema or data migration is needed.

## Acceptance criteria

- An active admin who claimed a card assigned to their unpublished profile receives `ownerSetup` when resolving that card.
- Signed-out users, inactive accounts, admins who do not own the profile, and cross-scope accounts receive `unavailable` and no private profile data.
