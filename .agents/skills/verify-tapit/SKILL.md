---
name: verify-tapit
description: "Drive Tapit's web app in its deterministic local demo (Next.js, browser-local storage) with Playwright to prove public profile, customer profile and links, and administrator flows. Use when asked to verify, prove, screenshot, or check a Tapit UI behavior end to end, or before reporting a web-facing change complete."
---

# Verify Tapit in the local demo

This skill proves Tapit's user-facing web behavior through its real pages, in the local demo only (`NEXT_PUBLIC_DEMO_MODE=true`, `NEXT_PUBLIC_DEMO_STORAGE=local`). The demo needs no Convex deployment, Google OAuth, email, or production data.

It does **not** prove hosted demo (Convex-backed), live/Preview/Production, Google sign-in, NFC or QR hardware, or physical-device behavior. Name the environment in every report.

Read the [feature map](./features/README.md) before choosing a journey. Every command below runs from the repository root through one helper, `scripts/tapit-verify.sh`.

## Launch

Prerequisites: Node.js 22.12+ and npm 11+. If `node_modules` is missing, run `npm ci`. If Playwright reports a missing browser, run `npx playwright install chromium`.

Start the verification server on loopback port 3000 and wait until it serves the demo home page:

```bash
.claude/skills/verify-tapit/scripts/tapit-verify.sh launch
```

Ready means `launch` printed `ready:` and the Doctor passes. The local demo has no migration or seed step: each Playwright test gets a fresh browser context, and the fixture loads when a page opens. The helper refuses to start when `127.0.0.1:3000` is occupied; identify that listener and leave it alone.

Port 3001 is not started by `launch`. `prove` (below) starts its own server on 3001 through Playwright's `webServer`, and Playwright stops it after the run.

## Doctor

Run this read-only check first whenever the app looks wrong or a journey fails for no obvious reason:

```bash
.claude/skills/verify-tapit/scripts/tapit-verify.sh doctor
```

It exits 0 only when all of these hold:

- the `launch` pidfile names a live process this helper started (ownership);
- `/api/live-contract` reports `"mode":"demo"`;
- `/` returns 200 and contains `Share with a tap`;
- `/login` returns 200.

A non-zero exit means stop and diagnose: read `test-results/verify-tapit/state/dev-3000.log`, or run `stop` and then `launch` again. Do not sign in with any non-demo credential to get past a failure.

## Drive

Run one journey at a time. `prove` refuses to run while the Doctor server on 3000 is still up, because Next allows only one dev server per checkout (`.next` lock) and Playwright's own 3001 server would fail to start. Stop the launch server first:

```bash
.claude/skills/verify-tapit/scripts/tapit-verify.sh stop
.claude/skills/verify-tapit/scripts/tapit-verify.sh prove "<exact test title>" <run-id>
```

`<run-id>` must be new; the helper refuses to reuse a run directory. The title comes from the feature file's `--grep` text. Each `prove` call wraps `npm run test:e2e:demo -- --grep "<title>" --workers=1 --trace=on`, so it runs one test with one worker and retains a trace. Playwright's `webServer` starts the app on 127.0.0.1:3001 with local demo mode and stops it when the run ends.

The journeys are scripted user action sequences in `e2e/*.spec.ts`: they navigate by visible links, buttons, and form fields, and they assert the resulting visible state. Do not edit localStorage, call internal app functions, or add test-only endpoints to get a journey to pass. If a precondition is missing from the fixture, the test fails; record the failure and its reason in that feature's `Gotchas`, and do not weaken the test.

Use `e2e/` specs as the source of truth for handles. The stable ones are accessible names (`Customer navigation`, `Add link`, `Save draft`, `Publish changes`), routes (`/app/links`, `/mara-velasquez`, `/c/mara-card-7f2q`), and visible headings. Avoid coordinates.

## Evidence

`prove` writes everything for one run under ignored `test-results/verify-tapit/<run-id>/`:

- `report.json`: Playwright JSON result (`stats` line printed by the helper: expected, unexpected, skipped, flaky);
- `run.log`: the full console output of the run;
- `artifacts/<test-folder>/trace.zip`: the Playwright trace (open with `npx playwright show-trace <path>`);
- any `*.png` the spec wrote to `test-results/` during the run, copied into the run directory.

Proof standards:

- A journey passes only when its assertions on the resulting state pass. A page that loads is not a pass.
- Exercise the real user path. Sign-in goes through the demo form with the fictional credentials in `README.md`.
- Capture the action and its result, not only the final screen. The trace holds both.
- Verify side effects alongside what is visible. For example, a saved draft must still be there after reload, and a publish must show on the public route.
- Mocks are acceptable only where a production boundary already isolates the external system. The local demo already does this for storage and auth.
- Dry-run and demo modes: verify what they skip by observing rather than trusting the name. Local demo never sends invitations, uses OAuth, or touches production; check `e2e/` assertions before claiming an email or network effect.

Report, for each proof: feature ID, exact title and command, route, visible state asserted, pass/fail counts from `stats`, and the paths to `report.json`, `trace.zip`, and any screenshot. State that it is local-demo evidence.

## Cleanup

```bash
.claude/skills/verify-tapit/scripts/tapit-verify.sh stop
```

`stop` signals only the process group of the dev server that `launch` recorded in `test-results/verify-tapit/state/dev-3000.pid`. It refuses to signal a group it did not start, and it never kills by process name. It deletes the pidfile and the dev log.

Playwright stops its own 3001 server and closes its browser contexts at the end of each run; no cleanup is needed for it. If a run crashed and 3001 stays occupied, identify that listener with `lsof -nP -iTCP:3001 -sTCP:LISTEN` and stop only the process you can trace to this run. Confirm both ports are free afterwards.

Cleanup removes instances and scratch state only. Never delete `test-results/verify-tapit/<run-id>/`; those directories are the proof and survive cleanup by design.

## Helpers

- `scripts/tapit-verify.sh launch | doctor | prove <title> <run-id> | stop` (executable). Usage errors print the subcommand list and exit 2.

## Maintenance

Keep the feature map aligned with routes, navigation, and the `e2e/` titles it cites. When a title is renamed, a route moves, or a precondition changes, update the matching feature file and rerun its recipe. Use `/maintain-verification-skill` for a periodic review of the map.
