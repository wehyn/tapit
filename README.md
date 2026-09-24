# Tapit

Tapit is a mobile-first digital profile service for professionals and small businesses. This repository
contains the greenfield MVP described by [`docs/intent.md`](docs/intent.md), [`docs/spec.md`](docs/spec.md),
[`docs/DESIGN.md`](docs/DESIGN.md), and [`docs/plan.md`](docs/plan.md).

## Local development

Use Node.js 22.12 or newer and npm 11 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. With `NEXT_PUBLIC_DEMO_MODE=true` (the safe default in `.env.example`),
the application uses deterministic local fixtures and a persistence-equivalent local self-service signup path
so the public and dashboard acceptance surfaces can be checked without production data, email, or a Convex
deployment. Copy `.env.example` to `.env.local` and
replace values only when configuring an isolated Convex development deployment.

For a hosted demo backed by shared, non-production Convex data, set
`NEXT_PUBLIC_DEMO_STORAGE=convex` and configure the matching non-production
`NEXT_PUBLIC_CONVEX_URL`, and set `TAPIT_DEMO_AUTH_MODE=hosted-demo` on that Convex deployment.
Hosted demo data is shared across users and devices; never point it at production.

After an operator provisions the isolated hosted-demo administrator through its supported Auth setup flow,
initialize the fixed Mara demo seed with the identity's user ID:

```bash
npx convex run --deployment dev:your-deployment demo:initialize '{"operatorUserId":"USER_ID"}'
```

To restore the shared development deployment to the fixed seed, run:

```bash
npx convex run --deployment dev:your-deployment demo:reset '{"operatorUserId":"USER_ID"}'
```

Reset removes only application records marked `scope: "demo"`; Convex Auth identities and ordinary unscoped
records remain. It affects every connected hosted-demo device.

When opening the dev server from another device, use the machine's LAN or Tailscale URL and set
`NEXT_ALLOWED_DEV_ORIGINS` in `.env.local` to the host/IP values you will use, separated by commas. Restart
`npm run dev` after changing it; this keeps Next.js dev resources and the demo sign-in handler available to
that browser origin.

For non-production live Google OAuth development, use the explicitly opted-in command below after aligning
`CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` to the same development deployment:

```bash
NEXT_PUBLIC_DEMO_MODE=false npx convex dev --start "npm run dev -- --hostname 127.0.0.1"
```

This command is not a production workflow. Live E2E requires dedicated non-production Google accounts for the
allowlisted first administrator, a customer, and an invited customer. It never creates Auth identities through
the Convex CLI. See the complete [live E2E runbook](docs/live-e2e.md) before opting in.

After filling an ignored `.env.live.local` with the complete Google storage-state contract, load it into the
shell and run the browser gate with an explicit development or Preview target:

```bash
set -a
source .env.live.local
set +a
npm run test:e2e:live
```

The contract rejects Production URLs and deployments. Keep the selected development or stable Preview app,
Convex cloud URL, Convex site URL, and deployment reference aligned, and never use Production for E2E.

See the [launch-readiness contract](docs/launch-readiness.md) for preview/production release targets,
go/no-go gates, and evidence requirements.

## Commands

- `npm run dev` starts the Next.js development server.
- `npm run build && npm run start` runs the production-like app locally.
- `npm run verify` runs formatting verification, linting, strict type checking, unit tests, and a build.
- `npm run test:e2e` runs Playwright browser workflows; `npx playwright install` installs browsers.
- `npm run test:e2e:live` runs the fail-fast live workflow after its non-production credentials and
  provisioning contract is configured; see [docs/live-e2e.md](docs/live-e2e.md).
- `npx playwright test e2e/accessibility.spec.ts` runs axe checks against public, customer, and admin success states.
- `npm run convex:dev` starts the Convex development workflow once `CONVEX_DEPLOYMENT` and auth values are configured.
- `npm run format` formats repository files.

## Environment and data safety

Local demo mode never sends invitations or uses OAuth and does not point at production data. Use separate
Convex development, Preview, and Production deployments. Real secrets, Google browser storage states, setup
tokens, customer data, and deployment identifiers belong in ignored environment storage, never in the repository.

Demo credentials are `mara@example.test` and `admin@tapit.local`, both using `tapit-demo`. A visitor can create
a browser-local customer through `/login?mode=signup`; the admin can still create a browser-local invitation,
and the generated setup link is shown only in the admin success state.
The customer shell intentionally exposes Profile, Links, Analytics, and Account only; card operations
remain administrator-only.

Never point the live workflow at Production. Live and Preview use one auth action, `Continue with Google`, with
provider ID `google`, scopes `openid email profile`, and callback
`<CONVEX_SITE_URL>/api/auth/callback/google`. Register separate Google OAuth clients and exact app origins
for live development, the stable Preview origin, and Production. Set `TAPIT_ADMIN_EMAILS` on each deployment;
only an allowlisted first Google identity becomes an administrator. Customer invitations are created by an
administrator and handed off manually as reusable links until revoked. Live authentication has no transactional
email dependency.

Production must start with a fresh deployment and controlled first-admin allowlist; never seed it from live E2E
or hosted-demo data. See [docs/live-e2e.md](docs/live-e2e.md) and [docs/launch-readiness.md](docs/launch-readiness.md)
for required configuration, `npm run verify`, and approved non-production evidence gates.

## Acceptance and device proof

The browser suite covers the deterministic local surface. Real NFC acceptance still requires a current
iPhone and Android device with an NDEF URI card, plus QR scans from generated PNG and SVG output. Record
device model, OS/browser, card state, route, result, and evidence in `e2e/real-device-checklist.md` before
claiming device acceptance.
