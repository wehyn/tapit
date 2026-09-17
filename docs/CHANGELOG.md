# Change log

## 2026-09-17 — Hosted demo and card registry fixes

- Hosted demo authentication now stays client-authenticated when the app is opened from another device on a LAN or tailnet. This avoids secure-cookie redirects over plain HTTP while preserving the production Next.js auth-proxy path.
- Authenticated hosted-demo users keep their requested return path, including card-claiming and onboarding URLs.
- Customer and deletion-request responses use schema-derived Convex document validators, so scoped hosted-demo records are returned safely.
- Analytics pagination now validates the complete analytics document, including the optional hosted-demo `scope` field.
- The live admin card registry shows the profile's existing active or claimable card and prevents an administrator from attempting a second live attachment. Card replacement remains an explicit operation and retains historical inactive/replaced card records.
- The hosted demo continues to use shared, non-production Convex storage. Email verification and password-reset delivery remain deferred for this testing setup.

Validation for this change:

- `npm run typecheck`
- `npm test -- --run` — 154 tests passed
- ESLint on the modified analytics and card-registry files
- `npx convex dev --once` against the configured development deployment
