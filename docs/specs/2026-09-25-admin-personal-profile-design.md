# Admin Personal Customer Profile

## Status

Design approved in conversation; implementation not started.

## Purpose

Administrators currently have administrative accounts and access to the admin console, but they do not receive a personal customer-style profile workspace. This feature gives every administrator a personal customer account/profile while preserving their existing administrative access.

An administrator will use the existing customer workspace for their own profile, links, account settings, analytics, and card tools. The administrator will not need a second login or a second customer identity.

## Goals

- Automatically create a personal profile for every admin account.
- Reuse the existing admin `customers` record and profile ownership model.
- Keep newly created profiles private drafts until the admin explicitly publishes.
- Let admins access their own profile through the existing `/app/*` workspace.
- Preserve full `/admin/*` access and existing customer authorization boundaries.
- Repair existing active admins that do not yet have a profile.
- Keep demo behavior consistent with live behavior.

## Non-goals

- Creating a second login or duplicate customer record for an admin.
- Creating a separate administrator-profile data model.
- Automatically publishing an admin profile.
- Changing access to other customers' profiles in the admin console.
- Adding multi-profile or granular administrator roles.

## Account and provisioning model

The existing account relationship remains canonical:

```text
users/auth identity
        |
        v
customers { role: "admin", profileId }
        |
        v
profiles { ownerId: admin customer }
```

Admin provisioning must create or reuse one active `customers` record and ensure that it has one owned profile. The profile is created with:

- `ownerId` set to the admin customer ID.
- `status` set to `draft`.
- An initial name from the verified Google display name, with a safe email-derived fallback.
- A generated unique slug.
- Empty links and no published snapshot.

The generated slug is editable while the profile is unpublished. Existing profile behavior makes the slug immutable after publication.

The ensure-profile operation must be idempotent. Repeated Google sign-ins, bootstrap runs, and account refreshes must reuse an existing profile and must not overwrite the admin's name edits, slug, links, image, publication state, or other profile data.

The behavior applies to:

- New admins provisioned through Google OAuth allowlisting.
- Existing admins whose account has no `profileId`.
- The bootstrap administrator path.
- Hosted-demo/admin fixtures.

## Existing-account repair

Existing active admin accounts without a profile require a controlled, repeatable repair path. The same idempotent ensure-profile helper should be used during provisioning and by a one-time internal backfill.

The backfill will:

- Select active admin customers with no `profileId`.
- Create a unique private draft profile.
- Patch only the missing `profileId`.
- Leave admins with an existing profile unchanged.
- Record an audit event for each created profile.
- Report created, skipped, and failed records.

Inconsistent states must fail safely. A missing profile referenced by `profileId`, a profile owned by another customer, or an orphaned profile after a partial write must be detected and handled idempotently rather than producing duplicates or silently changing ownership.

Deleting an admin's profile must not delete the administrator's authentication identity or administrative access accidentally. Existing account-erasure and administrative handling rules remain authoritative.

## Navigation and workspace

The admin console remains the default workspace. Add a personal navigation entry:

```text
Operations
  Customers
  Profiles
  Cards
  Analytics

Governance
  Audit log
  Settings

Personal
  My profile
```

`My profile` links to `/app/profile`.

The existing customer workspace is reused for admins:

- `/app/profile` — edit, preview, save, and publish the personal profile.
- `/app/links` — manage personal links.
- `/app/account/build-card` — use personal card tools.
- `/app/analytics` — view analytics for the admin's own profile.
- `/app/account` — use account, support, and deletion controls.

The `/app/*` guard changes from customer-only to active customer-or-admin access, while requiring a valid personal `profileId`. The workspace resolves only to the signed-in account's own profile. Admins retain their existing `/admin/*` access and administrative profile-management capabilities.

Demo mode must mirror the live behavior: admin sessions can enter `/app/*`, the admin fixture owns a draft profile, and customer sessions remain customer-scoped.

## Data flow and authorization

1. Google authentication verifies the identity and email server-side.
2. Admin provisioning resolves or creates the admin `customers` record.
3. The ensure-profile operation resolves an existing owned profile or creates one draft profile.
4. The customer record receives the profile ID if it is missing.
5. `/admin` and `/app` route guards use the same authenticated access record, with role-specific destination rules.
6. Profile mutations continue to enforce ownership through the existing profile-access helper.
7. Public profile projection remains published-only; draft admin data is never exposed publicly.

No client-supplied role, customer ID, or profile ID should be trusted to establish ownership. Admin access to other customers remains limited to existing administrator-only operations.

## Error handling and safety

- Slug collisions retry with a deterministic unique suffix.
- Existing profile data is never overwritten during ensure-profile.
- A missing or mismatched referenced profile produces an auditable failure or safe repair path.
- Partial profile/customer writes are recoverable by retrying the same idempotent operation.
- Profile creation remains private until explicit publication.
- Admin profile deletion cannot remove authentication or admin access as a side effect.

## Verification

Verification will use the project's demo E2E workflow as the primary repeatable artifact, with focused Convex integration coverage for provisioning idempotency, profile ownership, role routing, and repair behavior.

Acceptance criteria:

- A new allowlisted admin receives one active admin account and one private draft profile.
- An existing admin without a profile receives exactly one profile through repair.
- Repeated sign-in or repair creates no duplicates and preserves edits.
- The admin can open `My profile` and use profile, links, account, analytics, and card tools.
- The admin can edit, save, preview, and explicitly publish the profile.
- Public resolution exposes the admin profile only after publication.
- Existing `/admin/*` functionality remains available.
- Customers cannot access admin routes; admin personal workspace remains owner-scoped.
- Demo behavior matches the intended live behavior.
- `npm run verify` passes before completion claims.

Live, preview, production, and physical-device evidence must remain labeled separately from local/demo evidence.
