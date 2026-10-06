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

## Testing policy

- Write isolation tests before implementation.
- Highly prefer E2E tests as the sole testing mechanism. Use them to verify complex features work. At the end of E2E tests, produce a verifiable and repeatable artifact.
- If you must test a system in isolation, first write down all the ways it could fail, then write the code.

- Preserve unrelated worktree changes and untracked assets; inspect `git status` before changing files.
- Keep `NEXT_PUBLIC_DEMO_MODE=true` locally. Separate demo, hosted demo, development, Preview, and Production; never use Production for E2E or provisioning.
- Use `npm run test:e2e:demo` locally. Run live E2E only through `npm run test:e2e:live` and its non-production safety gate.
- Keep secrets, tokens, IDs, and customer data in ignored environment storage; never write directly to Convex Auth tables. The sole approved exception is the server-side account-erasure path for a verified deletion request: after linked application data is removed, it may delete that customer's Auth account, sessions, tokens, and user row. Do not use this exception for account creation, repair, or provisioning.
- For Convex changes, derive identity server-side, enforce ownership/role/scope, and keep public projections published-only.
- Run `npm run verify` before claiming completion. Separate local/demo, Preview/Production, and physical-device evidence; see `docs/live-e2e.md`, `docs/launch-readiness.md`, and `e2e/real-device-checklist.md`.
