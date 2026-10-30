# Issue #203: Card Claims for All Active Roles

**Status:** Approved scope; design note for review
**Date:** 2026-10-31
**Issues:** [#203 — Allow all active roles to claim assigned cards](https://github.com/wehyn/tapit/issues/203), [#160 — Allow admins to own, claim, and order cards](https://github.com/wehyn/tapit/issues/160)

## Problem

The card setup UI lets an administrator issue a claim code for an assigned card, but Convex claim verification and completion reject accounts whose role is not `customer`. The local demo has the same customer-only restriction. A valid owner can therefore receive the generic “invalid or unavailable” message when claiming a card assigned to their own profile.

Issue #160 requires active administrators to claim cards assigned to their own profiles. Issue #203 extends the same behavior across the app's supported account roles and demo modes.

## Decision

An active account may claim a card assigned to a profile it owns, regardless of its role. This applies to Convex customer and administrator accounts, hosted-demo accounts, and local-demo customer and administrator sessions. Demo is a scope or runtime mode, not a separate account role.

Remove only the customer-role restriction from claim verification and completion. Preserve the existing server-derived identity and all card, account, profile, and scope checks. Do not bypass ownership for administrators.

## Claim flow and invariants

1. Verification resolves the account from the authenticated identity and requires it to be active and in the card's scope. It continues to reject ineligible card statuses, open corrections, missing or invalidated codes, claimed codes, and code-hash mismatches.
2. Completion continues to require the matching unused, unexpired challenge and the same authenticated account. The card must still be eligible and unchanged since verification.
3. The assigned profile must belong to the authenticated account and share its scope. For an unassigned card, the existing guard still prevents claiming another unassigned card when the account's profile already has an active or claimable card.
4. Local demo mirrors these checks using its active session and stored account/profile ownership. Hosted demo continues to rely on Convex scope checks.
5. Codes remain one-time; expiry, invalidation, correction, replay protection, audit records, and sibling-card independence do not change.

## Approaches considered

- **Remove only the customer-role gates while preserving ownership checks — selected.** This is the smallest change and allows all currently supported active roles to claim their own assigned cards.
- **Add an explicit customer/admin allowlist.** This would work today but keeps role-specific claim rules and needs another code change whenever a new supported role is added.
- **Let administrators bypass profile ownership.** Rejected because it would allow an administrator to claim a card for another account and weaken the existing security boundary.

## Scope

In scope: Convex verification and completion, equivalent local-demo claim paths, regression tests for administrator and demo claims, and tests that preserve existing ownership and one-time-code protections.

Out of scope: customer card-management screens, additional unassigned-card claims, role-model changes, new card states, and changes to issue #195/#196 behavior.

## Acceptance criteria

- An active administrator can verify and complete a claim for an eligible card assigned to their own profile.
- An active customer retains the existing claim behavior.
- Local-demo and hosted-demo accounts can claim eligible cards within their own scope and profile ownership.
- A different account, inactive account, wrong scope, invalidated or mismatched code, expired or replayed challenge, correction-pending card, and second unassigned card remain rejected under their existing rules.
- Claiming one assigned card does not change a sibling card.
- The existing generic invalid-code message remains; this fix changes eligibility, not error-detail disclosure.
