# Shared Hosted Demo Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or an equivalent task-by-task execution workflow. Keep one writer per file, run the listed checks after each task, and do not deploy to production.

**Goal:** Preserve the current demo experience while making its customers, profiles, cards, claims, analytics, and audit state persist in the selected Convex development deployment and remain visible across devices.

**Architecture:** Add an explicit hosted-demo storage mode. Local demo mode continues using the fixture/store adapter for deterministic offline tests; hosted-demo mode routes through `LiveProviders` and the existing Convex application functions. Hosted-demo records receive a server-managed `scope: "demo"` marker so initialization/reset and admin lists cannot mix them with ordinary records. Hosted-demo authentication uses Convex Auth Password identities without email verification/reset delivery only when the selected non-production deployment has the explicit `TAPIT_DEMO_AUTH_MODE=hosted-demo` setting.

**Tech Stack:** Next.js App Router, React, Convex 1.44+, Convex Auth Password provider, existing rate limiter, Vitest/convex-test, Playwright.

---

## File ownership map

### Mode and environment boundary

- Create: `src/lib/demo/mode.ts` — one client-safe mode decision used by every branch.
- Modify: `src/app/layout.tsx` — choose local passthrough or Convex providers.
- Modify: `.env.example` — document local versus hosted demo settings without real credentials.
- Modify: `README.md` and `docs/live-e2e.md` — document non-production hosted-demo setup, accounts, handoff, and reset behavior.
- Test: `tests/unit/demo-mode.test.ts` — test the three mode decisions.

### Convex data/auth boundary

- Modify: `convex/schema.ts` — add the optional demo scope and indexes to app-owned tables.
- Modify: `convex/convex.config.ts` — declare the optional hosted-demo auth environment value.
- Modify: `convex/auth.ts` — disable verification/reset providers only for explicit hosted demo.
- Modify: `convex/admin.ts` — expose the authenticated account scope to server-side helpers.
- Modify: `convex/customers.ts`, `convex/profiles.ts`, `convex/links.ts`, `convex/profileImages.ts`, `convex/cards.ts`, `convex/cardClaims.ts`, `convex/analytics.ts`, `convex/invitations.ts`, and `convex/auth.ts` — propagate scope from the authenticated account or parent record and filter hosted-demo admin reads.
- Create: `convex/demo.ts` — operator-only hosted-demo initialization/reset using scoped records.
- Modify: `convex/bootstrap.ts` — mark the promoted hosted-demo administrator and preserve the existing operator-only bootstrap boundary.
- Test: `convex/integration/hosted-demo.test.ts` — scope propagation, auth behavior, initialization/reset safety, and cross-account boundaries.

### Existing UI adapters

- Modify: `src/components/providers/DemoProviders.tsx` and `src/components/providers/LiveProviders.tsx` — make provider selection explicit and hydration-stable.
- Modify: `src/components/auth/LoginForm.tsx`, `src/components/auth/SetupForm.tsx`, `src/components/layout/AdminShell.tsx`, and `src/components/layout/CustomerShell.tsx` — local-only demo session behavior versus hosted Convex Auth.
- Modify: `src/components/admin/CustomersManager.tsx`, `src/components/admin/CardsManager.tsx`, `src/components/admin/ProfilesManager.tsx`, `src/components/admin/SettingsManager.tsx`, and `src/components/admin/AuditLog.tsx` — route hosted mode through the existing live admin queries/mutations.
- Modify: `src/components/forms/ProfileEditor.tsx`, `src/components/forms/LinksEditor.tsx`, and `src/components/forms/AccountSettings.tsx` — use hosted Convex operations when hosted mode is selected.
- Modify: `src/components/analytics/CustomerAnalytics.tsx` and `src/components/admin/AdminAnalytics.tsx` — use Convex-backed hosted analytics.
- Modify: `src/components/profile/CardResolverClient.tsx`, `src/components/profile/PublicProfileScreen.tsx`, and `src/components/profile/UnpublishedCardClaim.tsx` — use the live resolver, claim, publication, and analytics path in hosted mode.
- Keep: `src/lib/demo/store.ts`, `src/lib/demo/fixtures.ts`, and `src/lib/demo/password.ts` — local adapter only; no hosted-mode data writes.

### Browser and regression tests

- Create: `e2e/hosted-demo.spec.ts` — two-context hosted-demo journey behind an explicit non-production environment gate.
- Modify: `e2e/admin.spec.ts`, `e2e/public-profile.spec.ts`, and `e2e/accessibility.spec.ts` — retain local demo coverage and add hosted-mode route assertions where fixtures are shared.
- Modify: `tests/unit/auth-flow.test.tsx`, `tests/unit/public-hydration.test.ts`, and `tests/unit/demo-signup.test.ts` — preserve local-mode expectations and add hosted-mode branch checks.
- Reuse: `convex/integration/card-claiming.test.ts`, `convex/integration/auth-ownership.test.ts`, and `convex/integration/remaining-operations.test.ts` for the existing card/auth invariants.

Do not hand-edit `convex/_generated/*`; regenerate it through Convex codegen after backend contracts change. Preserve the existing checkpoint commit and unrelated user changes.

## Data contracts

### Scope marker

Add this optional field to application-owned records that can be created or changed by the hosted demo:

```ts
scope?: "demo";
```

Add a `by_scope` index to `customers`, `profiles`, `cards`, `links`, `profileImages`, `analytics`, `analyticsSessions`, `auditLogs`, `invitations`, `deletionRequests`, and `settings`. Existing records without the field are ordinary records and must remain valid.

The authenticated administrator account is the scope source for admin-created customers, cards, settings, and audit records. Customer/profile/card child records inherit the scope from their parent. Hosted self-service signup sets `scope: "demo"` only when `TAPIT_DEMO_AUTH_MODE` is `hosted-demo`; ordinary live signup continues writing unscoped records.

Hosted-demo admin queries use the account’s scope to return only demo-scoped records. Ordinary live administrators continue seeing unscoped ordinary data according to the current behavior. Public slug/card resolvers remain globally addressable within the selected deployment and never use a client-provided scope for authorization.

### Authentication mode

Declare the server-only setting as optional in `convex/convex.config.ts`:

```ts
TAPIT_DEMO_AUTH_MODE: v.optional(v.literal("hosted-demo")),
```

In `convex/auth.ts`, configure the Password provider as follows:

```ts
const hostedDemo = env.TAPIT_DEMO_AUTH_MODE === "hosted-demo";

Password({
  profile(params) {
    return { email: normalizeAuthEmail(String(params.email ?? "")) };
  },
  validatePasswordRequirements(password) {
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  },
  reset: hostedDemo ? undefined : emailProvider(),
  verify: hostedDemo ? undefined : emailProvider(),
});
```

This setting is deployment-side and cannot be enabled by a URL parameter. The existing email-backed verification and reset behavior stays unchanged when the setting is absent.

### Demo mode selection

Implement the following pure decisions in `src/lib/demo/mode.ts`:

```ts
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
}

export function isHostedDemoMode(): boolean {
  return isDemoMode() && process.env.NEXT_PUBLIC_DEMO_STORAGE === "convex";
}

export function isLocalDemoMode(): boolean {
  return isDemoMode() && !isHostedDemoMode();
}

export function isLiveMode(): boolean {
  return !isDemoMode();
}
```

The hosted-demo branch must use `LiveProviders`; the local-demo branch must keep `DemoProviders`. A missing or invalid hosted-demo Convex URL must show a configuration error and must not silently fall back to localStorage.

## Tasks

### Task 1: Establish the hosted-demo mode boundary

**Files:** `src/lib/demo/mode.ts`, `src/app/layout.tsx`, `src/components/providers/DemoProviders.tsx`, `src/components/providers/LiveProviders.tsx`, `.env.example`, `README.md`, `docs/live-e2e.md`, `tests/unit/demo-mode.test.ts`

- [ ] Write `tests/unit/demo-mode.test.ts` with these cases: `NEXT_PUBLIC_DEMO_MODE=false` yields live; `NEXT_PUBLIC_DEMO_MODE=true` with no storage value yields local demo; and `NEXT_PUBLIC_DEMO_MODE=true` plus `NEXT_PUBLIC_DEMO_STORAGE=convex` yields hosted demo. Restore `process.env` after each case.
- [ ] Implement `src/lib/demo/mode.ts` using the exact four functions in the contract above. Do not read browser globals so the helpers are safe during server rendering.
- [ ] Replace layout’s direct `NEXT_PUBLIC_DEMO_MODE` branch with `isLocalDemoMode()`. Hosted demo and live mode must render `LiveProviders` so Convex Auth and Convex queries are available.
- [ ] Replace component-level checks of `NEXT_PUBLIC_DEMO_MODE !== "false"` with either `isLocalDemoMode()` or `isHostedDemoMode()` according to the existing local/live component pair. Keep all local-demo fixtures on the local branch.
- [ ] Document this configuration in `.env.example` and README, including `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`, and the warning that hosted-demo data is shared by all devices connected to that development deployment.
- [ ] Run `npx vitest run tests/unit/demo-mode.test.ts tests/unit/public-hydration.test.ts` and `npm run typecheck`; expected result is PASS with no local demo hydration regression.

### Task 2: Add scoped hosted-demo records and explicit auth configuration

**Files:** `convex/schema.ts`, `convex/convex.config.ts`, `convex/auth.ts`, `convex/admin.ts`, `convex/customers.ts`, `convex/profiles.ts`, `convex/links.ts`, `convex/profileImages.ts`, `convex/cards.ts`, `convex/cardClaims.ts`, `convex/analytics.ts`, `convex/invitations.ts`, `convex/bootstrap.ts`, `convex/integration/hosted-demo.test.ts`

- [ ] Add the optional `scope` field and `by_scope` indexes to each application table listed in the data contract. Keep all existing fields optional/required status compatible with populated deployments.
- [ ] Add `TAPIT_DEMO_AUTH_MODE` as an optional `"hosted-demo"` value in `convex/convex.config.ts` and use `env.TAPIT_DEMO_AUTH_MODE` in `convex/auth.ts` to omit verification/reset providers only in hosted demo.
- [ ] Update `requireAdministrator()` to return the authenticated customer account’s scope while retaining server-derived identity and role checks. Do not add a scope argument to any authorization function.
- [ ] Propagate scope in `customers.createCustomer`, `customers.createSelfServiceAccount`, and `customers.completeSetup`: admin-created invitation/profile/customer records inherit the authenticated admin scope; hosted self-service records receive `scope: "demo"`; setup completion copies the invitation scope.
- [ ] Propagate scope through profile draft/publication, links, images, card registration/attachment/replacement, claim challenge/completion, analytics writes, invitation records, deletion requests, settings writes, and audit records using the authenticated account or already-loaded parent record.
- [ ] Filter hosted-demo admin lists by the authenticated admin’s `scope` and preserve the existing unscoped live list behavior. Ensure public card/profile queries never expose scope or draft data.
- [ ] Add integration tests that prove unscoped live records and demo-scoped records remain separate, hosted signup skips the email-verification prerequisite, normal live signup still requires it, and a browser-supplied scope cannot cross the boundary.
- [ ] Run `npx vitest run convex/integration/hosted-demo.test.ts convex/integration/card-claiming.test.ts convex/integration/auth-ownership.test.ts`, then run `npm run typecheck`.
- [ ] Run `npx convex dev --once --codegen enable --typecheck enable` against the explicitly selected non-production development deployment. Confirm generated bindings are updated by the CLI and no schema/function validation errors occur.

### Task 3: Add safe hosted-demo initialization and reset

**Files:** `convex/demo.ts`, `convex/bootstrap.ts`, `convex/integration/hosted-demo.test.ts`, `README.md`, `docs/live-e2e.md`

- [ ] Add an internal `demo.initialize` mutation with complete validators that accepts the operator-provisioned admin user ID and ensures that account is active, scoped to `demo`, and role `admin`. It must create or reconcile only the known demo seed records and return non-secret IDs/statuses.
- [ ] Mark seeded demo records with `scope: "demo"`; preserve the current Mara public profile, claimable example card, active example card, inactive example card, supported themes, and baseline analytics/audits without storing claim-code plaintext.
- [ ] Add an internal `demo.reset` mutation that requires the existing operator path, deletes or reconciles only `scope: "demo"` application records in dependency order, preserves Convex Auth user records, and re-runs the seed initialization. It must never query or delete unscoped records.
- [ ] Ensure reset handles links/images/analytics/challenges/invitations/audit records before their parent profiles/cards/customers and is safe to run twice. Leave the operator-provisioned Auth identity available for the next login.
- [ ] Add integration tests proving initialization is idempotent, reset leaves an unscoped sentinel customer/profile/card untouched, claim codes are not returned by seed/list reads, and a second reset produces the same seed status.
- [ ] Document the exact non-production operator command, the required hosted-demo environment setting, and the fact that reset affects every connected device. Do not add an open public reset function.

### Task 4: Route all hosted-demo UI paths through Convex

**Files:** `src/components/auth/LoginForm.tsx`, `src/components/auth/SetupForm.tsx`, `src/components/layout/AdminShell.tsx`, `src/components/layout/CustomerShell.tsx`, `src/components/admin/CustomersManager.tsx`, `src/components/admin/CardsManager.tsx`, `src/components/admin/ProfilesManager.tsx`, `src/components/admin/SettingsManager.tsx`, `src/components/admin/AuditLog.tsx`, `src/components/forms/ProfileEditor.tsx`, `src/components/forms/LinksEditor.tsx`, `src/components/forms/AccountSettings.tsx`, `src/components/analytics/CustomerAnalytics.tsx`, `src/components/admin/AdminAnalytics.tsx`

- [ ] Change each component’s demo/live branch so local demo continues using `src/lib/demo/store.ts`, while hosted demo and live use the existing Convex query/mutation/action implementation.
- [ ] Remove hosted-demo dependence on `useDemoState`, `updateDemoState`, `setDemoSession`, and local fixture credentials. The hosted customer/admin session must be the Convex Auth session; localStorage may not contain hosted customer/profile/card data.
- [ ] Keep the existing customer setup-link handoff in hosted demo. The admin success state must display/copy the one-time setup link because hosted demo deliberately does not call the email provider.
- [ ] Keep account/password reset controls hidden or disabled in hosted demo when reset email delivery is unavailable, with a clear demo-only message. Do not create a browser-side password reset shortcut.
- [ ] Preserve the current admin confirmation before card attachment and the claim-code copy/regeneration/invalidation controls. Hosted demo mutations must return the same status and error states as live mode.
- [ ] Preserve the current customer profile editor, explicit Publish action, links, settings, analytics, and audit views. Verify all writes update Convex and that reactive queries update the other device without a manual reload.
- [ ] Run `npm run typecheck`, `npm run lint`, and the relevant unit tests after the adapter changes.

### Task 5: Preserve the public card/claim flow across devices

**Files:** `src/components/profile/CardResolverClient.tsx`, `src/components/profile/PublicProfileScreen.tsx`, `src/components/profile/UnpublishedCardClaim.tsx`, `src/app/c/[cardToken]/page.tsx`, `src/app/[slug]/page.tsx`, `src/lib/demo/store.ts`, `src/lib/demo/fixtures.ts`, `convex/integration/card-claiming.test.ts`, `e2e/hosted-demo.spec.ts`

- [ ] Keep `/c/<cardToken>` and `/<profile-slug>` unchanged. Hosted demo must call the existing `cards.resolve`/public-profile queries and append only the existing analytics source metadata.
- [ ] Ensure a signed-out hosted-demo phone sees the generic unpublished state and no draft content. The customer signs in with the Convex Auth account created through the setup link, enters the one-time claim code, and is routed to `/app/profile`.
- [ ] Verify the claim completion remains separate from publication: successful claim consumes the code/challenge, and Publish validates the draft, creates the public snapshot, and activates the card.
- [ ] Ensure an already-published profile attached to a new hosted-demo card follows the existing immediate-public behavior and does not require a second publication.
- [ ] Leave local `verifyDemoCardClaim`/`completeDemoCardClaim` behavior intact for local demo tests, including the current `registered → claimable → active` transitions. Local fixture writes must never execute in hosted mode.
- [ ] Add `e2e/hosted-demo.spec.ts` behind an explicit `TAPIT_HOSTED_DEMO_E2E=true` and non-production deployment gate. Use two browser contexts: admin context creates the customer/card/code; customer context opens the same card URL, completes setup/claim, publishes; admin context observes the resulting `active`/published state.
- [ ] Assert in the two-context test that the card URL and token never change, the unpublished resolver response has no profile content, invalid/reused codes fail, and a public visit after Publish renders the profile.

### Task 6: Verify analytics, reset, regressions, and handoff

**Files:** `tests/unit/demo-signup.test.ts`, `tests/unit/auth-flow.test.tsx`, `tests/unit/public-hydration.test.ts`, `tests/unit/analytics.test.ts`, `e2e/admin.spec.ts`, `e2e/public-profile.spec.ts`, `e2e/accessibility.spec.ts`, `README.md`, `docs/live-e2e.md`

- [ ] Add unit coverage that local demo signup still writes local fixtures only, hosted mode does not import the demo store, and mode changes do not create server/client hydration mismatches.
- [ ] Add hosted Convex integration assertions for NFC/card, QR, direct, and unknown source attribution, plus card deactivation/replacement and audit records after hosted operations.
- [ ] Run local deterministic checks:

```bash
npm run format:check
npm run lint
npm run typecheck
npx vitest run --exclude tests/unit/live-email-code.test.ts
npm run test:e2e:demo
```

Expected result: all existing local checks pass; the known unrelated demo deletion-audit expectation remains documented if it still fails.

- [ ] Run hosted checks only with an explicitly selected non-production deployment, configured `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`, `TAPIT_DEMO_AUTH_MODE=hosted-demo`, and a provisioned admin identity. Never run the hosted test against production.
- [ ] Run the two-device hosted flow manually from a computer and phone using the same app URL, record the stable card URL and before/after statuses, and confirm the phone’s profile publication is visible on the computer.
- [ ] Review the final diff for accidental localStorage writes in hosted branches, browser-supplied authorization fields, plaintext claim-code persistence, production-targeted commands, and generated-file hand edits.
- [ ] Commit the implementation in focused commits: mode boundary, backend scope/auth, initialization/reset, UI routing, public flow/tests, and documentation/verification.

## Handoff commands

After implementation, the operator will configure the isolated development deployment and run:

```bash
npx convex env set TAPIT_DEMO_AUTH_MODE hosted-demo
npx convex dev --once
NEXT_PUBLIC_DEMO_MODE=true NEXT_PUBLIC_DEMO_STORAGE=convex \
  npx next dev --hostname 0.0.0.0
```

The exact admin promotion/initialization command will use the existing internal `bootstrap:promoteUser` and `demo:initialize` functions with the operator-provisioned Auth user ID. No passwords or claim-code plaintext values are passed to Convex CLI commands.
