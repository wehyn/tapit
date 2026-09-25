# Production Live-Mode Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure only Vercel Production and its matching Convex Production deployment for live Google authentication and live Convex data while preserving local, Preview, hosted-demo, and non-production E2E behavior.

**Architecture:** No application-code change is expected. The existing build-time `NEXT_PUBLIC_DEMO_MODE=false` boundary selects `LiveProviders`, the existing Google-only Convex Auth path, and the existing `/api/live-contract` endpoint. Production Convex has never received the backend code, so the cutover also requires an approved first Convex Production deployment before a new Vercel Production build. A recorded preflight target and deployment snapshot provide the rollback boundary.

**Tech Stack:** Next.js 16.3.5 App Router, Convex 1.45.0, `@convex-dev/auth`, Vercel Production environment variables/deployments, Google OAuth, `curl`, Vercel CLI, Convex CLI, npm, and Playwright only for the existing non-production suites.

**Spec:** `docs/specs/2026-09-25-12-05-production-live-cutover-design.md`

## Global Constraints

- `NEXT_PUBLIC_DEMO_MODE=false`;
- no `NEXT_PUBLIC_DEMO_STORAGE` setting;
- `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` from the same Production Convex deployment;
- `NEXT_PUBLIC_APP_URL` set to the approved stable Production origin; and
- `TAPIT_APP_ENV=production` as the public live-contract environment label.
- `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`;
- `TAPIT_ADMIN_EMAILS` containing the controlled initial administrator email;
- the platform Production `CONVEX_SITE_URL`, `SITE_URL` set to the stable app origin, and `TAPIT_SUPPORT_URL`; and
- no `TAPIT_DEMO_AUTH_MODE=hosted-demo` setting.
- Preview or development credentials must not be reused for Production.
- Production will not be used for E2E or test-data provisioning.
- Do not click through the Production OAuth flow as an automated test.
- No direct writes to Convex Auth tables are allowed except the operator-approved, narrowly scoped account-erasure function: it may remove the verified requesting customer's linked Auth account, sessions, tokens, and user row after dependent application data is erased. No other Auth-table write is authorized.
- Keep all secret values, OAuth credentials, deployment tokens, Google storage states, customer data, and raw Auth identifiers out of Git and command output.
- If the preflight reveals that the current live path cannot satisfy this contract, stop and revise the design before making code changes.

## File and system map

The plan reads these repository files to prove the existing contract; it does not modify them:

- `src/lib/demo/mode.ts` — build-time demo/live mode selection.
- `src/app/layout.tsx` — demo versus live provider boundary.
- `src/components/providers/LiveProviders.tsx` — Convex live provider and authenticated route boundary.
- `src/app/(auth)/login/page.tsx` and `src/components/auth/LoginForm.tsx` — login mode selection.
- `src/components/auth/GoogleLoginForm.tsx` — Production Google login control and copy.
- `src/app/api/live-contract/route.ts` — read-only deployment contract endpoint.
- `next.config.ts` — build-time environment exposure and the reason a new build is required.
- `.env.example`, `README.md`, `docs/live-e2e.md`, `docs/launch-readiness.md`, and `e2e/real-device-checklist.md` — environment and evidence boundaries.
- `convex/auth.ts`, `convex/auth.config.ts`, and `convex/convex.config.ts` — Google provider, Convex site identity, and deployment environment contract.
- `tests/live-e2e-preflight.test.ts`, `convex/integration/auth-production.test.ts`, and `convex/integration/google-auth-lifecycle.test.ts` — existing non-Production proof that the live path is Google-only and first-admin behavior is guarded.

External systems changed by the execution are the Vercel Production environment/deployment, the matching Convex Production environment and first code deployment, and a dedicated Production Google Cloud project and OAuth client. No tracked application or test file is expected to change.

## Preflight addendum (2026-09-25)

- Stable app origin: `https://tapit-eosin.vercel.app`; current READY deployment: `dpl_38kKRzWUbqvG2vY5BDuoMy6Hgqyn`, built from `main` commit `246c76aeb6062c7914ba84d271ae1e886d87b56a` and serving `{"mode":"demo"}`.
- Matching Convex Production: `giddy-armadillo-255`, cloud URL `https://giddy-armadillo-255.convex.cloud`, HTTP actions URL `https://giddy-armadillo-255.convex.site`. The dashboard reports **Never deployed**, and the environment-variable list is empty. The `users`, `authAccounts`, `customers`, `profiles`, `cards`, and `invitations` tables are empty.
- Approved initial admin: `wayneegarcia@gmail.com`. Approved initial support destination: `mailto:wayneegarcia@gmail.com`.
- Google Cloud rejects new project creation because this account is at its quota. Projects pending deletion still count against quota until permanent deletion. The user approved dedicating the existing, apparently unused project `sigma-celerity-399507` to Tapit Production OAuth, and it has been renamed `Tapit Production OAuth`. Google Auth Platform and the Production web client have been created with the exact origin/callback; only the approved administrator is a test user. Google keeps the external app in Testing because an approved public privacy-policy URL is missing. The operator confirmed Wayne Garcia, the Philippines, and `wayneegarcia@gmail.com` as privacy contact. `docs/privacy-notice-draft.md` awaits review of retention, deletion, and analytics decisions. Do not reuse another product's OAuth client or branding.
- The untracked plan file was formatted; `npm run verify` passed 318 tests and the build; `npm run test:e2e:demo` passed 22 tests with one hosted-demo skip. Re-run gates if source or environment changes affect them.
- On 2026-09-25 the operator saved `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in Convex Production `giddy-armadillo-255`; both names and masked values were verified in its dashboard. After a fresh Google page load, the client showed only a newer enabled secret; the originally exposed secret was absent. The operator reports saving the replacement in Convex. Masked values cannot be compared in the dashboard, so a successful sign-in remains the functional proof after cutover.
- The operator confirmed Wayne Garcia as Tapit's legal operator, the Philippines as the initial jurisdiction, and `wayneegarcia@gmail.com` as privacy contact. The operator approved proposed retention periods of 90 days for analytics session keys, 13 months for aggregate analytics, and one year for minimal audit records. Account erasure requires administrator approval; the 30-day period is an operational review-and-erasure target, and requests still pending at day 30 must be flagged rather than automatically erased. The operator also approved the narrowly scoped Auth erasure exception above because the installed Convex Auth version exposes no deletion API. Local retention and approved-account erasure code and a public privacy route are prepared and verified locally. Keep the policy publication synchronized with the corresponding Convex deployment; publishing the policy before cleanup would make its retention claims inaccurate.

These findings replace the former assumption that Convex Production and Google OAuth are already configured. Do not change Vercel's Production mode until the new prerequisites and their approvals are complete.

---

### Task 1: Establish the repository and local/demo baseline

**Files:**

- Read: `AGENTS.md`, `docs/specs/2026-09-25-12-05-production-live-cutover-design.md`, `README.md`, `.env.example`, `next.config.ts`, `src/lib/demo/mode.ts`, `src/app/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/components/auth/LoginForm.tsx`, `src/components/auth/GoogleLoginForm.tsx`, `src/components/providers/LiveProviders.tsx`, `src/app/api/live-contract/route.ts`
- Verify: `package.json`, `package-lock.json`

**Interfaces:**

- Consumes: the checked-out repository and the approved cutover spec.
- Produces: a clean-worktree baseline, the current commit SHA, and local/demo verification evidence. No provider mutation is allowed in this task.

- [ ] **Step 1: Record the repository state before any provider action.**

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log -1 --format='%H %s'
```

Expected: the worktree is clean and the current commit is recorded for comparison with the deployed commit. If the deployed commit differs, verify that the application source is identical or use the provider’s existing deployed commit; do not silently deploy the current planning branch. No generated environment file or secret is added.

- [ ] **Step 2: Confirm the source-level live boundary.**

Check that `src/lib/demo/mode.ts` treats only `NEXT_PUBLIC_DEMO_MODE=false` as live, that `src/app/layout.tsx` mounts `LiveProviders` outside demo mode, that `LoginForm` returns `GoogleLoginForm` outside local and hosted demo, and that `src/app/api/live-contract/route.ts` returns `mode: "live"`, `authProvider: "google"`, and `TAPIT_APP_ENV` in live mode.

Expected: the current source already implements the spec’s required Production behavior; do not edit it.

- [ ] **Step 3: Install the locked dependency tree without changing manifests.**

```bash
npm ci
```

Expected: dependencies install from `package-lock.json`; `package.json` and `package-lock.json` remain unchanged.

- [ ] **Step 4: Run the repository verification gate.**

```bash
npm run verify
```

Expected: format check, ESLint, strict typecheck, unit/integration tests, and build pass. A failure is a stop condition for the cutover, not permission to alter application code in this plan.

- [ ] **Step 5: Run the deterministic local E2E workflow separately.**

```bash
npm run test:e2e:demo
```

Expected: the browser suite runs with `NEXT_PUBLIC_DEMO_MODE=true` and local storage fixtures; it does not contact Convex Production or Google OAuth.

- [ ] **Step 6: Confirm no repository state changed during verification.**

```bash
git status --short
git diff --check
```

Expected: no tracked changes and no unignored secret or test-state files.

---

### Task 2: Perform the read-only Production and OAuth preflight

**Files:**

- Read: `docs/launch-readiness.md`, `docs/live-e2e.md`, `.env.example`, `convex/auth.ts`, `convex/auth.config.ts`, `convex/convex.config.ts`
- External read-only targets: the Vercel project, current Production alias/deployment, Convex deployment inventory, Convex Production environment metadata, and the Production Google OAuth client
- Evidence: a secure redacted cutover record outside the repository; never commit it

**Interfaces:**

- Consumes: Task 1’s commit SHA and the approved stable Production app origin.
- Produces: `PROD_APP_ORIGIN`, `CURRENT_PROD_DEPLOYMENT_ID`, `CURRENT_PROD_DEPLOYMENT_URL`, `PROD_CONVEX_DEPLOYMENT`, `PROD_CONVEX_CLOUD_URL`, `PROD_CONVEX_SITE_URL`, the controlled initial-admin email, and a redacted before-state record.

- [ ] **Step 1: Identify the Vercel Production project and current deployment.**

Use the linked Vercel project or the Vercel dashboard. When the project is linked, collect deployment metadata without exposing environment values:

```bash
vercel list --environment production --format=json
vercel inspect "$PROD_APP_ORIGIN" --format=json
```

Record only the Production alias, deployment ID/URL, commit SHA, readiness status, and timestamp. Confirm the current deployment is the healthy deployment described by the spec and that its commit is the intended application commit.

- [ ] **Step 2: Record Vercel Production variable names and targets without copying secret values.**

```bash
vercel env list production
```

Record the existence and target of `NEXT_PUBLIC_DEMO_MODE`, `NEXT_PUBLIC_DEMO_STORAGE`, and `NEXT_PUBLIC_APP_URL`, and whether `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, and `TAPIT_APP_ENV` exist. Redact any displayed values; do not paste CLI output containing secrets into the evidence record.

- [ ] **Step 3: Resolve and confirm the exact Convex Production deployment.**

```bash
npx convex deployments
npx convex env list --deployment "$PROD_CONVEX_DEPLOYMENT" --names-only
```

Confirm the selected deployment belongs to the Tapit project, is the intended Production deployment, and has the expected Convex cloud/site identity. Use the Convex dashboard for non-secret value confirmation and table-level counts/metadata; do not export, print, or inspect customer records.

- [ ] **Step 4: Check Production application-data state before enabling live authentication.**

Use the Convex dashboard’s table metadata/count view or an equivalent redacted operational report. Determine whether Production is fresh and whether any application accounts, profiles, cards, invitations, or other customer data already exist.

Expected: a fresh Production deployment with no application accounts/data, or an explicit stop and compatibility assessment. Do not delete, migrate, seed, bootstrap, or write any application/Auth record.

- [ ] **Step 5: Verify the Convex Production environment contract.**

In the Convex Production environment settings, confirm the required variable names and masked values for `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `TAPIT_ADMIN_EMAILS`, and `TAPIT_SUPPORT_URL`; confirm the controlled administrator email is normalized and present in `TAPIT_ADMIN_EMAILS`; confirm `TAPIT_DEMO_AUTH_MODE` is absent; and confirm the platform-provided `CONVEX_SITE_URL` is the site URL selected for this deployment.

Do not use a shell command that prints secret values. The code in `convex/auth.ts` and `convex/auth.config.ts` must remain the source of truth for provider ID `google` and the Convex issuer relationship.

- [ ] **Step 6: Verify the Production Google OAuth client.**

In the Google OAuth provider console, inspect only the Production client. Confirm:

Print the exact values from the approved preflight record rather than copying a template:

```bash
printf '%s/\n%s/api/auth/callback/google\n' "${PROD_APP_ORIGIN%/}" "${PROD_CONVEX_SITE_URL%/}"
```

Confirm the client is separate from Development and Preview, and that its client ID matches the Production Convex configuration without exposing the secret.

- [ ] **Step 7: Stop on any ambiguous prerequisite.**

Stop before changing `NEXT_PUBLIC_DEMO_MODE` if any of these are unresolved: the Convex target, existing data state, controlled admin email, Google client, callback URL, stable app origin, Convex cloud/site URL, support URL, or required environment variable. The next action must be to resolve that named prerequisite or revise the design; it must not be a best-effort cutover.

---

### Task 2A: Resolve new Production prerequisites found by preflight

**External targets:** The approved Google Cloud project `sigma-celerity-399507` and proposed Production OAuth web client; Convex Production `giddy-armadillo-255` (read-only until Task 4).

- [ ] **Step 1: Finish the Production data-state check.** Confirm the `authAccounts`, `customers`, `profiles`, `cards`, and `invitations` tables are empty through dashboard metadata. If any contain records, stop for a compatibility assessment.
- [x] **Step 2: Select an approved dedicated Google Cloud project.** The user approved dedicating the existing `sigma-celerity-399507` project; its name is now `Tapit Production OAuth`. It had no OAuth clients, API keys, service accounts, recent API traffic, or charges visible in the preflight. Its ID remains unchanged. Pending deletion of other projects does not immediately free project quota.
- [x] **Step 3: Configure Google Auth Platform branding and initial audience.** The visible app name is Tapit, the support contact is the approved address, and the external Testing audience includes the controlled administrator. Public publishing remains gated by Step 6.
- [x] **Step 4: Create one Production web OAuth client.** The `Tapit Production Web` client has `https://tapit-eosin.vercel.app` as its authorized JavaScript origin and `https://giddy-armadillo-255.convex.site/api/auth/callback/google` as its redirect URI. The user approved this security-sensitive access at action time. Do not print or commit its secret.
- [ ] **Step 5: Confirm the first Convex deployment path.** Use the reviewed PR #26 source commit and a target selector or deploy key that resolves to `giddy-armadillo-255`. Use a dry run where supported. Do not deploy until the fresh target-specific confirmation in Task 3. Merge the same source to `main` only after the backend is live, so the privacy notice cannot appear before its cleanup behavior.
- [ ] **Step 6: Resolve the public privacy notice and OAuth audience.** Review `docs/privacy-notice-draft.md` with the operator, settle its factual and jurisdiction-specific placeholders, publish it on Tapit's app origin, link it from the homepage, and enter the matching URL in Google branding. Make the external Google audience available to intended users only after Google permits publication. Do not switch Vercel Production to live while OAuth remains test-user-only.

---

### Task 3: Obtain the explicit Production change approval

**Files:**

- Read: the secure redacted preflight record from Task 2
- External approval record: the current task/thread or the approved change-management record

**Interfaces:**

- Consumes: the concrete deployment IDs, URLs, environment names, and pre-change values/targets from Task 2.
- Produces: explicit authorization for the exact Vercel Production changes and fresh confirmation for Convex Production variables and the first backend deployment. The Google client was created after a separate, exact-target approval. No Production configuration changes happen before the applicable approvals.

- [ ] **Step 1: Present the exact change set for approval.**

Name the concrete Vercel project and Production alias, current deployment ID, matching Convex Production deployment reference, and the exact variable names/targets to change. State that the change will set Convex admin/support variables, deploy the reviewed PR #26 Convex code to `giddy-armadillo-255` for the first time, merge the reviewed source, publish the privacy and terms pages in demo mode, complete Google branding and audience, then set `NEXT_PUBLIC_DEMO_MODE=false`, remove Production `NEXT_PUBLIC_DEMO_STORAGE`, align the public URLs/environment label, and trigger a live Vercel Production rebuild. The Google ID/secret names are already present and must not be overwritten without a separate reason.

- [ ] **Step 2: Receive explicit approval immediately before provider mutation.**

The approval must identify the exact Vercel Production project/alias and Convex Production deployment from Task 2. It must also acknowledge that no Production E2E, provisioning, or automated OAuth sign-in will occur. The only direct Auth-table writes in the deployed code are the operator-approved, account-scoped erasure operations after administrator approval; the cutover itself does not invoke them.

- [ ] **Step 3: Re-check the target immediately before writing.**

```bash
vercel inspect "$PROD_APP_ORIGIN" --format=json
npx convex env list --deployment "$PROD_CONVEX_DEPLOYMENT" --names-only
```

Expected: the target still matches the approved record. If the alias or deployment changed, return to Task 2 and obtain approval for the new target.

---

### Task 4: Configure matching Convex Production and Google OAuth settings

**Files:**

- External modify: the approved Convex Production environment
- External modify if required: the dedicated Production Google OAuth client
- Read only: `convex/auth.ts`, `convex/auth.config.ts`, `convex/convex.config.ts`

**Interfaces:**

- Consumes: the approved `PROD_CONVEX_DEPLOYMENT`, `PROD_CONVEX_SITE_URL`, Production Google client values, support URL, and controlled admin email.
- Produces: a matching Google-only Convex Production configuration. It must not create users, accounts, profiles, invitations, or Auth records.

- [ ] **Step 1: Obtain the fresh Convex mutation confirmation.**

Before changing any Convex Production variable, explicitly confirm the exact deployment reference and the exact variable operations: set/update `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `SITE_URL`, `TAPIT_ADMIN_EMAILS`, and `TAPIT_SUPPORT_URL`; preserve the platform `CONVEX_SITE_URL`; and remove `TAPIT_DEMO_AUTH_MODE` if it exists. Set `SITE_URL` to `PROD_APP_ORIGIN`, not the Convex site URL, so Convex Auth can return from Google OAuth.

- [x] **Step 1A: Create the approved Production OAuth web client.**

In the dedicated Tapit Google Cloud project, register the exact app origin and Convex callback from Task 2A. Confirm the visible consent branding is Tapit and the controlled administrator is permitted by the audience configuration. Store the client secret only in provider-managed secret storage, and record only a redacted client identifier in the cutover record.

- [ ] **Step 2: Set the non-secret and secret Convex variables without shell-history exposure.**

Use stdin or the provider UI for each value; never put `AUTH_GOOGLE_SECRET` in command arguments or captured output:

```bash
printf '%s' "$PROD_GOOGLE_CLIENT_ID" | npx convex env set --deployment "$PROD_CONVEX_DEPLOYMENT" AUTH_GOOGLE_ID
printf '%s' "$PROD_GOOGLE_CLIENT_SECRET" | npx convex env set --deployment "$PROD_CONVEX_DEPLOYMENT" AUTH_GOOGLE_SECRET
printf '%s' "$PROD_APP_ORIGIN" | npx convex env set --deployment "$PROD_CONVEX_DEPLOYMENT" SITE_URL
printf '%s' "$PROD_ADMIN_EMAIL" | npx convex env set --deployment "$PROD_CONVEX_DEPLOYMENT" TAPIT_ADMIN_EMAILS
printf '%s' "$PROD_SUPPORT_URL" | npx convex env set --deployment "$PROD_CONVEX_DEPLOYMENT" TAPIT_SUPPORT_URL
```

Use `--force` only if the approved preflight shows an existing value that must be replaced. The value of `TAPIT_ADMIN_EMAILS` must contain the controlled initial administrator and no unapproved customer address.

- [ ] **Step 3: Remove hosted-demo auth mode if present.**

```bash
npx convex env remove --deployment "$PROD_CONVEX_DEPLOYMENT" TAPIT_DEMO_AUTH_MODE
```

Run this only when Task 2 confirmed the variable exists and the approval explicitly includes its removal. Do not mutate the Convex schema, Auth tables, or application data.

- [ ] **Step 4: Align the OAuth client registration.**

In the Production Google OAuth client, ensure the exact approved app origin and this callback are registered:

Print the exact values from the approved preflight record and register those two entries in the Production client:

```bash
printf '%s/\n%s/api/auth/callback/google\n' "${PROD_APP_ORIGIN%/}" "${PROD_CONVEX_SITE_URL%/}"
```

Confirm the client is separate from Development/Preview and that the provider remains `google` with scopes `openid email profile` as implemented by the existing auth path.

- [ ] **Step 5: Verify Convex names and non-secret identity without exposing secrets.**

```bash
npx convex env list --deployment "$PROD_CONVEX_DEPLOYMENT" --names-only
```

Expected: the required names, including `SITE_URL`, are present; `SITE_URL` equals the approved app origin; `TAPIT_DEMO_AUTH_MODE` is absent; and the Production Convex site/cloud identity still matches the Vercel public URLs. Do not run a provisioning function or any write against Convex data.

- [ ] **Step 6: Deploy the approved backend to Production for the first time.**

Reconfirm `giddy-armadillo-255` and the approved source commit immediately before `npx convex deploy`. The reviewed cutover candidate is `f1a3ee22fa233fdb9637b75d297cf075a0a0ba80` on PR #26; a later commit needs a fresh code review and verification. Record the command's resolved deployment target and commit without printing credentials. Deploy functions, schema, indexes, and components to this exact Production deployment before publishing the matching privacy notice. Do not run a provisioning function, import records, or write Auth tables. Confirm the dashboard reports a successful deployment and the expected public functions and auth HTTP routes are present. Stop before any Vercel Production build if the backend deployment or auth issuer cannot be verified.

- [ ] **Step 7: Publish the reviewed privacy and terms pages while Production is still in demo mode.** After the backend deployment succeeds and PR #26 is approved and merged, let Vercel build the merged `main` commit using the existing Production demo-mode variables. Verify `/privacy` and `/terms` are public on `https://tapit-eosin.vercel.app` and linked from its homepage. Record that new READY deployment as `POLICY_DEPLOYMENT_URL`; retain the old demo deployment for rollback. The public policy's retention claims must never precede the matching backend deployment.

- [ ] **Step 8: Complete Google branding and audience.** Enter `https://tapit-eosin.vercel.app/privacy` and `https://tapit-eosin.vercel.app/terms` in project `sigma-celerity-399507`, verify their public reachability, and publish the External OAuth audience when Google permits. Confirm the basic sign-in scopes and exact origin/callback remain unchanged. Do not switch Vercel to live while Google still admits only test users.

---

### Task 5: Update Vercel Production-only configuration

**Files:**

- External modify: Vercel Production environment variables for the approved project only
- Preserve: Vercel Development and Preview targets exactly as found in Task 2

**Interfaces:**

- Consumes: the approved `PROD_APP_ORIGIN`, `PROD_CONVEX_CLOUD_URL`, `PROD_CONVEX_SITE_URL`, and pre-change Vercel record.
- Produces: the Vercel Production build-time environment contract; no source-file changes.

- [ ] **Step 1: Update the existing Production mode variable.**

```bash
printf '%s' false | vercel env update NEXT_PUBLIC_DEMO_MODE production
```

If the variable is absent rather than existing, add exactly one Production target with `vercel env add NEXT_PUBLIC_DEMO_MODE production --value false --yes`.

- [ ] **Step 2: Remove only the Production demo-storage variable.**

```bash
vercel env remove NEXT_PUBLIC_DEMO_STORAGE production --yes
```

Run this only if Task 2 confirmed that the Production target exists. Do not remove the Development or Preview target.

- [ ] **Step 3: Add or update the matching public Production URLs and environment label.**

Use the values recorded from the approved targets and keep them out of source control:

```bash
printf '%s' "$PROD_CONVEX_CLOUD_URL" | vercel env add NEXT_PUBLIC_CONVEX_URL production --yes
printf '%s' "$PROD_CONVEX_SITE_URL" | vercel env add NEXT_PUBLIC_CONVEX_SITE_URL production --yes
printf '%s' "$PROD_APP_ORIGIN" | vercel env update NEXT_PUBLIC_APP_URL production --yes
printf '%s' production | vercel env add TAPIT_APP_ENV production --no-sensitive --yes
```

If a variable already exists, use `vercel env update` instead of `vercel env add`; use `--force` only when the approved preflight shows that the existing target has the wrong value. Do not pass secrets on command lines.

- [ ] **Step 4: Verify target isolation after the Vercel mutation.**

```bash
vercel env list production
```

Confirm the Production target contains the required names, has no `NEXT_PUBLIC_DEMO_STORAGE`, and that Development/Preview were not changed. Redact values in any saved output.

---

### Task 6: Build the approved Production deployment and verify the public live contract

**Files:**

- External modify: the Vercel Production deployment/alias
- Verify read-only: `/api/live-contract` and `/login` on the stable Production origin

**Interfaces:**

- Consumes: the approved merged commit, updated Vercel Production variables, matching Convex Production configuration, `POLICY_DEPLOYMENT_URL`, and the recorded previous healthy deployment.
- Produces: `NEW_PROD_DEPLOYMENT_ID` and `NEW_PROD_DEPLOYMENT_URL` for a READY Production deployment with a public live contract and Google login surface; no administrator sign-in.

- [ ] **Step 1: Trigger a new Production build from the approved application commit.**

Use the Vercel dashboard’s redeploy action for `POLICY_DEPLOYMENT_URL` or the equivalent CLI workflow. When using the CLI, rebuild that deployment with the merged cutover source and target Production:

```bash
vercel redeploy "$POLICY_DEPLOYMENT_URL" --target production
```

Do not deploy an arbitrary dirty worktree. Capture the new deployment ID/URL and wait for a READY result with `vercel inspect --wait`; preserve build logs only if they contain no secrets or customer data.

- [ ] **Step 2: Confirm the new deployment is serving the stable Production alias.**

```bash
vercel inspect "$PROD_APP_ORIGIN" --format=json
```

Expected: the alias points to the new READY deployment, the deployment commit is the approved commit, and the old deployment ID remains available for rollback.

- [ ] **Step 3: Verify the public live contract without authentication.**

```bash
contract_json="$(curl --fail-with-body --silent --show-error "$PROD_APP_ORIGIN/api/live-contract")"
node -e 'const value=JSON.parse(process.argv[1]); if (value.mode !== "live" || value.authProvider !== "google" || value.appEnvironment !== "production") { console.error(JSON.stringify(value)); process.exit(1); }' "$contract_json"
```

Expected: HTTP 200 and the response contains `mode: "live"`, `authProvider: "google"`, and `appEnvironment: "production"`; its Convex cloud/site URLs match the approved Production deployment.

- [ ] **Step 4: Verify the Production login page without clicking OAuth.**

```bash
login_html="$(curl --fail-with-body --silent --show-error "$PROD_APP_ORIGIN/login")"
printf '%s' "$login_html" | rg -q 'Continue with Google'
if printf '%s' "$login_html" | rg -qi 'name="password"|type="password"|password'; then
  printf '%s\n' 'Production login still exposes the demo password form' >&2
  exit 1
fi
```

Expected: the page exposes `Continue with Google` and does not expose the demo password form. This is a read-only public smoke check, not `npm run test:e2e:live`, and it must not follow the Google redirect.

- [ ] **Step 5: Re-run local/demo acceptance after the hosted change.**

```bash
npm run test:e2e:demo
```

Expected: the repository’s local deterministic workflow still passes and remains pointed at its local server/fixtures rather than Production.

- [ ] **Step 6: Record the cutover evidence and explicit boundary.**

Record the approved commit, old/new deployment IDs, alias, timestamps, redacted variable names/targets, matching Convex deployment reference, live-contract JSON with URLs redacted as needed, login-page assertion result, and the fact that no OAuth sign-in or provisioning occurred. Mark unrelated launch-readiness gates from `docs/launch-readiness.md` as separate evidence requirements, not as satisfied by this cutover.

---

### Task 7: Execute rollback if any Production verification fails

**Files:**

- External modify: Vercel Production environment/alias and, if necessary, Convex Production environment
- Verify read-only: stable Production `/api/live-contract` and `/login`

**Interfaces:**

- Consumes: the pre-cutover Vercel/Convex record and previous healthy deployment from Task 2.
- Produces: either a restored demo-mode Production deployment with verified public contract or a clearly recorded incident requiring operator intervention. Never creates a first administrator during rollback.

- [ ] **Step 1: Stop all sign-in and provisioning activity.**

Do not click the Google button, do not run `npm run test:e2e:live`, do not run `npx convex run`, and do not write Convex Auth or application tables.

- [ ] **Step 2: Restore the recorded Vercel Production variables.**

Restore the exact pre-cutover values and targets from the secure record: the previous `NEXT_PUBLIC_DEMO_MODE`, the previous `NEXT_PUBLIC_DEMO_STORAGE` presence/value, the previous public URLs, the previous `NEXT_PUBLIC_APP_URL`, and the previous `TAPIT_APP_ENV`. Remove only variables that were introduced by the failed cutover and were absent before it.

- [ ] **Step 3: Restore the previous healthy Vercel deployment/alias.**

Use the provider-supported rollback or promotion command with the recorded deployment ID:

```bash
vercel rollback "$NEW_PROD_DEPLOYMENT_ID" --yes
```

If the provider workflow requires promotion instead, promote `$CURRENT_PROD_DEPLOYMENT_URL`. Do not delete either deployment; preserve both IDs for incident evidence.

- [ ] **Step 4: Restore only changed Convex Production variables.**

Restore the recorded prior values for `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `TAPIT_ADMIN_EMAILS`, and `TAPIT_SUPPORT_URL`, and restore the prior `TAPIT_DEMO_AUTH_MODE` presence/value if it was changed. This requires the same explicit target confirmation and must not touch data or Auth tables.

- [ ] **Step 5: Verify the restored public state.**

```bash
curl --fail-with-body --silent --show-error "$PROD_APP_ORIGIN/api/live-contract"
curl --fail-with-body --silent --show-error "$PROD_APP_ORIGIN/login"
```

Expected: the stable alias serves the previously healthy contract and login state. Preserve the failure response, deployment IDs, timestamps, and redacted configuration evidence.

- [ ] **Step 6: Stop and revise the design if the rollback cannot be proven.**

Do not claim completion while the alias, live contract, or login state is ambiguous. Escalate the exact provider failure and keep the first administrator sign-in deferred.

## Self-review against the spec

- The existing live Google path is verified in Task 1; no application-code change is planned.
- Production-only Vercel and matching Convex configuration are isolated in Tasks 4 and 5.
- Local/demo, hosted-demo, Preview, and the guarded non-production live E2E workflow remain untouched and are protected by Tasks 1 and 6.
- The required Vercel and Convex environment contract is enumerated in the global constraints and verified in Tasks 2, 4, and 5.
- The exact OAuth origin/callback relationship is checked in Tasks 2 and 5.
- The required live-contract and login assertions are checked in Task 6 without automated first-admin sign-in.
- Existing Production data, ambiguous prerequisites, and failed health checks are hard stops in Tasks 2 and 7.
- Rollback preserves the previous deployment/configuration and verifies the restored public state in Task 7.
- Full launch readiness remains separately tracked in `docs/launch-readiness.md`; this plan does not claim device, backup, monitoring, or full Production acceptance.
