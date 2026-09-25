# Production-only live-mode cutover design

**Date:** 2026-09-25 12:05 Asia/Manila

**Status:** Revised after Production preflight; provider changes pending exact-target approval

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
- The matching Convex Production deployment is `giddy-armadillo-255` (`https://giddy-armadillo-255.convex.cloud`, `https://giddy-armadillo-255.convex.site`). Its dashboard reports **Never deployed**, and its environment-variable list is empty. The `users`, `authAccounts`, `customers`, `profiles`, `cards`, and `invitations` tables were confirmed empty in the dashboard.
- The available Google Cloud account reached its project quota. Google Cloud counts projects pending deletion against that quota until permanent deletion. The user approved dedicating the existing, apparently unused project `sigma-celerity-399507` to Tapit Production OAuth; it has been renamed `Tapit Production OAuth`. The Google Auth Platform consent configuration and a web client with the exact Production origin and callback now exist. The external audience remains in Testing, with only the approved initial administrator added as a test user. Google disables publication until the branding includes an approved public privacy-policy URL. The operator confirmed Wayne Garcia, the Philippines, and `wayneegarcia@gmail.com` as privacy contact. A draft is in `docs/privacy-notice-draft.md`; retention, deletion, and analytics decisions remain open.
- The controlled initial administrator is `wayneegarcia@gmail.com`, and the approved initial support destination is `mailto:wayneegarcia@gmail.com`.

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
- the platform Production `CONVEX_SITE_URL`, `SITE_URL` set to the stable app origin, and `TAPIT_SUPPORT_URL`; and
- no `TAPIT_DEMO_AUTH_MODE=hosted-demo` setting.

The Google OAuth client must allow the exact Production app origin and callback `<CONVEX_SITE_URL>/api/auth/callback/google`. Preview or development credentials must not be reused for Production. Because `NEXT_PUBLIC_*` settings are build-time values, changing Vercel variables requires a new Production build/deployment.

## 5. Cutover sequence and safeguards

1. Record the current Production deployment and alias. Record environment-variable names/targets and preserve the prior configuration through the providers' managed settings; do not print or commit secret values. Inspect Convex Production identity and configuration without exposing customer data.
2. Confirm that the Production application and Auth tables are empty or stop for a compatibility assessment. Use the approved dedicated Google Cloud project `sigma-celerity-399507`, configure its OAuth consent branding, and create a Production web client with the exact app origin and Convex callback. Preserve its secret only in provider-managed secret storage. Before public sign-in is offered, approve and publish an accurate privacy notice, link it from the homepage and Google branding, and make the external audience available beyond test users.
3. After explicit approval naming `giddy-armadillo-255` and the exact variable operations, configure Convex Production and deploy the approved `main` Convex code to that deployment for the first time. Verify the functions, auth issuer, and deployment health before changing Vercel's mode flag. This first backend deployment is part of the cutover, not an existing prerequisite.
4. After exact-target approval of the Vercel changes, update only Vercel Production variables. Leave Development and Preview targets untouched. Trigger a new Production build from the approved application commit so the public mode is compiled as live.
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
