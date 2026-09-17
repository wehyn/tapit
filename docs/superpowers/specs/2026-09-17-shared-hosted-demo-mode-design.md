# Shared Hosted Demo Mode Design

**Date:** 2026-09-17  
**Status:** Approved for planning

## Goal

Keep Tapit’s current demo mode and its existing end-to-end card workflow, while moving demo application data from browser `localStorage` into the selected Convex development deployment so multiple devices see the same state.

The demo must be able to exercise the real workflow:

1. An administrator creates or selects a customer profile.
2. The administrator registers a physical card token, attaches it to the profile, and generates the claim code.
3. A customer uses another device to open the unchanged `/c/<cardToken>` URL.
4. The customer authenticates, enters the one-time claim code, reviews the private draft, and explicitly publishes it.
5. The same card URL resolves to the public profile on every device.

## Product decision

This is one shared hosted demo dataset, not a demo sandbox/workspace system. There is no per-demo workspace code and no second database. The selected Convex development deployment is the host-side source of truth.

The current local demo adapter remains available for deterministic tests and offline development. Hosted demo mode is an explicit storage option alongside local demo mode:

```env
NEXT_PUBLIC_DEMO_MODE=true
NEXT_PUBLIC_DEMO_STORAGE=convex
```

Production and ordinary live mode continue to use the existing live path. Demo data must never be mixed with production data; the hosted demo option is only for an explicitly selected non-production Convex deployment.

## Architecture

### Mode selection

Introduce one shared mode helper that distinguishes:

- local demo: `NEXT_PUBLIC_DEMO_MODE` is enabled and storage is `local` or unset;
- hosted demo: `NEXT_PUBLIC_DEMO_MODE=true` and `NEXT_PUBLIC_DEMO_STORAGE=convex`;
- live: `NEXT_PUBLIC_DEMO_MODE=false`.

Existing components that currently branch on `NEXT_PUBLIC_DEMO_MODE !== "false"` must use this helper. Hosted demo must select `LiveProviders` and the existing live Convex-backed components, not the browser-local demo store. Local demo keeps the current `DemoProviders`, fixtures, and `localStorage` behavior.

### Convex persistence and business logic

Hosted demo uses the existing Convex tables and existing server-authorized functions for customers, profiles, cards, claims, analytics, invitations, and audit logs. This keeps the hosted demo behavior representative of the application and avoids a second implementation of card lifecycle or publication rules.

The existing `/c/<cardToken>` resolver remains the only card URL resolver. Card tokens stay globally unique within the selected development deployment, and no NFC URL rewrite is needed.

Convex remains the source of truth for hosted demo reads and writes. Local browser storage may retain only a per-device authentication/session artifact required by the demo adapter; it must not hold customers, profiles, cards, claim codes, analytics, or audit history.

### Hosted demo authentication

Hosted demo uses Convex Auth Password identities and server-side customer roles, so the customer claim path still proves both:

- possession of the card through the one-time claim code; and
- identity through the authenticated customer account linked to the intended profile.

The selected non-production deployment gets an explicit demo-auth configuration that disables email verification and password-reset email delivery only for hosted demo. This removes the dependency on the placeholder/unavailable transactional mail endpoint while keeping normal live environments on the existing email-backed verification/reset path.

Hosted demo does not expose administrator signup. A demo administrator is operator-provisioned once using the existing internal promotion/bootstrap process. The public signup path still creates customer accounts only.

Administrator-created customer onboarding uses the existing controlled setup-link UI. In hosted demo, the link is displayed for copy/open handoff instead of requiring email delivery. The customer opens it on the second device, sets a password through Convex Auth, and then continues to the card claim flow.

### Seed and reset

Hosted demo needs a repeatable initialization/reset operation for the existing demonstration records. The operation must be administrator/operator controlled, idempotent, and limited to the selected non-production deployment. It may restore the current Mara profile, claimable-card example, active card example, inactive card example, supported themes, and baseline analytics/audit records.

Reset must not delete arbitrary live customer data. It must target only records explicitly marked as hosted-demo seed records, or a dedicated demo account/profile/card set established during initialization. The UI should offer reset only to the hosted-demo administrator and should report that it resets the shared demo for all devices.

## End-to-end hosted demo flow

### Administrator device

1. Set `NEXT_PUBLIC_DEMO_MODE=true` and `NEXT_PUBLIC_DEMO_STORAGE=convex`; configure the matching non-production `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_DEPLOYMENT`.
2. Sign in with the operator-provisioned hosted-demo administrator account.
3. Open `/admin/customers` and create an invited customer with the desired profile name, slug, and theme, or select an existing customer profile.
4. Open `/admin/cards`, generate a secure card token, register the pre-encoded `/c/<cardToken>` URL, select the profile, and confirm attachment.
5. Generate the one-time 8-character claim code and copy the card URL, customer setup link, and claim code through the controlled handoff.

### Customer device

1. Open the setup link, choose a password, and sign in as the invited customer. No email service is needed in hosted demo.
2. Tap or scan the unchanged card URL.
3. See only the generic unpublished-card onboarding state.
4. Enter the claim code. Convex verifies the code and the authenticated customer identity separately.
5. Continue to `/app/profile`, review/edit the draft, and press Publish.

### Result

Publishing creates the public snapshot and activates the claimed card according to the existing lifecycle. The computer, phone, and any other device connected to the same Convex deployment observe the same state. Future visits to `/c/<cardToken>` resolve to the public profile; source attribution remains analytics metadata only.

## Security and privacy

- Hosted demo is restricted to a selected non-production deployment and must be clearly identified as demo data.
- Existing Convex Auth identity derivation and role checks remain authoritative.
- No hosted-demo function may authorize from a browser-supplied role, customer ID, profile ID, or email.
- Claim codes remain normalized, hashed, rate-limited, single-use, regeneratable, revocable, and absent from public reads.
- Unpublished card resolution returns only the generic onboarding state and never draft profile content.
- Hosted demo seed/reset operations must not touch unmarked customer, profile, card, analytics, invitation, or audit data.
- Email verification bypass is enabled only by an explicit server-side hosted-demo environment setting on the non-production deployment; it must not be inferred from a public query parameter or client flag.

## Error and concurrency behavior

- If hosted-demo configuration is incomplete, the application shows a clear setup error rather than silently falling back to browser-local data.
- If the Convex deployment is unreachable, reads show the existing loading/error state and writes report that the hosted demo could not be saved; local storage must not become a hidden fallback.
- Concurrent updates from the computer and phone use Convex transactions and reactive queries. The UI refreshes from Convex after mutations; it does not merge independent browser snapshots.
- A shared reset invalidates the prior hosted-demo state and is visible to all devices. Existing sessions may remain authenticated, but records removed or reset by the operation are no longer available.
- Existing duplicate-token, invalid-claim, wrong-account, inactive-card, replaced-card, and publication validation errors remain unchanged.

## Testing targets

- Mode selection routes local demo, hosted demo, and live mode to the intended providers without hydration regressions.
- Hosted demo reads and writes are backed by Convex, not `localStorage`.
- Two independent browser contexts can see the same customer, card, claim, profile, analytics, and audit updates.
- Admin can create a customer, register/generate/attach a card, and generate a claim code.
- Customer setup and authentication work without the email provider in hosted demo.
- Wrong customer cannot complete a claim; code reuse/revocation/expiry remains rejected.
- Unpublished draft content remains private until the authenticated customer publishes.
- Publishing changes the existing card URL from onboarding to public profile without rewriting the token.
- Local demo tests retain deterministic fixture behavior and live-mode tests retain existing Convex Auth/email behavior.
- Hosted-demo reset is idempotent and cannot remove unmarked records.

## Out of scope

- Per-customer demo workspaces or shareable workspace codes.
- A separate database or external persistence service.
- Production email-provider selection or production verification-policy changes.
- Production administrator signup.
- Visitor accounts or visitor analytics.
- Rewriting existing NFC URLs.
