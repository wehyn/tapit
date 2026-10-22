---
name: verify-tapit
description: "Drive Tapit's local demo web app with Playwright to verify public profiles, customer editing, and admin flows. Use for UI behavior checks in this repository."
---

# Verify Tapit in the local demo

Use this skill to prove Tapit's user-facing web behavior in the deterministic local demo. It drives the app through its real pages with the repository's Playwright suite. It does not prove hosted-demo, Convex deployment, Google OAuth, Production, NFC hardware, or physical-device behavior.

Read [the feature map](./features/README.md) before choosing a journey. Start from the current checkout, keep the server and browser on loopback, and record which feature file and entry point were exercised.

## Launch

Tapit is a Next.js web app. The local demo is the primary repeatable surface: it uses browser-local demo state and does not need Convex, Google OAuth, email, or production data.

Prerequisites are Node.js 22.12 or newer and npm 11 or newer. If dependencies are absent, run `npm ci`. If Playwright reports that Chromium is missing, run `npx playwright install chromium`.

Before starting, verify the port can be bound. This probe opens and immediately closes a loopback socket without changing app data:

```bash
node --input-type=module -e 'import net from "node:net"; const probe=net.createServer(); probe.once("error",(error)=>{console.error(`127.0.0.1:3000 is unavailable: ${error.code}`); process.exit(1);}); probe.listen(3000,"127.0.0.1",()=>probe.close(()=>console.log("127.0.0.1:3000 is free")));'
```

If the check fails, stop and identify the listener; do not reuse a server you did not start for this verification. Start the app in its own terminal from the repository root:

```bash
NEXT_PUBLIC_DEMO_MODE=true NEXT_PUBLIC_DEMO_STORAGE=local npm run dev -- --hostname 127.0.0.1 --port 3000
```

Keep that terminal open. Wait for Next.js to report readiness on port `3000`, then run Doctor. The app has no database migration step in local demo mode; a fresh Playwright browser context loads the deterministic fixture when the user opens a page. Do not point local verification at hosted demo storage.

## Doctor

Run this read-only check before driving if the server looks unhealthy, the page is unexpected, or a login journey fails. It checks that the intended loopback app is responding in demo mode and that the public and login pages are reachable:

```bash
node --input-type=module -e 'const base="http://127.0.0.1:3000"; const [contract, home, login]=await Promise.all([fetch(`${base}/api/live-contract`),fetch(base),fetch(`${base}/login`)]); const mode=await contract.json(); const homeHtml=await home.text(); if(!contract.ok||mode.mode!=="demo"||!home.ok||!homeHtml.includes("Share with a tap")||!login.ok) { console.error({contractStatus:contract.status,mode:mode.mode,homeStatus:home.status,loginStatus:login.status}); process.exit(1); } console.log("Tapit local demo is ready at http://127.0.0.1:3000");'
```

The local-contract route reports the demo mode but does not expose a commit SHA. Confirm build ownership from the launch terminal and current worktree; the port preflight plus the server started in that terminal establishes which process is being driven. Customer/admin recipes sign in through the real local demo form using the fictional credentials listed in `README.md`; if sign-in fails, stop and diagnose rather than trying live credentials.

## Drive

Use the exact command in the feature recipe. It calls `npm run test:e2e:demo`, which sets local demo mode and local storage, then starts and owns the Playwright server on `127.0.0.1:3001` for that run. Do not prestart another server on that port or reuse a server you did not start. The port-3000 command above is for standalone Doctor checks or manual inspection; stop that server before invoking a feature recipe. Do not run the hosted-demo or live project for local feature proof.

Each feature recipe gives the exact `npm run test:e2e:demo` command, route, accessible handles, and visible end state. The cited spec is the user-action sequence; run it as written rather than editing localStorage or calling internal app functions. Use one worker so the action order and artifacts are easy to inspect.

## Evidence

Keep Playwright output under ignored `test-results/`. Use `--trace=on` for the selected journey; the trace records the browser actions and DOM snapshots around the assertions. The configured JSON reporter records the test result. When the journey's spec writes a screenshot, retain it alongside the report.

For each proof, report the feature ID, exact test title and command, URL/route, visible state, pass/fail result, trace/report paths, screenshot path if produced, and whether the evidence is ignored or tracked. A successful page load alone is not a pass: require the test's resulting-state assertions. Do not present local-demo evidence as hosted, live, accessibility certification, or device evidence.

## Cleanup

The `test:e2e:demo` wrapper stops the server it starts after the Playwright run. If you also started a port-3000 server for Doctor or manual inspection, stop it with Ctrl-C in the terminal where this verification started it before invoking the recipe. Do not use process-name kills or stop a server owned by another session. Playwright closes its browser contexts after each test; demo browser data is isolated to those contexts. Keep `test-results/` intact so the trace, JSON result, and any screenshots survive cleanup.

## Helpers

This skill ships no helper scripts. The commands above invoke the app and the repository's existing Playwright harness directly.

## Maintenance

Keep the feature map aligned with routes, navigation, and the selectors in `e2e/`. When a route, user entry point, demo precondition, or observable result changes, update the matching feature file and run its recipe. See `/maintain-verification-skill` for a periodic map review.
