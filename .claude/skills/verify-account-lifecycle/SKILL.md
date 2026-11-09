---
name: verify-account-lifecycle
description: Check changes to Tapit's customer-account lifecycle (status, deletionStatus, setupState, deletion requests, prepared setup links) against a TLA+ model and the real transition functions. Use when touching customers.ts, invitations.ts, authIdentity.ts, accountErasure.ts or the account machines in state-machines.ts.
---

# Verify the account lifecycle

Use this when a change writes `customers.status`, `customers.deletionStatus`, `customers.setupState` or `deletionRequests.status`, or edits `transitionCustomerStatus`, `transitionDeletionStatus`, `transitionDeletionRequestStatus`, `transitionPreparedSetup` in `src/lib/domain/state-machines.ts`. These four fields move together but are validated separately (`docs/state-machines.md`, "Account phase"), so a new write site can leave them inconsistent.

## Property

An account is deleted in `status` exactly when it is deleted in `deletionStatus`; a deletion request is open exactly while the customer waits on it; and a prepared setup link is usable exactly when the setup state says "waiting".

Harm if it breaks: a customer who asked to be deleted keeps access, a deleted customer can sign in on stale state, or a setup link that should be dead still claims an account.

The rules are the `INVARIANTS` in `verification/account-lifecycle/AccountLifecycle.cfg`.

## Run

1. Run `/statechart` on `verification/account-lifecycle/AccountLifecycle.tla` with config `AccountLifecycle.cfg` and view `view.mjs`. Read broken rules from its report; a pass draws the account chart.
2. From the repository root run `npx vitest run --project unit tests/verification/account-lifecycle-model.test.ts` (the real transition tables against the model's guards).
3. Run `npm run test -- convex/integration/prepared-setup.test.ts convex/integration/account-lifecycle-model.test.ts convex/integration/remaining-operations.test.ts`.

## Fixed finding

Rule `DeletedHasNoSetup`: a deleted account carries no prepared setup. `approveDeletion` (`convex/customers.ts`) used to set `setupState: "draft"` on a claimed prepared account it had just deleted, where nothing could act on it (`generate` and `deletePreparedDraft` need `status === "invited"`). It now clears `setupState`, `setupExpiryInvitationId` and `setupExpiresAt`. TLC found the 3-step path (claim link, request deletion, approve); `convex/integration/account-lifecycle-model.test.ts` is the regression test on the real mutation.

## Reading a failure

- TLC breaks a rule other than the open finding: replay the path against the real mutations. A path no real sequence allows means a model error; fix the model, never the rule.
- The vitest tables fail: the real machine disagrees with a guard of the model. Decide which is right, update the other, re-run TLC.

## Scope and assumptions

One account (with a `profiled` flag for `profileId`), starting either self-service (pending) or prepared (invited with a live link). Each action is one mutation, one transaction. Left out: roles, scopes and demo data, profiles and cards (deletion also unpublishes and retires them), the erasure passes that delete rows after approval, invitation expiry timestamps (expiry is a nondeterministic action), the legacy `createCustomer` flow with `setupState: null`, `setupExpiryInvitationId`, email checks and Google verification, and the `reset_demo` event. `RestartAccount` is allowed only for an account that never got a profile (an abandoned sign-up): `ensureGoogleApplicationAccount` requires `profileId === undefined`, and approval keeps the profile, so an approved deletion is final in the model. Real erasure passes that might later clear `profileId` are not modelled.

## Coverage record

- `src/lib/domain/state-machines.ts`: the four account machines above.
- `convex/customers.ts`: `createPrepared`, `createSelfServiceAccount`, `completeSelfServiceOnboarding`, `deletePendingAccount`, `deletePreparedDraft`, `expirePreparedSetup`, `requestDeletion`, `approveDeletion`.
- `convex/invitations.ts`: `generate`, `revoke`, `replace`, `claim`. `convex/authIdentity.ts`: restart of a deleted customer.
- `verification/account-lifecycle/`, `tests/verification/account-lifecycle-model.test.ts`, `convex/integration/account-lifecycle-model.test.ts`.
- Sync commit: `aa04762d2741769d98c7e496f072ea97003e9851`.

After any covered file changes, re-read the model against the new code, re-run all checks, and move the sync commit forward only once you have confirmed the model still describes the code at that commit.

## Proof the checks can fail

- Model: `ApproveDeletion` setting `setup' = "draft"` breaks `DeletedHasNoSetup` in three steps; `ApproveDeletion` leaving `deletionStatus` unchanged. TLC breaks `DeletedAgrees`, `OpenRequestMeansRequested` and `RequestedNeedsActive` in three steps.
- Code (scratch edit, then reverted): `approve_deletion` in `CUSTOMER_TRANSITIONS` also accepting `pending`. The vitest tables failed.

For later drift checks, use `/maintain-formal-verification-skill`.
