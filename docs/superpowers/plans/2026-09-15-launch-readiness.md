# Tapit Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]` syntax) for tracking.

**Goal:** Move Tapit from the proven local/demo and non-production Convex integration to a release candidate with production authentication safeguards, repeatable preview validation, and recorded physical-device acceptance.

**Architecture:** Keep NEXT_PUBLIC_DEMO_MODE=true as the deterministic local regression boundary. Use separate Vercel and Convex development, preview, and production environments, with NEXT_PUBLIC_DEMO_MODE=false only in an explicitly selected live environment. Complete the deferred authentication and abuse controls, exercise the existing live Playwright harness against preview, and record real-device results in the existing acceptance checklist without storing private customer data.

**Tech Stack:** Next.js 16.3.5, React 19.3.0, TypeScript 5.9.3, Convex 1.45.0, @convex-dev/auth 0.0.95, Vitest 5.0.0, Playwright 1.63.0, axe 4.13.0, Vercel, Convex CLI, and one approved transactional email provider behind the Convex Auth email-provider boundary.

**Spec:** docs/intent.md, docs/spec.md, docs/DESIGN.md, docs/plan.md, docs/live-convex-integration-plan.md, docs/live-e2e.md, docs/design-proof.md, and e2e/real-device-checklist.md

## Global Constraints

- Use Node.js 22.12 or newer and npm 11 or newer.
- Keep NEXT_PUBLIC_DEMO_MODE=true as the safe local default.
- Use separate Convex development, preview, and production deployments.
- Run live provisioning only against a named non-production deployment with TAPIT_LIVE_PROVISION_CONFIRM=I_UNDERSTAND_NON_PRODUCTION.
- Never point npm run test:e2e:live at production; its deployment guard must remain fail-closed.
- Provision Convex Auth identities through supported authentication flows; never write undocumented Auth tables directly.
- Derive Convex authorization from the authenticated identity; never trust caller-supplied user IDs, roles, or ownership claims.
- Read convex/_generated/ai/guidelines.md before changing any file under convex/.
- Never hand-edit convex/_generated/; regenerate it through the installed Convex workflow when required.
- Keep deployment URLs, API keys, passwords, setup tokens, user IDs, and private customer data in ignored environment storage or provider dashboards.
- Preserve public/images/tapit-profile-card-cutout-v2.png and the existing self-service plan unless the owner explicitly requests a separate change to either file.
- Keep repository history organized by coherent feature or release surface; use separate commits for documentation, auth controls, abuse controls, and acceptance evidence.
- Do not claim production readiness from local tests, desktop browser tests, or the earlier non-production live run alone.

## Current Baseline and Scope

At plan creation, main and origin/main both point to merge commit be93955, which includes self-service customer signup and public profiles. The tracked application currently passes lint with four generated-file warnings, strict TypeScript, 100 unit tests, the production build, and 16/16 demo Playwright tests. git diff --check passes. The full npm run verify command is currently stopped before lint because the existing untracked self-service plan under docs/superpowers/plans/ is not formatted; Task 1 restores that release gate without changing its meaning.

The remaining work spans operational setup, security hardening, live deployment proof, and physical-device proof. The tasks below are deliberately separated into reviewable commits; they can be split into separate execution plans later without changing their boundaries.

## File and Responsibility Map

- Create docs/launch-readiness.md as the single release contract: decisions, environment matrix, go/no-go gates, backup/rollback runbook, monitoring owner, and evidence links.
- Modify README.md to link the release contract and make local, preview, and production boundaries explicit.
- Modify .env.example only with safe variable names and comments for the preview/production contract; keep all values empty or non-sensitive.
- Modify docs/live-e2e.md to point operators at the preview contract, current live test count, and the production prohibition.
- Format but do not semantically rewrite docs/superpowers/plans/2026-09-15-self-service-signup-public-profile.md; it is an existing worktree artifact that currently blocks npm run verify.
- Preserve public/images/tapit-profile-card-cutout-v2.png; it is not part of this plan’s staging set.
- Modify convex/auth.ts to enable the selected email verification/reset providers and configure failed-sign-in throttling.
- Create convex/authEmail.ts as the provider-neutral email message boundary used by Convex Auth verification and reset flows.
- Create convex/convex.config.ts only if the installed Convex environment API requires declarations for the chosen email provider variables; declare those variables there and read them through generated env bindings.
- Modify convex/customers.ts and the selected Convex rate-limiter component wiring to enforce verified identities and throttle public self-service account creation server-side.
- Modify src/components/auth/LoginForm.tsx and src/components/forms/AccountSettings.tsx for verification-code, reset-request, and reset-completion states.
- Modify src/components/auth/SetupForm.tsx so invitation setup cannot activate an account before required email verification succeeds.
- Add focused unit/integration tests beside the existing auth and ownership tests; extend e2e/signup.spec.ts and e2e/live.spec.ts only for behaviors that are safe and deterministic to exercise.
- Modify convex/integration/auth-ownership.test.ts so existing authenticated fixtures explicitly represent verified users.
- Update e2e/real-device-checklist.md and docs/design-proof.md only after actual preview/device evidence exists; keep screenshots and recordings outside the repository.

---

### Task 1: Release Contract and Worktree Hygiene

**Files:**

- Create: docs/launch-readiness.md
- Modify: README.md
- Modify: .env.example
- Modify: docs/live-e2e.md
- Format only: docs/superpowers/plans/2026-09-15-self-service-signup-public-profile.md
- Preserve without staging: public/images/tapit-profile-card-cutout-v2.png

**Interfaces:**

- Consumes: the current environment variables in .env.example, the live execution contract in docs/live-e2e.md, the deferred gates in docs/DESIGN.md, and the completed/non-production status in docs/live-convex-integration-plan.md.
- Produces: one operator-readable release contract that later tasks can use for preview setup, live E2E, manual acceptance, go/no-go, and rollback decisions.

- [ ] **Step 1: Inventory the worktree before touching release documentation**

Run:

```bash
git status --short --branch
git diff --check
git ls-files --others --exclude-standard
```

Classify the existing self-service plan as a documentation artifact and the v2 image as a preserved local asset. Do not use a wildcard git add, do not delete either file, and do not stage either file in the release-contract commit unless the owner separately requests it.

- [ ] **Step 2: Format the existing self-service plan without changing its content**

Run:

```bash
npx prettier --write docs/superpowers/plans/2026-09-15-self-service-signup-public-profile.md
npx prettier --check docs/superpowers/plans/2026-09-15-self-service-signup-public-profile.md
```

Expected: Prettier changes whitespace only and the focused check reports that the file matches. If the diff contains prose or code changes, stop and restore only the unintended semantic changes before continuing.

- [ ] **Step 3: Create the release contract with explicit decisions and evidence fields**

Create docs/launch-readiness.md with these sections and the following concrete recording rules:

```markdown
# Tapit Launch Readiness

## Release target

Record each entry from the named source before marking a release gate complete:

| Entry                                  | Required source                                                  |
| -------------------------------------- | ---------------------------------------------------------------- |
| Candidate commit                       | Output of git rev-parse --short HEAD from the reviewed worktree  |
| Preview application URL                | URL shown by the selected Vercel preview deployment              |
| Preview Convex deployment reference    | Named non-production deployment accepted by scripts/live-e2e.mjs |
| Production application URL             | Approved production Vercel project domain                        |
| Production Convex deployment reference | Approved production Convex deployment name                       |
| Release owner                          | Named person who owns the go/no-go decision                      |
| Incident contact                       | Named person and escalation destination for the release window   |

## Product and policy decisions

Record the owner-approved value and an evidence link or dashboard reference for each decision:

| Decision                                            | Required record                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Production domain and public URL                    | Exact domain, DNS owner, and approved public URL                              |
| Transactional email provider and verified sender    | Provider name, sender address/domain, and verification status                 |
| Setup-link lifetime and resend policy               | Expiration duration, resend cooldown, and invalidation behavior               |
| Email verification policy                           | Which account actions require verification and how failed delivery is handled |
| Password reset policy                               | Token lifetime, generic response wording, and support escalation              |
| Public signup quota and abuse response              | Per-key quota, edge rule, response behavior, and escalation owner             |
| Support destination                                 | Public support URL or inbox and the responsible owner                         |
| Analytics disclosure and consent treatment          | User-facing disclosure, consent behavior, and retention decision              |
| Unique-view method and retention window             | Counting rule, deduplication window, and retention period                     |
| Account-deletion retention period                   | Deletion behavior, legal retention, and purge owner                           |
| Launch jurisdiction and privacy notice location     | Jurisdiction and URL/path for the applicable notice                           |
| Monitoring owner and alert destination              | Dashboard owner, alert channel, and response target                           |
| Backup frequency, restore owner, and rollback owner | Schedule, named operators, restore target, and rollback authority             |
| Final brand assets and public metadata              | Approved asset revision, title, description, and social preview values        |

## Environment matrix

| Environment      | App mode                    | Convex target                | Data policy                          | Live E2E allowed        |
| ---------------- | --------------------------- | ---------------------------- | ------------------------------------ | ----------------------- |
| Local demo       | NEXT_PUBLIC_DEMO_MODE=true  | none                         | deterministic browser-local fixtures | no                      |
| Development live | NEXT_PUBLIC_DEMO_MODE=false | named development deployment | disposable test data                 | yes, with confirmation  |
| Preview          | NEXT_PUBLIC_DEMO_MODE=false | named preview deployment     | isolated test data                   | yes, with confirmation  |
| Production       | NEXT_PUBLIC_DEMO_MODE=false | production deployment        | real customer data                   | no provisioning harness |

## Go/no-go gates

- [ ] npm run verify passes from a worktree containing only intended files.
- [ ] npm run test:e2e:demo -- --workers=1 passes.
- [ ] Auth verification, password reset, and abuse controls pass focused tests.
- [ ] Preview deployment has NEXT_PUBLIC_DEMO_MODE=false and matching Convex URL/target.
- [ ] npm run test:e2e:live passes against preview with the complete non-production contract.
- [ ] Backup restore drill succeeds against an isolated target.
- [ ] Responsive review passes at 390px, 768px, and 1440px.
- [ ] Current iPhone and Android NFC/QR/device checks are recorded.
- [ ] Production first-admin, email, support, monitoring, and rollback procedures are verified.

## Evidence index

Record command output, deployment names, timestamps, and links to external evidence without recording secrets, passwords, setup tokens, or private customer data.
```

During execution, fill the evidence table with owner-approved values and references. The document must not contain credentials or copied customer records.

- [ ] **Step 4: Link the release contract from the operator-facing docs**

Add a short link in README.md after the live E2E instructions, add the preview/production environment names to .env.example comments, and add a link from the first section of docs/live-e2e.md to docs/launch-readiness.md. Keep NEXT_PUBLIC_DEMO_MODE=true in .env.example and retain the existing fail-fast confirmation text.

- [ ] **Step 5: Run the documentation and application gates**

Run:

```bash
npx prettier --write docs/launch-readiness.md
npm run format:check
git diff --check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e:demo -- --workers=1
```

Expected: all commands exit 0; lint may retain the four existing generated-file warnings but must report zero errors; demo Playwright must report 16 passing tests or a larger count only when new deterministic coverage was intentionally added.

- [ ] **Step 6: Commit only the release-contract surface**

Review the staged path list explicitly, then commit:

```bash
git add docs/launch-readiness.md README.md .env.example docs/live-e2e.md
git diff --cached --name-only
git commit -m "docs: define Tapit launch readiness contract"
```

Expected staged paths contain only the four named release-documentation files. The existing self-service plan and v2 image remain visible as untracked or separately managed worktree artifacts.

---

### Task 2: Production Authentication and Signup Abuse Controls

**Files:**

- Modify: convex/auth.ts
- Create: convex/authEmail.ts
- Create if required by the installed Convex environment API: convex/convex.config.ts
- Modify: convex/customers.ts
- Modify: src/components/auth/LoginForm.tsx
- Modify: src/components/auth/SetupForm.tsx
- Modify: src/components/forms/AccountSettings.tsx
- Modify: package.json and package-lock.json only if the selected Convex rate-limiter capability requires a new dependency
- Create: convex/integration/auth-production.test.ts
- Create: tests/unit/auth-flow.test.tsx
- Modify: convex/integration/auth-ownership.test.ts
- Modify: tests/unit/signup.test.ts
- Modify: e2e/signup.spec.ts
- Modify: e2e/live.spec.ts

**Interfaces:**

- Consumes: Convex Auth’s current Password provider, the existing signIn("password", ...) calls, customers.createSelfServiceAccount, customers.completeSetup, and the existing Convex integration-test fixtures.
- Produces: email verification and reset flows that never reveal account existence, a server-enforced public-signup quota, and stable UI states for pending code entry, success, expiry, and failure.

Before implementation, read the installed Convex Auth types/source and the current Convex capability catalog. The installed package exposes these Password flows: signUp, signIn, reset, reset-verification, and email-verification. The installed config also exposes signIn.maxFailedAttempsPerHour; preserve the package’s spelling exactly when configuring it.

- [ ] **Step 1: Write failing tests for the production auth states and server boundaries**

Add tests that establish these requirements before implementation. In the Convex integration test, use the existing
test fixture convention for the application user document and t.withIdentity; do not insert authAccounts,
authVerificationCodes, authRateLimits, sessions, or any other Convex Auth-managed rows.

```ts
it("does not create an application customer until signup email verification completes", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "unverified@example.test" }),
  );
  const user = t.withIdentity(identity(userId));

  await expect(
    user.mutation(api.customers.createSelfServiceAccount, {
      name: "Unverified Customer",
      slug: "unverified-customer",
    }),
  ).rejects.toThrow("Email verification required.");

  await expect(
    t.run(async (ctx) =>
      ctx.db
        .query("customers")
        .withIndex("by_email", (query) => query.eq("email", "unverified@example.test"))
        .unique(),
    ),
  ).resolves.toBeNull();
});
```

Add these additional assertions with the indicated test seam:

| Test location                              | Scenario                                                                                                            | Required assertion                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tests/unit/auth-flow.test.tsx              | Submit reset for a known email, then an unknown email using the mocked signIn action                                | Both renders show the same generic success copy, neither render includes account-existence language, and the submit button is disabled while the promise is pending |
| convex/integration/auth-production.test.ts | Call self-service creation four times for one normalized identity after the three-attempt window is configured      | The fourth call throws the stable rate-limit message and the database still contains only the first customer                                                        |
| convex/integration/auth-production.test.ts | Use a verified identity whose email differs from the invitation, then an unverified identity whose email matches it | Both calls are rejected and the invitation remains unused; the matching verified identity alone can complete setup                                                  |
| convex/integration/auth-production.test.ts | Capture the mocked transport request                                                                                | Subject, plain text, and HTML contain the expiry and support destination, while logs and thrown client errors contain no URL, token, password, or message body      |

Use convex-test mocked identities for Convex mutations and a mocked email transport for provider tests. Assert
emailVerificationTime on every verified user fixture and omit it on the unverified fixture. Update the existing
auth-ownership fixtures that exercise self-service creation or invitation setup so they explicitly set a fixed
emailVerificationTime. The application users fixture is the only Auth-related document needed; all managed Auth rows
remain owned by Convex Auth.

- [ ] **Step 2: Run the focused tests to verify RED**

Run:

```bash
npx vitest run convex/integration/auth-production.test.ts convex/integration/auth-ownership.test.ts tests/unit/auth-flow.test.tsx tests/unit/signup.test.ts
```

Expected: the new assertions fail because the current Password configuration has no verification/reset provider and the public signup mutation has no quota. Existing tests must continue to run and their failures must be distinguishable from the new failures.

- [ ] **Step 3: Record the email-provider and policy decisions before coding the adapter**

In docs/launch-readiness.md, record the selected transactional provider, verified sender/domain, message retention behavior, setup-link lifetime, resend policy, email-verification requirement, password-reset requirement, and the support destination. Verify the provider supports an HTTPS API or SDK callable from a Convex Auth verification request and can send to the preview test accounts.

Use these message requirements for both verification and reset messages:

- Subject identifies Tapit account security without exposing whether an account exists.
- Plain text includes the one-time URL or code, expiration time, and support destination.
- HTML includes the same information and a keyboard-accessible primary link.
- The provider key and sender are read from ignored deployment environment variables.
- Provider failures throw a generic auth-service error to the client and log only provider status metadata, never the URL, token, password, or email body.

- [ ] **Step 4: Add the provider-neutral Convex email boundary**

Create convex/authEmail.ts with one exported callback used by both Password.reset and Password.verify. Keep the message
construction separate from the provider request so it can be unit-tested without a network call. Implement the message
builder and transport boundary with these exported types and functions:

```ts
import { env } from "./_generated/server";

export type AuthEmailRequest = {
  identifier: string;
  url: string;
  expires: Date;
  token: string;
};

export type AuthEmailMessage = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export function buildAuthEmailMessage(
  request: AuthEmailRequest,
  supportUrl: string,
): AuthEmailMessage {
  const expiresAt = request.expires.toISOString();
  const safeUrl = escapeHtml(request.url);
  const safeSupportUrl = escapeHtml(supportUrl);
  return {
    subject: "Tapit account security",
    text: [
      "Use this Tapit account-security link:",
      request.url,
      "",
      "This link expires at " + expiresAt + ".",
      "Need help? " + supportUrl,
    ].join("\n"),
    html: [
      "<p>Use this Tapit account-security link:</p>",
      '<p><a href="' + safeUrl + '">Continue securely</a></p>',
      "<p>This link expires at " + expiresAt + ".</p>",
      '<p>Need help? <a href="' + safeSupportUrl + '">' + safeSupportUrl + "</a></p>",
    ].join(""),
  };
}

type ProviderRequest = AuthEmailMessage & {
  to: string;
  from: string;
  apiKey: string;
  endpoint: string;
};

async function sendThroughSelectedProvider(input: ProviderRequest): Promise<Response> {
  return await fetch(input.endpoint, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + input.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: input.to,
      from: input.from,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });
}

export async function sendAuthEmail(request: AuthEmailRequest): Promise<void> {
  const message = buildAuthEmailMessage(request, env.TAPIT_SUPPORT_URL);
  const response = await sendThroughSelectedProvider({
    to: request.identifier,
    from: env.TAPIT_AUTH_EMAIL_FROM,
    apiKey: env.TAPIT_AUTH_EMAIL_API_KEY,
    endpoint: env.TAPIT_AUTH_EMAIL_API_URL,
    ...message,
  });
  if (!response.ok) {
    console.error("Tapit authentication email provider rejected the request", {
      status: response.status,
    });
    throw new Error("Authentication email service unavailable.");
  }
}
```

Implement sendThroughSelectedProvider with the selected provider's documented HTTPS request shape and keep it
non-exported. Read TAPIT_SUPPORT_URL, TAPIT_AUTH_EMAIL_FROM, TAPIT_AUTH_EMAIL_API_KEY, and
TAPIT_AUTH_EMAIL_API_URL through the generated env binding after declaring these four string variables with defineApp
in convex/convex.config.ts:

```ts
env: {
  TAPIT_SUPPORT_URL: v.string(),
  TAPIT_AUTH_EMAIL_FROM: v.string(),
  TAPIT_AUTH_EMAIL_API_KEY: v.string(),
  TAPIT_AUTH_EMAIL_API_URL: v.string(),
}
```

The function must use one request, reject non-2xx responses, and log only status metadata.
It must never log request.url, request.token, the email body, or the API key. Escape the URL and support destination
when interpolating the HTML message, and test the escaping.

- [ ] **Step 5: Enable verification, reset, and failed-sign-in throttling in Convex Auth**

Update convex/auth.ts while preserving the existing eight-character minimum and Scrypt-backed Password provider. The
configuration must import Email, Password, convexAuth, and sendAuthEmail, then be equivalent to:

```ts
import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { sendAuthEmail } from "./authEmail";

const emailProvider = () =>
  Email({
    maxAge: 60 * 60,
    sendVerificationRequest: async ({ identifier, url, expires, token }) =>
      sendAuthEmail({ identifier, url, expires, token }),
  });

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      validatePasswordRequirements(password) {
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters.");
        }
      },
      reset: emailProvider(),
      verify: emailProvider(),
    }),
  ],
  signIn: {
    maxFailedAttempsPerHour: 5,
  },
});
```

Use the installed Email provider helper rather than hand-rolling verification-code persistence. Keep reset and verification tokens inside Convex Auth’s managed tables and never return them from a public application function.

- [ ] **Step 6: Add the server-side self-service quota through the supported rate-limiter capability**

Use the current @convex-dev/rate-limiter component procedure instead of adding a hand-rolled counter table. Configure a named limiter for customers.createSelfServiceAccount keyed by the normalized authenticated email with a documented quota of 3 account-creation attempts per 60-minute window. Consume the quota before the duplicate-email/profile checks, return a stable rate-limit error, and ensure a failed transaction does not permanently consume a token when the component supports refund-on-error.

In convex/customers.ts, reject createSelfServiceAccount and completeSetup when the authenticated users document
does not have emailVerificationTime. Perform that check on the server before linking or creating the application
customer, while retaining the existing authenticated-email and invitation-email comparisons.

Keep the Convex Auth failed-sign-in limiter enabled separately. Configure a deployment-edge rule for POST /api/auth and the public slug-availability endpoint so one client cannot generate unbounded requests; record the rule and owner in docs/launch-readiness.md. Do not treat client-side debounce as the security boundary.

- [ ] **Step 7: Update the login UI as an explicit auth state machine**

In src/components/auth/LoginForm.tsx, preserve the existing sign-in/signup modes and safe return-path handling, then add these states:

```ts
type PendingAuth =
  { kind: "signup"; email: string; name: string; slug: string } | { kind: "reset"; email: string };
```

Implement the flows with the installed useAuthActions().signIn API. Keep only the normalized email, name, and slug in
the pending signup state; do not retain the password after the initial sign-up request returns.

```ts
await signIn("password", { flow: "signUp", email, password });
await signIn("password", { flow: "email-verification", email, code });
await signIn("password", { flow: "reset", email });
await signIn("password", {
  flow: "reset-verification",
  email,
  code,
  newPassword,
});
```

After verified signup returns an authenticated session, call api.customers.createSelfServiceAccount once with the already-validated name and slug. After reset completion, clear the form and route to sign-in. Show one generic reset-request success message for both known and unknown emails. Disable submit controls while requests are in flight and provide a resend action subject to the same email-service rate limit.

- [ ] **Step 8: Update invitation setup and account settings**

In src/components/auth/SetupForm.tsx, keep the existing token hash/status preflight, then require the verification-code
state before calling api.customers.completeSetup when Convex Auth returns a non-authenticated verification result.
Preserve the email-match check and one-time invitation behavior; the server-side emailVerificationTime check remains
the final enforcement boundary.

In src/components/forms/AccountSettings.tsx, keep the current password-change copy for the demo branch and add a live-branch link/button that opens the reset flow with the account email prefilled. Do not expose whether another email is registered.

- [ ] **Step 9: Run the focused tests to verify GREEN**

Run:

```bash
npx vitest run convex/integration/auth-production.test.ts convex/integration/auth-ownership.test.ts tests/unit/auth-flow.test.tsx tests/unit/signup.test.ts
npm run typecheck
npm run lint
```

Expected: the focused auth/quota tests pass, TypeScript exits 0, and lint reports no new errors. Generated-file warnings are acceptable only if they match the existing baseline.

- [ ] **Step 10: Run browser coverage for the new state transitions**

Add deterministic demo coverage only for rendering and validation states that do not require a real email provider. At
minimum, the demo suite must assert the verification-code form, expired-code error, disabled submit state, and the
generic reset-request message. Add live coverage for verified signup, invitation setup with verification, password
reset, generic reset responses, and rate-limit messaging only when the preview contract is available. For every new
live case, add a named test to e2e/live.spec.ts and assert the final URL or visible message rather than treating a
skipped test as evidence. Run:

```bash
npm run test:e2e:demo -- --workers=1
```

Expected: the demo suite remains green and continues to report at least 16 passing tests. Record live results in the release contract rather than marking them passed from skipped tests.

- [ ] **Step 11: Commit authentication controls separately from release documentation**

Review the staged paths, Convex generated diff, and secret scan, then commit:

```bash
git add convex/auth.ts convex/authEmail.ts convex/convex.config.ts convex/customers.ts convex/integration/auth-production.test.ts tests/unit/auth-flow.test.tsx src/components/auth/LoginForm.tsx src/components/auth/SetupForm.tsx src/components/forms/AccountSettings.tsx tests/unit/signup.test.ts e2e/signup.spec.ts e2e/live.spec.ts package.json package-lock.json
git diff --cached --name-only
git commit -m "feat: harden production authentication and signup abuse"
```

Omit convex/convex.config.ts and package files from the staging command when the implementation does not require them. Never stage environment files or generated files by wildcard.

---

### Task 3: Preview Deployment and Non-Production Live Certification

**Files:**

- Modify: docs/launch-readiness.md
- Modify: docs/live-e2e.md if the current deployment names or test count changed
- No production credentials or deployment secrets committed to the repository

**Interfaces:**

- Consumes: main at the reviewed commit, the completed auth controls, the existing scripts/live-e2e.mjs preflight, e2e/fixtures/live.ts, and the complete TAPIT_LIVE_* contract.
- Produces: a named isolated preview application and Convex deployment with NEXT_PUBLIC_DEMO_MODE=false, a recorded environment alignment check, and a fresh live browser result.

- [ ] **Step 1: Reconfirm the source revision and local gates before deployment**

Run:

```bash
git fetch origin --prune
git status --short --branch
git rev-parse --short HEAD
git rev-parse --short origin/main
npm run verify
npm run test:e2e:demo -- --workers=1
npx convex ai-files status
```

Expected: the local branch is the intended release candidate, local and remote revisions are understood, all verification commands exit 0, and Convex-managed guidance reports current. Do not deploy unreviewed application changes; the known preserved plan and image artifacts may remain untracked.

- [ ] **Step 2: Provision the preview environments without copying production data**

Create one Vercel preview application deployment and one explicitly named Convex preview deployment using the current provider-supported workflow. Confirm the dashboard labels both targets as preview/non-production before adding data. Do not copy production Auth, customer, analytics, invitation, or storage records into preview.

- [ ] **Step 3: Configure matching preview environment variables**

Set the Vercel preview environment to:

```text
NEXT_PUBLIC_DEMO_MODE=false
```

Set NEXT_PUBLIC_APP_URL to the URL shown by the selected Vercel preview deployment, set
NEXT_PUBLIC_CONVEX_URL to the cloud URL of the selected Convex preview deployment, and set
NEXT_PUBLIC_SUPPORT_URL to the owner-approved public support destination. Record the three non-secret values in the
release contract after verifying them in the deployment dashboards.

Set the matching Convex preview deployment variables for Auth site URL, AUTH_SECRET, email provider settings, verified sender, and any rate-limit component settings through the deployment manager. Keep values out of .env.example, shell history, logs, and commits. Confirm NEXT_PUBLIC_CONVEX_URL belongs to the selected TAPIT_LIVE_CONVEX_DEPLOYMENT before opening the app.

- [ ] **Step 4: Provision only the operator-approved preview identities**

Create the first administrator Password identity through the supported operator setup surface for the isolated preview. Create the seeded customer Password identity through the same supported flow when the legacy seeded customer tests require it. Record only the resulting user IDs and email labels in ignored environment storage. Do not use npx convex run to create Auth identities and do not write authAccounts or other Auth system tables directly.

- [ ] **Step 5: Create the ignored live contract file**

Create .env.live.preview locally, ensure it is ignored by Git, and populate it from the preview deployment manager. It must contain the names required by docs/live-e2e.md, including:

```text
TAPIT_LIVE_BASE_URL
TAPIT_LIVE_ADMIN_EMAIL
TAPIT_LIVE_ADMIN_PASSWORD
TAPIT_LIVE_CUSTOMER_EMAIL
TAPIT_LIVE_CUSTOMER_PASSWORD
TAPIT_LIVE_PROFILE_SLUG
TAPIT_LIVE_PUBLISHED_BIO
TAPIT_LIVE_CONVEX_DEPLOYMENT
TAPIT_LIVE_ADMIN_USER_ID
TAPIT_LIVE_CUSTOMER_USER_ID
TAPIT_LIVE_PROVISION_CONFIRM
```

Set TAPIT_LIVE_CONVEX_DEPLOYMENT to the preview reference accepted by scripts/live-e2e.mjs; set the confirmation exactly to I_UNDERSTAND_NON_PRODUCTION. Never print the file or values.

- [ ] **Step 6: Verify preview mode and deployment alignment without provisioning**

Open the preview app in a clean browser and verify:

- /login exposes customer signup only and no administrator signup control.
- /app/profile redirects signed-out visitors to /login.
- / contains no demo-profile links or demo-only copy.
- the browser’s Convex requests target the selected preview URL.
- an intentionally missing NEXT_PUBLIC_CONVEX_URL in a local live-mode process produces the documented clear configuration error.

If any check points to demo state or a different deployment, stop and correct environment configuration before running the provisioning command.

- [ ] **Step 7: Run the fail-fast live E2E command against preview**

Run exactly:

```bash
set -a
source .env.live.preview
set +a
npm run test:e2e:live
```

The harness provisions the deterministic seeded state through bootstrap:bootstrap, creates the one-time invitation through the admin UI, then runs the serialized live-chromium project. The current e2e/live.spec.ts contains five live tests covering self-service signup, customer draft privacy/publication/image behavior, administrator cards/analytics, invitation setup replay protection, and administrator profile moderation.

Expected: the preflight accepts only the preview target and the explicit confirmation; the five live tests pass; the output contains no secret values; and the preview profile shows draft privacy before publication and image visibility only after publication.

- [ ] **Step 8: Record live evidence and clean only through supported flows**

Record the preview deployment reference, app URL, commit, timestamp, test count, and any non-sensitive failure summary in docs/launch-readiness.md. Update the live-runbook/design-proof test count only after the command exits 0. Leave disposable preview data in the isolated deployment or remove it through the supported customer deletion/admin approval flow; never run undocumented table deletion or Auth-row cleanup commands.

- [ ] **Step 9: Commit the preview evidence separately**

Commit only documentation changes made by this task:

```bash
git add docs/launch-readiness.md docs/live-e2e.md docs/design-proof.md
git diff --cached --name-only
git commit -m "docs: record preview live certification"
```

Do not stage .env.live.preview, browser traces, screenshots, or generated reports.

---

### Task 4: Responsive, Accessibility, and Physical-Device Acceptance

**Files:**

- Modify after actual evidence: e2e/real-device-checklist.md
- Modify after actual evidence: docs/design-proof.md
- Modify after actual evidence: docs/launch-readiness.md
- Store screenshots and recordings outside the repository

**Interfaces:**

- Consumes: the certified preview URL, a published seeded profile, an active card URL, generated QR PNG/SVG files, inactive/replaced card states, and the current e2e/real-device-checklist.md matrix.
- Produces: reproducible device/browser records and a release decision for NFC, QR, direct URLs, unavailable states, Save contact, responsive layout, and the 4G usability target.

- [ ] **Step 1: Prepare a redacted device-test packet**

Use a preview profile containing only synthetic test content. Prepare one active card, one deactivated/replaced card, one unpublished or suspended profile, and QR PNG/SVG output generated by the admin UI. Record the preview URL and token labels in a private test note, not in the repository.

- [ ] **Step 2: Run responsive browser review at the three required widths**

Review the public profile, login/signup, setup, customer editor, confirmation dialog, QR card, admin records, and unavailable pages at 390px, 768px, and 1440px. At each width check:

- no horizontal scroll or clipped primary action;
- profile image, name, bio, and links remain readable;
- keyboard focus is visible and dialog focus is contained/restored;
- reduced-motion behavior remains usable;
- loading, error, empty, unpublished, suspended, and signed-out states do not reveal private content;
- the customer shell does not expose Cards navigation.

Run the automated companion checks after the manual review:

```bash
npx playwright test e2e/accessibility.spec.ts --project chromium --workers=1
npm run test:e2e:demo -- --workers=1
```

- [ ] **Step 3: Test NFC and QR on current iPhone and Android devices**

Complete every row in e2e/real-device-checklist.md using current physical devices:

- NFC tap opens the published profile without requiring an app.
- PNG and SVG QR scans resolve to the same published profile as the NFC/direct URL.
- Direct profile URL is usable on normal 4G.
- Deactivated/replaced cards show the branded inactive page without former profile content.
- Unpublished/suspended profiles show the branded unavailable page without identity leakage.
- Save contact imports only the approved vCard fields.

For every row record device model, OS version, browser version, input, route/state, timestamp, result, and a redacted external evidence reference. Do not place customer email addresses, passwords, setup tokens, or personal profile data in the checklist.

- [ ] **Step 4: Measure the normal-4G usability target**

For both devices, clear the browser cache, use the browser’s normal/Fast 4G profile, load the direct public URL three times, and record the time until the profile name and primary links are usable. Pass only when the visible profile is usable within 2 seconds on all three cold loads for each device; attach the timing capture outside the repository.

- [ ] **Step 5: Update the acceptance records from observed results**

Replace each checklist row’s pending marker only with the observed result and external evidence reference. Add a short dated summary to docs/design-proof.md and mark the corresponding launch-contract gates complete. If a row fails, keep it failed, add the exact device/route symptom, and return to the owning code or deployment task instead of weakening the expected result.

- [ ] **Step 6: Commit acceptance evidence without private artifacts**

Review the diff for secrets and personal data, then commit:

```bash
git add e2e/real-device-checklist.md docs/design-proof.md docs/launch-readiness.md
git diff --cached --name-only
git commit -m "docs: record Tapit device acceptance"
```

Keep screenshots, videos, browser exports, and private operator notes outside Git.

---

### Task 5: Production Backup, Monitoring, Rollback, and Go-Live

**Files:**

- Modify: docs/launch-readiness.md
- Modify: README.md if production operator commands or rollback links change
- No production data or secrets committed to the repository

**Interfaces:**

- Consumes: green local/auth gates, a green preview live run, completed device checklist, selected production environment variables, and the owner-approved launch decisions.
- Produces: an auditable production go/no-go decision, a verified backup/restore path, a monitored NEXT_PUBLIC_DEMO_MODE=false deployment, and a rollback record.

- [ ] **Step 1: Configure production operational ownership**

Record in docs/launch-readiness.md the named owners and alert destinations for Convex errors/insights, Vercel application errors, Auth/email delivery failures, abuse/rate-limit events, backups, restore execution, and incident communication. Confirm each owner can access the relevant dashboard without sharing credentials.

- [ ] **Step 2: Run a backup and restore drill before production deployment**

Use the supported Convex backup/export workflow to capture the preview release state, restore it into a throwaway preview target, and verify the restored profile, card, publication boundary, image mapping, invitation state, and audit records. Record snapshot ID, restore target, verification timestamp, and operator in the release contract. Do not test restore by overwriting production.

- [ ] **Step 3: Configure production environment separation**

Create the production Vercel/Convex targets separately from preview. Set NEXT_PUBLIC_DEMO_MODE=false, the production application URL, matching Convex URL/site URL, AUTH_SECRET, approved email provider settings, support destination, and rate-limit policy. Confirm the production deployment has no preview credentials, test user IDs, setup tokens, demo fixtures, or local email adapter settings.

- [ ] **Step 4: Provision the first production administrator through the supported operator path**

Use the approved production setup surface and the supported Convex Auth Password flow to create exactly the first administrator identity. Link it through the deployment-scoped bootstrap procedure only after the identity exists. Verify the public login page still exposes customer signup only and that no administrator role selector or public administrator signup path is reachable.

- [ ] **Step 5: Obtain explicit production deployment approval**

Before any production-affecting command, record the selected production Convex deployment, the exact commit, backup status, rollback target, and approver in the release contract. Follow the convex-deploy-guard procedure and require a fresh explicit approval for the production action. A preview pass never substitutes for this approval.

- [ ] **Step 6: Deploy the application and Convex functions**

Deploy the reviewed commit through the approved Vercel and Convex production workflows. Do not use npm run test:e2e:live against production because that harness provisions and mutates data and is intentionally non-production-only. Capture deployment IDs and health status without copying credentials into the repository.

- [ ] **Step 7: Run read-only production smoke checks**

From a clean browser/device, verify only approved existing data and non-mutating paths:

- the production landing page and /login load with demo copy absent;
- the first administrator can sign in and reach the admin landing page;
- the public slug and active card show the published profile;
- inactive/replaced cards and unpublished/suspended profiles hide former content;
- the public profile’s links, vCard, metadata, and support destination use production URLs;
- a signed-out browser cannot access /app or /admin.

If a smoke check would create or modify a customer, invitation, card, profile, or analytics record, stop and use the preview workflow instead.

- [ ] **Step 8: Monitor the initial release window and exercise rollback criteria**

Watch Vercel logs, Convex errors/insights, Auth/email delivery, rate-limit events, and public route availability for the owner-approved initial window. Roll back to the recorded Vercel deployment and restore Convex code/data only when the documented rollback trigger is met, such as authentication outage, public-profile leakage, failed card privacy, or unrecoverable data-integrity error. Record the observed metrics, alerts, decision, and final deployment ID.

- [ ] **Step 9: Close the launch contract**

Mark the production gates complete only after evidence exists for local verification, auth controls, preview live E2E, backup restore, device acceptance, production smoke, and monitoring ownership. If any gate lacks evidence, leave the release decision at no-go and document the exact next action.

- [ ] **Step 10: Commit only final runbook updates**

After the operational work is complete, review the documentation diff and commit:

```bash
git add docs/launch-readiness.md README.md
git diff --cached --name-only
git commit -m "docs: finalize Tapit production launch runbook"
```

Do not commit deployment dashboard exports, logs containing identifiers, environment files, screenshots with customer data, or provider credentials.

## Self-Review Checklist

- **Spec coverage:** Task 1 covers environment boundaries and release documentation; Task 2 covers deferred verification, reset, email delivery, failed-sign-in throttling, signup abuse control, and account-flow UI; Task 3 covers separate preview deployments and the current live harness; Task 4 covers responsive/accessibility/device/4G proof; Task 5 covers production first-admin setup, backups, monitoring, rollback, and go/no-go.
- **Scope boundaries:** physical card manufacturing, billing, custom domains, native applications, team profiles, rich content, and other non-MVP features remain outside this plan.
- **Security review:** no task permits direct Auth-table writes, caller-selected ownership, production live provisioning, or secret storage in Git.
- **Test review:** every code task begins with a failing focused test, runs a focused green test, then runs the broader local/browser gates. Operational tasks require named deployment/evidence outcomes before documentation is marked complete.
- **Type review:** the auth UI uses the installed Password flow names exactly; the Convex email callback is isolated behind sendAuthEmail; the public signup limiter protects customers.createSelfServiceAccount; generated bindings are regenerated rather than edited.
- **Worktree review:** staging commands use explicit paths and preserve public/images/tapit-profile-card-cutout-v2.png and the existing self-service plan.
