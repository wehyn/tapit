# Card Claiming and Customer Onboarding Implementation Plan

> **For agentic workers:** Use the Astra orchestrator workflow for bounded exploration, implementation, testing, review, and integration. Keep one writer per file and follow the current `AGENTS.md` and Convex AI guidelines.

**Goal:** Implement secure card claiming and two customer onboarding paths while preserving stable NFC URLs, explicit profile publication, existing authentication, and current card operations.

**Architecture:** Keep Convex as the source of truth. Separate the physical card token from the profile slug and from the one-time claim-code secret. Add an admin-only card lifecycle/claim-management surface, an auth-aware unpublished-card onboarding state that never returns draft content, and source-aware aggregate analytics. Preserve the existing `/c/<cardToken>` resolver and `/<slug>` public projection.

**Tech Stack:** Next.js 16 App Router, React 19, Convex 1.45, Convex Auth Password provider, Convex rate limiter, Vitest/convex-test, Playwright, existing demo adapter.

---

## File ownership map

### Backend and shared contracts

- `convex/schema.ts`: card lifecycle/claim metadata and analytics source fields/indexes.
- `convex/validators.ts`: card status/source/code validators and shared normalization limits.
- `convex/cards.ts`: public resolver, admin registration/attachment, claim-code lifecycle, deactivation/replacement transitions.
- `convex/cardClaims.ts`: short-lived pre-auth claim challenges and authenticated claim completion, kept separate from card administration.
- `convex/customers.ts`: admin customer creation/profile initialization and secure setup/reset trigger boundary.
- `convex/profiles.ts`: publication side effects for claimable cards and existing draft/publish behavior.
- `convex/analytics.ts`: source-aware view/click recording and aggregate reads.
- `convex/auth.ts`: secure administrator-triggered reset-email action only; do not alter provider password storage.
- `convex/integration/card-claiming.test.ts`: new backend integration coverage for schema, authorization, privacy, lifecycle, and analytics.
- `src/lib/auth/claim-code.ts`: client-safe code normalization/generation helpers only; never persist plaintext in Convex.

### Customer/admin/public UI

- `src/components/admin/CustomersManager.tsx`: admin account creation, initial profile values/design, setup/reset actions, and status display.
- `src/components/admin/CardsManager.tsx`: registration, existing-profile selection, attachment confirmation, claim-code lifecycle, status display, and QR output.
- `src/components/profile/CardResolverClient.tsx`: source parsing, unpublished onboarding state, auth-aware claim flow, and source-aware tracking.
- `src/components/profile/UnpublishedCardClaim.tsx`: focused unpublished-card owner/code form and post-verification routing.
- `src/components/profile/PublicProfileScreen.tsx`: direct-profile source attribution and unchanged published projection behavior.
- `src/app/c/[cardToken]/page.tsx`: pass the App Router query parameters to the client without changing the route.
- `src/app/[slug]/page.tsx`: pass direct-profile search parameters to the client without changing the public URL.
- `src/components/analytics/CustomerAnalytics.tsx`: source breakdown while retaining aggregate-only metrics.
- `src/components/admin/AdminAnalytics.tsx`: cross-customer source breakdown.
- `src/components/auth/LoginForm.tsx`: preserve safe return paths and support card-claim return navigation if the existing path needs a small extension.
- `src/lib/domain/index.ts`: keep shared types aligned with live Convex responses and demo behavior.

### Demo adapter and tests

- `src/lib/demo/fixtures.ts`, `src/lib/demo/store.ts`: mirror claimable state, code lifecycle, source analytics, and admin actions only where demo mode exposes the same flow.
- `tests/unit/claim-code.test.ts`: pure normalization/generation tests.
- `tests/unit/analytics.test.ts`: source aggregation tests.
- `tests/unit/link-rules.test.ts`, `tests/unit/profile-rules.test.ts`: regression coverage for unchanged shared publication and link rules.
- `e2e/admin.spec.ts`: admin dashboard card/account/code workflows.
- `e2e/customer.spec.ts`: claim/setup/publish flow and existing-account flow.
- `e2e/public-profile.spec.ts`: published, unpublished, direct, NFC, QR, inactive, and replaced paths.
- `e2e/accessibility.spec.ts`: new unpublished claim and admin confirmation states.

Do not hand-edit `convex/_generated/*`; regenerate through the installed Convex workflow when schema/function contracts change. Do not modify unrelated user-owned changes in `AGENTS.md`, `.agents/`, or `.codex/`.

## Data and API contracts

### Card state

Extend the card status union to:

```ts
type CardStatus = "registered" | "claimable" | "active" | "inactive" | "replaced";
```

Use these transitions:

```text
registered → claimable   attached to an unpublished profile
claimable  → active      profile is published after successful owner setup
registered → active      attached to an already-published profile
active     → inactive    administrator deactivation
active     → replaced    administrator replacement
```

Add optional card fields for the claim lifecycle:

```ts
claimCodeHash?: string;
claimCodeGeneratedAt?: number;
claimCodeExpiresAt?: number;
claimCodeInvalidatedAt?: number;
claimCodeClaimedAt?: number;
```

Add a `cardClaimChallenges` table containing `cardId`, a SHA-256 `challengeHash`, `expiresAt`, `usedAt`, and `createdAt`, with indexes named `by_challengeHash` and `by_cardId`. Store only normalized claim-code and challenge digests. The generated plaintext code may be returned only by the authenticated admin mutation that generated it and must not be returned by list/resolve/claim queries. The generated challenge may be returned by the public verification mutation only as a short-lived bearer value held by the browser until authentication; it must never be placed in a URL or returned with profile/customer data.

### Source attribution

Add a source union:

```ts
type AnalyticsSource = "nfc" | "qr" | "direct" | "unknown";
```

New analytics rows must include `source`. Keep the field optional for existing documents and treat missing values as `unknown` in every reader; new writes must always set a valid source. Bare `/c/<cardToken>` is `nfc`; `/c/<cardToken>?source=qr` is `qr`; `/<slug>` without a source is `direct`. Source never participates in authorization.

### Public resolver result

The public card resolver may return a non-private onboarding result:

```ts
type ResolveResult =
  | { status: "missing" }
  | { status: "inactive" }
  | { status: "unavailable" }
  | { status: "onboarding"; profileId: Id<"profiles"> }
  | { status: "active"; profile: PublicProfile };
```

`profileId` is only an opaque routing identifier and must not be accompanied by draft content, owner email, or customer data. Prefer returning `onboarding` only for an unpublished card with a valid attached profile; signed-out and unrelated callers receive the same generic onboarding state.

### Admin APIs

Keep all admin functions server-authorized with `requireAdministrator`. Add or extend functions with complete validators:

- `customers.createCustomer` accepts optional initial profile content/design values while preserving generated/default values and invitation behavior.
- `cards.attach` attaches a registered card to a selected profile, setting `claimable` for an unpublished profile and `active` for a published profile.
- `cards.generateClaimCode` returns the plaintext code once to the admin and records only its hash.
- `cards.invalidateClaimCode` revokes the current code.
- `cards.claimStatus` returns non-secret state for the owning admin view.
- `cardClaims.verifyCode` is a public mutation with `{ token, code }`; it checks only the card/code pair and returns a short-lived opaque challenge or a generic failure. It must not reveal profile/customer data.
- `cardClaims.complete` is an authenticated mutation with `{ challenge }`; it derives the authenticated customer, checks that the customer's profile owns the challenged card, consumes both challenge and code atomically, records the claim, and keeps the card `claimable` until publication. `profiles.publish` transitions an attached claimed card from `claimable` to `active`.
- `cards.adminList` returns claim/status metadata but never the code or hash.
- `auth.adminRequestPasswordReset` accepts only a customer ID from an admin and schedules the existing Convex Auth reset flow for the server-resolved customer email. It must never accept or store an admin-supplied password.

The claim mutation must derive the authenticated user with `getAuthUserId`/`ctx.auth`, resolve the linked `customers` row, and compare the card’s profile owner server-side. It must not accept a customer/profile ID as an authorization decision.

## Tasks

### Task 1: Add pure claim-code and source contracts

**Files:**

- Create: `src/lib/auth/claim-code.ts`
- Modify: `convex/validators.ts`
- Modify: `src/lib/domain/index.ts`
- Test: `tests/unit/claim-code.test.ts`

- [ ] Write tests for uppercase normalization, removal of surrounding whitespace, rejection of non-alphanumeric/incorrect-length values, and generation using an injectable random source or a deterministic test boundary.
- [ ] Implement an 8-character uppercase alphanumeric format using `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, and keep the client helper independent from authorization.
- [ ] Add shared `AnalyticsSource`/card-status types and Convex validators without changing existing public profile rules.
- [ ] Run `npx vitest run tests/unit/claim-code.test.ts tests/unit/profile-rules.test.ts tests/unit/link-rules.test.ts` and confirm the new tests pass.

### Task 2: Extend the Convex schema and backend card lifecycle

**Files:**

- Modify: `convex/schema.ts`
- Modify: `convex/cards.ts`
- Create: `convex/cardClaims.ts`
- Modify: `convex/profiles.ts`
- Modify: `convex/admin.ts` to expose a server-derived customer lookup helper for authenticated claim completion while preserving administrator checks.
- Create: `convex/integration/card-claiming.test.ts`

- [ ] Add failing convex-test cases for duplicate registration, admin-only attachment, published-profile immediate activation, unpublished-profile claimable state, invalid/reused/revoked code, cross-account claim denial, and inactive/replaced card denial.
- [ ] Add card claim fields and `claimable` status to the schema, add `cardClaimChallenges`, and add indexes named `by_token`, `by_profileId`, `by_status`, `by_challengeHash`, and `by_cardId` with declared fields in order.
- [ ] Implement server-side normalization/hash comparison using Web Crypto-compatible code in the Convex runtime. Generate claim codes only in an admin mutation and return plaintext only in that mutation response.
- [ ] Implement the admin attachment mutation. It must re-check card state, profile existence, duplicate attachment, profile ownership/customer status, and publication status in the transaction. It must write an audit record.
- [ ] Implement code generation and invalidation in `convex/cards.ts` with rate limiting, generic admin result states, and audit records. Regeneration replaces the digest and expiry so the prior code fails.
- [ ] Implement `cardClaims.verifyCode` with a per-card rate limiter, generic failure errors, a cryptographically random short-lived challenge, and a hashed challenge row. It must reject cards that are not `claimable`, expired/revoked/used codes, duplicate attempts beyond the limit, and malformed codes.
- [ ] Implement `cardClaims.complete` with server-derived identity, intended-profile ownership matching, atomic challenge/code consumption, single-use replay protection, and a claim audit record. It must not publish the profile.
- [ ] Update publication to transition an attached claimed `claimable` card to `active` only after a successful validated publish. Do not publish from card attachment or claim.
- [ ] Update `cards.resolve` to return onboarding for attached unpublished cards without projecting draft data. Preserve missing/inactive/unavailable behavior and active public projection behavior.
- [ ] Run `npx vitest run convex/integration/card-claiming.test.ts` and `npm run typecheck`; regenerate generated bindings through the installed Convex workflow after the schema and function contracts change.

### Task 3: Add source-aware analytics without changing privacy boundaries

**Files:**

- Modify: `convex/schema.ts`
- Modify: `convex/analytics.ts`
- Modify: `src/components/profile/CardResolverClient.tsx`
- Modify: `src/components/profile/PublicProfileScreen.tsx`
- Modify: `src/app/c/[cardToken]/page.tsx`
- Modify: `src/app/[slug]/page.tsx`
- Test: `convex/integration/card-claiming.test.ts`
- Test: `tests/unit/analytics.test.ts`

- [ ] Add failing tests for bare card/NFC, QR query, direct slug, and unknown historical attribution, including source totals for profile views and link clicks.
- [ ] Add `source` to recording mutations with a constrained validator and default unknown behavior for legacy callers. Validate the link against the published snapshot exactly as today.
- [ ] Update aggregate queries and UI summaries to group or filter by source while keeping total/unique counts aggregate-only.
- [ ] Pass App Router search params into client components. Treat `source=qr` as QR only on the card resolver; treat all other card values as NFC and slug visits without source as direct. Ignore source for authorization.
- [ ] Make QR generation append `source=qr` to the derived card URL without changing the stored NFC URL.
- [ ] Run analytics unit/integration tests and verify existing legacy rows remain queryable as unknown.

### Task 4: Implement unpublished-card claim and authentication routing

**Files:**

- Create: `src/components/profile/UnpublishedCardClaim.tsx`
- Modify: `src/components/profile/CardResolverClient.tsx`
- Modify: `src/components/auth/LoginForm.tsx`
- Modify: `src/components/auth/SetupForm.tsx` to preserve a sanitized claim return path through invitation setup.
- Modify: `src/lib/demo/store.ts`, `src/lib/demo/fixtures.ts`
- Test: `tests/unit/auth-flow.test.tsx`
- Test: `e2e/customer.spec.ts`
- Test: `e2e/public-profile.spec.ts`

- [ ] Add a generic unpublished-card component with an owner CTA, an 8-character code field, loading state, generic invalid/used/revoked/rate-limited error, and no profile data.
- [ ] On valid code, call `cardClaims.verifyCode`. Keep the opaque challenge in origin-scoped browser session state only; never put the claim code or challenge in a URL. If the browser is unauthenticated, route through the existing login/setup flow with a sanitized internal return path.
- [ ] After authentication, call `cardClaims.complete`; require the server-side customer/profile match, then route the owner to `/app/profile`. If the account is not yet linked, keep the challenge unconsumed and direct the customer to the existing invitation setup path supplied by the admin.
- [ ] Keep published cards on the existing public render path and record one profile view after public rendering. Do not count the onboarding screen as a public profile view.
- [ ] Mirror the same user-visible behavior in demo mode using the browser-local adapter without weakening live-mode security tests.
- [ ] Add browser coverage for signed-out unpublished access, valid owner setup, wrong account, invalid code, successful publish, and subsequent public card access.

### Task 5: Expand admin customer/card operations and confirmation UI

**Files:**

- Modify: `src/components/admin/CustomersManager.tsx`
- Modify: `src/components/admin/CardsManager.tsx`
- Modify: `convex/auth.ts`
- Modify: `src/components/admin/ProfilesManager.tsx` to keep administrator profile editing and publication status compatible with initialized profile themes/content.
- Modify: `src/components/qr/QrControls.tsx`
- Modify: `src/components/admin/AuditLog.tsx` to render readable labels for customer, card, claim, reset, and attachment audit actions.
- Modify: `src/lib/demo/store.ts`, `src/lib/demo/fixtures.ts`
- Test: `e2e/admin.spec.ts`
- Test: `e2e/accessibility.spec.ts`

- [ ] Add admin account-creation fields for email, profile name, profile slug, and supported theme/design values. Preserve duplicate email/slug validation and invitation creation.
- [ ] Add an existing-profile selector to card attachment. Show customer email, profile slug, profile status, card token, and card status before the mutation.
- [ ] Require explicit confirmation before attachment and show a separate success result with the new assignment/status.
- [ ] Add generate/regenerate/invalidate/copy claim-code controls. Display a newly generated code only in the immediate admin result state; do not populate it from list queries.
- [ ] Add setup/resend and secure password-reset trigger controls with generic result feedback. The UI must state that admins cannot view or set passwords.
- [ ] Add the server-authorized `auth.adminRequestPasswordReset` action. It must resolve the selected customer email server-side and schedule the existing reset email flow without accepting a password or exposing reset tokens to the admin.
- [ ] Display account, invitation, profile, claim, publication, and card status without exposing hashes or private profile fields.
- [ ] Preserve existing deactivate/replace confirmations and QR PNG/SVG downloads, updating encoded QR output to include `source=qr`.
- [ ] Add accessible labels, focus behavior, keyboard confirmation handling, and error states for all new controls. Run the admin accessibility test.

### Task 6: Extend customer/admin analytics presentation

**Files:**

- Modify: `src/components/analytics/CustomerAnalytics.tsx`
- Modify: `src/components/admin/AdminAnalytics.tsx`
- Modify: `src/lib/demo/store.ts`
- Test: `tests/unit/analytics.test.ts`
- Test: `e2e/customer.spec.ts`
- Test: `e2e/admin.spec.ts`

- [ ] Add source totals/breakdowns for NFC, QR, direct, and unknown while retaining profile views, unique views, and link clicks.
- [ ] Keep copy privacy-preserving and avoid visitor-level history or identity data.
- [ ] Mirror live source aggregation in demo mode and preserve existing empty/range states.
- [ ] Verify analytics after both onboarding paths, including a published profile attached after customer setup.

### Task 7: Full regression verification and independent review

**Files:**

- Modify only files required by test/reviewer findings.

- [ ] Run focused Convex integration tests for claim lifecycle, ownership, privacy, and publication.
- [ ] Run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`.
- [ ] Run `npm run test:e2e:demo -- --workers=1` and the targeted live-mode tests only against an explicitly selected non-production deployment when the required environment contract is present.
- [ ] Inspect `git diff --check` and the final diff for generated-file edits, secrets, draft leakage, and unrelated changes.
- [ ] Dispatch an independent Astra reviewer for security, concurrency, authorization, privacy, card-state, analytics, and missing-test review.
- [ ] Resolve all material findings, rerun affected tests, and confirm no delegated agent remains running before claiming completion.

## Verification matrix

| Requirement                 | Evidence                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin-assisted onboarding   | Admin E2E plus Convex integration test creates account/profile, attaches card, generates code, authenticates customer, and publishes         |
| Customer-created onboarding | Customer E2E creates profile, admin attaches a new card, and published/unpublished behavior is verified                                      |
| Card lifecycle              | Integration tests assert `registered → claimable → active` and preserve inactive/replaced transitions                                        |
| Secure claim code           | Unit and integration tests assert normalization, hash-only storage, one-time use, regeneration/revocation, rate limiting, and generic errors |
| Authz/privacy               | Cross-account convex-test cases and signed-out browser tests assert no draft/profile leakage or unauthorized attachment/claim                |
| No NFC rewrite              | Tests assert the same `/c/<cardToken>` resolves before and after publication/edits and QR only changes derived output                        |
| Source analytics            | Integration/unit/E2E assertions cover NFC, QR, direct, and unknown aggregates                                                                |
| Admin confirmation/status   | Admin E2E and accessibility tests cover confirmation, success/error states, status visibility, and code secrecy                              |
| Regression-free behavior    | Full unit, lint, typecheck, build, demo E2E, and relevant live Convex evidence                                                               |
