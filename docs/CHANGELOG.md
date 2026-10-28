# Change log

## 2026-10-28 — Resettable Demo accounts

- Administrators promote customers to Demo before promoting them to Administrator. Demo customers can reset their Tapit data and linked cards, then onboard again with the same sign-in identity; ordinary customer deletion is unchanged.

## 2026-10-28 — Admin owner-access override

- Administrators can grant or revoke owner-feature access for an active customer from Customers. Each state change is audited and does not create a card claim or change card records; normal card claims still require the card token and one-time code.

## 2026-10-28 — Card-order offers, usage limits, and admin copy

- Admins configure offer pricing and shared order-use caps separately from referrer attribution. Exact aliases such as `FOUNDING` and `FOUNDING-AHRON` share one offer without parsing code strings.
- The Codes page shows each offer once, its uses consumed and remaining, and each alias's explicit offer/referrer mapping. Its copy describes codes generally.
- Convex and local demo checkout enforce the same shared caps, including when orders are submitted concurrently. Canceled and refunded orders remain counted.

## 2026-10-28 — Cardless customer limits

- Customers can edit and publish before claiming a card, with up to three links and the Paper, Moss, or Night preset. Claiming a card with its one-time code unlocks fine-tuning, slideshow uploads, analytics, and card-owner tools. Profile photos and background images remain available before claiming.
- Cardless customers can reach ordering and claiming from the Card section. Account and Help appear in both the sidebar and account menu.

## 2026-10-26 — Remove inert workspace search

- The workspace top bar no longer shows the ⌘K search button, which had no behaviour.

## 2026-10-21 — Workspace shell and navigation

- Customer and admin workspaces share one shell built from a typed navigation registry. Desktop uses a 248px labelled sidebar with a Customer / Admin switch for administrators. Mobile uses a bottom tab bar and a More sheet; administrators keep their own tabs.
- Every workspace page has a top bar with breadcrumbs, a ⌘K search button that has no behaviour yet, and a save-state pill driven by the draft save context.
- Build card moved from `/app/account/build-card` to `/app/card`. The old path redirects permanently.
- The first-visit navigation tour is removed. The Profile page shows a "Finish your profile" checklist derived from profile data until every step is done.

Validation for this change:

- `npx tsc --noEmit`, `npm run lint` (0 errors, 3 existing warnings), `npm run build`
- `npx vitest run` — 58 files, 573 tests passed
- `npm run test:e2e:demo` — 152 passed, 1 skipped, 1 failed on a browser protocol error in the focus-style spec that passed when rerun alone

## 2026-09-24 — Public profile customization

- Added the guided Warm Studio customization flow for public profiles, including accent, type scale, link treatment, content order, featured links, automatic contact actions, and one optional About or Services disclosure.
- Legacy profiles keep their existing appearance until an explicit Warm Studio opt-in is published; direct profile URLs, active card paths, previews, and vCards continue to use the published projection.

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
