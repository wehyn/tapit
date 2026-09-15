# Live E2E

`npm run test:e2e:demo` runs the deterministic local demo project. It starts the local Next.js server and
does not exercise Convex. `npm run test:e2e:live` is the fail-fast live command. It provisions a fresh test
card/customer state through the existing internal bootstrap and admin UI, then runs the serialized live
Playwright project.

This workflow is for an explicitly named non-production Convex deployment only. Do not use production URLs,
deployments, credentials, or data.

## 1. Configure live-mode development (optional)

Keep the repository default at `NEXT_PUBLIC_DEMO_MODE=true`. For local live development, configure an ignored
environment file with a non-production deployment and make the two Convex settings refer to that same
deployment:

```text
NEXT_PUBLIC_DEMO_MODE=false
CONVEX_DEPLOYMENT=dev:your-deployment
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

Then use the existing combined local command:

```bash
NEXT_PUBLIC_DEMO_MODE=false npx convex dev --start "npm run dev -- --hostname 127.0.0.1"
```

`CONVEX_DEPLOYMENT` selects the development deployment and `NEXT_PUBLIC_CONVEX_URL` must be its matching
Convex URL. This is a local live-mode development workflow, not a production deployment.

## Complete contract

Put these values in the shell environment or an ignored environment manager. The command only prints
variable names and generic errors; it never prints values, passwords, setup tokens, or CLI output from
provisioning.

```text
TAPIT_LIVE_BASE_URL=https://non-production-app.example
TAPIT_LIVE_ADMIN_EMAIL=admin@example.test
TAPIT_LIVE_ADMIN_PASSWORD=...
TAPIT_LIVE_CUSTOMER_EMAIL=customer@example.test
TAPIT_LIVE_CUSTOMER_PASSWORD=...
TAPIT_LIVE_PROFILE_SLUG=tapit-test-customer
TAPIT_LIVE_PUBLISHED_BIO=A Tapit test profile.
TAPIT_LIVE_CONVEX_DEPLOYMENT=dev
TAPIT_LIVE_ADMIN_USER_ID=...
TAPIT_LIVE_CUSTOMER_USER_ID=...
TAPIT_LIVE_PROVISION_CONFIRM=I_UNDERSTAND_NON_PRODUCTION
```

The two Convex user IDs must already exist and correspond to the Password-provider accounts above.
Use the CLI-supported `preview` or `preview/<branch>` reference instead when the live app is connected to
an isolated preview deployment. The `TAPIT_LIVE_CONVEX_DEPLOYMENT` value is passed to `npx convex run
--deployment`; it is separate from `CONVEX_DEPLOYMENT=dev:<deployment>` in the Next.js environment file.
Provision the first administrator Password identity through the supported operator setup flow for the selected
deployment. The live customer is created by the browser suite through the public customer signup mode with a
unique runtime email and slug; it does not need a pre-provisioned customer identity, customer user ID, or
invitation. Keep any seeded customer contract values only for the existing invitation/setup coverage.

The first administrator is an operator-provisioned Password identity, not an open administrator signup route:
use the supported sign-up operation only from an approved setup surface for the isolated deployment, then run
bootstrap to link that user ID to the admin customer record. After that, the administrator signs in through
`/login` like every other account. The public login page exposes only customer self-service signup.

After the administrator identity exists, run the existing internal `bootstrap:bootstrap` mutation through
`npm run test:e2e:live`; the helper supplies the admin ID and a fresh card token. The live signup test then
generates a unique disposable customer email and slug at runtime, signs up through `/login?mode=signup`, and
provisions the profile through the authenticated app mutation. It must assert that no administrator account or
invitation is created for that customer. The existing invitation test continues to exercise the administrator UI
and one-time setup-token path.

This is intentionally limited: `npx convex run` cannot create Convex Auth Password identities, and the
internal bootstrap mutation requires existing user IDs. If those identities are absent, the helper
fails with that exact limitation rather than attempting undocumented writes to Convex Auth tables.

## 2. Run the live workflow

Once the two identities, their user IDs, and all values in the contract are configured, run exactly:

```bash
npm run test:e2e:live
```

The command requires `TAPIT_LIVE_PROVISION_CONFIRM=I_UNDERSTAND_NON_PRODUCTION`. It fails before
provisioning when required variables are missing, when the Convex deployment reference is not `dev`/`preview`,
when local-server mode is inconsistent, or when the confirmation is absent. The base URL, Convex deployment,
and credentials must all describe the same non-production environment.

The first customer journey also uploads `public/images/tapit-demo-mara-avatar.png` through the owned
profile-image path. The browser receives a profile-scoped upload URL, posts the client-prepared JPEG, and
finalizes it through the authenticated attach action. The image is visible in the customer preview and only
appears in the signed-out slug/card projections after publication. Rejected formats and files over 5 MB leave
the existing image unchanged; Convex Storage cleanup and the profile-image ownership mapping are exercised by
the local Convex integration tests.

## Local live build

The live E2E harness has a separate local-server switch. To have `npm run test:e2e:live` start Next.js itself,
use a local base URL and opt in explicitly:

```text
TAPIT_LIVE_BASE_URL=http://127.0.0.1:3000
TAPIT_LIVE_LOCAL_SERVER=true
```

The live config then starts `npm run dev -- --hostname 127.0.0.1`. The Convex deployment used for
provisioning remains the explicit `TAPIT_LIVE_CONVEX_DEPLOYMENT` target.

For a remote live base URL, leave `TAPIT_LIVE_LOCAL_SERVER` unset or set it to a value other than `true`.
The harness never starts a local Next.js server in that mode. Do not run both local-server workflows on the
same port at once.

## Direct Playwright usage

Direct `npx playwright test --project live-chromium` keeps the fixture's useful skip message, but it
requires the complete runtime contract, including the one-time setup values:

```text
TAPIT_LIVE_SETUP_EMAIL=...
TAPIT_LIVE_SETUP_PASSWORD=...
TAPIT_LIVE_SETUP_TOKEN=...
```

Use the npm live command for repeatable provisioning and fresh setup tokens. Live tests are serialized
because they mutate the same seeded profile; the suite covers customer draft privacy/publication plus
admin profile draft save, publish, unpublish, suspension, and restoration, as well as cards and analytics.

This runbook does not replace manual device evidence. NFC acceptance, QR scans, and device/browser results
remain external checks and must be recorded in `e2e/real-device-checklist.md` on current physical devices.
