# Local Live E2E Mail Adapter Implementation Plan

> **For agentic workers:** Use the orchestrator workflow and the installed test-driven-development and verification-before-completion skills for every code change or completion claim. Keep each checkbox independently verifiable.

**Goal:** Provide a safe, disposable mail/code adapter for the existing non-production live E2E harness and document the exact boundary needed before running the six browser tests.

**Architecture:** Add a standalone Node HTTP service that binds to loopback by default and keeps only the newest opaque Convex Auth code per normalized recipient in memory. The provider-facing `POST /send` route and Playwright-facing `GET /code` route use separate bearer tokens; the service never persists or returns message bodies. Keep the remote delivery boundary explicit: Convex Cloud still needs an approved HTTPS route to the adapter, while local Playwright may read the loopback code route.

**Tech Stack:** Node.js built-in `http` and `crypto` modules, Vitest, Convex 1.45.0, Next.js 16.3.5, Playwright 1.63.0.

**Spec:** `/home/dei/.codex/attachments/188b3722-a861-446a-8cf8-04239a33a10a/pasted-text-1.txt` and `docs/live-e2e.md`

## Global Constraints

- The live harness may target only `development` or `preview` app environments and `dev` or `preview` Convex deployments.
- Keep `NEXT_PUBLIC_DEMO_MODE=true` as the repository default; live mode is opt-in through ignored environment storage.
- Create Convex Auth Password identities only through a supported auth flow; never insert Convex Auth rows directly.
- Store no deployment secrets, passwords, setup tokens, mailbox contents, or real email-provider values in tracked files.
- Bind the adapter to `127.0.0.1` by default; an externally reachable provider URL must be an explicitly approved HTTPS tunnel or service.
- Preserve the untracked handoff files `docs/superpowers/plans/2026-09-15-launch-readiness.md`, `docs/superpowers/plans/2026-09-15-self-service-signup-public-profile.md`, and `public/images/tapit-profile-card-cutout-v2.png`.
- Do not edit generated Convex files or change the production deployment.

---

### Task 1: Add the disposable in-memory mail/code adapter

**Files:**

- Create: `scripts/live-email-sink.mjs`
- Modify: `tests/unit/live-email-code.test.ts`

**Interfaces:**

- `createEmailSinkServer({ host, port, providerToken, codeToken })` returns `{ server }`, where `server` is a Node HTTP server that can be listened on an ephemeral test port and closed by the caller.
- `extractVerificationCode(text, html)` returns the first Convex Auth `code` query value matching `/^[A-Za-z0-9_-]{8,128}$/`, or `null`.
- `POST /send` requires `Authorization: Bearer <providerToken>`, accepts JSON `{ to, text, html }`, extracts the opaque code, stores only the newest code under `to.trim().toLowerCase()`, and returns `202` with `{ "accepted": true }`.
- `GET /code?email=<recipient>&kind=<signup|setup|reset|verification>` requires `Authorization: Bearer <codeToken>` and returns exactly `{ "code": "..." }` for the newest stored code, or a bodyless `404` when no code exists.
- Invalid bearer tokens, unknown routes, malformed JSON, missing recipients, invalid kinds, missing codes, and oversized bodies return a generic error status without message content.

- [x] **Step 1: Write the failing behavior test**

Add a real HTTP test to `tests/unit/live-email-code.test.ts` that constructs the exported server on port `0`, posts an authenticated provider message containing an opaque `code` URL, posts a newer message for the same recipient, reads `/code` with the separate bearer token, and asserts that the response has only the `code` key and contains the newer code. Add a second test for rejected provider/code tokens and a third test for HTML-escaped URLs and invalid flow kinds.

```ts
const sink = createEmailSinkServer({
  providerToken: "provider-secret",
  codeToken: "reader-secret",
});
await listen(sink.server);
try {
  const delivery = await fetch(`${baseURL}/send`, {
    method: "POST",
    headers: {
      Authorization: "Bearer provider-secret",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: "Person@Example.test",
      text: "https://tapit.test/auth?code=NewCode_1234567890",
      html: "<p>ignored mailbox content</p>",
    }),
  });
  expect(delivery.status).toBe(202);

  const codeResponse = await fetch(`${baseURL}/code?email=person%40example.test&kind=signup`, {
    headers: { Authorization: "Bearer reader-secret" },
  });
  expect(codeResponse.status).toBe(200);
  expect(await codeResponse.json()).toEqual({ code: "NewCode_1234567890" });
} finally {
  await close(sink.server);
}
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run tests/unit/live-email-code.test.ts
```

Expected: the new test fails because `scripts/live-email-sink.mjs` and its exported server do not exist yet; the existing adapter-contract test may still pass.

- [x] **Step 3: Implement the smallest server that satisfies the tests**

Use only Node built-ins. Parse request bodies with a fixed maximum of `262144` bytes, compare bearer tokens with length-checked `timingSafeEqual`, normalize recipient keys, recognize only `signup`, `setup`, `reset`, and `verification`, and scan text plus HTML for URLs after converting `&amp;` to `&`. Keep the map process-local and never include incoming message text, tokens, or codes in logs. The CLI entrypoint must read `TAPIT_EMAIL_SINK_HOST` (default `127.0.0.1`), `TAPIT_EMAIL_SINK_PORT` (default `8025`), `TAPIT_EMAIL_SINK_PROVIDER_TOKEN`, and `TAPIT_LIVE_EMAIL_CODE_TOKEN`, fail before listening when either token is missing, and close on `SIGINT`/`SIGTERM`.

- [x] **Step 4: Run the focused test to verify GREEN**

Run:

```bash
npx vitest run tests/unit/live-email-code.test.ts
```

Expected: all tests in the focused file pass, including the new real-server cases, with no secret or mailbox text in test output.

- [x] **Step 5: Run relevant regression checks**

Run:

```bash
npm run typecheck
npm run lint -- --quiet
```

Expected: both commands exit `0`; no generated files are modified.

### Task 2: Make the adapter runnable and document the non-production boundary

**Files:**

- Modify: `package.json`
- Modify: `.env.example`
- Modify: `docs/live-e2e.md`

**Interfaces:**

- Add `npm run live:email-sink` as the local command `node scripts/live-email-sink.mjs`.
- Document local-only values `TAPIT_EMAIL_SINK_PROVIDER_TOKEN` and `TAPIT_LIVE_EMAIL_CODE_TOKEN`, the default `http://127.0.0.1:8025/code` reader URL, and the requirement that `TAPIT_AUTH_EMAIL_API_URL` point to a separate approved HTTPS route reachable from Convex Cloud.
- Document that a tailnet-only `tailscale serve` endpoint is not sufficient for Convex Cloud; any tunnel or provider must be development/preview-only, bearer-protected, and cleaned up after the run.
- Keep all values as non-secret examples and retain the existing fail-closed `npm run test:e2e:live` command.

- [x] **Step 1: Add the package command and example block**

Add the script and commented variables without real credentials:

```json
"live:email-sink": "node scripts/live-email-sink.mjs"
```

```text
# Local-only disposable adapter; never use production mail.
# TAPIT_EMAIL_SINK_PROVIDER_TOKEN=local-provider-token
# TAPIT_LIVE_EMAIL_CODE_TOKEN=local-reader-token
# TAPIT_LIVE_EMAIL_CODE_URL=http://127.0.0.1:8025/code
# TAPIT_LIVE_EMAIL_DOMAIN=example.test
```

- [x] **Step 2: Document the execution sequence**

Document that the operator must first sync code to the explicitly identified dev deployment, configure the four Convex email/support variables on that same non-production deployment, provision the admin Password identity through a supported auth flow, start `npm run live:email-sink`, expose only `/send` through an approved HTTPS route if Convex Cloud is sending remotely, set the complete ignored live contract, and then run exactly `npm run test:e2e:live`. State that missing identities, missing external delivery reachability, or missing contract variables are blockers and must not be bypassed with direct Auth-table writes.

- [x] **Step 3: Run documentation and diff checks**

Run:

```bash
npm run format:check
git diff --check
```

Expected: both commands exit `0` and the three handoff files remain untouched.

### Task 3: Execute the non-production live gate

**Files:**

- No production-file ownership; root-owned command evidence only.

**Interfaces:**

- Consumes the selected development deployment, its configured email boundary, existing Password user IDs, and the complete ignored live contract.
- Produces fresh evidence for Convex sync, local app contract verification, bootstrap, and all six serialized live browser tests; if a prerequisite is absent, produces a fail-closed blocker report instead.

- [x] **Step 1: Identify and announce the target**

Read `CONVEX_DEPLOYMENT` from the selected ignored environment file and compare it with the live Convex URL and `TAPIT_LIVE_CONVEX_DEPLOYMENT`. Announce the target as development or preview before any `npx convex dev`, `npx convex env set`, or bootstrap command. Refuse any production target.

- [x] **Step 2: Sync and configure only the selected non-production deployment**

Use the installed Convex `1.45.0` CLI with the selected environment file, set `TAPIT_SUPPORT_URL`, `TAPIT_AUTH_EMAIL_FROM`, `TAPIT_AUTH_EMAIL_API_KEY`, and `TAPIT_AUTH_EMAIL_API_URL` only on that dev/preview deployment, and verify names with `npx convex env list --names-only --deployment <selected-reference>`. Do not print values.

- [x] **Step 3: Run the real browser gate when the contract is complete**

Start one local Next server through the wrapper’s `TAPIT_LIVE_LOCAL_SERVER=true` path, run `npm run test:e2e:live`, and record the exact six-test result. If the external mail route or supported admin identity is unavailable, run the wrapper only far enough to capture its generic fail-closed error and report the missing prerequisite without claiming a live pass.

Evidence: the selected dev deployment synced successfully and the temporary HTTPS `/send` route was
reachable with the isolated provider token. A fresh Password identity was created through the public
signup and verification flow, promoted through the existing non-production bootstrap mutation, and used
to provision the setup token. After correcting the live wrapper's ambiguous sign-in locator and aligning
live assertions with the live profile/links editors, `npm run test:e2e:live` completed with **6 passed**
against `dev:cool-vole-719`. The run cleaned up its scoped Funnel route and restored the temporary Convex
email settings to neutral development values.

- [x] **Step 4: Perform root verification**

Run `git status --short --branch`, `git diff --check`, `npm run verify`, `npm run test:e2e:demo -- --workers=1`, and `npx convex ai-files status` on the final tree. Confirm no production command was run, no secrets are tracked, no required agent remains open, and the launch decision remains NO-GO for all unverified external gates.

Evidence: `npm run verify` passed with 134 tests and a successful build; the serialized demo browser suite
passed 16/16; the focused adapter and preflight tests passed 16/16; Convex AI guidance is installed and
up to date; `git diff --check` is clean; and the final status preserves the unrelated untracked handoff
files and profile-card asset.

---

## Plan self-review

- Spec coverage: local code-sink behavior is covered by Task 1; runnable setup and remote-delivery constraints are covered by Task 2; deployment, supported identity, and six-test evidence are covered by Task 3.
- Placeholder scan: no production implementation step is deferred to an unspecified function or file; deployment values are intentionally supplied only at runtime through ignored environment storage.
- Type/interface consistency: Task 1 exports `createEmailSinkServer` and `extractVerificationCode`; Task 2 exposes the CLI entrypoint and environment names; Task 3 consumes those names through the documented live contract.
- Safety review: the adapter is loopback-first, in-memory, bearer-protected, non-production-only by documentation, and separate from Convex Auth identity storage.
