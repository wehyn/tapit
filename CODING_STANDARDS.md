# Coding standards

## Tests

Prefer E2E as the sole testing mechanism, especially for complex features, and produce a repeatable artifact from each E2E run. If isolation testing is necessary, list the ways the system could fail before writing the test, and write it before implementation.

Use `npm run test:e2e:demo` for local E2E. Run `npm run test:e2e:live` only through its non-production safety gate. Run `npm run verify` before reporting completion.

## Convex auth and data

Derive identity server-side, enforce ownership, role, and scope, and expose only published data in public projections.

Use supported account flows for Convex Auth; never write directly to Auth tables. The sole exception is the server-side account-erasure path for a verified deletion request: after linked application data is removed, it may delete that customer's Auth account, sessions, tokens, and user row. This exception does not cover account creation, repair, or provisioning.

## Environment and evidence

When setting up local work, keep `NEXT_PUBLIC_DEMO_MODE=true`. Distinguish demo, hosted demo, development, Preview, Production, and physical-device evidence. Use the local/demo and live E2E commands under Tests; Production is never an E2E or provisioning target.

Keep secrets, tokens, IDs, and customer data in ignored environment storage.

For live E2E, launch readiness, or device evidence, consult [`docs/live-e2e.md`](docs/live-e2e.md), [`docs/launch-readiness.md`](docs/launch-readiness.md), and [`e2e/real-device-checklist.md`](e2e/real-device-checklist.md) as applicable. State which environment each verification covers.
