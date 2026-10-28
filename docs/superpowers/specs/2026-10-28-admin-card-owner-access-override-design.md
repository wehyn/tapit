# Admin-Granted Card-Owner Access Override

**Status:** Approved
**Date:** 2026-10-28

## Goal

Let an administrator grant or revoke card-owner features for an active customer from `/admin/customers`, without recording or changing a card claim. This supports administrative exceptions while preserving the distinction between an access grant and proof that a customer claimed a physical card.

## Access rule

For an active customer with a valid profile they own, card-owner features are available when either:

1. The customer has successfully claimed a card assigned to that profile, using the existing token-and-one-time-code flow; or
2. An administrator has enabled that customer's owner-access override.

Administrators keep their existing access. Invited, pending, inactive, or deleted customer accounts cannot receive an override. The override does not claim that the customer possesses a physical card.

The override and a real claim are independent sources of access. Revoking the override removes only the admin grant; a successful card claim continues to grant access. If an override is granted and the customer later completes a card claim, both records remain accurate and either source continues to grant access.

## Admin workflow

- Add an explicit owner-access override status and grant/revoke action to active customer records in `/admin/customers`.
- Label the state as an **admin override**, separate from card-claim status. Do not label the override as a claimed card or change any card status.
- Confirm grant and revoke actions before submitting, following the existing confirmation pattern for customer role changes.
- Show success or actionable error feedback in both the local demo and Convex-backed admin views.

## Data and authorization

- Store the current override as an optional `cardOwnerAccessOverride` boolean on the customer record. The local demo customer uses the same optional field.
- Add an admin-only mutation that accepts a customer ID and desired override state. Derive the administrator identity on the server and require an active same-scope customer account with the customer role. Verify profile ownership before granting access; allow revocation even if the customer's profile is missing or mismatched.
- Make repeated requests for the current state idempotent.
- Record each actual state transition in the existing audit log with the acting administrator, target account and profile, timestamp, and before/after values.
- Include the override in the shared Convex and local-demo owner-access calculation. Do not accept a client-provided entitlement value as authorization.
- Do not write to card records, claim-code fields, claim challenges, or claim history.

## Error handling

Reject unauthenticated or non-admin calls, cross-scope targets, grants for accounts with missing or mismatched profiles, and accounts that are not active customers with the customer role. Revocation remains available for an active same-scope customer even if profile data is no longer valid. The grant/revoke update and audit entry must commit atomically. Surface mutation errors in `/admin/customers` and leave the current override unchanged on failure.

## Verification

1. An administrator can grant and revoke an active customer's override in `/admin/customers`; the displayed override state updates in both local demo and Convex-backed modes.
2. A granted customer receives the existing card-owner capabilities without a card claim, and revocation removes only the override-based access.
3. A customer with a successful card claim retains card-owner access after the admin override is revoked.
4. Grant and revoke actions create audit entries; repeating an unchanged state does not create duplicate entries.
5. Non-admin, cross-scope, inactive, invited, admin-role, and profile-mismatch grant requests are rejected server-side; profile-mismatch revocation remains possible.
6. The override never changes card status, claim-code state, or token-plus-code claim behavior.

## Out of scope

- Recording an administrator-attested card claim.
- Registering, assigning, replacing, or deactivating cards.
- Adding a reason field or a separate grant-history table; the existing audit log records grant history.
