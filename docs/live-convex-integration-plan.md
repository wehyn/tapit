# Live Convex Vertical Slice Plan

**Status:** Complete for the non-production live Convex integration; production deployment and manual device checks are deferred launch gates
**Date:** 2026-09-15
**Repository:** `tapit`

## Objective

Track the migration from the browser-local demo adapter to a live Convex-backed application, prove the integrated customer journey in a real browser, and complete the deployment cutover safely.

The first live slice is intentionally narrow:

1. A user can authenticate with Convex Auth.
2. An authenticated customer can read and save only their own profile draft.
3. Publishing promotes a validated draft to the public profile projection.
4. An unauthenticated visitor can read only the published projection by slug.
5. An administrator and test customer can be bootstrapped safely and repeatably.
6. Automated tests prove both the happy path and the negative ownership cases.

Links, Cards, Analytics, and Admin operations are now wired to Convex. The selected non-production browser
matrix covers cards, analytics, and admin/profile flows; broader operation, preview/production, and manual
evidence remains part of the cutover gates.

## Current state

The repository now contains the Convex-backed application boundary, its domain hardening, separate live/demo browser suites, and the deterministic local regression surface.

- Next.js `16.3.5`, React `19.3.0`, Convex `1.45.0`, and `@convex-dev/auth` `0.0.95` are installed.
- `convex/schema.ts` models customers, profiles, owned `profileImages`, links, cards, analytics, audit logs, invitations, deletion requests, and settings.
- `convex/auth.ts`, `convex/auth.config.ts`, and `convex/http.ts` already configure the Password provider and Convex Auth HTTP routes.
- `convex/profiles.ts` contains server-side draft, publication, public-by-slug, and ownership checks, with corresponding Convex integration coverage.
- `src/components/providers/LiveProviders.tsx` mounts the Convex Auth provider when live mode is selected; the root layout retains the demo provider as an explicit fallback.
- Live-mode login, setup, profile editing, public profiles, dashboards, and admin screens use Convex; demo mode continues to use `src/lib/demo/store.ts` for deterministic local acceptance tests.
- `convex/integration/*.test.ts` covers authentication, ownership, content, analytics, and remaining operations. `e2e/live.spec.ts` and `scripts/live-e2e.mjs` provide the live browser contract, while the existing Playwright suite remains the demo regression surface.
- `NEXT_PUBLIC_DEMO_MODE=true` remains the safe local default until the live slice passes its cutover gates.
- A non-production development deployment has been exercised by the live browser suite, including the owned image slice. Production/preview configuration, production auth operations, and manual device/public-profile evidence are intentionally deferred until launch preparation.

The generated Convex files and managed AI guidance in `convex/_generated/ai/`, `.agents/`, and `.claude/` are current and are kept with the repository tooling. Any Convex implementation must follow those generated guidelines, especially server-derived identity, complete argument validators, function references, bounded queries, and `ConvexProviderWithAuth`/the Convex Auth provider rather than a plain Convex provider.

## Implementation checkpoint

The live application boundary is based on `main` at `a260100`; the current worktree adds bootstrap integrity, live-runbook hardening, and the owned image slice. The current evidence is `npm run verify`, `npm run test:e2e:demo -- --workers=1`, focused Convex storage tests, Convex code generation/typechecking, `npx convex ai-files status` (all managed guidance current), `npm run test:e2e:live` (four tests passed against the selected non-production deployment, including owned image privacy/publication), and `git diff --check`.

The remaining work is launch preparation: configure preview/production separately, complete the production first-admin and email/recovery runbook, then perform the manual device/public-profile checks. None of those gates blocks the current non-production integration scope.

## Decisions and boundaries

### Authentication

- Use the installed Convex Auth Password provider for email/password sign-in and sign-up.
- Use `ConvexAuthNextjsProvider` from `@convex-dev/auth/nextjs` in the client provider, with the installed package's server provider/middleware integration where the Next.js 16 runtime requires it.
- Keep `/api/auth` as the auth route unless the implementation proves that a different route is required.
- Derive identity inside Convex functions. Do not accept a caller-supplied user ID, email, or role as an authorization input.
- Continue using the `customers.userId` relationship for application authorization, but verify that it is linked to the authenticated Convex Auth user before allowing customer operations.
- Keep email verification, password reset, production email delivery, and rate limiting as explicit pre-launch gates unless the live slice exposes a blocker that requires them sooner.

### File storage boundary

- Live mode uses an owned Convex Storage lifecycle. A profile-scoped upload URL requires authenticated
  profile access; the attach action reads the stored Blob, validates JPEG/PNG/WebP magic bytes and the
  5 MB limit, and records the storage ID in the `profileImages` ownership table before it can be used.
- New draft and published snapshots carry only the storage reference. Owner reads resolve draft and published
  URLs for preview; slug and card projections resolve only a mapped published reference for new uploads, so
  draft images remain private. A legacy `imageUrl` is retained only for snapshots written before this storage
  boundary. Replacement, removal, and approved account deletion clean files only when they are no longer
  referenced.
- Demo mode retains the browser-local resized data-URL path and never calls Convex Storage. The current
  client optimization creates one bounded 1200px JPEG display image; responsive variants, abandoned-upload
  retention, and the final production retention policy remain explicit launch gates.

### Data access

- Customer profile reads and writes use Convex function references generated from `convex/_generated/api`.
- The public profile query returns a deliberately small published projection. It never returns `draft`, customer records, invitations, audit data, or unpublished content.
- Profile publication remains an explicit mutation. Saving a draft must not alter what an unauthenticated visitor sees.
- Ownership checks stay in Convex even when the UI hides another customer's profile ID.
- New backend functions use validators and indexes. Queries that can grow must be bounded or paginated; existing unbounded MVP list queries are reviewed as part of the later migration.

### Demo mode and cutover

- Keep the demo adapter as a deterministic local regression surface while the live deployment is being verified.
- The runtime mode boundary is implemented: `NEXT_PUBLIC_DEMO_MODE=false` selects the Convex provider and live data path, while the safe local default remains demo mode.
- The live slice must pass with demo mode disabled against a non-production Convex deployment before the demo adapter is retired.
- Do not commit real deployment URLs, auth secrets, bootstrap secrets, passwords, or setup tokens.

### Bootstrap strategy

Use an idempotent, deployment-scoped bootstrap flow rather than hand-editing Convex tables:

- Create or reconcile one administrator account, one test customer account, one profile, one active card, and deterministic published content.
- Provision Auth credentials through Convex Auth's supported Password flow; do not insert undocumented rows into Convex Auth system tables.
- Link the authenticated Auth users to the seeded `customers` records through a narrowly gated bootstrap operation.
- Make rerunning bootstrap safe: existing records are updated or reused by stable seed identifiers, and duplicate profiles, cards, or invitations are not created.
- Keep the bootstrap entrypoint unavailable to ordinary application users after initialization. Prefer an internal/CLI-controlled entrypoint or a one-time environment-gated operation over a permanent public admin mutation.
- Document the exact command and target deployment in the README after implementation. The command must make the deployment target explicit so a local seed cannot be sent to production accidentally.

The live harness intentionally requires existing Convex Auth Password identities because `npx convex run` cannot create them. The supported identity-provisioning step and deployment-scoped bootstrap flow are documented in `docs/live-e2e.md`; the final production first-admin runbook remains a launch gate.

## Work phases

### Phase 0 — Establish the live development baseline

**Scope:** environment, generated bindings, mode switch, and a reproducible target.

**Status:** Complete for the selected non-production development deployment.

- [x] Confirm the authenticated Convex CLI account and the selected development deployment.
- [x] Replace placeholder Convex values in local environment files only; keep `.env.example` safe and descriptive.
- [x] Run Convex code generation/typechecking against the selected development deployment.
- [x] Record the deployment target without exposing credentials in source control or logs.
- [x] Add or update a documented command for starting Next.js and Convex together during live development.
- [x] Keep `NEXT_PUBLIC_DEMO_MODE=true` until the vertical-slice verification gate is green.
- [x] Capture a baseline with `npm run verify` and the demo Playwright suite before changing the app boundary.

**Exit gate:** the repository and demo regression surface are green, and the selected non-production deployment is configured and checked without tracked credentials.

### Phase 1 — Add the Convex/Auth application provider

**Primary files:** `src/components/providers/`, `src/app/layout.tsx`, `proxy.ts`, auth route files if required.

**Status:** Complete for the non-production live browser run.

- [x] Add a client provider that constructs one `ConvexReactClient` from `NEXT_PUBLIC_CONVEX_URL` and mounts the installed Convex Auth Next.js provider.
- [x] Mount the provider for the live mode without breaking the demo-mode fallback.
- [x] Align the proxy with the provider's auth route and current Next.js request/runtime conventions.
- [x] Keep protected route handling for `/app` and `/admin`, but make the backend the final authorization authority.
- [x] Add loading, unauthenticated, and auth-error states that do not flash protected customer data.
- [x] Prove that a browser login creates a real Convex Auth session and that sign-out invalidates it.

**Exit gate:** provider, proxy, route guards, loading states, live login, and sign-out/session invalidation are proven.

### Phase 2 — Replace demo login and setup with Convex Auth

**Primary files:** `src/components/auth/LoginForm.tsx`, `src/components/auth/SetupForm.tsx`, `convex/customers.ts`, invitation helpers, auth tests.

**Status:** Complete for the non-production live browser run.

- [x] Replace demo password verification and local session storage with `useAuthActions().signIn` and `signOut`.
- [x] Preserve safe return-path handling and route users by the server-returned application role.
- [x] Implement invitation-gated customer setup: validate the setup token, create/sign in the Convex Auth Password account, atomically consume the invitation, and link the Auth user to the intended customer.
- [x] Ensure invalid, expired, reused, and mismatched setup tokens fail without activating the customer.
- [x] Ensure a customer cannot attach an existing Auth identity to another customer's record.
- [x] Decide and document how the seeded administrator first signs in without exposing an open administrator signup path.
- [x] Remove demo password/session calls from the live path while retaining them only behind the explicit demo mode boundary.

**Exit gate:** the live auth flows and negative authorization behavior are covered locally, and seeded live-account login, setup, sign-out, and protected-route behavior pass in a real browser.

### Phase 3 — Connect customer profile read/save/public publication

**Backend scope:** `convex/profiles.ts`, `convex/customers.ts`, validators, and any small projection helpers.
**Frontend scope:** `ProfileEditor`, customer workspace data hooks, public profile route/components.

**Status:** Complete for the non-production live browser run, including the owned image-storage journey; production evidence is deferred until launch preparation.

- [x] Add or refine a `current`/`mine` profile query that returns the authenticated customer's account/profile in the shape the editor needs.
- [x] Use the existing server-side ownership helper for reads, draft saves, and publication; strengthen it if tests find an identity-linking gap.
- [x] Wire profile editor initialization to Convex query state rather than demo fixtures.
- [x] Wire Save draft to a Convex mutation and show pending, success, and error states.
- [x] Wire Publish to the Convex publication mutation and preserve the published snapshot boundary.
- [x] Keep slug uniqueness and post-publication slug immutability enforced server-side, with client validation only as a usability aid.
- [x] Wire `/<slug>` to the public Convex query and render missing/unavailable/published states from query results.
- [x] Ensure a draft bio, draft links, or draft image never appear publicly before publication, including the owned image-storage path in local integration tests.
- [x] Wire public-view and link-click tracking to Convex without including private visitor identity in the stored analytics model.

**Exit gate:** code-level ownership, draft/publication, public-projection behavior, and the owned live image journey are covered locally and against the selected non-production deployment.

### Phase 4 — Seed/bootstrap data and integration tests

**Primary files:** `convex/bootstrap.ts` or equivalent seed module, `tests/convex/` or `convex/*.test.ts`, test configuration, README/runbook.

**Status:** Bootstrap, integration coverage, live-test harness, and controlled development deployment execution complete.

- [x] Add deterministic bootstrap data for admin, test customer, profile, published projection, and active card.
- [x] Make bootstrap idempotent and safe to rerun on a development or staging deployment.
- [x] Add Convex integration tests using `convex-test` and mocked identities for:
  - unauthenticated access is rejected for customer queries/mutations;
  - the authenticated customer can read and update only their own profile;
  - a second customer cannot read, save, publish, or otherwise mutate the first customer's profile;
  - administrators can perform explicitly permitted operations;
  - public slug reads expose published data only;
  - draft changes remain private until publication;
  - setup tokens are one-time and cannot be replayed or used for a different customer.
- [x] Keep existing domain/unit tests for pure validation rules.
- [x] Add browser tests for the real auth/profile/public journey against a controlled live deployment, with credentials supplied through ignored environment variables or a test-only bootstrap.
- [x] Separate demo-mode Playwright tests from live-mode Playwright tests so local deterministic regression coverage does not masquerade as backend coverage.

**Exit gate:** local integration tests prove positive and negative authorization cases and bootstrap repeatability; the four-test live browser matrix passes against a non-production deployment.

### Phase 5 — Migrate Links, Cards, Analytics, and Admin operations

This phase started after the first live boundary was implemented. Each area keeps its backend and UI changes together so a screen cannot silently fall back to demo state.

**Status:** Convex backend/UI migration, local coverage, and the current non-production browser matrix are complete; production evidence is deferred until launch preparation.

#### Links

- [x] Replace `LinksEditor` demo reads/writes with `links.listForProfile` and `links.replaceDraft`.
- [x] Reuse server-side destination validation and profile ownership checks.
- [x] Confirm link replacement updates the draft only and does not publish implicitly.
- [x] Add tests for duplicate destinations, unsafe schemes, ordering, and cross-customer access.

#### Cards

- [x] Replace admin card lists, registration, assignment, deactivation, and replacement with Convex queries/mutations.
- [x] Wire `/c/<token>` to `cards.resolve` and verify inactive/replaced cards never expose former profile content.
- [x] Ensure card assignment and replacement are administrator-only and audited.
- [x] Add browser coverage for active, inactive, missing, and reassigned cards.

#### Analytics

- [x] Replace demo counters with Convex event mutations and bounded customer/admin queries.
- [x] Ensure public events cannot be used to read customer analytics.
- [x] Prevent duplicate profile-view counting across card resolution and final profile render.
- [x] Add tests for time ranges, profile scope, link scope, and unauthenticated write/read boundaries.

#### Admin operations

- [x] Migrate customer creation, invitations, profile status changes, card management, settings, audit logs, deletion requests, and admin analytics.
- [x] Require administrator authorization in every backend function, not only in route layouts.
- [x] Preserve audit records for sensitive state transitions.
- [x] Review all list queries for pagination or bounded reads before production data grows.
- [x] Remove admin-only demo fixtures from the live path.

**Exit gate:** live-mode code paths and local authorization coverage are complete, with current profile, cards, analytics, and admin browser flows proven against non-production Convex.

### Phase 6 — Cutover and cleanup

**Status:** Complete for the current non-production scope; production deployment and manual cutover gates are deferred.

- [x] Run the existing live verification matrix against a non-production deployment before the owned image slice.
  - [x] Rerun the live customer journey with the owned image upload and verify draft image privacy and post-publication visibility.
- [x] Set `NEXT_PUBLIC_DEMO_MODE=false` only in the intended live environment and verify the application fails clearly if required Convex configuration is missing.
- [x] Retire demo-mode links and copy from the live UI while keeping demo mode available for isolated local regression until it is intentionally removed.
- [x] Update README, `.env.example`, deployment notes, and the production checklist.
- [x] Run a final authorization review of every public Convex function and route.
- [x] Confirm no secrets, local tokens, or personal seed credentials are tracked.

**Exit gate:** local/static, integration, accessibility, and non-production live-browser gates are green. Production-mode deployment, production auth/email configuration, and manual public-profile/device smoke checks are deferred until launch preparation.

## Delegation plan

Delegation is organized around disjoint ownership. The implementation ownership below is complete; the root integrator owns the remaining deployment-target decisions and final verification.

| Workstream | Deliverable | File ownership |
| --- | --- | --- |
| Repository explorer | Map current demo data flows, route boundaries, and test seams; identify all files that must leave demo mode | Read-only; no edits |
| Convex/auth researcher | Verify installed Convex Auth Next.js and Password APIs, bootstrap constraints, and convex-test identity setup | Read-only; no edits |
| Auth/provider worker | Provider, root layout boundary, proxy, login, setup, auth-facing client helpers | `src/components/providers/**`, `src/app/layout.tsx`, `proxy.ts`, `src/components/auth/**`, auth route files |
| Backend vertical-slice worker | Profile/customer functions, bootstrap entrypoint, validators, and server-side ownership behavior | `convex/**` excluding generated files; no frontend edits |
| Profile/public worker | Customer profile hooks/UI and public slug route/components | `src/components/forms/ProfileEditor.tsx`, `src/components/profile/**`, relevant `src/app/[slug]/**` files |
| Convex integration-test worker | `convex-test` tests, test config changes, and live-test harness helpers | Convex test files and test configuration only |
| Links/cards worker | Links and Cards backend/UI migration after the first slice | Links/cards-specific Convex and component/page files only |
| Analytics/admin worker | Analytics and Admin migration after the first slice | Analytics/admin-specific Convex and component/page files only |
| Independent reviewer | Security, ownership, fallback leakage, and test evidence review | Read-only; reports findings |
| Root integrator | Merge compatible changes, resolve shared-file conflicts, run all gates, and own final result | Shared contracts, generated output, final verification |

Rules for delegation:

- Explorers and researchers report findings before implementation workers begin when an API/version question affects multiple files.
- No two implementation workers edit the same file in parallel.
- Generated Convex files are regenerated by the integrator after backend changes; workers do not hand-edit them.
- Every worker reports changed files, commands run, failures, and remaining assumptions.
- A reviewer does not modify code unless explicitly reassigned as an implementation worker.

## Verification matrix

### Static and unit gates

Run from the repository root:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

For Convex changes, also run the installed Convex workflow against the explicitly selected development deployment, including code generation and a push/check appropriate to the current deployment guard.

### Convex integration gates

- Authenticated identity is present where required and absent where expected.
- Customer ownership is derived server-side and cannot be overridden with a request argument.
- A second customer's identity receives an authorization error or an empty scoped result, never the first customer's private document.
- Public queries return only the intended published projection.
- Profile image storage IDs are owner-mapped, signature/size validated, and never exposed as public projection fields.
- Bootstrap is idempotent and has no permanent unauthenticated admin escalation path.
- Invitation tokens are hashed, expire, are single-use, and are bound to the intended customer.

### Browser/E2E gates

The live E2E suite must exercise this sequence with a clean browser context:

1. Open login while signed out and verify protected-route behavior.
2. Sign in as the seeded administrator and verify the role-specific landing page.
3. Sign in or complete setup as the seeded customer.
4. Read the customer's profile from Convex, edit a draft, save it, and verify the pending/success state.
5. Open the public slug in a separate signed-out context and verify the old published data remains visible.
6. Publish from the customer workspace and verify the public slug now shows the new published data.
7. Attempt the same profile operation as a second customer and verify it is refused.
8. Sign out, refresh, and verify protected data is no longer available.

Then run the existing public, admin, customer, accessibility, and smoke suites in their appropriate demo/live configurations.

### Manual checks

- Test a fresh browser and a second browser profile to verify session isolation.
- Confirm browser refresh and direct navigation do not reintroduce demo state.
- Confirm missing, unpublished, and suspended profiles render safe unavailable pages.
- Confirm `.env.local` and deployment dashboards contain real values only outside source control.
- Confirm the public URL is reachable from a clean device/browser when the selected deployment is available.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Convex Auth Next.js integration changes with the installed beta package | Validate against installed package types/source before implementation; keep provider work isolated and test sign-in in a real browser |
| Auth user is created before an invalid invitation is rejected | Add a preflight token check and an atomic completion mutation; define orphan-account handling before production |
| Demo state leaks into live mode | Make the provider/data boundary explicit, test with `NEXT_PUBLIC_DEMO_MODE=false`, and search for live imports from `src/lib/demo` |
| Caller supplies another customer/profile ID | Derive identity server-side and test cross-customer reads/writes with mocked identities |
| Seed data is duplicated or sent to the wrong deployment | Stable seed keys, idempotent mutations, explicit deployment flags, and a documented non-production bootstrap command |
| Existing list queries stop scaling | Review every migrated query for indexes and bounded reads; paginate admin/audit/analytics lists before launch |
| Public profile leaks draft or private fields | Return a dedicated projection and assert the absence of draft/customer fields in integration and browser tests |
| Auth setup differs between demo and live E2E | Maintain separate fixtures/configuration and report which backend each suite exercises |

## Definition of done

The live vertical slice is complete when all of the following are true:

- The Next.js app mounts the real Convex Auth provider in live mode.
- Login, sign-out, session refresh, and invitation setup use Convex Auth rather than the demo password/session store.
- Customer profile read, draft save, publish, and public slug read persist in Convex.
- Seed/bootstrap data is repeatable and deployment-scoped.
- Convex integration tests prove authentication and customer ownership, including negative cases.
- A real browser E2E run proves the signed-in customer → draft → publish → signed-out public profile journey.
- A fresh non-production browser run proves the signed-in customer → owned image upload → draft privacy → publish → signed-out image journey.
- The complete static, unit, build, accessibility, and live E2E gates pass.
- Links, Cards, Analytics, and Admin operations are migrated in the live-mode code paths and covered locally; the current non-production browser run proves cards, analytics, and admin/profile flows, while broader preview/production evidence is a deferred launch gate.

## References

- [Convex Next.js quickstart](https://docs.convex.dev/quickstart/nextjs)
- [Convex Auth setup](https://labs.convex.dev/auth/setup)
- [Convex Auth Next.js authorization](https://labs.convex.dev/auth/authz/nextjs)
- [Convex CLI environment variables](https://docs.convex.dev/cli/reference/env)
- [Convex multiple deployments](https://docs.convex.dev/production/multiple-deployments)
