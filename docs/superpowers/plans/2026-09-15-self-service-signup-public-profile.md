# Self-Service Signup and Public Profile Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a new customer create a Tapit account from the login page, choose a stable profile URL, and immediately enter the existing customer workspace where they can add a bio, Portfolio link, TikTok link, and other safe destinations. The profile remains private until the customer explicitly publishes it, after which visitors can open the stable URL without a Tapit account.

**Architecture:** Keep Convex Auth Password as the identity provider and keep the existing one-customer/one-profile model. The login page gains a customer-only signup mode. After Password sign-up establishes the Auth identity, an authenticated Convex mutation derives the user email from the server identity and atomically creates the active customer record plus its draft profile. The existing ProfileEditor, LinksEditor, publication snapshot, public slug route, analytics, vCard, and card resolution remain the source of truth. Portfolio and TikTok are labeled safe links, not new profile fields or product entities. Demo mode receives a persistence-equivalent local adapter so the same browser journey works without Convex.

**Tech Stack:** Next.js 16.3.5, React 19.3, Convex 1.45.0, @convex-dev/auth 0.0.95 Password provider, TypeScript strict mode, Tailwind CSS 4, Vitest 5, convex-test, Playwright 1.63, and the repository's existing demo/live provider split.

**Spec:** docs/spec.md

## Global Constraints

- Signup is open to customer accounts only. There is no public administrator signup, administrator role selector, or administrator CTA.
- Signup fields are display name, desired profile slug, email, password, and password confirmation. The auth form does not collect a portfolio field; the existing Links workspace is the place to add Portfolio, TikTok, social, booking, contact, and other destinations.
- The server is authoritative for email ownership mapping, account role, profile ownership, slug normalization, slug reservation, slug uniqueness, and publication authorization. Client validation and slug availability are usability aids only.
- A successful signup creates exactly one active customer account and exactly one draft profile with the selected name and slug, no invitation, and no published snapshot. A retry for the same authenticated customer is idempotent and returns the existing account/profile rather than creating duplicates.
- The current Password provider behavior remains in place: password minimum length is eight characters, while email verification and password recovery remain documented launch gates rather than being invented as part of this slice.
- Use the existing route-safe return-path handling. A signup from /login?next=... may return to the sanitized internal path after provisioning; external URLs, protocol-relative URLs, malformed escapes, control characters, and backslash paths remain rejected.
- Profile slugs are trimmed and lowercased, use only lowercase ASCII letters, numbers, and single hyphens between segments, are at most 64 characters, and cannot be one of login, setup, app, admin, c, or api. The same rules and error messages must exist in the browser and Convex code.
- A newly created profile is not public merely because it has a URL. Visitors continue to receive the existing missing/unavailable state until the customer has a nonblank name and at least one valid enabled link and explicitly publishes.
- Public projection must continue to read only the published snapshot. Draft bio, draft image, draft links, and draft contact fields must never appear at /slug or /c/cardToken before publication.
- Keep existing invitation/setup onboarding, admin provisioning, card administration, customer role boundaries, safe HTTPS/mailto/tel destination rules, noindex public metadata, aggregate-only analytics, and deletion behavior intact.
- Keep the customer shell limited to Profile, Links, Analytics, and Account. Cards remain administrator-only.
- Preserve the repository default NEXT_PUBLIC_DEMO_MODE=true. Live tests and live documentation must target only explicitly confirmed dev or preview deployments.
- Convex functions must use object-form definitions, complete args and returns validators, server-derived identity, indexes for lookups, bounded reads, and the repository's Convex guidelines. Run code generation instead of hand-editing convex/_generated files.
- Public signup/rate limiting, email verification, password recovery, and abuse controls must be confirmed before enabling this flow for production traffic. This plan does not introduce an insecure client-only rate limiter.
- Do not alter, stage, or delete the pre-existing untracked asset public/images/tapit-profile-card-cutout-v2.png.

---

## Repository anchors discovered during the read-only audit

- Auth entry: src/app/(auth)/login/page.tsx and src/components/auth/LoginForm.tsx. The form currently supports sign-in only; SetupForm already demonstrates the supported Password flow:"signUp" plus an effect that waits for the Convex session before completing app-side setup.
- Auth boundary: src/components/providers/LiveProviders.tsx and proxy.ts protect /app and /admin. currentAccess intentionally reports authenticated false when a Convex Auth identity has no active Tapit customer record, so a just-created identity can remain on the login page while the provisioning mutation finishes.
- Existing account/profile model: convex/schema.ts, convex/customers.ts, convex/profiles.ts, convex/profileAccess.ts, convex/profileProjection.ts, and convex/validators.ts. No new portfolio table, link table, or schema field is needed.
- Existing public experience: src/app/[slug]/page.tsx, src/app/c/[cardToken]/page.tsx, src/components/profile/PublicProfileScreen.tsx, and src/components/profile/PublicProfile.tsx already render published labeled links and hide unpublished content.
- Existing customer editing: src/components/forms/ProfileEditor.tsx and src/components/forms/LinksEditor.tsx already expose stable URL, bio, preview, link ordering, arbitrary labels, and safe HTTPS/mailto/tel destinations. The new onboarding hint should lead into these surfaces rather than duplicate them.
- Demo boundary: src/lib/demo/fixtures.ts and src/lib/demo/store.ts persist local accounts and profiles; demo authentication is intentionally local and must remain isolated from Convex.
- Verification baseline: npm run verify, single-worker Playwright demo E2E, the guarded non-production live E2E command, npx convex codegen --typecheck enable, npx convex ai-files status, and git diff --check.

## Task 1: Reconcile the product specification and operational docs

**Files:**

- Modify docs/intent.md.
- Modify docs/spec.md.
- Modify docs/plan.md.
- Modify docs/DESIGN.md.
- Modify docs/live-convex-integration-plan.md.
- Modify docs/live-e2e.md.
- Modify README.md.

**Required decisions and documentation:**

- Replace the current administrator-only onboarding statement with two explicit paths:
  - operator-provisioned invited customer setup remains available through the existing setup token;
  - customer self-service signup is available from the public login page and creates a customer account plus a draft profile.
- Keep the first administrator operator-provisioned. The public signup mode must never create an admin account or allow a caller to select a role.
- Add the following functional requirements after the existing FR-050 requirements in docs/spec.md:

```text
FR-051: A visitor shall be able to choose customer self-service signup from the login page using display name, profile slug, email, password, and password confirmation.
FR-052: Customer self-service signup shall create one active customer account and one draft profile owned by that account, with no invitation and no published snapshot.
FR-053: The system shall derive the signup email and account role from the authenticated server identity and shall never accept a caller-supplied user ID or role for provisioning.
FR-054: The system shall normalize, validate, reserve, and uniquely enforce customer profile slugs before creating or saving a profile.
FR-055: A self-service customer shall receive a stable platform-hosted profile URL immediately, but that URL shall remain unavailable to visitors until explicit publication requirements are met.
FR-056: Self-service customers shall be able to use the existing labeled-link editor for portfolio, TikTok, social, contact, booking, and other destinations allowed by FR-014.
```

- Replace the existing no-public-signup AC-003 with an acceptance criterion that permits customer signup while retaining administrator protection, then add:

```text
AC-003: Given a visitor chooses Create your profile, when valid customer signup data is submitted, then Tapit authenticates the customer and provisions one active customer account with one private draft profile.
AC-035: Given signup creates a profile, when the customer opens the workspace, then the stable profile URL is shown and the customer is directed to add links before publication.
AC-036: Given a requested slug is invalid, reserved, or already in use, when signup is submitted, then Tapit rejects provisioning with an actionable error and does not create a second account or profile.
AC-037: Given a newly signed-up customer saves a bio or links without publishing, when a visitor opens the stable URL, then the visitor sees the existing missing/unavailable state and no draft content.
AC-038: Given a customer adds enabled Portfolio and TikTok HTTPS links and publishes a valid profile, when a signed-out visitor opens the stable URL, then the profile name, bio, and both labeled links are visible without authentication.
AC-039: Given a visitor attempts to create an administrator account through the public login page, when signup is submitted, then no administrator path or role selection is available.
AC-040: Given the existing invitation setup flow is used, when the invited customer completes setup, then the invitation remains one-time and the customer can still access the same profile workflow.
```

- Update the intent, design, and implementation-plan prose to describe the login toggle, mobile-first signup form, stable URL preview, explicit publish boundary, and the existing Links workspace as the portfolio/social destination editor.
- Update docs/live-e2e.md so “do not add sign-up to the public login page” becomes “do not add public administrator signup”; document that the live suite creates a unique disposable customer through the public customer signup mode while the first admin identity is still operator-provisioned.
- Update README.md commands and environment safety notes to explain that demo mode supports local self-service accounts, live mode requires a non-production deployment, and no additional live environment variable is needed because the signup test generates a unique email and slug at runtime.
- Keep the existing launch gates visible: Password provider rate limits/abuse controls, email verification, password recovery, retention, monitoring, and production domain decisions.

**Verification:**

- [ ] Search docs/spec.md, docs/plan.md, docs/live-e2e.md, docs/live-convex-integration-plan.md, and README.md for the old unconditional “no public customer signup” rule and revise every occurrence that contradicts customer self-service.
- [ ] Confirm every remaining administrator-provisioning sentence explicitly refers to admin-only setup or the first administrator, not to customer signup.
- [ ] Run git diff --check after the documentation commit.
- [ ] Commit as docs: define customer self-service onboarding.

## Task 2: Define and test the shared signup and slug contracts first

**Files:**

- Create src/lib/auth/signup.ts.
- Modify src/lib/domain/index.ts.
- Modify convex/validators.ts.
- Create tests/unit/signup.test.ts.
- Modify tests/unit/profile-rules.test.ts.

**Interfaces:**

```typescript
export type SignupFormValues = {
  email: string;
  password: string;
  confirmation: string;
  name: string;
  slug: string;
};

export type SignupPayload = {
  email: string;
  password: string;
  name: string;
  slug: string;
};

export type SignupValidationResult = {
  errors: Partial<Record<keyof SignupFormValues, string>>;
  payload: SignupPayload | null;
};

export function normalizeSignupEmail(value: string): string;
export function validateSignupEmail(value: string): string | null;
export function normalizeSignupInput(values: SignupFormValues): SignupPayload;
export function validateSignupInput(values: SignupFormValues): SignupValidationResult;
```

- Export MAX_PROFILE_SLUG_LENGTH, RESERVED_PROFILE_SLUGS, and normalizeProfileSlug from src/lib/domain/index.ts. Extend validateProfileSlug to enforce the 64-character limit and reserved route segments while preserving its existing immutable-slug and duplicate-slug options.
- Keep the browser domain module persistence-agnostic. It may share the profile slug contract with signup validation, but it must not import Convex database context or perform availability queries.
- Export the Convex-side equivalents from convex/validators.ts, with a distinct server-safe name where needed, such as validateProfileSlugValue. Define the helper contract here; integrate it into createCustomer, saveDraft, publish, and self-service provisioning in Task 3 so every Convex path uses the same rules.
- Use exact validation behavior:
  - normalize email with trim and lowercase; reject blank, whitespace-containing, or malformed email;
  - trim the display name and reject blank or longer-than-120-character names;
  - trim/lowercase the slug and apply the shared slug rules;
  - require password length of at least eight characters and an exact confirmation match;
  - return a null payload when any field has an error, and never return the confirmation in the payload.

**TDD sequence:**

- [ ] Add unit tests for email/name/password/confirmation normalization and errors, including leading/trailing whitespace.
- [ ] Add unit tests for lowercasing slugs, invalid separators, reserved route segments, the 64-character boundary, duplicate slugs, and immutable published slugs.
- [ ] Run npx vitest run tests/unit/signup.test.ts tests/unit/profile-rules.test.ts and record the expected red result because the new module and slug constraints do not exist yet.
- [ ] Implement src/lib/auth/signup.ts and the frontend domain constants/rules.
- [ ] Implement the server-side validator constants/rules; leave existing Convex slug call-site integration to Task 3.
- [ ] Re-run the focused Vitest command and require all new and existing slug tests to pass.
- [ ] Run npm run typecheck so the new contract is checked under strict TypeScript settings.
- [ ] Commit as feat: define signup and profile-slug contracts.

## Task 3: Add the authenticated Convex self-service provisioning vertical slice

**Files:**

- Modify convex/customers.ts.
- Modify convex/profiles.ts.
- Modify convex/validators.ts to apply the server helper at the existing slug-validation call sites.
- Modify convex/integration/auth-ownership.test.ts.
- Modify convex/integration/content-hardening.test.ts for the slug-hardening assertions.
- Regenerate Convex output with npx convex codegen --typecheck enable; do not hand-edit convex/_generated.

**Interfaces:**

```typescript
export const checkSlugAvailability = query({
  args: { slug: v.string() },
  returns: v.object({
    available: v.boolean(),
    normalizedSlug: v.string(),
    error: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    // Normalize and validate the slug, then use profiles.by_slug.
    // Return availability/error only; never return profile or owner data.
  },
});

export const createSelfServiceAccount = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
  },
  returns: v.object({
    customerId: v.id("customers"),
    profileId: v.id("profiles"),
    slug: v.string(),
  }),
  handler: async (ctx, args) => {
    // Require the authenticated user and derive the email from users/Auth identity.
    // Create or return exactly one active customer/profile pair.
  },
});
```

- Put checkSlugAvailability in convex/profiles.ts because the existing by_slug index and public profile lookup live there. Normalize the incoming value, return a reserved/invalid error without a database lookup, return a duplicate error when by_slug finds a profile, and return available true only for a valid unused slug.
- In createSelfServiceAccount:
  - call requireUser(ctx);
  - load the authenticated users row and require a valid email; normalize it server-side;
  - look up the current customer by by_userId; if it is an active customer with a profile, return its IDs and normalized slug without inserting anything;
  - reject an admin record, deleted/inactive record, or a current user linked to an incompatible account;
  - validate the trimmed name and normalized slug using the server helpers;
  - query customers.by_email and reject an existing customer or pending invitation for another account with the exact message “That email already has a Tapit account or invitation. Sign in or use the setup link.”; do not auto-claim an admin-created invitation because Password signup does not prove email ownership;
  - query profiles.by_slug and reject a duplicate slug;
  - insert a customer with the derived email, role customer, status active, deletionStatus active, userId, and timestamps;
  - insert a profile owned by that customer with top-level slug, status draft, draft name/slug/empty links, and no published snapshot;
  - patch the customer profileId;
  - insert an auditLogs row with action customer.self_service_created, the authenticated actorUserId, accountId, profileId, timestamp, and a non-secret after payload;
  - return the new IDs and slug.
- Keep the mutation idempotent for retries after the Auth provider succeeds. A duplicate-slug failure must leave the authenticated identity available so the UI can correct the slug and retry the app provisioning mutation without calling Password sign-up a second time.
- Replace raw slug regular expressions in createCustomer and profiles.saveDraft with the server helper. Preserve post-publication immutability, duplicate checks, safe link validation, profile image ownership, and the existing invitation flow.
- Do not add a schema table or accept email, userId, role, accountId, or profileId from the browser. The current customers and profiles schema is sufficient.

## Task 4: Mirror the provisioning behavior in the local demo adapter

**Files:**

- Modify src/lib/demo/store.ts.
- Create tests/unit/demo-signup.test.ts.

**Interface:**

```typescript
export type DemoSelfServiceAccountInput = {
  email: string;
  name: string;
  slug: string;
  passwordHash: string;
};

export function createDemoSelfServiceAccount(input: DemoSelfServiceAccountInput): {
  customerId: string;
  profileId: string;
  slug: string;
};
```

- Normalize and validate email/name/slug using the same user-visible contract as live mode. Reject existing active/invited/deleted customer emails and any slug found in a draft or published profile.
- Generate unique local customer/profile IDs with crypto.randomUUID, add an active customer with role customer, the supplied passwordHash, no setupToken, and the new profileId, and add a draft DemoProfile with the supplied name/slug, empty links, paper theme, draft status, and published null.
- Persist the customer/profile/audit update through updateDemoState so localStorage rollback behavior remains centralized. Leave the legacy primary profile alias and demo admin fixture intact; getDemoProfileForSession must resolve the new profile through the new customer profileId.
- Add audit action customer.self_service_created with the new email/slug but no password.

**TDD sequence:**

- [ ] Add tests that reset the demo state, create an account, reload state from localStorage, and assert the customer/profile/audit records persist with the expected ownership and publication boundary.
- [ ] Assert a new profile's public projection is null before publication and that duplicate email/slug attempts leave state unchanged.
- [ ] Run npx vitest run tests/unit/demo-signup.test.ts and record the expected red result.
- [ ] Implement the adapter and run the focused test again.
- [ ] Run npm run typecheck and commit as feat: add demo self-service account adapter.

## Task 5: Add the signup mode and customer-only UX to the login page

**Files:**

- Create src/components/auth/AuthShell.tsx.
- Modify src/components/auth/LoginForm.tsx.
- Modify src/app/(auth)/login/page.tsx.
- Modify src/app/page.tsx.
- Create e2e/signup.spec.ts with the first browser assertions.
- Modify e2e/accessibility.spec.ts for the signup-mode axe check.

**Interfaces:**

```typescript
export type AuthMode = "signin" | "signup";

export function AuthShell({
  mode,
  onModeChange,
  children,
  supportUrl,
  demoHint,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  children: ReactNode;
  supportUrl?: string;
  demoHint?: boolean;
}): ReactNode;

export function LoginForm({
  nextPath,
  initialMode,
}: {
  nextPath?: string;
  initialMode?: AuthMode;
}): ReactNode;
```

- Import type ReactNode from react and extract the shared Tapit login layout, Brand/Fingerprint treatment, support/footer treatment, focus/target sizing, and mode copy into AuthShell without changing SetupForm. Use accessible mode buttons with exact labels “New to Tapit? Create your profile” and “Already have an account? Sign in”.
- Keep sign-in behavior and sanitizeReturnPath unchanged except for the new mode state. Preserve admin redirect to /admin/customers and customer redirect to /app/profile.
- Add the signup fields with stable labels and IDs:
  - Display name, id signup-name;
  - Profile link, id signup-slug;
  - Email, id signup-email;
  - Password, id signup-password;
  - Confirm password, id signup-confirmation.
- Signup copy should explain the outcome in plain language: create a shareable Tapit profile for a bio, portfolio, socials, and contact links. Show a relative/current-origin profile URL preview after a valid slug is entered and show availability as checking, available, reserved/invalid, or already in use.
- Use validateSignupInput on submit. Show field-level errors through Field and an actionable Notice for provider/provisioning errors. Do not disable submission solely because the availability query is still loading; the mutation remains authoritative.
- Use “The profile slug is invalid.” for malformed slugs, “That profile slug is reserved.” for route collisions, “That profile slug is already in use.” for duplicate slugs, and “That email already has a Tapit account or invitation. Sign in or use the setup link.” for an app-level email conflict.
- Demo path:
  - validate the form;
  - hash the password with hashDemoPassword;
  - call createDemoSelfServiceAccount;
  - call setDemoSession with the new normalized email and role customer;
  - route to the sanitized next path or /app/profile.
- Live path:
  - use useAuthActions().signIn("password", { flow: "signUp", email, password }) for a new identity;
  - wait for isAuthenticated as SetupForm does, then call api.customers.createSelfServiceAccount with only name and slug;
  - if the user is already authenticated with no active Tapit account after a failed slug attempt, call the provisioning mutation directly rather than attempting Password sign-up again;
  - on duplicate slug, keep the session and form values so the customer can correct the slug and retry;
  - on an existing app-account/invitation conflict or provider failure, show the exact actionable error and provide a safe route back to sign-in/setup; never write directly to Convex Auth tables;
  - after success, route to the sanitized next path or /app/profile.
- Add the live api.profiles.checkSlugAvailability query as an advisory UX signal. In demo mode compute the same state from local profile records.
- Update the login page searchParams type to accept mode and pass signup only for the exact mode=signup value; all other values default to sign-in.
- In src/app/page.tsx, point the live header/hero acquisition CTA to /login?mode=signup with “Create your profile” copy. Preserve the demo “View demo profile” CTA and the existing Open workspace link so the current smoke contract remains valid.
- Verify LiveProviders continues to allow /login while currentAccess reports no active app account; do not broaden protected routes or change the admin boundary.

**TDD/acceptance sequence:**

- [ ] Add the demo Playwright test for /login?mode=signup, required labels, the mode toggle, reserved slug feedback, and successful redirect before implementing the new UI. Run NEXT_PUBLIC_DEMO_MODE=true npx playwright test e2e/signup.spec.ts --project chromium --workers=1 and record the expected failure.
- [ ] Implement AuthShell, the two mode branches, live/demo provisioning calls, and login-page mode parsing.
- [ ] Re-run the focused signup test and require successful creation of an isolated local customer session.
- [ ] Add assertions that normal sign-in still reaches the customer fixture and admin fixture, and that the live CTA has signup mode without exposing an admin option.
- [ ] Add an accessibility test for /login?mode=signup that asserts the signup heading and runs the existing axe helper.
- [ ] Run npx vitest run tests/unit/auth-lifecycle.test.ts tests/unit/signup.test.ts tests/unit/demo-signup.test.ts and npm run typecheck.
- [ ] Commit as feat: add customer signup mode to login.

## Task 6: Make the post-signup path visibly lead to a publishable bio/link profile

**Files:**

- Modify src/components/forms/ProfileEditor.tsx.
- Modify src/components/forms/LinksEditor.tsx.
- Extend e2e/signup.spec.ts.

**Behavior:**

- Add the same onboarding Notice to the demo and live ProfileEditor when the current profile is a new draft with no valid enabled link and no published snapshot:

```text
Your profile link is ready. Add a Portfolio, TikTok, or contact link, then publish it.
```

- Include a 44px-or-larger ButtonLink to /app/links labeled Add your first link. Keep the existing stable URL display/copy control visible, and retain the existing preview/publication error behavior.
- Update the LinksEditor description and empty state to mention that labels such as Portfolio and TikTok can point to valid HTTPS destinations, while email and phone actions can use the existing mailto/tel support. Do not add a TikTok-specific schema field or require a particular social network.
- Keep link labels arbitrary, link ordering/enabled state intact, and all existing safe-destination validation/error messages unchanged.

**TDD/acceptance sequence:**

- [ ] Extend e2e/signup.spec.ts to create a unique demo account, assert the ProfileEditor shows the stable /creator-profile URL and the onboarding Notice, and assert direct signed-out access is unavailable before publication.
- [ ] Add an initial bio and save a draft; assert the public route still does not expose the draft bio.
- [ ] Open Links, add enabled links labeled Portfolio and TikTok with HTTPS destinations, save/publish, sign out, and assert the public profile shows the name, bio, both labels, and the correct link hrefs without authentication.
- [ ] Assert malformed javascript: destinations continue to fail and do not become public.
- [ ] Implement the shared onboarding copy/CTA in both provider branches and update link guidance.
- [ ] Run NEXT_PUBLIC_DEMO_MODE=true npx playwright test e2e/signup.spec.ts --project chromium --workers=1 and the existing customer/public-profile tests with one worker.
- [ ] Run npm run format:check, npm run lint, and npm run typecheck.
- [ ] Commit as feat: guide new customers from profile link to publication.

## Task 7: Extend live non-production browser coverage without changing admin provisioning

**Files:**

- Modify e2e/live.spec.ts.
- Modify docs/live-e2e.md to document the generated-data and non-production requirements of the final test.

**Live journey:**

- Add a serial test to the existing live.spec.ts so Playwright config continues to select the live project without changing test matching.
- Generate a unique email and valid slug at runtime, use a disposable non-production password, visit /login?mode=signup, and complete customer signup. Do not add credentials to environment files or print them.
- Assert redirect to /app/profile, the new customer profile name/slug, and the stable URL preview.
- Save a draft bio, open the stable URL from a separate browser context before publication, and assert the existing Profile not found/unavailable state plus absence of the draft bio.
- Add Portfolio and TikTok links through /app/links, publish, sign out, and assert a separate signed-out context sees the name, bio, and both links.
- Sign in again with the generated credentials to prove the newly provisioned Auth identity and app account survive the public visit.
- Keep the test scoped to the selected dev/preview deployment and leave the generated account as disposable data in that isolated deployment. Do not attempt undocumented Convex Auth deletion or direct table cleanup; document the supported customer request/admin approval UI as the cleanup path when operators need to remove the app account.
- Preserve the existing live tests for seeded customer draft privacy, admin card/analytics operations, invitation setup/token replay, and moderation.

**Verification:**

- [ ] Run the demo signup journey first.
- [ ] With a complete ignored live contract and explicit non-production confirmation loaded, run npm run test:e2e:live and require the new signup test plus all existing serialized live tests to pass.
- [ ] Confirm the live run creates no admin account and no invitation for the self-service customer.
- [ ] Record the live test's generated-data and non-production requirements in docs/live-e2e.md.
- [ ] Commit as test: cover live customer self-service signup.

## Task 8: Run the full verification and security review before declaring the feature ready

**Files:**

- Review docs/spec.md, docs/live-e2e.md, and README.md for stale customer-signup language after all code and test changes.
- No generated Convex file is hand-edited.

**Required verification:**

- [ ] Run npx vitest run tests/unit/signup.test.ts tests/unit/demo-signup.test.ts tests/unit/profile-rules.test.ts tests/unit/auth-lifecycle.test.ts.
- [ ] Run npx vitest run convex/integration/auth-ownership.test.ts convex/integration/content-hardening.test.ts convex/integration/analytics-hardening.test.ts convex/integration/storage.test.ts convex/integration/remaining-operations.test.ts.
- [ ] Run npx convex codegen --typecheck enable.
- [ ] Run npm run verify. This must cover format verification, lint, strict TypeScript, all unit tests, and the production build.
- [ ] Run npm run test:e2e:demo -- --workers=1, then run npm run test:e2e -- --workers=1 and obtain a final exit code rather than treating an output-window timeout as a result.
- [ ] When and only when the complete dev/preview contract is present, run set -a; source .env.live.local; set +a; TAPIT_LIVE_CONVEX_DEPLOYMENT=dev npm run test:e2e:live. Never substitute a production deployment.
- [ ] Run npx convex ai-files status after Convex changes and confirm the required project guidance is available.
- [ ] Run git diff --check and inspect git status --short --branch. Confirm the only pre-existing unrelated item remains public/images/tapit-profile-card-cutout-v2.png and is unstaged/untouched.

**Review checklist:**

- [ ] Unauthenticated users can view published profiles and cannot view drafts.
- [ ] An Auth identity without an active Tapit customer cannot access /app or /admin and cannot self-assign an admin role.
- [ ] The provisioning mutation accepts only name and slug, derives email/userId/role on the server, is idempotent, and cannot attach a second customer to another user's profile.
- [ ] Duplicate/reserved/malformed slugs fail in both availability feedback and authoritative mutation; race-time duplicate protection remains in the Convex transaction.
- [ ] Existing invited setup links remain token-bound, one-time, email-matched, and unaffected by public customer signup.
- [ ] Sign-in, sign-out, safe next paths, admin routing, deletion/unpublication, cards, analytics, vCard, image ownership, and existing accessibility checks still pass.
- [ ] The public profile continues to expose only safe labeled destinations; Portfolio and TikTok are content labels, not trusted redirect instructions.
- [ ] Signup form labels, inline errors, focus states, keyboard operation, color contrast, reduced-motion behavior, and mobile layout pass the existing axe/browser checks.
- [ ] Production launch remains blocked until provider/deployment rate limits, email verification, password recovery, monitoring, and abuse handling are explicitly confirmed.

**Final commit/review outcome:**

- [ ] Keep the feature-sized commits above intact; do not squash unrelated surfaces into one commit.
- [ ] Run git diff --check after the final documentation correction.
- [ ] Request an independent code review focused on auth identity linking, duplicate/race behavior, public draft leakage, and the distinction between customer signup and administrator provisioning.
