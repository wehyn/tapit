# Google OAuth-only authentication design

**Date:** 2026-09-25 01:23 Asia/Manila
**Status:** Approved design; specification only
**Scope:** Live development, Preview, and Production authentication for Tapit

## 1. Decision summary

Tapit will use Convex Auth with Google as its only live authentication provider. The existing Convex Auth/session architecture remains in place; account provisioning and authorization continue to be decided server-side in Convex.

The live flow will use one `Continue with Google` entry point. Password sign-in, password signup, email verification, password reset, magic links, and additional OAuth providers are out of scope for this version.

Local deterministic demo mode remains unchanged and continues to use `NEXT_PUBLIC_DEMO_MODE=true`.

Production starts fresh. There are no production password accounts to migrate.

## 2. Goals

- Let any Google account begin Tapit customer onboarding.
- Keep protected access unavailable until new self-service onboarding is complete.
- Provision the first administrator from an explicit environment allowlist.
- Preserve administrator-created customer profiles for invited users.
- Keep invitations available without requiring a transactional email provider.
- Keep identity-to-account ownership and role checks inside Convex.
- Keep local demo, live development, Preview, and Production clearly separated.

## 3. Non-goals

- Password authentication or password recovery.
- Email verification or authentication email delivery.
- Email-delivered invitations.
- Magic-link authentication.
- Additional OAuth providers.
- Account linking or self-service identity replacement.
- Automatic promotion of existing customers through the admin allowlist.
- Migration of existing Production accounts.
- Production E2E testing or test data.
- Organization SSO/OIDC.

## 4. Account lifecycle and routing

The authenticated Google identity is evaluated server-side after Convex Auth completes OAuth. The client never chooses a role, account ID, or trusted email.

### 4.1 Existing active accounts

- An active customer linked to the Google identity is routed to `/app/profile`.
- An active administrator is routed to the admin console.
- A Google identity is linked to at most one Tapit customer record.

### 4.2 New self-service users

A Google user with no existing Tapit account and no applicable invitation is provisioned into a pending customer state. Pending users:

- have no protected customer or administrator access;
- can access only the onboarding flow;
- resume onboarding on a later sign-in; and
- can delete the incomplete Tapit account from onboarding.

Pending accounts are retained indefinitely until completed or deleted. A later sign-in after deletion may start onboarding again.

### 4.3 New administrators

If a Google email is in the environment's initial `TAPIT_ADMIN_EMAILS` allowlist and has no existing Tapit account, the first successful sign-in provisions an administrator account without customer onboarding.

The allowlist is an initial-provisioning mechanism only:

- it does not promote pending, invited, active, or previously created customer records;
- adding an existing customer email later does not change that customer's role; and
- later role changes are performed manually by an authorized administrator.

### 4.4 Invited customers

An invited customer must enter through the invitation link. After Google authentication, the verified Google email must exactly match the normalized invitation email. A successful match:

- links the Google identity to the pre-created customer;
- changes the customer to active;
- preserves the administrator-created profile data; and
- routes directly to the customer workspace without self-service onboarding.

An invitation email match without the required invitation-link context does not activate the customer. The user is instructed to use the invitation link.

## 5. Self-service customer onboarding

The onboarding form requires only a display name. It is prefilled from the Google profile and remains editable.

Completing onboarding will:

1. create or activate the pending customer record;
2. generate a unique profile slug from the display name;
3. create a private draft profile; and
4. grant access to `/app/profile`.

The generated slug is not a signup requirement. It is editable later from the profile workspace. Collision handling must produce a deterministic available variant, such as a normalized name followed by a numeric suffix. If the Google profile has no usable name, the onboarding form remains responsible for collecting one.

New profiles remain private drafts until the user explicitly publishes them, matching the existing product behavior.

## 6. Invitation workflow

Invitations are manually shared links; no email provider is required.

An administrator creates an invitation by providing the target email and profile display name. The profile slug is generated automatically and may be overridden by the administrator. Tapit generates an opaque invitation link for the administrator to copy and share.

Invitation rules:

- the link is reusable until revoked;
- it has no automatic expiry;
- reuse is limited to the one matching verified Google email and linked customer;
- the raw token is not stored in Convex; only a cryptographic token hash is stored;
- revoking an invitation invalidates the old link immediately; and
- an administrator can revoke the old link and generate a replacement link.

The existing one-time-use behavior must therefore be replaced. The invitation model may retain an acceptance timestamp for audit purposes, but acceptance must not itself prevent later valid sign-ins through the still-active invitation.

## 7. Environment and provider configuration

Non-demo environments use separate Google OAuth clients:

- live development/local OAuth;
- Preview; and
- Production.

Each client is registered only for its environment's approved origin and Convex Auth callback. Preview must use a stable configured origin or an explicitly registered preview origin; arbitrary ephemeral Vercel preview URLs are not part of the permanent OAuth contract.

The matching Convex deployment will hold the Google OAuth credentials and environment-specific policy values. The expected non-demo configuration includes:

- the Google OAuth client ID;
- the Google OAuth client secret;
- `TAPIT_ADMIN_EMAILS`, containing normalized comma-separated email addresses;
- the matching `CONVEX_SITE_URL`; and
- `TAPIT_SUPPORT_URL` if still used by the application.

The exact Google credential names must follow the installed Convex Auth version's provider contract. OAuth secrets must remain in Convex deployment environment variables and must not be exposed in the browser or Vercel client bundle.

Google consent is limited to the standard `openid`, `email`, and `profile` scopes.

The `TAPIT_AUTH_EMAIL_FROM`, `TAPIT_AUTH_EMAIL_API_KEY`, and `TAPIT_AUTH_EMAIL_API_URL` variables are no longer authentication prerequisites. The auth-email sender code becomes unused by the live auth path and should not remain a required deployment contract. Local demo mode does not require Google OAuth credentials.

Vercel's `NEXT_PUBLIC_CONVEX_URL` must point to the matching Convex deployment for each environment. No Vercel or Convex environment changes are part of this specification step.

## 8. Data model and authorization invariants

The implementation will extend the customer lifecycle with an explicit `pending` state. Pending customer records have no profile yet and retain only the server-owned onboarding information needed to resume, such as the display-name draft.

The customer-to-identity invariants are:

- `customers.userId` is assigned only from the authenticated Convex identity;
- trusted email is read from the verified Google identity and normalized server-side;
- one Google identity cannot be linked to multiple customer records;
- pending and invited customers cannot call protected customer or administrator functions;
- ownership and role checks remain enforced by each Convex function; and
- client-supplied email, role, user ID, or customer ID is never treated as authorization.

Invitation records must support a nullable/no-expiry policy and revocation without using one-time `usedAt` as an access gate. Invitation acceptance, onboarding completion, pending-account deletion, invitation revocation, and manual role changes are recorded in the existing audit-log model.

Self-service onboarding and invitation claims remain rate-limited. Authentication tables are managed through Convex Auth APIs; application code must not write directly to Convex Auth tables.

## 9. User-interface changes in scope

The live auth surface will:

- replace sign-in/sign-up mode selection with one `Continue with Google` action;
- remove password, verification-code, resend-code, and password-reset controls;
- preserve clear loading, cancellation, and OAuth error states;
- route pending users to onboarding;
- provide pending-account deletion with confirmation; and
- explain invitation mismatch, revoked-link, and missing-link failures.

The administrator surface will provide:

- manual invitation creation;
- copyable invitation links;
- automatic slug generation with optional override;
- invitation revocation and replacement-link generation; and
- manual customer-role promotion/demotion.

The local demo auth surface and demo credentials remain unchanged.

## 10. Verification and release gates

### Local/demo

- Keep `NEXT_PUBLIC_DEMO_MODE=true`.
- Run the existing demo E2E suite.
- Run `npm run verify`.
- Confirm local demo auth and protected routes still work.

### Live development or Preview

Use only non-production data and a dedicated Google OAuth client to verify:

- a new Google user is blocked at onboarding before completion;
- the display name is prefilled and editable;
- completion creates a customer with a unique generated slug;
- returning customers route directly to their workspace;
- matching invitation links activate the pre-created customer;
- the invited profile remains unchanged;
- missing, mismatched, and revoked invitation links are rejected;
- reusable invitation links continue working until revoked;
- an allowlisted first-time email provisions an administrator;
- adding an existing customer to the allowlist does not promote it;
- manual role promotion works;
- pending-account deletion and restart work; and
- local demo behavior remains unaffected.

### Production readiness

Before a future Production deployment, verify:

- the Production Google OAuth client and callback are registered;
- Convex and Vercel point to the matching Production deployment;
- Production OAuth secrets are present in Convex;
- `TAPIT_ADMIN_EMAILS` contains at least one controlled initial admin email;
- a non-production end-to-end run has passed; and
- no Production E2E or test data is needed for the release decision.

## 11. Acceptance criteria

The OAuth-only implementation is ready for a later deployment plan when:

1. Live environments expose Google OAuth as the only auth path.
2. Local demo mode remains functional and isolated.
3. New users cannot reach protected app data before completing onboarding.
4. New customer onboarding requires only a display name.
5. Profile slugs are generated automatically and can be edited later.
6. Invited customers require an exact verified-email match and preserve their pre-created profile.
7. Invitation links are reusable until revoked and never require an email provider.
8. Initial admin provisioning is allowlist-driven, while later role changes are manual.
9. Pending-account deletion, authorization boundaries, rate limits, and audit events are verified.
10. `npm run verify` and the approved non-production E2E scenarios pass.

## 12. Implementation boundary

This document authorizes no code, dependency, Convex, Vercel, Google Cloud, database, or deployment changes. The next phase, if separately approved, should turn this specification into an implementation plan before editing the repository.
