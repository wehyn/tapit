# Tapit

Tapit is a mobile-first digital profile service for professionals and small businesses. A visitor taps an NFC
card or scans a QR code and lands on the owner's public profile, with no app or account required. Customers
edit and publish their profile, links, and look; administrators provision customers, manage cards and card
orders, and review analytics and audit history.

The product is defined by:

- [`docs/intent.md`](docs/intent.md): why Tapit exists and what it must achieve.
- [`docs/spec.md`](docs/spec.md): product spec, workflows, roles, and acceptance criteria.
- [`docs/DESIGN.md`](docs/DESIGN.md): information architecture and design rules.
- [`docs/plan.md`](docs/plan.md): MVP delivery plan. Feature-level designs live in `docs/specs/`,
  `docs/superpowers/specs/`, and `docs/plans/`; user-visible changes are logged in
  [`docs/CHANGELOG.md`](docs/CHANGELOG.md).

## Quick start

Requires Node.js 22.12+ and npm 11+.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The `.env.example` defaults run the **local demo**: deterministic fixtures and
browser-local storage, with no Convex deployment, OAuth, email, or production data. Sign in with:

| Role          | Email               | Password     |
| ------------- | ------------------- | ------------ |
| Customer      | `mara@example.test` | `tapit-demo` |
| Administrator | `admin@tapit.local` | `tapit-demo` |

You can also create a browser-local customer at `/login?mode=signup`. An administrator can create a
browser-local invitation; its setup link is shown only in the admin success state.

To open the dev server from another device, use the machine's LAN or Tailscale URL, list those hosts/IPs
(comma-separated) in `NEXT_ALLOWED_DEV_ORIGINS` in `.env.local`, and restart `npm run dev`.

## Tech stack

- [Next.js 16](https://nextjs.org) App Router (`src/app`) with React 19 and Tailwind CSS 4.
- [Convex](https://convex.dev) for data, server functions, file storage, crons, and HTTP upload endpoints, with
  [Convex Auth](https://labs.convex.dev/auth) (Google OAuth in live mode) and `@convex-dev/rate-limiter`.
- `zod` for validation, `qrcode` for QR output, `sharp` for image processing, Phosphor icons.
- Vitest (jsdom unit tests and `convex-test` integration tests), Playwright with axe for browser and
  accessibility tests, ESLint, Prettier, and TypeScript in strict mode.

## Repository layout

| Path                  | Contents                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `src/app/`            | Routes (see below). `src/proxy.ts` guards `/app`, `/admin`, and `/onboarding` in live mode.   |
| `src/components/`     | Tapit-owned UI, grouped by area (`workspace`, `admin`, `profile`, `card-builder`, `ui`, ...). |
| `src/lib/`            | Domain helpers; `src/lib/demo/` holds the demo fixtures, store, and mode switches.            |
| `convex/`             | Schema (`schema.ts`), queries/mutations/actions, auth, HTTP routes, crons, `demo.ts`.         |
| `convex/integration/` | Convex integration tests (`convex-test`).                                                     |
| `tests/`              | Vitest unit and component tests.                                                              |
| `e2e/`                | Playwright specs, including `live.spec.ts` and `hosted-demo.spec.ts` (both opt-in).           |
| `scripts/`            | Design-rule check, live E2E wrapper and contract, Google storage-state helper, model checks.  |
| `docs/`               | Product, design, launch, and E2E documentation.                                               |
| `design/`             | HTML mockups and redesign references.                                                         |

### Routes

- **Public:** `/` (home), `/[slug]` (public profile), `/c/[cardToken]` (card resolver), `/build-card`,
  `/privacy`, `/terms`.
- **Auth:** `/login` (`?mode=signup` for self-service signup), `/setup/[token]` (invitation setup),
  `/onboarding`.
- **Customer workspace (`/app`):** Profile, Links, Customize, Card (design and order a card), Analytics,
  Account. Card registration, replacement, and claim-code issuance remain administrator-only.
- **Admin workspace (`/admin`):** Customers, Profiles, Cards, Orders, Codes, Analytics, Audit log, Settings.
- **API:** `/api/auth` (Convex Auth) and `/api/live-contract` (non-production live-target check).

## Commands

| Command                                                 | Purpose                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm run dev`                                           | Start the Next.js dev server.                                                           |
| `npm run build && npm run start`                        | Run the production build locally.                                                       |
| `npm run verify`                                        | Design check, format check, lint, typecheck, unit + Convex tests, and build.            |
| `npm run design:check`                                  | Enforce design-token rules in `src/` (spacing, radius, text, shadows, icon imports).    |
| `npm run test` / `npm run test:watch`                   | Vitest unit (`tests/`) and Convex integration (`convex/**/*.test.ts`) tests.            |
| `npm run test:e2e:demo`                                 | Playwright suite against a forced local-demo server on port 3001.                       |
| `npm run test:e2e`                                      | Playwright suite using your current env (CI runs this). `npx playwright install` first. |
| `npx playwright test e2e/accessibility.spec.ts`         | axe checks on public, customer, and admin success states.                               |
| `npm run test:e2e:live`                                 | Guarded live suite; non-production only. See [docs/live-e2e.md](docs/live-e2e.md).      |
| `npm run convex:dev`                                    | Convex dev workflow once `CONVEX_DEPLOYMENT` and auth values are configured.            |
| `npm run lint` / `npm run typecheck` / `npm run format` | Individual checks; `format` rewrites files with Prettier.                               |

CI (`.github/workflows/ci.yml`) runs verification and a production build in parallel, then runs the demo E2E suite against that build in four Playwright shards. The merged JSON report remains available as the `playwright-e2e-results` artifact.

## Runtime modes

The app's mode is set by environment variables (see [`src/lib/demo/mode.ts`](src/lib/demo/mode.ts)):

| Mode        | Settings                                                                                | Data                                                               |
| ----------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Local demo  | `NEXT_PUBLIC_DEMO_MODE=true` (default)                                                  | Browser-local fixtures; nothing remote.                            |
| Hosted demo | `NEXT_PUBLIC_DEMO_STORAGE=convex` plus `TAPIT_DEMO_AUTH_MODE=hosted-demo` on Convex     | Shared non-production Convex data.                                 |
| Live        | `NEXT_PUBLIC_DEMO_MODE=false`, aligned `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` | A Convex dev, Preview, or Production deployment with Google OAuth. |

Keep `NEXT_PUBLIC_DEMO_MODE=true` for everyday local work. Local demo mode never sends invitations, never uses
OAuth, and never points at production data.

### Hosted demo

Set `NEXT_PUBLIC_DEMO_STORAGE=convex` with a matching non-production `NEXT_PUBLIC_CONVEX_URL`, and set
`TAPIT_DEMO_AUTH_MODE=hosted-demo` on that Convex deployment. Hosted demo data is shared across users and
devices; never point it at production.

After an operator provisions the hosted-demo administrator through its supported Auth setup flow, initialize the
fixed Mara demo seed with that identity's user ID:

```bash
npx convex run --deployment dev:your-deployment demo:initialize '{"operatorUserId":"USER_ID"}'
```

To restore the shared deployment to the fixed seed:

```bash
npx convex run --deployment dev:your-deployment demo:reset '{"operatorUserId":"USER_ID"}'
```

Reset removes only application records marked `scope: "demo"`; Convex Auth identities and ordinary unscoped
records remain. It affects every connected hosted-demo device.

The hosted card-claim E2E (`e2e/hosted-demo.spec.ts`) is separately opt-in and must target an isolated,
disposable non-production deployment. It leaves an invited customer, Auth identity, profile, and claimed card
behind, and `demo:reset` is not full cleanup, so retire the deployment after the run. Its preflight checks the
app's `/api/live-contract` against explicit expected app environment and Convex cloud/site URLs before any
writes. Read the [hosted demo E2E instructions](docs/live-e2e.md#hosted-demo-card-claim-e2e) first.

### Live mode (non-production)

For live Google OAuth development, align `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` to the same
development deployment and opt in explicitly:

```bash
NEXT_PUBLIC_DEMO_MODE=false npx convex dev --start "npm run dev -- --hostname 127.0.0.1"
```

This is not a production workflow. Live and Preview use a single `Continue with Google` action (provider ID
`google`, scopes `openid email profile`, callback `<CONVEX_SITE_URL>/api/auth/callback/google`). Register a
separate Google OAuth client and exact app origins for live development, the stable Preview origin, and
Production. Set `TAPIT_ADMIN_EMAILS` on each deployment; only an allowlisted first Google identity becomes an
administrator. Administrators create customer invitations and hand off the reusable setup links manually until
revoked; live authentication has no transactional email dependency.

The live E2E suite needs dedicated non-production Google accounts for the first administrator, a customer, and
an invited customer, and never creates Auth identities through the Convex CLI. Put the full contract in an
ignored `.env.live.local`, then run it with an explicit development or Preview target:

```bash
set -a
source .env.live.local
set +a
npm run test:e2e:live
```

The contract rejects Production URLs and deployments. Keep the selected app, Convex cloud URL, Convex site URL,
and deployment reference aligned. The [live E2E runbook](docs/live-e2e.md) covers Google provider setup, the
contract variables, storage-state creation, and the run procedure.

## Environment and data safety

- **Never point E2E, hosted demo, or provisioning at Production.** Use separate Convex development, Preview, and
  Production deployments.
- Real secrets, Google browser storage states, setup tokens, customer data, and deployment identifiers belong in
  ignored environment storage (`.env*.local`, `.secrets/`), never in the repository.
- Set the server-side Convex variable `TAPIT_ANALYTICS_RATE_LIMIT_HMAC_SECRET` on every deployment, with a
  different value of at least 32 random bytes each (for example `openssl rand -hex 32`). Analytics events are
  dropped if it is missing or too short. Never put it in a `NEXT_PUBLIC_*` variable.
- Live deployments also need `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS`, and
  `TAPIT_ADMIN_EMAILS` in Convex (see `.env.example`); generate a distinct signing-key pair per deployment.
- Production must start from a fresh deployment and a controlled first-admin allowlist; never seed it from live
  E2E or hosted-demo data. See the [launch-readiness contract](docs/launch-readiness.md) for Preview/Production
  targets, go/no-go gates, and evidence requirements.

## Acceptance and device proof

The browser suites cover the deterministic local surface. Real NFC acceptance still requires a current iPhone
and Android device with an NDEF URI card, plus QR scans of the generated PNG and SVG output. Record device
model, OS/browser, card state, route, result, and evidence in
[`e2e/real-device-checklist.md`](e2e/real-device-checklist.md) before claiming device acceptance.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODING_STANDARDS.md](CODING_STANDARDS.md). Coding agents should
also read [AGENTS.md](AGENTS.md).
