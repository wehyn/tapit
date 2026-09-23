# Remove Orange Focus Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox ("- [ ]") syntax for tracking.

**Goal:** Replace Tapit’s orange focus outlines and rings with the existing green theme accent across every form and form-like control while preserving visible keyboard focus.

**Architecture:** Keep --tapit-focus as the semantic focus-color token, but make it resolve to --tapit-accent instead of the hard-coded orange value. The global :focus-visible outline and the explicit focus:ring-tapit-focus/focus-visible:ring-tapit-focus utilities in LinksWorkspace and CardsManager remain structurally unchanged while rendering in Tapit green. Add a source-level contract test and a local demo browser regression test so future form additions cannot silently reintroduce the orange focus treatment.

**Tech Stack:** Next.js 16.3.5 App Router, React 19.3.0, TypeScript 5.9.3, Tailwind CSS 4.3.3, Vitest 5.0.0, Testing Library, and Playwright 1.63.0.

**Spec:** User request from 2026-09-23: remove the orange focus outlines from all forms because they look out of place and do not fit the Tapit theme; preserve the rest of the form behavior and styling.

## Global Constraints

- Preserve a visible :focus-visible affordance; do not remove focus indicators with a broad outline: none rule.
- Reuse the existing --tapit-accent: #187461 token; add no dependency and introduce no new color.
- Change focus color only. Do not alter validation colors, status-badge colors, hover states, form labels, persistence, authentication, or Convex behavior.
- Shared Field, TextareaField, and SelectField controls retain their current green focus:border-tapit-accent and focus:ring-tapit-accent/20 behavior.
- Explicit orange focus consumers in LinksWorkspace.tsx and CardsManager.tsx resolve to the same green focus token after the change.
- Preserve unrelated untracked files already in the worktree: TASKS.md, the existing plan files, and public/images/tapit-profile-card-cutout-v2.png.
- Run Next-backed checks serially because they share .next/; use the guarded npm run test:e2e:live command for any live proof and never bypass its preflight.

---

## Current Implementation Map

- src/app/globals.css:10-14 defines the palette; --tapit-focus: #b86500 is the only runtime orange focus token.
- src/app/globals.css:78-81 applies the token to every :focus-visible element as a 3px outline.
- src/components/forms/LinksWorkspace.tsx:165,180,321 uses tapit-focus for the redirect URL focus ring and both custom toggle focus rings.
- src/components/admin/CardsManager.tsx:419,854 uses tapit-focus for the two expandable card-summary focus rings.
- src/components/ui/Button.tsx:26-64 does not override focus, so shared buttons and button links inherit the global outline.
- src/components/ui/Field.tsx:3-4,19-27,55-63,78-90 already supplies green focus styles and outline-none; these controls need no component changes.
- The audited form-bearing routes are /login, /setup/[token], /app/profile, /app/links, /app/account, /app/analytics, /admin/customers, /admin/profiles, /admin/cards, /admin/analytics, /admin/audit-log, /admin/settings, and the claim form at /c/[cardToken].

## File Map

- Modify: src/app/globals.css:14 — point the semantic focus token at the existing green accent while leaving the global focus rule intact.
- Create: tests/unit/focus-styles.test.ts — guard the focus-token contract and prove the old orange value is gone.
- Create: e2e/focus-styles.spec.ts — focus visible form controls across local demo routes and assert their computed outline, border, and ring colors do not contain the old orange.
- Do not modify form component files unless a regression test demonstrates a separate hard-coded color; existing component classes already consume the semantic token.

---

### Task 1: Repoint the shared focus token and add the source regression guard

**Files:**

- Modify: src/app/globals.css:10-15
- Create: tests/unit/focus-styles.test.ts

**Interfaces:**

- Consumes: CSS custom properties --tapit-accent, --tapit-focus, and the global :focus-visible rule.
- Produces: A source contract that keeps focus visible while resolving it to the green theme accent.

- [ ] **Step 1: Write the failing unit test.**

Create tests/unit/focus-styles.test.ts:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("focus color contract", () => {
  it("uses the Tapit accent instead of orange for focus indicators", () => {
    expect(globalsCss).toContain("--tapit-focus: var(--tapit-accent);");
    expect(globalsCss).toContain("outline: 3px solid var(--tapit-focus);");
    expect(globalsCss).not.toContain("--tapit-focus: #b86500;");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED.**

Run:

```bash
npm test -- tests/unit/focus-styles.test.ts
```

Expected result before implementation: failure because globals.css still contains --tapit-focus: #b86500; and lacks the green-token declaration.

- [ ] **Step 3: Make the minimal CSS change.**

Change only the focus-token declaration:

```css
:root {
  --tapit-accent: #187461;
  --tapit-focus: var(--tapit-accent);
}
```

Keep the existing @theme mapping and :focus-visible rule unchanged:

```css
@theme inline {
  --color-tapit-focus: var(--tapit-focus);
}

:focus-visible {
  outline: 3px solid var(--tapit-focus);
  outline-offset: 3px;
}
```

This changes the global outline, the LinksWorkspace redirect/toggle rings, and the CardsManager summary rings without duplicating focus-color edits across form components.

- [ ] **Step 4: Run the focused test and verify GREEN.**

Run:

```bash
npm test -- tests/unit/focus-styles.test.ts
```

Expected result: the new test passes with zero failures.

- [ ] **Step 5: Check that the old orange token is absent from runtime CSS.**

Run:

```bash
if rg -n "#b86500" src/app src/components; then
  echo "old orange focus color remains in runtime source" >&2
  exit 1
fi
```

Expected result: no old orange focus literal is found and the command exits 0.

- [ ] **Step 6: Commit the focused implementation and regression guard.**

```bash
git add src/app/globals.css tests/unit/focus-styles.test.ts
git commit -m "fix: align focus indicators with tapit theme"
```

### Task 2: Add browser coverage for every local form surface

**Files:**

- Create: e2e/focus-styles.spec.ts
- Read-only dependencies: playwright.config.ts, e2e/accessibility.spec.ts, e2e/customer.spec.ts, e2e/public-profile.spec.ts, and src/lib/demo/fixtures.ts

**Interfaces:**

- Consumes: The green --tapit-focus token from Task 1 and the existing Chromium demo project.
- Produces: Browser-level proof that focused form controls do not render the former orange outline/ring on auth, setup, claim, customer, and admin surfaces.

- [ ] **Step 1: Add computed-style helpers.**

The new spec must focus every visible input, textarea, select, button, and summary, then inspect outlineColor, all border colors, and boxShadow:

```ts
import { expect, test, type Locator, type Page } from "@playwright/test";

const ORANGE_FOCUS = /#b86500|rgb\(\s*184,\s*101,\s*0|rgba\(\s*184,\s*101,\s*0/i;
const FORM_CONTROLS =
  'input:not([type="hidden"]):not([disabled]):visible, textarea:not([disabled]):visible, select:not([disabled]):visible, button:not([disabled]):visible, summary:visible';

async function readFocusColors(surface: Locator) {
  return surface.evaluate((element) => {
    const styles = getComputedStyle(element);
    return [
      styles.outlineColor,
      styles.borderTopColor,
      styles.borderRightColor,
      styles.borderBottomColor,
      styles.borderLeftColor,
      styles.boxShadow,
    ].join(" ");
  });
}

async function expectNoOrangeFocus(page: Page, route: string) {
  const controls = page.locator(FORM_CONTROLS);
  for (let index = 0; index < (await controls.count()); index += 1) {
    const control = controls.nth(index);
    const description =
      (await control.getAttribute("aria-label")) ??
      (await control.getAttribute("id")) ??
      (await control.evaluate((element) => element.tagName.toLowerCase()));
    await control.focus();
    expect(await readFocusColors(control), route + " " + description).not.toMatch(ORANGE_FOCUS);
  }
}
```

- [ ] **Step 2: Cover unauthenticated forms and the custom toggle proxy.**

Visit each unauthenticated form route and call expectNoOrangeFocus after the page is ready:

```ts
for (const route of [
  "/login",
  "/login?mode=signup",
  "/setup/demo-setup-token",
  "/c/claimable-card-demo",
]) {
  await page.goto(route);
  await expectNoOrangeFocus(page, route);
}
```

Then focus the named redirect checkbox and inspect its following sibling span with:

```ts
const redirectToggle = page.getByRole("checkbox", {
  name: "Enable card tap and scan redirect",
});
await redirectToggle.focus();
const redirectToggleSurface = redirectToggle.locator(
  "xpath=following-sibling::span[@aria-hidden='true']",
);
expect(await readFocusColors(redirectToggleSurface), "redirect toggle").not.toMatch(ORANGE_FOCUS);
```

- [ ] **Step 3: Cover customer forms and the ordinary redirect ring.**

Sign in with the existing demo customer credentials, then scan every customer route. On /app/links, separately focus the HTTPS destination URL and inspect boxShadow:

```ts
await page.goto("/login");
await page.getByLabel("Email").fill("mara@example.test");
await page.getByLabel("Password").fill("tapit-demo");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await expect(page).toHaveURL(/\/app\/profile$/);

for (const route of ["/app/profile", "/app/links", "/app/analytics", "/app/account"]) {
  await page.goto(route);
  await expectNoOrangeFocus(page, route);
}

await page.goto("/app/links");
const redirectInput = page.getByRole("textbox", { name: "HTTPS destination URL" });
await redirectInput.focus();
expect(await readFocusColors(redirectInput), "redirect URL").not.toMatch(ORANGE_FOCUS);
```

- [ ] **Step 4: Cover admin forms and expandable card controls.**

Sign out, sign in with the existing demo administrator, and scan every admin route. Expand one card summary before scanning the card registry so the explicit summary ring and raw assignment control are exercised. The test must not submit, delete, or persist any form data.

```ts
await page.getByRole("button", { name: "Sign out" }).click();
await page.goto("/login");
await page.getByLabel("Email").fill("admin@tapit.local");
await page.getByLabel("Password").fill("tapit-demo");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await expect(page).toHaveURL(/\/admin\/customers$/);

for (const route of [
  "/admin/customers",
  "/admin/profiles",
  "/admin/cards",
  "/admin/analytics",
  "/admin/audit-log",
  "/admin/settings",
]) {
  await page.goto(route);
  if (route === "/admin/cards") {
    await page.locator("summary").first().click();
  }
  await expectNoOrangeFocus(page, route);
}
```

- [ ] **Step 5: Run the focused browser test in the supported local demo boundary.**

Run:

```bash
npm run test:e2e:demo -- --workers=1 e2e/focus-styles.spec.ts
```

Expected result: Chromium reports zero matches for the old orange outline, border, or box-shadow. If loopback binding or Chromium sandbox permissions block the environment, record the exact failure and do not bypass the configured Playwright wrapper or claim browser verification.

- [ ] **Step 6: Commit the browser regression coverage.**

```bash
git add e2e/focus-styles.spec.ts
git commit -m "test: cover themed form focus states"
```

### Task 3: Run the complete verification gate and reconcile the audit

**Files:**

- Read-only verification: the complete working tree and the files changed by Tasks 1-2.

**Interfaces:**

- Consumes: The token change, unit contract, and browser regression test from Tasks 1-2.
- Produces: Fresh evidence that the theme change is complete, scoped, formatted, type-safe, and free of unintended behavior changes.

- [ ] **Step 1: Run the project verification suite serially.**

Run:

```bash
npm run verify
```

Expected result: format check, ESLint, TypeScript, Vitest, and the production build all exit 0.

- [ ] **Step 2: Run the complete local demo E2E suite serially.**

Run:

```bash
npm run test:e2e:demo -- --workers=1
```

Expected result: existing auth, customer, admin, profile, links, card, and accessibility flows remain green alongside the new focus-style coverage.

- [ ] **Step 3: Verify the old orange runtime literal is absent and the diff is clean.**

Run:

```bash
if rg -n "#b86500" src/app src/components; then
  echo "old orange runtime focus color remains" >&2
  exit 1
fi
git diff --check
```

Expected result: no old orange literal is found and git diff --check exits 0. Orange-like status badge colors may remain outside focus styling and must not be removed by this task.

- [ ] **Step 4: Review the final diff and worktree boundary.**

Run:

```bash
git diff --stat HEAD~2..HEAD
git diff -- src/app/globals.css tests/unit/focus-styles.test.ts e2e/focus-styles.spec.ts
git status --short --branch
```

Confirm that only the focus token and the two regression-test files are part of the intended implementation commits, while pre-existing untracked plans/assets remain untouched.

- [ ] **Step 5: Record the completion checklist.**

The implementation is ready to hand off only when all of these are evidenced:

- --tapit-focus resolves to var(--tapit-accent).
- The global :focus-visible outline remains present and visible.
- LinksWorkspace redirect/toggle rings and CardsManager summary rings no longer resolve to orange.
- Shared fields retain their existing green border/ring behavior.
- Auth, setup, customer, admin, analytics, account, card-claim, and links form surfaces pass the local focus-color regression test.
- npm run verify, the focused E2E test, and the full local demo E2E suite have fresh results, or any environment blocker is reported explicitly.
- No unrelated files are modified, staged, deleted, or overwritten.

## Self-Review Checklist

- Spec coverage: the token, global outline, explicit component rings, shared fields, all audited route families, and browser verification each have a task.
- No production form logic, validation, auth, persistence, or Convex code is changed.
- No focus indicator is removed; only the color source changes from orange to the existing accent green.
- The plan contains no dependency additions or unresolved API/type placeholders.
- The only expected production-file diff is src/app/globals.css:14; the remaining files are regression coverage.
