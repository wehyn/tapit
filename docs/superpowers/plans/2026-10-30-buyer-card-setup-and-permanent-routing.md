# Buyer Card Setup and Permanent URL Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or inline task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let buyers set up registered, unassigned cards themselves and keep each NFC/QR URL resolving to the card’s current state and profile.

**Architecture:** Extend the existing `/c/[cardToken]` resolver and claim flow. The permanent URL identifies a card but never proves ownership; the server routes by the card record and whether its package code has been consumed. The recipient’s signed-in account supplies the only profile eligible for attachment. Mirror the same transitions in local demo.

**Tech Stack:** Next.js 16 App Router, React, Convex, Convex Auth with Google OAuth, the local demo store, Vitest/convex-test, and Playwright.

---

## Scope and sequence

This plan combines issues [#190](https://github.com/wehyn/tapit/issues/190) and [#193](https://github.com/wehyn/tapit/issues/193). Issue [#196](https://github.com/wehyn/tapit/issues/196) follows this work and completes #193’s lost-card return-page acceptance. This plan covers the setup, claim, active-profile, correction-pending, unavailable, and missing states. #196 adds the lost state, admin action, configured return instructions, and dedicated page after the combined work is complete.

Keep package claim codes valid until a customer successfully uses them or an admin invalidates/replaces them. Keep the existing 10-minute verification challenge expiry and one-time challenge use. Existing stored `claimCodeExpiresAt` values must not expire old package codes after this change; stop writing the field and ignore it for package-code validity.

Preserve the exact registered card URL, including a query such as `?claim=1`, for NFC and QR. Treat query values as entry hints only. Never include a package code in the URL or QR. Do not expose a draft profile through a public card resolver response.

Follow #192’s canonical URL contract: normalize relative `/c/<token>` inputs to `https://tapit-eosin.vercel.app`, accept absolute URLs only on that HTTPS origin, and preserve the complete query string. Keep local demo records on that same canonical origin, including when migrating legacy same-origin URLs.

## File map

- `convex/schema.ts`, `convex/cards.ts`: preserve the full registered URL and route card state without exposing draft data.
- `convex/cardClaims.ts`, `convex/cardCorrectionRequests.ts`: generate and verify non-expiring package codes, attach only to the authenticated customer’s profile, and manage correction requests.
- `src/components/profile/CardResolverClient.tsx`, `src/components/profile/CardSetupFlow.tsx`, `src/components/profile/UnpublishedCardClaim.tsx`: present state-based routing, account choices, profile confirmation, code entry, skip, and correction states.
- `src/components/auth/OnboardingForm.tsx`, `src/app/onboarding/page.tsx`: return a new customer to the card flow after profile creation and ask about attachment only after the profile slug exists.
- `src/components/admin/CardsManager.tsx`: register cards unassigned by default, generate package codes for registered cards, and review correction requests.
- `src/lib/card-url.ts`, `src/lib/demo/fixtures.ts`, `src/lib/demo/store.ts`, `convex/demo.ts`: keep canonical URL handling and local/hosted-demo card transitions consistent with Convex.
- `convex/integration/card-routing.test.ts`, `convex/integration/card-claiming.test.ts`, `convex/integration/card-correction.test.ts`, `tests/unit/cards-manager.test.tsx`, `tests/unit/auth-flow.test.tsx`, `e2e/public-profile.spec.ts`, `e2e/admin.spec.ts`, `e2e/hosted-demo.spec.ts`: exercise backend contracts, UI states, and local/hosted demo journeys.
- `docs/spec.md`, `docs/CHANGELOG.md`, `scripts/verify-card-claim-model.mjs`: update product behavior and the claim lifecycle model.

## Task 1: Preserve permanent URLs and define resolver behavior

**Files:**

- Modify: `convex/cards.ts`
- Modify: `src/app/c/[cardToken]/page.tsx`
- Modify: `src/components/profile/CardResolverClient.tsx`
- Modify: `src/components/admin/CardsManager.tsx`
- Test: `convex/integration/card-routing.test.ts`
- Test: `tests/unit/cards-manager.test.tsx`

- [ ] **Step 1: Read the runtime-specific guides**

Read `convex/_generated/ai/guidelines.md` before editing Convex files. Install the locked dependencies with `npm ci` if `node_modules/next/dist/docs/` is absent, then locate and read the installed Next.js guide for route `searchParams` and navigation:

```bash
rg --files node_modules/next/dist/docs | rg '(page|use-search-params|use-router|navigation)'
```

The relevant code is under the existing App Router card route, and the repo’s Next.js `AGENTS.md` says to follow the installed version’s guide.

- [ ] **Step 2: Add resolver contract tests before changing routing**

Create `convex/integration/card-routing.test.ts` with `convexTest`, `vitest`, `api`, `schema`, and `import.meta.glob("../**/*.{ts,js}")`. Seed one admin, one customer, profiles in draft and published states, and cards for each state. Assert these public results:

| Seeded card state                                         | Resolver result | Public profile data                                 |
| --------------------------------------------------------- | --------------- | --------------------------------------------------- |
| `registered`, no `profileId`                              | `setup`         | None                                                |
| `claimable`, code not claimed                             | `claim`         | None, including when the profile is a private draft |
| `claimable`, code already claimed but profile still draft | `setup`         | None                                                |
| `active`, code not claimed                                | `claim`         | None                                                |
| `active`, `claimCodeClaimedAt` set                        | `active`        | Current published projection                        |
| `inactive` or `replaced`                                  | `inactive`      | None                                                |
| Unknown token                                             | `missing`       | None                                                |

Include an `active` claimed card with the registered URL `https://tapit-eosin.vercel.app/c/card-1?claim=1`; it must still resolve to its published profile. Assert that a `?claim=1` URL never supplies an ownership credential. Assert that the response for an attached, unclaimed draft contains no draft name, slug, links, or other profile content. Change that card’s profile slug and profile assignment in the test, then resolve the same token again and assert it returns the current published target while leaving `cardUrl` unchanged.

- [ ] **Step 3: Allow a permanent URL query while preserving its exact value**

Reuse `cardTokenFromUrl` and `normalizeCardUrl` from `src/lib/card-url.ts` in the admin UI and backend. Normalize relative `/c/<token>` inputs to the canonical origin; reject absolute URLs on other origins, credentials, invalid protocols, mismatched tokens, and fragments. Preserve the complete query on valid URLs, and make QR generation use the stored URL unchanged. Keep token uniqueness as the authoritative duplicate check. Migrate relative and old current-origin local-demo URLs to the canonical origin while leaving malformed or unrelated origins untouched.

Add unit and Convex mutation assertions that registering `https://tapit-eosin.vercel.app/c/card-1?claim=1` stores the same string and that a second URL with the same token is rejected. Verify the QR code input is the stored full URL and never contains a claim code.

- [ ] **Step 4: Implement the live resolver state contract**

In `cards.resolve`, return `setup` for a registered card without a profile; return `claim` for an attached but unclaimed card regardless of `?claim=1`; return `setup` for a claimed `claimable` card whose profile is still a private draft; and return the published profile only for an active card whose package code was claimed. Keep `inactive`, `missing`, and `unavailable` results free of profile data. Leave the lost state to follow-up #196.

Update `src/app/c/[cardToken]/page.tsx` and `CardResolverClient` so `claim=1` is preserved in the URL but does not force claim UI or authorize ownership; the resolver result controls the page. Route inactive, replaced, and missing cards to one neutral unavailable screen. Keep the claimed active profile public projection and existing analytics behavior intact.

- [ ] **Step 5: Run the focused resolver checks**

Run:

```bash
npm test -- convex/integration/card-routing.test.ts tests/unit/cards-manager.test.tsx
```

Expected: all resolver-state, full-URL, query preservation, profile privacy, and duplicate-token assertions pass.

## Task 2: Issue package codes before assignment and attach atomically

**Files:**

- Modify: `convex/cards.ts`
- Modify: `convex/cardClaims.ts`
- Modify: `convex/schema.ts`
- Modify: `src/components/admin/CardsManager.tsx`
- Modify: `src/components/profile/CardResolverClient.tsx`
- Modify: `src/components/profile/UnpublishedCardClaim.tsx`
- Test: `convex/integration/card-claiming.test.ts`
- Test: `tests/unit/cards-manager.test.tsx`

- [ ] **Step 1: List the failure cases the isolated backend tests must cover**

Before adding tests, record these failure cases in the test file comments or describe block: a public token without a code; wrong code; invalidated or replaced code; a package code whose legacy `claimCodeExpiresAt` is in the past; an expired or replayed 10-minute challenge; an account outside the card’s scope; a second account claiming the first account’s card; and a profile that already has a live card. These cases require Convex integration tests because rate limits, challenge replay, account identity, and writes must be checked transactionally.

- [ ] **Step 2: Add package-code lifecycle tests**

Extend `convex/integration/card-claiming.test.ts` to prove:

1. An administrator can generate a code for a `registered` card with no `profileId`.
2. A generated code is stored as a hash and the raw code is returned only in the generation response.
3. A code with a past legacy `claimCodeExpiresAt` still verifies when it is unused and not invalidated.
4. Admin invalidation or replacement makes the old code unusable.
5. Verification still creates a challenge that expires after 10 minutes and can be used once.
6. Successful completion associates the card with the authenticated customer’s server-owned `profileId`, consumes the package code, and records an audit event.
7. A caller cannot pass a different profile or customer ID to attach the card elsewhere.
8. A profile with another live card cannot receive a second attachment.

- [ ] **Step 3: Remove time expiry from package-code generation and verification**

In `convex/cards.ts`, allow `generateClaimCode` for `registered` unassigned cards and for existing eligible unclaimed attached cards. Stop setting `claimCodeExpiresAt`, stop returning expiry from `generateClaimCode` and `claimStatus`, and remove the expiry field from public resolver and admin-list projections. Keep the current generation rate limit, hash storage, audit entry, invalidate action, and regenerate behavior. Retain the optional schema field for previously stored documents, but do not use it to decide validity.

In `convex/cardClaims.ts`, allow `verifyCode` for a registered unassigned card or an eligible attached unclaimed card. Accept a valid hash until `claimCodeClaimedAt` or `claimCodeInvalidatedAt` is set. Keep the challenge’s 10-minute `expiresAt` and `usedAt` checks. In `complete`, derive the profile from the authenticated customer, confirm same scope and ownership, enforce the one-live-card-per-profile rule, attach a previously unassigned card, and atomically consume the challenge and package code. In `CardResolverClient.tsx`, remove the package-code expiry timer and route all unclaimed cards into setup or claim from resolver state.

- [ ] **Step 4: Update administrator registration and package-code controls**

In `src/components/admin/CardsManager.tsx`, leave newly registered cards in `registered` state without prompting to attach them. Keep the existing explicit assignment action for administrative assignments. Show **Generate claim code** for a registered unassigned card and for eligible attached unclaimed cards. Remove expiry text/state from the generated-code UI. Keep **Invalidate** and regenerate available until successful use. Keep the URL copy/QR actions independent from the private code.

- [ ] **Step 5: Verify the focused backend and admin contracts**

Run:

```bash
npm test -- convex/integration/card-claiming.test.ts tests/unit/cards-manager.test.tsx
```

Expected: unassigned cards accept one valid code claim, legacy package expiry does not invalidate codes, challenge expiry and replay protections remain, and new admin registrations stay unassigned.

## Task 3: Build the recipient setup, confirmation, and skip flow

**Files:**

- Create: `src/components/profile/CardSetupFlow.tsx`
- Modify: `src/components/profile/CardResolverClient.tsx`
- Modify: `src/components/profile/UnpublishedCardClaim.tsx`
- Modify: `src/components/auth/OnboardingForm.tsx`
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/components/auth/GoogleLoginForm.tsx`
- Test: `tests/unit/auth-flow.test.tsx`
- Test: `e2e/public-profile.spec.ts`
- Test: `e2e/hosted-demo.spec.ts`

- [ ] **Step 1: Add tests for account choice and resumed onboarding**

Extend `tests/unit/auth-flow.test.tsx`, `e2e/public-profile.spec.ts`, and `e2e/hosted-demo.spec.ts` to assert:

1. A signed-out recipient can choose an existing Tapit account or new profile setup.
2. Both paths use Google OAuth in hosted/live mode and return to the exact card path, including its query.
3. A new account completes profile onboarding and receives its slug before the card-attachment question appears.
4. Skipping attachment leaves the card unassigned, keeps the customer in the limited-access state from issue #155, and routes to `/app/profile`.
5. A later visit to the same card URL resumes setup for that account.
6. An existing account sees its own profile details and slug before confirming attachment.
7. The preview never exposes another account’s private draft.

- [ ] **Step 2: Add a card setup component around the existing claim form**

Create `CardSetupFlow.tsx` for the entry choices, loading/error states, authenticated profile preview, skip action, and correction-request entry point. Reuse `UnpublishedCardClaim` for the package-code input and challenge display where that keeps one validation path. The setup component must receive only the card token and resolver state; it must not receive a client-authoritative profile ID.

Build the sign-in return path as `/c/${encodeURIComponent(cardToken)}` and preserve the original search string. Pass it through the existing sanitized `next` path. Keep the package code in the form body only. Use the authenticated `profiles.current` result to render the recipient’s own slug, display name, bio, profile image, links, and publication state before the final confirmation.

- [ ] **Step 3: Return new customers to the card after onboarding**

In `src/app/onboarding/page.tsx` and `OnboardingForm.tsx`, read and sanitize an optional local `next` path. When it points to the card flow, complete profile creation first, show **Attach this card** and **Skip for now**, and route each action appropriately. Show this choice only after `completeSelfServiceOnboarding` returns the profile slug. If the user skips, leave the registered card and code unchanged and open `/app/profile`.

In `GoogleLoginForm.tsx`, preserve the card return path through Google sign-in for existing accounts and pending new accounts. If an account is already active, return to the card flow. If the account is pending, finish its current onboarding before returning.

- [ ] **Step 4: Confirm attachment only after profile preview and code verification**

Require the customer to sign in, enter the package code, review their own profile, and explicitly confirm before completion. The final mutation derives the target profile from the authenticated customer. On success, route to `/app/profile` and show that the same card URL now opens the confirmed profile. On invalid or unavailable codes, keep the message generic and allow retry within the existing rate limit. On skip, do not consume the code.

- [ ] **Step 5: Run the focused UI and local-demo journey**

Run:

```bash
npm test -- tests/unit/auth-flow.test.tsx
npm run test:e2e:demo -- e2e/public-profile.spec.ts
npm run test:e2e -- e2e/hosted-demo.spec.ts
```

Expected: the deterministic local demo covers unassigned setup, account/profile completion, profile preview, successful claim, skip, and rescan. With a non-production hosted-demo environment configured, the hosted demo covers the Convex resolver and claim mutations using demo-scoped data. The code remains absent from the card URL throughout.

## Task 4: Pause and correct a misassigned card

**Files:**

- Modify: `convex/schema.ts`
- Create: `convex/cardCorrectionRequests.ts`
- Modify: `convex/cards.ts`
- Modify: `src/components/profile/CardSetupFlow.tsx`
- Modify: `src/components/profile/CardResolverClient.tsx`
- Modify: `src/components/admin/CardsManager.tsx`
- Test: `convex/integration/card-correction.test.ts`
- Test: `tests/unit/cards-manager.test.tsx`

- [ ] **Step 1: Add correction-flow security tests**

Create `convex/integration/card-correction.test.ts`. Cover an authenticated customer with a valid package-code challenge requesting a correction; an unauthenticated caller; an invalid, expired, or replayed challenge; a request from another scope; duplicate open requests for one card; resolver neutrality while the request is open; and an admin correcting the assignment to the requester’s server-owned profile. Assert the request never stores the raw package code and the correction never changes `card._id`, `token`, or `cardUrl`.

Also assert the corrected card stays unclaimed and the package code remains available until the customer reopens the card and confirms the corrected profile. Assert that a profile with an existing active/claimable card cannot acquire a second one through the correction action; leave the request pending and explain the existing-card conflict in the admin UI.

- [ ] **Step 2: Add a scoped correction request model and mutations**

Add `cardCorrectionRequests` to `convex/schema.ts` with `scope`, `cardId`, `requesterCustomerId`, `requesterProfileId`, `status` (`pending` or `resolved`), `requestedAt`, and optional `resolvedAt`/`resolvedByUserId`, indexed by card, scope, and status. Add optional `correctionRequestedAt` to `cards`.

Implement `requestCorrection` in `convex/cardCorrectionRequests.ts`. Require an authenticated active customer, their server-owned profile, a current unexpired challenge for the card, matching package-code hash, and no existing open request. Mark the challenge used, create the request, and set `correctionRequestedAt`. Do not consume the package code.

Implement an administrator-only query and `correctAssignment` mutation. The mutation verifies the open request, requester profile ownership/scope, and existing one-live-card rule; then sets the card’s profile/status from that profile, clears `correctionRequestedAt`, resolves the request, and writes an audit event. Preserve the card ID, token, URL, and unconsumed package code. Do not add a user-facing rejection path; an unresolved operational conflict remains visible to administrators.

- [ ] **Step 3: Pause the public URL and add the admin review surface**

Make `cards.resolve` return `unavailable` with no profile data while `correctionRequestedAt` is set. In `CardSetupFlow.tsx`, confirm code possession before allowing **Request correction**, explain that the card is paused for review, and direct the recipient to scan again after the correction. In `CardsManager.tsx`, show a pending correction with the requester profile, current assignment, token, and **Correct assignment** action. Do not display a foreign draft to either the recipient or public resolver.

- [ ] **Step 4: Run correction and admin UI checks**

Run:

```bash
npm test -- convex/integration/card-correction.test.ts tests/unit/cards-manager.test.tsx
```

Expected: only authenticated, code-proven requests pause a card; public resolution stays neutral while pending; an administrator can assign the same physical card to the requester profile without changing its permanent URL; the recipient then confirms and consumes the same package code.

## Task 5: Match the full workflow in local demo

**Files:**

- Modify: `src/lib/demo/fixtures.ts`
- Modify: `src/lib/demo/store.ts`
- Modify: `convex/demo.ts`
- Modify: `src/components/admin/CardsManager.tsx`
- Modify: `src/components/profile/CardResolverClient.tsx`
- Modify: `src/components/profile/CardSetupFlow.tsx`
- Test: `e2e/public-profile.spec.ts`
- Test: `e2e/admin.spec.ts`

- [ ] **Step 1: Seed deterministic unassigned and correction fixtures**

Add a registered, unassigned local-demo card with a fixed eight-character demo code and a permanently stored URL. Keep the fixture code out of the URL. Extend demo card validation for correction-pending data while preserving old browser-local state containing `claimCodeExpiresAt`. Remove package-code expiry from hosted-demo card fixtures in `convex/demo.ts`.

- [ ] **Step 2: Mirror claim, expiry, and correction transitions**

In `src/lib/demo/store.ts`, allow admin generation for registered unassigned cards, remove package-code expiry checks, and keep challenge expiry at 10 minutes. Attach to the signed-in demo customer’s own profile only after confirmation. Keep a skipped card registered and resumable. Store correction requests locally, pause their public route, and let the admin assign the request to the requester’s own profile while preserving token and URL. Generate local demo codes deterministically from the card and demo state rather than wall-clock time.

- [ ] **Step 3: Keep admin demo registration unassigned by default**

Update the shared card manager’s demo branch so registration creates only the card record. Keep explicit admin assignment available from the row. Allow code generation, invalidation, and correction review for the same states as Convex. Render QR from the stored full URL.

- [ ] **Step 4: Prove the repeatable local demo behavior**

Extend `e2e/public-profile.spec.ts` to cover unassigned setup, successful claim, skip then rescan, and correction pause then admin correction. Extend `e2e/admin.spec.ts` to verify registration remains unassigned, the code appears only in the admin screen, invalidation works, and correction preserves the exact URL/token.

Run:

```bash
npm run test:e2e:demo -- e2e/public-profile.spec.ts e2e/admin.spec.ts
```

Expected: the complete browser journey passes using local storage only and does not require Google OAuth, Convex, or production data.

## Task 6: Update the product contract and verify the issue acceptance criteria

**Files:**

- Modify: `docs/spec.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `scripts/verify-card-claim-model.mjs`
- Test: `convex/integration/card-routing.test.ts`
- Test: `convex/integration/card-claiming.test.ts`
- Test: `convex/integration/card-correction.test.ts`
- Test: `e2e/public-profile.spec.ts`
- Test: `e2e/admin.spec.ts`
- Test: `e2e/hosted-demo.spec.ts`

- [ ] **Step 1: Update the product behavior and acceptance criteria**

Update `docs/spec.md` to remove customer self-service card claiming from the explicitly excluded MVP list; document registered unassigned card setup, Google account/profile onboarding, the non-expiring package code, explicit profile confirmation, skip/resume behavior, correction pause/review, and state-based permanent URL routing. Update card registration and card URL acceptance criteria to preserve the full stored NFC/QR URL. State that #196 adds the configured lost-card return instructions after this work.

Add a concise `2026-10-30` entry to `docs/CHANGELOG.md` describing buyer setup, non-expiring package codes, permanent URL routing, and admin-reviewed correction.

- [ ] **Step 2: Update the claim model check**

Update `scripts/verify-card-claim-model.mjs` so it models registered/unassigned, attached/unclaimed, active/claimed, correction-pending, inactive, and missing states. Assert that the package code has no timer, the verification challenge expires after 10 minutes, successful use consumes the code, and invalidation/replacement blocks the prior code.

- [ ] **Step 3: Run the focused contracts and repository verification**

Run:

```bash
npm test -- convex/integration/card-routing.test.ts convex/integration/card-claiming.test.ts convex/integration/card-correction.test.ts tests/unit/auth-flow.test.tsx tests/unit/cards-manager.test.tsx
node scripts/verify-card-claim-model.mjs
npm run test:e2e:demo -- e2e/public-profile.spec.ts e2e/admin.spec.ts
npm run test:e2e -- e2e/hosted-demo.spec.ts
npm run verify
```

Expected: all focused tests and the claim model check pass; local-demo E2E proves the buyer journey; hosted-demo E2E passes when configured for a non-production deployment; `npm run verify` passes design checks, formatting, lint, typecheck, tests, and build. Use only the deterministic local demo or non-production Convex test harness.

## #196 follow-up

After this plan completes, continue issue #196 by adding `lost` to the card schema and validators, the administrator **Mark lost** action, its audit event, configured return contact/instructions, and the dedicated lost-card page. Add the `lost` resolver result in `convex/cards.ts` and render it in `CardResolverClient.tsx`. Verify that a lost card’s URL keeps the same token and full query while other cards for the same profile remain unaffected.
