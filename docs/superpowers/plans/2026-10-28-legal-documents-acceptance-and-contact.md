# Legal Documents, Acceptance, and Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish accurate public Terms and Privacy Notice, record current-version acceptance before account access, and use `officialntap.it@gmail.com` as Tapit's default legal and support contact.

**Architecture:** Keep `/terms` and `/privacy` public. Use a shared pure-constant module for document versions and the support default, an append-only Convex acceptance table with server-derived identity, and equivalent acceptance history in the local-demo store. Gate protected app use at the live and local workspace boundaries and at protected Convex functions, while leaving public profiles and legal pages available. Preserve the existing configurable support destination and migrate only exact legacy defaults.

**Tech Stack:** Next.js 16 App Router, React 19, Convex 1.44, browser-local demo store, Vitest/convex-test, Playwright.

---

## Scope and release gate

This plan implements the approved design in [`docs/superpowers/specs/2026-10-28-terms-privacy-agreement-and-contact-design.md`](../specs/2026-10-28-terms-privacy-agreement-and-contact-design.md) for issue #179. Keep the issue open while this branch contains only documentation. Add `Closes #179` to the PR only after the implementation below is complete.

Before publishing the revised legal copy, obtain operator/legal answers for the required business address, analytics disclosure and lawful basis, provider entities and processing locations, provider log/backup retention, account-erasure behavior, and material-update notice method. The current production implementation has no automatic expiry for analytics keys/aggregates and does not erase all account/Auth records. Do not publish a stronger retention, deletion, or compliance promise until the corresponding facts and controls are verified. Do not change Production settings, seed Production, or run E2E against Production as part of this plan.

## File map

- Legal copy and public framing: `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`, `src/components/legal/LegalFrame.tsx`, `src/components/auth/SetupForm.tsx`.
- Shared policy identifiers and support default: create `convex/legalConstants.ts`; keep it free of Convex server imports so both Convex functions and the UI can import it.
- Convex acceptance and enforcement: `convex/schema.ts`, `convex/admin.ts`, `convex/customers.ts`, `convex/invitationAcceptance.ts`, and create `convex/legalAcceptance.ts`. Gate authenticated public functions in `convex/analytics.ts`, `convex/audit.ts`, `convex/cardClaims.ts`, `convex/cardOrderDesignUploadHttp.ts`, `convex/cardOrderDesigns.ts`, `convex/cardOrderPaymentQr.ts`, `convex/cardOrderPaymentQrUploadHttp.ts`, `convex/cardOrderReceiptUploadHttp.ts`, `convex/cardOrderReceipts.ts`, `convex/cardOrderSettings.ts`, `convex/cardOrders.ts`, `convex/cards.ts`, `convex/invitations.ts`, `convex/links.ts`, `convex/profileAccess.ts`, `convex/profileMedia.ts`, `convex/profiles.ts`, and `convex/settings.ts`. Keep the status/acceptance/setup and internal provisioning paths callable before acceptance.
- Browser flows and demo parity: `src/components/auth/AuthShell.tsx`, `src/components/auth/LoginForm.tsx`, `src/components/auth/GoogleLoginForm.tsx`, `src/components/auth/SetupForm.tsx`, `src/components/providers/LiveProviders.tsx`, `src/components/layout/WorkspaceShell.tsx`, `src/lib/demo/fixtures.ts`, and `src/lib/demo/store.ts`.
- Contact destinations: `src/components/layout/navigation.ts`, `src/components/profile/CardResolverClient.tsx`, `src/components/profile/PublicProfileScreen.tsx`, `convex/settings.ts`, `convex/demo.ts`, `.env.example`, and `convex/convex.config.ts`.
- Tests and product records: create `convex/integration/legal-acceptance.test.ts`, `convex/integration/settings-support.test.ts`, and `e2e/legal-acceptance.spec.ts`; update `tests/unit/auth-flow.test.tsx`, `tests/unit/demo-signup.test.ts`, `tests/unit/demo-storage-store.test.ts`, `convex/integration/remaining-operations.test.ts`, `e2e/smoke.spec.ts`, `e2e/signup.spec.ts`, and `e2e/admin.spec.ts`. Add focused acceptance coverage to `e2e/hosted-demo.spec.ts` and `e2e/live.spec.ts`. Update `docs/privacy-notice-draft.md`, `docs/spec.md`, `docs/CHANGELOG.md`, `docs/launch-readiness.md`, `docs/specs/2026-09-25-01-23-google-oauth-only-auth-design.md`, `docs/specs/2026-09-25-12-05-production-live-cutover-design.md`, `docs/plans/2026-09-25-12-05-production-live-cutover.md`, and `design/redesign/AdminSettings.dc.html`. Regenerate Convex types; never hand-edit generated files.

## Task 1: Update the public legal documents

**Files:** `convex/legalConstants.ts`, `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`, `src/components/legal/LegalFrame.tsx`, `src/components/auth/SetupForm.tsx`, `docs/privacy-notice-draft.md`, `e2e/smoke.spec.ts`, `e2e/signup.spec.ts`.

- [ ] **Step 1: Add public-document assertions.** Extend `e2e/smoke.spec.ts` to open both routes and assert the existing page headings, the `officialntap.it@gmail.com` mail link, both public document links, and the effective-date copy. Extend the setup journey in `e2e/signup.spec.ts` to check that `/setup/[token]` links to both documents while signed out.

```ts
await page.goto("/privacy");
await expect(page.getByRole("heading", { name: "Tapit privacy notice" })).toBeVisible();
await expect(
  page.getByRole("link", { name: "officialntap.it@gmail.com", exact: true }),
).toHaveAttribute("href", "mailto:officialntap.it@gmail.com");
```

- [ ] **Step 2: Run the focused local-demo E2E tests.** Run `npm run test:e2e:demo -- e2e/smoke.spec.ts e2e/signup.spec.ts`; confirm the new setup-link assertions fail until the links are added.
- [ ] **Step 3: Add shared version and support constants.** In `convex/legalConstants.ts`, export `TERMS_VERSION = "terms-v1"`, `PRIVACY_VERSION = "privacy-v1"`, and `DEFAULT_SUPPORT_URL = "mailto:officialntap.it@gmail.com"`. Treat a substantive document revision as a manual version bump.

```ts
export const TERMS_VERSION = "terms-v1";
export const PRIVACY_VERSION = "privacy-v1";
export const DEFAULT_SUPPORT_URL = "mailto:officialntap.it@gmail.com";
```

- [ ] **Step 4: Revise both legal pages and `LegalFrame`.** Update contact address and effective dates only after the fact review above. Make the privacy text accurately disclose current analytics, session keys, keyed abuse-prevention hashes, current deletion behavior, and provider processing. Keep the privacy draft's proposed controls visibly separate from deployed behavior. Add public document links to the shared setup frame; the homepage and `AuthShell` already link to both.
- [ ] **Step 5: Re-run the focused E2E tests.** Run `npm run test:e2e:demo -- e2e/smoke.spec.ts e2e/signup.spec.ts`; expect both document routes and setup links to pass at the existing viewports.

## Task 2: Store acceptance and enforce it in Convex

**Files:** `convex/schema.ts`, `convex/legalAcceptance.ts`, `convex/admin.ts`, `convex/customers.ts`, `convex/invitationAcceptance.ts`, protected Convex functions listed in the file map, `convex/integration/legal-acceptance.test.ts`.

- [ ] **Step 1: Add integration tests for the acceptance contract.** Cover unsigned rejection, server-derived account identity, current-version validation, idempotent retries, history after a version bump, cross-account isolation, and rejection by one protected query before acceptance. Use existing `convex-test` setup patterns from `convex/integration/auth-ownership.test.ts`.

```ts
expect(await asCustomer.query(api.admin.currentAccess, {})).toMatchObject({
  authenticated: true,
  legalAcceptanceRequired: true,
});
await expect(asCustomer.query(api.profiles.mine, {})).rejects.toThrow(/accept.*terms/i);
```

- [ ] **Step 2: Run the focused Convex integration test.** Run `npm run test -- convex/integration/legal-acceptance.test.ts`; confirm the new contract assertions fail before implementation.
- [ ] **Step 3: Add the append-only acceptance table.** Store one row per accepted Terms/Privacy version pair. Derive account and user IDs from Auth; do not accept identity IDs from client arguments.

```ts
legalAcceptances: defineTable({
  scope: v.optional(v.literal("demo")),
  customerId: v.id("customers"),
  userId: v.id("users"),
  termsVersion: v.string(),
  privacyVersion: v.string(),
  acceptedAt: v.number(),
}).index("by_customerId_and_acceptedAt", ["customerId", "acceptedAt"]),
```

- [ ] **Step 4: Add status and acceptance functions.** Add `legalAcceptanceRequired` to `admin.currentAccess`. In `convex/legalAcceptance.ts`, expose a status query and an acceptance mutation. The mutation derives the current account through Auth, rejects non-current version arguments, inserts only a missing version pair, and returns its server timestamp. Keep `currentAccess`, the acceptance mutation, account creation/setup mutations that atomically record acceptance, and internal Google provisioning as explicit pre-acceptance exceptions.
- [ ] **Step 5: Add the protected-function helper.** Add `requireAcceptedUser` in `convex/admin.ts`; use it for authenticated customer data and mutations, and make `requireAdministrator` enforce current acceptance. Update authenticated HTTP upload endpoints and `convex/cardClaims.ts`, which currently use `getAuthUserId` directly. Keep status queries and setup/acceptance operations usable until the current pair is recorded.

```ts
export async function requireAcceptedUser(ctx: AuthContext) {
  const userId = await requireUser(ctx);
  const account = await ctx.db
    .query("customers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (account === null || !isActiveCustomer(account)) throw new Error("Active account required.");
  const latest = await ctx.db
    .query("legalAcceptances")
    .withIndex("by_customerId_and_acceptedAt", (q) => q.eq("customerId", account._id))
    .order("desc")
    .first();
  if (latest?.termsVersion !== TERMS_VERSION || latest.privacyVersion !== PRIVACY_VERSION)
    throw new Error("Accept the current Terms and Privacy Notice before continuing.");
  return { userId, account };
}
```

- [ ] **Step 6: Record acceptance atomically in account setup.** Pass the current pair into `customers.createSelfServiceAccount`, `customers.completeSetup`, and `invitationAcceptance.acceptInvitation`. Store the acceptance row in the same mutation transaction as account/profile creation or invitation completion. A retry for the same pair must not add another row.
- [ ] **Step 7: Regenerate types and run the focused integration test.** Run `npx convex codegen`, then `npm run test -- convex/integration/legal-acceptance.test.ts`; expect all acceptance, idempotency, ownership, and direct-function gating assertions to pass.

## Task 3: Add accessible acceptance to every account flow

**Files:** create `src/components/legal/LegalAcceptanceFields.tsx` and `src/components/legal/LegalAcceptanceGate.tsx`; update `src/components/auth/AuthShell.tsx`, `src/components/auth/LoginForm.tsx`, `src/components/auth/GoogleLoginForm.tsx`, `src/components/auth/SetupForm.tsx`, `src/components/providers/LiveProviders.tsx`, `src/components/layout/WorkspaceShell.tsx`, `src/lib/demo/fixtures.ts`, `src/lib/demo/store.ts`, `tests/unit/auth-flow.test.tsx`, `tests/unit/demo-signup.test.ts`, `tests/unit/demo-storage-store.test.ts`, and create `e2e/legal-acceptance.spec.ts`.

- [ ] **Step 1: Add UI tests for the required choices and gate.** Test unchecked Terms/Privacy controls block signup and setup; checked controls allow continuation; an existing account with no current acceptance sees the gate on a protected route; a current acceptance bypasses the gate; a version bump prompts again. Cover accessible labels and the announced validation error.

```tsx
expect(screen.getByRole("checkbox", { name: /agree to the terms/i })).not.toBeChecked();
await user.click(screen.getByRole("button", { name: "Create your profile" }));
expect(await screen.findByRole("alert")).toHaveTextContent(/accept both documents/i);
expect(createAccount).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run focused unit tests.** Run `npm run test -- tests/unit/auth-flow.test.tsx tests/unit/demo-signup.test.ts tests/unit/demo-storage-store.test.ts`; confirm the new assertions fail before implementation.
- [ ] **Step 3: Build two independent, accessible controls.** Use native labelled checkbox inputs and the existing design tokens; link Terms and Privacy in new tabs. Do not label Privacy acknowledgment as legal consent to analytics processing.

```tsx
<label>
  <input checked={termsAccepted} onChange={(event) => onTermsChange(event.target.checked)} required type="checkbox" />
  I agree to the <Link href="/terms" rel="noreferrer" target="_blank">Terms</Link>.
</label>
<label>
  <input checked={privacyAcknowledged} onChange={(event) => onPrivacyChange(event.target.checked)} required type="checkbox" />
  I acknowledge the <Link href="/privacy" rel="noreferrer" target="_blank">Privacy Notice</Link>.
</label>
```

- [ ] **Step 4: Wire account creation and invited setup.** Record the pair with local-demo account creation, hosted-demo signup/setup mutations, and live invitation completion. For live Google signup, save only the checked version pair in same-tab `sessionStorage` before OAuth, consume it after the authenticated identity returns, and clear it on success, rejection, cancellation, or account mismatch.
- [ ] **Step 5: Gate existing authenticated users in place.** In `LiveProviders.AuthBoundary` and `DemoWorkspaceShell`, show `LegalAcceptanceGate` instead of protected workspace content until both versions are current. Preserve the requested path by rendering the gate in place. Keep `/`, `/terms`, `/privacy`, `/[slug]`, and `/c/[cardToken]` public.
- [ ] **Step 6: Normalize saved local-demo state.** Add optional `legalAcceptances` history to `DemoState`; when normalizing older storage, default it to an empty array so existing browser data remains readable. Keep local data deterministic and explain in code that browser storage is a demo UX boundary, not a server security boundary.

```ts
type DemoLegalAcceptance = {
  customerId: string;
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: number;
};

legalAcceptances: normalizeCollection(parsed.legalAcceptances, isDemoLegalAcceptance),
```

- [ ] **Step 7: Run focused unit and local-demo E2E checks.** Run the unit command from Step 2 and `npm run test:e2e:demo -- e2e/legal-acceptance.spec.ts e2e/demo-setup-persistence.spec.ts`; expect signup, returning-account gate, invited setup, state retention, and accessibility assertions to pass.

## Task 4: Unify the default support destination safely

**Files:** `src/components/layout/navigation.ts`, `src/components/profile/CardResolverClient.tsx`, `src/components/profile/PublicProfileScreen.tsx`, `src/lib/demo/fixtures.ts`, `src/lib/demo/store.ts`, `convex/settings.ts`, `convex/demo.ts`, `convex/integration/remaining-operations.test.ts`, create `convex/integration/settings-support.test.ts`, `tests/unit/demo-storage-store.test.ts`, `e2e/admin.spec.ts`, `.env.example`, `convex/convex.config.ts`, generated Convex types.

- [ ] **Step 1: Add support-default tests.** In `convex/integration/settings-support.test.ts` and `tests/unit/demo-storage-store.test.ts`, assert that an empty Convex setting and fresh local demo use `mailto:officialntap.it@gmail.com`; a stored exact legacy value is normalized; a custom `https:` or `mailto:` setting is preserved; hosted-demo seeding preserves a custom value; and the public support query returns only the destination.
- [ ] **Step 2: Change the default and exact-value normalization.** Import `DEFAULT_SUPPORT_URL` from `convex/legalConstants.ts`. Update the workspace Help link and Convex fallback. Normalize only `mailto:wayneegarcia@gmail.com` and `mailto:support@example.test` in saved local state. Change hosted-demo seeding to replace only those exact defaults and leave custom saved values intact.

```ts
const supportUrl =
  parsed.supportUrl === "mailto:wayneegarcia@gmail.com" ||
  parsed.supportUrl === "mailto:support@example.test"
    ? DEFAULT_SUPPORT_URL
    : (parsed.supportUrl ?? fallback.supportUrl);
```

- [ ] **Step 3: Keep public support safe and mode-consistent.** Add an unauthenticated `settings.publicSupport` query that returns only the configured destination (or the official fallback). Use it for live inactive-card and unavailable-profile states. Keep authenticated account support on the existing query and keep the admin override supported.
- [ ] **Step 4: Remove stale support configuration.** No runtime code reads `TAPIT_SUPPORT_URL` or `NEXT_PUBLIC_SUPPORT_URL`; remove those stale example/config entries and the unused Convex env declaration, then regenerate Convex types. Update the old expected fallback in `convex/integration/remaining-operations.test.ts`. Keep test/customer contact addresses as test data, not product defaults.
- [ ] **Step 5: Inspect saved settings without changing Production.** In the intended non-production deployment, verify the current support setting. Update a stored value only when it exactly matches a known legacy default, using the existing audited admin setting mutation. Preserve any other configured value. Record a separate operator-approved Production setting update for the release; do not run it from this implementation task.
- [ ] **Step 6: Run focused checks.** Run `npm run test -- tests/unit/demo-storage-store.test.ts convex/integration/remaining-operations.test.ts convex/integration/settings-support.test.ts` and `npm run test:e2e:demo -- e2e/admin.spec.ts e2e/public-profile.spec.ts`; expect exact-value migration, admin override, and public state links to pass.

## Task 5: Update product records and complete verification

**Files:** `docs/privacy-notice-draft.md`, `docs/spec.md`, `docs/CHANGELOG.md`, `docs/launch-readiness.md`, `docs/specs/2026-09-25-01-23-google-oauth-only-auth-design.md`, `docs/specs/2026-09-25-12-05-production-live-cutover-design.md`, `docs/plans/2026-09-25-12-05-production-live-cutover.md`, `design/redesign/AdminSettings.dc.html`, `e2e/smoke.spec.ts`, `e2e/signup.spec.ts`, `e2e/hosted-demo.spec.ts`, `e2e/live.spec.ts`, `e2e/accessibility.spec.ts`.

- [ ] **Step 1: Update product documentation.** Replace the support-destination placeholder in `docs/spec.md`; record the public legal pages, versioned acceptance, and official contact in the changelog; add legal review and accurate-retention checks to launch readiness. Mark old cutover contact statements as historical while retaining historical admin identity values.
- [ ] **Step 2: Check local-demo accessibility and route behavior.** Run `npm run test:e2e:demo -- e2e/legal-acceptance.spec.ts e2e/accessibility.spec.ts e2e/smoke.spec.ts e2e/signup.spec.ts`; expect public page links, pre-access acceptance, keyboard flow, and mobile layouts to pass.
- [ ] **Step 3: Check hosted-demo and live OAuth paths only in non-production.** With the exact ignored environment contract from `docs/live-e2e.md` loaded for an isolated disposable deployment, run `npx playwright test --project chromium e2e/hosted-demo.spec.ts`. Run `npm run test:e2e:live` only through its existing explicit non-production safety gate after OAuth fixtures are provisioned for a Preview/development deployment; never target Production.
- [ ] **Step 4: Run repository verification.** Run `npm run verify`; expect design checks, formatting, lint, typecheck, unit/integration tests, and build to pass.
- [ ] **Step 5: Review issue coverage before changing the PR reference.** Confirm legal copy, all auth modes, protected Convex functions, support defaults/overrides, saved legacy values, and public profile behavior meet the spec. After implementation is included and legal publication facts are approved, change the draft PR body to `Closes #179`; keep it as `Refs #179` until then.

## Known limits

- Local-demo browser storage can be edited by its user; its acceptance gate only models the product flow. Convex acceptance is server-recorded and enforced.
- A public support destination is intentionally exposed on public unavailable states; the new public query must return only that one validated destination.
- Legal review may require copy changes or different retention statements. Do not merge a public Production deployment until the operator approves those facts.
