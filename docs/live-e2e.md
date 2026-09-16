# Live E2E

`npm run test:e2e:demo` runs the deterministic local demo project. It starts the local Next.js server and
does not exercise Convex. `npm run test:e2e:live` is the fail-fast live command. It provisions a fresh test
card/customer state through the existing internal bootstrap and admin UI, then runs the serialized live
Playwright project. See the [launch-readiness contract](launch-readiness.md) for the preview release target,
go/no-go gates, and evidence requirements.

This workflow is for an explicitly named non-production Convex deployment only. Do not use production URLs,
deployments, credentials, or data.

The live suite currently contains 6 serialized browser tests. Preview runs are allowed with the complete
non-production contract below; production provisioning and live E2E are prohibited.

## 1. Configure live-mode development (optional)

Keep the repository default at `NEXT_PUBLIC_DEMO_MODE=true`. For local live development, configure an ignored
environment file with a non-production deployment and make the two Convex settings refer to that same
deployment:

```text
NEXT_PUBLIC_DEMO_MODE=false
TAPIT_APP_ENV=development
CONVEX_DEPLOYMENT=dev:your-deployment
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
TAPIT_LIVE_EMAIL_DOMAIN=example.test
TAPIT_LIVE_EMAIL_CODE_URL=http://127.0.0.1:8025/code
TAPIT_LIVE_EMAIL_CODE_TOKEN=...
```

Then use the existing combined local command:

```bash
NEXT_PUBLIC_DEMO_MODE=false npx convex dev --start "npm run dev -- --hostname 127.0.0.1"
```

`CONVEX_DEPLOYMENT` selects the development deployment and `NEXT_PUBLIC_CONVEX_URL` must be its matching
Convex URL. This is a local live-mode development workflow, not a production deployment.

### Disposable local mail adapter

Start the loopback-only, in-memory adapter in a separate terminal before running the live harness:

```bash
TAPIT_EMAIL_SINK_PROVIDER_TOKEN=local-provider-token \
TAPIT_LIVE_EMAIL_CODE_TOKEN=local-reader-token \
npm run live:email-sink
```

The adapter has two separate bearer-protected boundaries. Convex sends messages to `POST /send` through
`TAPIT_AUTH_EMAIL_API_URL`, using `TAPIT_EMAIL_SINK_PROVIDER_TOKEN`; Playwright reads only the newest opaque
code from `GET /code?email=...&kind=...` through `TAPIT_LIVE_EMAIL_CODE_URL`, using
`TAPIT_LIVE_EMAIL_CODE_TOKEN`. The default local reader URL is
`http://127.0.0.1:8025/code`. The adapter keeps only the newest code per normalized recipient in process
memory: it has no mailbox, does not persist messages, and never returns message bodies.

For local live development, `TAPIT_AUTH_EMAIL_API_URL` may point to the adapter's local `/send` route only
when Convex delivery is local and can reach that process. When Convex Cloud sends remotely, its send endpoint
must be a separately approved HTTPS route to the adapter. A tailnet-only `tailscale serve` endpoint is not
sufficient for Convex Cloud. Any tunnel or provider route must be bearer-protected, limited to the selected
development/preview run, and cleaned up after the run. Expose only `/send`; keep the `/code` reader on the
operator's loopback or another separately controlled route.

## Complete contract

Put these values in the shell environment or an ignored environment manager. The command only prints
variable names and generic errors; it never prints values, passwords, setup tokens, or CLI output from
provisioning.

```text
TAPIT_LIVE_BASE_URL=https://non-production-app.example
TAPIT_LIVE_APP_ENV=preview
TAPIT_LIVE_CONVEX_URL=https://your-preview-deployment.convex.cloud
TAPIT_LIVE_ADMIN_EMAIL=admin@example.test
TAPIT_LIVE_ADMIN_PASSWORD=...
TAPIT_LIVE_CUSTOMER_EMAIL=customer@example.test
TAPIT_LIVE_CUSTOMER_PASSWORD=...
TAPIT_LIVE_PROFILE_SLUG=tapit-test-customer
TAPIT_LIVE_PUBLISHED_BIO=A Tapit test profile.
TAPIT_LIVE_EMAIL_DOMAIN=example.test
TAPIT_LIVE_EMAIL_CODE_URL=https://preview-mailbox.example/internal/code
TAPIT_LIVE_EMAIL_CODE_TOKEN=...
TAPIT_LIVE_CONVEX_DEPLOYMENT=dev
TAPIT_LIVE_ADMIN_USER_ID=...
TAPIT_LIVE_CUSTOMER_USER_ID=...
TAPIT_LIVE_PROVISION_CONFIRM=I_UNDERSTAND_NON_PRODUCTION
```

The two Convex user IDs must already exist and correspond to the Password-provider accounts above. The
email domain must be an isolated disposable domain routed to the selected non-production mail adapter. The
authenticated code endpoint must be an operator-owned HTTPS adapter (or a localhost HTTP adapter for local
live development) that accepts the recipient and flow kind as query parameters and returns only the newest
verification token as `{ "code": "..." }`. It must require the configured reader bearer token, never expose
mailbox contents, and never be pointed at production mail. The adapter extracts the opaque token from the
Convex Auth email URL; it does not weaken email verification. This reader URL is distinct from
`TAPIT_AUTH_EMAIL_API_URL`, which is the provider-facing Convex send endpoint and must use its separate provider
bearer token. For Convex Cloud, that send endpoint must use an approved HTTPS route; tailnet-only access is
not enough.

The existing seeded customer variables (`TAPIT_LIVE_CUSTOMER_*`, `TAPIT_LIVE_PROFILE_SLUG`, and
`TAPIT_LIVE_PUBLISHED_BIO`) remain required only for the legacy seeded customer draft/public-profile and
invitation/setup coverage. The self-service journey generates its own email at the configured disposable
domain, slug, password, and bio at runtime; it does not reuse the seeded customer.
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
generates a unique disposable customer email and slug at runtime, signs up through `/login?mode=signup`, reads
the resulting verification token through the authenticated mail adapter, and verifies the email in the browser
before provisioning the profile through the authenticated app mutation. It must assert that no administrator
account or invitation is created for that customer. The existing invitation test continues to exercise the
administrator UI and one-time setup-token path; it also reads and submits its own verification token through the
same adapter. The browser assertions cover the customer-only signup surface and absence of admin controls; there
is no direct undocumented table inspection. The final reset journey starts from the disposable customer’s
authenticated Account Settings page, uses the same adapter, and proves the replacement password works. No
production deployment is permitted.

This is intentionally limited: `npx convex run` cannot create Convex Auth Password identities, and the
internal bootstrap mutation requires existing user IDs. If those identities are absent, the helper
fails with that exact limitation rather than attempting undocumented writes to Convex Auth tables.

## 2. Run the live workflow

Run the complete non-production sequence in this order:

1. Select and announce the explicitly identified `dev` or `preview` Convex deployment. Sync the current code
   to that deployment and confirm that the app URL, Convex URL, and deployment reference all target the same
   non-production environment.
2. Configure `TAPIT_SUPPORT_URL`, `TAPIT_AUTH_EMAIL_FROM`, `TAPIT_AUTH_EMAIL_API_KEY`, and
   `TAPIT_AUTH_EMAIL_API_URL` on that deployment only. The API URL is the provider-facing `POST /send` route,
   not the Playwright reader URL. For Convex Cloud, use the separately approved HTTPS route described above.
3. Provision the administrator Password identity through the supported setup/auth flow and record its user ID.
   Do not write directly to Convex Auth tables.
4. Start the local adapter with `npm run live:email-sink`, using separate provider and reader bearer tokens.
   If delivery is from Convex Cloud, expose only `/send` through the approved HTTPS route and verify that the
   route is reachable before continuing.
5. Set the complete live contract in ignored environment storage, including the reader URL/token, deployment,
   existing admin user ID, confirmation, and all app/customer values. Keep `NEXT_PUBLIC_DEMO_MODE=true` as the
   tracked repository default.
6. Run exactly:

```bash
npm run test:e2e:live
```

The command requires `TAPIT_LIVE_PROVISION_CONFIRM=I_UNDERSTAND_NON_PRODUCTION`. It fails closed before
provisioning when required variables are missing, when the Convex deployment reference is not `dev`/`preview`,
when a remotely reachable mail route is not protected/HTTPS, when local-server mode is inconsistent, or when
the confirmation is absent. Missing administrator/customer identities, missing external delivery reachability,
or missing contract variables are blockers. Do not bypass them with direct Auth-table writes or production
values. After the run, remove the temporary tunnel/provider route and stop the local adapter.

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

## Live project guard

The live Playwright project is intentionally runnable only through `npm run test:e2e:live`. The wrapper
performs the non-production preflight, verifies that the selected app reports live mode with the exact
configured Convex URL, provisions a fresh setup token, and then invokes Playwright. A direct
`npx playwright test --project live-chromium` run is rejected or skipped before any mutating test.

Live tests are serialized
because they mutate the same seeded profile; the suite covers customer draft privacy/publication plus
admin profile draft save, publish, unpublish, suspension, and restoration, as well as cards and analytics.

The generated self-service customer is intentionally disposable test data in the selected isolated deployment.
Do not attempt undocumented Convex Auth or table deletion. When operators need to remove the app account, use
the supported customer request/admin approval UI and follow the normal customer deletion workflow. The first
administrator remains operator-provisioned; public signup never creates an administrator or invitation.

This runbook does not replace manual device evidence. NFC acceptance, QR scans, and device/browser results
remain external checks and must be recorded in `e2e/real-device-checklist.md` on current physical devices.
