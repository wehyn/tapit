# Issue #173: Resettable Demo Accounts for Production Testing

**Status:** Approved for implementation on 2026-10-28
**Date:** 2026-10-28
**Issue:** [#173 — Add resettable Demo accounts for production testing](https://github.com/wehyn/tapit/issues/173)

## Goal

Let administrators designate customer accounts for repeatable production testing. A Demo account can be reset to a fresh onboarding state without registering another Google identity.

## Account classification

- The `/admin/customers` promotion path is staged: an ordinary customer can first be promoted to Demo, then a Demo account can be promoted to Administrator.
- Demo is a customer account classification, not an authorization role. Demo accounts have the same permissions as ordinary customers.
- The customer registry identifies Demo accounts clearly. Administrators cannot mark an administrator account as Demo.
- No separate Demo signup flow or additional Google identity is introduced.

Promoting a Demo account to Administrator replaces its Demo classification with the administrator role. The promotion does not reset customer data or change its Google identity. Administrator accounts do not have the Demo reset action. Ordinary customers cannot be promoted directly to Administrator.

## Reset behavior

Account settings show **Reset account** for Demo accounts and keep **Delete Account** for ordinary customers. The reset requires an explicit confirmation that the Demo account's Tapit data and associated cards will be removed.

On confirmation, reset the Demo account to the state of a newly registered customer who has not started onboarding. Clear account-owned Tapit data, including onboarding/profile state, profile content and publication, links, customization, uploaded media, analytics, card orders and their uploads, and card-claim state. Delete the cards linked to or claimed by this Demo account from the card registry.

Preserve the account's Google identity and sign-in association so the same Google account can sign in again. Preserve its Demo classification so it continues to show **Reset account** and can be reused after onboarding. Do not affect another account's data, administrator-owned settings, or cards unrelated to this Demo account.

After reset, signing in with the preserved Google identity starts the normal customer onboarding flow. The account remains a customer throughout; reset does not grant administrator access or require a new registration.

## Authorization and data safety

- Only an administrator can designate a customer as Demo.
- Only a Demo account can be promoted to Administrator through the customer promotion flow; the promotion replaces Demo status.
- Only the signed-in owner of a Demo account can use **Reset account** from account settings. The server must verify the authenticated identity and Demo classification; UI visibility alone is not authorization.
- Ordinary customer deletion remains unchanged. A non-Demo customer cannot invoke the Demo reset operation.
- A completed reset removes the account's data and its linked/claimed cards together. Do not report success while associated claims or cards remain. Storage cleanup must not delete files still referenced by unrelated records.

## Local demo and Convex

Implement the same designation, reset, and post-reset onboarding behavior in Convex and local demo modes. The local demo reset must be deterministic and clear the same account-owned state as the Convex path.

## Acceptance criteria

1. In `/admin/customers`, an ordinary customer can be promoted to Demo, and a Demo account can then be promoted to Administrator.
2. Demo accounts retain ordinary customer permissions. Promoting one to Administrator removes its Demo status and reset action while preserving its existing data and Google identity; ordinary customers cannot be promoted directly to Administrator, and an administrator account cannot be marked Demo.
3. Demo account settings provide a confirmed **Reset account** action. Ordinary customers continue to have **Delete Account**.
4. Reset clears all Tapit data owned by the Demo account, including onboarding/profile state, media, orders, analytics, and claim state, and removes its linked/claimed cards from the card registry.
5. Reset preserves the Google identity and Demo classification. The same Google account can sign in and complete onboarding again.
6. The reset does not delete another account's data or shared files still referenced elsewhere.
7. Convex and local demo modes produce the same reset result.

## Scope boundaries

- Do not add Demo-specific permissions, a new authentication provider, or a separate signup experience.
- Do not change ordinary customer account deletion.
- Do not delete cards or other records that are unrelated to the Demo account.
- A reverse conversion from Demo to ordinary customer is not required.

## Verification expectations

- Verify an administrator can promote a customer to Demo, then promote that Demo account to Administrator; the first step keeps customer permissions, and the second removes Demo status without deleting account data or Google sign-in.
- Verify a confirmed Demo reset clears the account data, claims, and associated cards while preserving Google sign-in and Demo status.
- Verify a normal customer still sees the existing deletion path and cannot invoke Demo reset.
- Verify re-onboarding with the same Google identity and confirm parity with the deterministic local demo flow.

No implementation or verification is included in this spec change.
