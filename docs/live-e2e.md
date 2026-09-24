# Live Google OAuth E2E

`npm run test:e2e:demo` is the deterministic local browser suite. It keeps
`NEXT_PUBLIC_DEMO_MODE=true`, uses local fixtures, and does not exercise Convex or Google OAuth. Hosted demo is
also separate: it may use `NEXT_PUBLIC_DEMO_STORAGE=convex` with `TAPIT_DEMO_AUTH_MODE=hosted-demo` on an
isolated non-production Convex deployment. Hosted demo password compatibility is not live-auth evidence.

`npm run test:e2e:live` is the guarded live suite. It is allowed only against a named development deployment or
stable Preview deployment, never Production. The wrapper fails closed before provisioning when the contract is
missing, points at Production, contains credentials in a URL, has mismatched Convex origins, or reports an app
provider other than Google.

## Google provider setup

Configure a separate Google OAuth client for each live development deployment, the stable Preview origin, and
Production. Register the exact browser origins used by that environment and the matching Convex Auth callback:

```text
https://<app-origin>/
https://<CONVEX_SITE_URL>/api/auth/callback/google
```

The provider ID is `google` and the scopes are `openid email profile`. Set the Google client values
`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` on the matching Convex deployment. Keep `CONVEX_SITE_URL`, the
Convex cloud URL, the app's `NEXT_PUBLIC_CONVEX_URL`, and the selected deployment reference aligned.

Set `TAPIT_ADMIN_EMAILS` to the comma-separated normalized addresses allowed to become the first administrator.
Only a new Google identity whose verified email is in that allowlist can become an administrator. Existing
pending, invited, active, or deleted accounts are never promoted by a later allowlist change.

Invitations are manual. An administrator creates an invitation in the app, copies the returned setup link, and
hands it to the matching verified Google account. The link is reusable by that linked identity until revoked and
has no transactional email or email adapter dependency. The invited profile remains private until publication.

## Non-production contract

Store this contract in ignored environment storage. Google storage-state files are credentials: keep them out of
Git, use one dedicated account per state, restrict their file permissions, and never print their contents.

```text
TAPIT_E2E_MODE=live
TAPIT_LIVE_BASE_URL=https://non-production-app.example
TAPIT_LIVE_APP_ENV=development|preview
TAPIT_LIVE_CONVEX_URL=https://deployment.convex.cloud
TAPIT_LIVE_CONVEX_DEPLOYMENT=dev:<deployment>|preview/<branch>
NEXT_PUBLIC_CONVEX_SITE_URL=https://deployment.convex.site
TAPIT_LIVE_ADMIN_EMAIL=admin@example.test
TAPIT_LIVE_ADMIN_GOOGLE_STATE=.secrets/google-admin.json
TAPIT_LIVE_CUSTOMER_EMAIL=customer@example.test
TAPIT_LIVE_CUSTOMER_GOOGLE_STATE=.secrets/google-customer.json
TAPIT_LIVE_INVITED_EMAIL=invited@example.test
TAPIT_LIVE_INVITED_GOOGLE_STATE=.secrets/google-invited.json
TAPIT_LIVE_PROFILE_SLUG=tapit-live-customer
TAPIT_LIVE_PUBLISHED_BIO=A dedicated non-production test profile.
TAPIT_LIVE_PROVISION_CONFIRM=I_UNDERSTAND_NON_PRODUCTION
```

The wrapper also accepts `TAPIT_LIVE_LOCAL_SERVER=true` only when the base URL is a loopback HTTP app started by
the wrapper. Remote targets must use HTTPS. Do not put passwords, OAuth tokens, raw invitation tokens, Auth user
IDs, email-reader URLs, or Production values in this contract.

Create each storage state with the visible Chromium helper, one account at a time:

```bash
npm run live:google-state -- .secrets/google-admin.json
npm run live:google-state -- .secrets/google-customer.json
npm run live:google-state -- .secrets/google-invited.json
```

The helper opens Google in visible Chromium, waits for the operator to complete sign-in, and writes only the
Playwright storage state after explicit terminal confirmation. It does not capture or log passwords, cookies,
OAuth credentials, or customer data.

## Run the approved non-production suite

1. Select and announce the exact development or stable Preview app, Convex cloud URL, Convex site URL, and
   deployment reference. Confirm the Google client callback and registered origin match that target.
2. Confirm `TAPIT_ADMIN_EMAILS` contains the controlled first admin and that all three dedicated states belong to
   the declared emails.
3. Keep the repository default at `NEXT_PUBLIC_DEMO_MODE=true`; load the ignored live contract only in the run
   shell.
4. Run `npm run test:e2e:live`. The wrapper verifies `/api/live-contract`, auth provider, origin matching, and
   image CORS before it creates an invitation through the admin UI. The raw setup token remains process memory.
5. Remove disposable application records with supported customer/admin flows after the run. Never write Convex
   Auth tables directly and never run this workflow against Production.

The live matrix covers first allowlisted admin sign-in, pending Google onboarding with an editable prefilled name,
private profile creation, returning active access, pending deletion and restart, matching invitation setup,
missing-link and wrong-email rejection, invitation replay until revocation, allowlist non-promotion, manual role
changes, and admin profile/card/analytics behavior. It also proves public profile privacy before publication.

Live E2E evidence is valid only when the target, Google client configuration, three state paths, declared emails,
and confirmation are recorded without exposing secrets. Until a dedicated non-production target is provisioned,
the live suite remains unrun; local/demo evidence does not establish live or Production readiness.

## Local live target

For a local Next.js server connected to a dedicated development deployment, use a loopback app URL and keep the
Convex URLs remote and matching:

```text
TAPIT_LIVE_BASE_URL=http://127.0.0.1:3000
TAPIT_LIVE_LOCAL_SERVER=true
TAPIT_LIVE_APP_ENV=development
TAPIT_LIVE_CONVEX_URL=https://deployment.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://deployment.convex.site
```

The callback still belongs to the Convex site URL. The browser origin registered for the Google client must match
the app origin used by the run. Never use a Production Convex URL or Google client for local live testing.

## Related verification

Run `npm run verify` before claiming repository completion. Run `npm run test:e2e:demo` separately for local/demo
acceptance. Physical NFC, QR, and device evidence remains an external check recorded in
`e2e/real-device-checklist.md`.
