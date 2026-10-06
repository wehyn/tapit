# Coding standards

Load the section that matches the work.

## Tests

When changing code, write isolation tests before implementation when isolation testing is needed. Prefer E2E as the main verification for complex features; produce a repeatable artifact from E2E runs. Before adding an isolation test, list the ways the system could fail.

Use `npm run test:e2e:demo` for local E2E. Run `npm run test:e2e:live` only through its non-production safety gate. Run `npm run verify` before reporting completion.

## Convex auth and data

When working on Convex, read `convex/_generated/ai/guidelines.md` first. Derive identity server-side, enforce ownership, role, and scope, and expose only published data in public projections.

Keep secrets, tokens, IDs, and customer data in ignored environment storage. Never write directly to Convex Auth tables. The sole exception is the server-side account-erasure path for a verified deletion request: after linked application data is removed, it may delete that customer's Auth account, sessions, tokens, and user row. This exception does not cover account creation, repair, or provisioning.

## Environment and evidence

When setting up local work, keep `NEXT_PUBLIC_DEMO_MODE=true`. Distinguish demo, hosted demo, development, Preview, Production, and physical-device evidence. Use the local/demo and live E2E commands under Tests; Production is never an E2E or provisioning target.

For live E2E, launch readiness, or device evidence, consult [`docs/live-e2e.md`](docs/live-e2e.md), [`docs/launch-readiness.md`](docs/launch-readiness.md), and [`e2e/real-device-checklist.md`](e2e/real-device-checklist.md) as applicable. State which environment each verification covers.
