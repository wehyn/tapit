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
the application uses deterministic local fixtures so the public and dashboard acceptance surfaces can be
checked without production data, email, or a Convex deployment. Copy `.env.example` to `.env.local` and
replace values only when configuring an isolated Convex development deployment.

When opening the dev server from another device, use the machine's LAN or Tailscale URL and set
`NEXT_ALLOWED_DEV_ORIGINS` in `.env.local` to the host/IP values you will use, separated by commas. Restart
`npm run dev` after changing it; this keeps Next.js dev resources and the demo sign-in handler available to
that browser origin.

For the non-production live Convex workflow, use the explicitly opted-in command below after aligning
`CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` to the same development deployment:

```bash
NEXT_PUBLIC_DEMO_MODE=false npx convex dev --start "npm run dev -- --hostname 127.0.0.1"
```

This command is not a production workflow. Live E2E also requires two already-provisioned Convex Auth
Password identities and their user IDs; it does not create accounts through the Convex CLI. See the complete
[live E2E runbook](docs/live-e2e.md) before opting in.

After filling an ignored `.env.live.local` with the complete live contract, load it into the shell and run the
browser gate with an explicit development target:

```bash
set -a
source .env.live.local
set +a
TAPIT_LIVE_CONVEX_DEPLOYMENT=dev npm run test:e2e:live
```

Here `dev` resolves the development deployment selected by `CONVEX_DEPLOYMENT`; keep that value and
`NEXT_PUBLIC_CONVEX_URL` aligned, and never substitute `prod` for this workflow.

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

Local demo mode never sends invitations and does not point at production data. Use separate Convex
development, preview, and production deployments. Real secrets, setup tokens, customer data, production
domains, and email credentials belong in the environment manager, never in the repository.

Demo credentials are `mara@example.test` and `admin@tapit.local`, both using `tapit-demo`. The admin can
create a browser-local invitation; the generated setup link is shown only in the admin success state.
The customer shell intentionally exposes Profile, Links, Analytics, and Account only; card operations
remain administrator-only.

Never point the live workflow at production. Keep live credentials, deployment identifiers, and user IDs in
ignored environment storage; do not add them to `.env.example` or this repository.

The MVP intentionally leaves email provider, setup-link expiry/resend policy, password recovery and
verification, unique-view method, deleted-data retention, launch jurisdiction, monitoring ownership,
production domain, and final brand assets as documented launch gates. See `docs/plan.md` before a real
pilot or production deployment.

## Acceptance and device proof

The browser suite covers the deterministic local surface. Real NFC acceptance still requires a current
iPhone and Android device with an NDEF URI card, plus QR scans from generated PNG and SVG output. Record
device model, OS/browser, card state, route, result, and evidence in `e2e/real-device-checklist.md` before
claiming device acceptance.
