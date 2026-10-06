# Contributing to Tapit

Read the [README](README.md) for the project overview and [AGENTS.md](AGENTS.md) for repository instructions.

## Local setup

Use Node.js 22.12+ and npm 11+. Keep `NEXT_PUBLIC_DEMO_MODE=true` locally.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

## Before changing code

Follow [CODING_STANDARDS.md](CODING_STANDARDS.md) for coding, testing, Convex auth/data, and environment-specific verification.

## Verify and submit

Use the verification commands and environment runbooks listed in [CODING_STANDARDS.md](CODING_STANDARDS.md). CI also runs `npm run test:e2e`.

In the pull request, explain the change and list checks run with their environments, plus any live or device checks still pending. Keep secrets and private data in ignored storage.
