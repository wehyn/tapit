# Contributing to Tapit

For developers and coding agents: read the [README](README.md) and [AGENTS.md](AGENTS.md), check `git status`, and preserve unrelated worktree changes.

## Local setup

Use Node.js 22.12+ and npm 11+. Keep `NEXT_PUBLIC_DEMO_MODE=true` locally.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

## Before changing code

- For Next.js changes, read the relevant guide in `node_modules/next/dist/docs/`.
- For Convex changes, first read `convex/_generated/ai/guidelines.md`; enforce server-side identity and access checks.
- Follow the testing policy in [AGENTS.md](AGENTS.md). Keep secrets, tokens, and customer data in ignored storage. Never run E2E or provisioning against Production.

## Verify and submit

Run `npm run verify` before claiming completion and `npm run test:e2e:demo` for local browser changes. CI also runs `npm run test:e2e`. Use [the live E2E runbook](docs/live-e2e.md) only with a dedicated development or Preview target; record NFC and QR evidence with the [device checklist](e2e/real-device-checklist.md).

In the pull request, explain the change, list checks run and their environments, and identify any live or device checks still pending. Do not include secrets or private data.
