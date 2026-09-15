# Live E2E

`npm run test:e2e:demo` runs the deterministic local demo project. It starts the local Next.js server and
does not exercise Convex. `npm run test:e2e:live` is the fail-fast live command; it never starts a local
Next.js server for a remote base URL.

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
TAPIT_LIVE_CONVEX_DEPLOYMENT=dev-or-preview-reference
TAPIT_LIVE_ADMIN_USER_ID=...
TAPIT_LIVE_CUSTOMER_USER_ID=...
TAPIT_LIVE_PROVISION_CONFIRM=I_UNDERSTAND_NON_PRODUCTION
```

The two Convex user IDs must already exist and correspond to the Password-provider accounts above.
The helper runs the existing internal `bootstrap:bootstrap` mutation with a fresh card token, then signs
in through the administrator UI and calls the existing `customers.createCustomer` flow. That UI flow
generates a fresh setup token and profile slug for each run; the token and generated setup password are
passed only to that run's child Playwright process.

This is intentionally limited: `npx convex run` cannot create Convex Auth Password identities, and the
internal bootstrap mutation requires existing user IDs. If those identities are absent, the helper
fails with that exact limitation rather than attempting undocumented writes to Convex Auth tables.

## Local live build

To exercise a local live-mode Next build, use a local base URL and opt in explicitly:

```text
TAPIT_LIVE_BASE_URL=http://127.0.0.1:3000
TAPIT_LIVE_LOCAL_SERVER=true
```

The live config then starts `npm run dev -- --hostname 127.0.0.1`. The Convex deployment used for
provisioning remains the explicit `TAPIT_LIVE_CONVEX_DEPLOYMENT` target.

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
