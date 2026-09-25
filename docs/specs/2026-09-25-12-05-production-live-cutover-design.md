# Production-only live-mode cutover design

**Date:** 2026-09-25 12:05 Asia/Manila

**Status:** Draft for user review

**Scope:** Configure the hosted Production environment for live Google authentication and Convex data while retaining demo mode for local development and E2E.

## 1. Decision summary

Tapit's existing `main` already contains a live Google OAuth path. The Production Vercel environment currently selects demo mode, so `/login` renders the demo flow. The cutover will configure only Vercel Production and its matching Convex Production deployment to use the existing live path.

Local development and the deterministic `npm run test:e2e:demo` workflow will remain in demo mode. The hosted-demo implementation and the guarded non-production live E2E workflow remain available. Production will not be used for E2E or test-data provisioning.

No application-code change is expected for this cutover. The public deployment contract and login page will be checked after the new Production build is ready.

## 2. Goals and non-goals

### Goals

- Show `Continue with Google` on the Production login page.
- Send Production authentication and application data to the matching Convex Production deployment.
- Keep local, Preview, and E2E settings unchanged unless preflight identifies a required non-production check.
- Keep Google OAuth credentials and the initial administrator allowlist in Convex Production environment storage.
- Make the change reversible by recording the current Production deployment and environment settings before cutover.

### Non-goals

- Remove local or hosted demo code, fixtures, documentation, or E2E coverage.
- Run Production E2E, seed test data, or create Auth records through CLI/database operations.
- Change account lifecycle, invitation, authorization, or profile-publication behavior.
- Claim full Production launch readiness from the appearance of the Google button alone.

## 3. Current findings

- The deployed `main` commit already includes the Google login component and the live Convex provider path.
- The live runtime is selected at build time by `NEXT_PUBLIC_DEMO_MODE`; the current Production deployment reports `mode=demo`.
- The Vercel Production environment currently lists `NEXT_PUBLIC_DEMO_MODE`, `NEXT_PUBLIC_DEMO_STORAGE`, and `NEXT_PUBLIC_APP_URL`. It does not list `NEXT_PUBLIC_CONVEX_URL` or `NEXT_PUBLIC_CONVEX_SITE_URL`.
- Production Convex deployment identity, data state, Google credentials, admin allowlist, and OAuth callback registration still need a read-only preflight. Do not infer their presence from the Vercel project configuration.

## 4. Environment contract

Before changing Production, identify the exact Convex Production deployment and confirm it is the intended target. Confirm its current application-data state and the approved first-administrator email. Keep all secret values out of Git and command output.

Vercel Production must use:

- `NEXT_PUBLIC_DEMO_MODE=false`;
- no `NEXT_PUBLIC_DEMO_STORAGE` setting;
- `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` from the same Production Convex deployment;
- `NEXT_PUBLIC_APP_URL` set to the approved stable Production origin; and
- `TAPIT_APP_ENV=production` as the public live-contract environment label.

Convex Production must use the matching Google OAuth client and policy values:

- `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`;
- `TAPIT_ADMIN_EMAILS` containing the controlled initial administrator email;
- the Production `CONVEX_SITE_URL` and `TAPIT_SUPPORT_URL`; and
- no `TAPIT_DEMO_AUTH_MODE=hosted-demo` setting.

The Google OAuth client must allow the exact Production app origin and callback `<CONVEX_SITE_URL>/api/auth/callback/google`. Preview or development credentials must not be reused for Production. Because `NEXT_PUBLIC_*` settings are build-time values, changing Vercel variables requires a new Production build/deployment.

## 5. Cutover sequence and safeguards

1. Record the current Production deployment and alias. Record environment-variable names/targets and preserve the prior configuration through the providers' managed settings; do not print or commit secret values. Inspect Convex Production identity and configuration without exposing customer data.
2. Stop if the Convex target, data state, initial-admin email, OAuth client/callback, or required configuration is missing or ambiguous. Resolve the specific prerequisite before changing the mode flag.
3. After explicit approval of the concrete Production changes, update only the Vercel Production variables and the matching Convex Production variables. Leave Development and Preview targets untouched.
4. Trigger a new Production build so the public mode is compiled as live.
5. Verify the new deployment reports `{ "mode": "live", "authProvider": "google", "appEnvironment": "production" }` from `/api/live-contract`, and that `/login` renders `Continue with Google` without the demo password form.
6. Do not click through the Production OAuth flow as an automated test: the first allowlisted sign-in can create the Production administrator record. The controlled administrator's first sign-in is a separate, deliberate operator action after configuration is confirmed.

Convex Production mutations require a fresh, explicit confirmation naming the target deployment and exact variables or deployment action. Production E2E and test provisioning remain prohibited. No direct writes to Convex Auth tables are allowed.

## 6. Failure handling and rollback

If the live contract, login page, or deployment health check fails, do not proceed with a first administrator sign-in. Restore the recorded Production environment settings and route the Production alias back to the previously healthy deployment, then verify the restored public contract. Preserve the failure response and deployment IDs without recording secrets or customer data.

If preflight discovers existing Production application accounts or data, stop and assess account/data compatibility before enabling the Google-only flow. This design does not authorize data deletion, migration, or account provisioning.

## 7. Acceptance criteria

1. Local development still defaults to deterministic demo mode.
2. `npm run test:e2e:demo` remains the local E2E workflow and is not pointed at Production.
3. This cutover changes only Vercel Production, which points to its matching Convex Production deployment; Development and Preview settings remain as found.
4. Google OAuth's Production origin and callback match the stable app and Convex Production URLs.
5. The deployed Production live contract reports Google authentication and the Production environment.
6. The Production login page shows `Continue with Google`; the demo password form is absent.
7. No Production E2E, test-data seeding, or automated first-admin sign-in is performed.
8. Any launch-readiness gates outside this authentication-mode cutover remain separately tracked.

## 8. Implementation boundary

Implementation is limited to the Production configuration and deployment steps above. Local demo code, Preview configuration, E2E scripts, and unrelated application behavior remain unchanged. If the preflight reveals that the current live path cannot satisfy this contract, stop and revise the design before making code changes.
