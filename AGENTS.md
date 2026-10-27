<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

# Tapit project guidance

Before editing, inspect `git status` and preserve unrelated changes and untracked assets.

For code or test work, read [CODING_STANDARDS.md](CODING_STANDARDS.md). For local, live, launch-readiness, or device verification, read its environment section. [README.md](README.md) has the stack, repo layout, routes, and runtime modes.

## Where things live

- `src/app/`: Next.js routes. Public `/[slug]` and `/c/[cardToken]`, customer `/app/*`, admin `/admin/*`. `src/proxy.ts` (not `middleware.ts`) guards protected routes in live mode only.
- `src/components/layout/navigation.ts`: the single registry for customer and admin workspace navigation.
- `src/lib/demo/`: local-demo fixtures and store. `mode.ts` decides local demo, hosted demo, or live from env.
- `convex/`: backend. `schema.ts` holds all tables; `convex/integration/*.test.ts` are `convex-test` suites run by `npm run test`.
- `scripts/`: design-rule check, live E2E wrapper and contract, card-claim model check.

## Working rules

- Every feature runs in two modes: the local demo (browser-local store in `src/lib/demo/`) and Convex. A change usually needs both paths, and the demo path must stay deterministic.
- Demo is the default whenever `NEXT_PUBLIC_DEMO_MODE` is anything other than `false`. Never flip the repository default or `.env.example` to live.
- Hosted-demo records carry `scope: "demo"` (when `TAPIT_DEMO_AUTH_MODE=hosted-demo`); `demo:reset` deletes only those.
- UI uses Tapit design tokens. `npm run design:check` (part of `verify`) rejects off-scale spacing, arbitrary radius/text/colour/shadow utilities, side borders and dividers, hover motion, and `@phosphor-icons/react` imports outside `src/components/ui/Icon.tsx`. See [docs/DESIGN.md](docs/DESIGN.md).
- Never run E2E, provisioning, admin repair, or demo seeding against Production. Never create Auth identities through the Convex CLI.

## Which doc for which task

- Product behaviour and acceptance criteria: [docs/spec.md](docs/spec.md). The root `spec.md` is a single feature spec (card-order codes and payment uploads, issues #151–153), not the product spec; other feature designs are in `docs/specs/`, `docs/superpowers/specs/`, and `docs/plans/`.
- Notable user-visible changes: [docs/CHANGELOG.md](docs/CHANGELOG.md).
- Live/hosted-demo E2E and Google OAuth: [docs/live-e2e.md](docs/live-e2e.md).
- Preview/Production release gates: [docs/launch-readiness.md](docs/launch-readiness.md).
- Physical NFC/QR evidence: [e2e/real-device-checklist.md](e2e/real-device-checklist.md).

## Repo skills

Under `.claude/skills/` and `.agents/skills/`:

- `verify-tapit`: drive the local demo with Playwright to prove a web-facing change before reporting it done.
- `verify-card-claiming`: use when changing `convex/cardClaims.ts`, claim-code mutations in `convex/cards.ts`, or the `cards`/`cardClaimChallenges` schema.
- `convex-*`: Convex task skills (auth, authz audit, migrations, tests, deploy guard, and so on).
- `pr-flow` (`.agents/skills/` only): focused feature commits and, when asked, a pull request.
