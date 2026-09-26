# Collapsible Draft Action Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Make the shared profile workspace draft action bar collapse when the draft is clean and idle, while automatically expanding for unsaved or in-flight work and preserving all existing save, publish, validation, navigation-save, accessibility, and mobile behavior.

**Architecture:** \`ProfileWorkspaceFrame\` owns only the local expanded/collapsed presentation state. \`ProfileEditor\` supplies an explicit \`hasDraftChanges={isDirty}\` for both demo and live controllers, while the existing loading props signal save/publish activity. The collapsed control and expanded action region share a stable \`aria-controls\` target; \`LinksWorkspace\` remains unchanged.

**Tech Stack:** Next App Router client components, React state/effects, TypeScript, Tailwind CSS, Phosphor Icons, Playwright demo E2E, and the existing Vitest controller suite.

---

## File map

### Modify

- \`src/components/forms/ProfileWorkspaceFrame.tsx\` — add the controlled dirty-state input, local disclosure state, compact saved-status control, expanded action region, and accessible focus/motion treatment.
- \`src/components/forms/ProfileEditor.tsx\` — pass the already-computed \`isDirty\` value from both demo and live render branches.
- \`e2e/customer.spec.ts\` — cover compact clean state, keyboard/click expansion, manual collapse, and automatic expansion after editing on \`/app/profile\` and \`/app/customize\`; update the existing layout assertion for the profile route.
- \`tests/unit/profile-editor.test.tsx\` — adapt existing controller interactions that assume the clean initial action bar is expanded by explicitly opening the new compact control before testing publish/save-disabled behavior. Do not add a separate unit-test file; the new behavior is browser-verified by E2E per \`AGENTS.md\`.

### Leave unchanged

- \`src/components/forms/LinksWorkspace.tsx\` — the approved slice changes only the shared profile workspace frame; links retain their current always-expanded action bar.
- \`docs/superpowers/specs/2026-09-26-draft-action-bar-collapse-design.md\` — approved design record.
- Existing save, publish, validation, crop, media, and draft-navigation handlers — only their frame inputs and presentation state change.

## Task 1: Write the browser acceptance coverage first

**Files:**

- Modify: \`e2e/customer.spec.ts\`
- Modify: \`tests/unit/profile-editor.test.tsx\`

- [ ] **Step 1: Add a focused customer E2E scenario for both profile workspaces.**

Use the existing \`resetDemoHarness\` and \`signInAsCustomer\` helpers. For each route in \`["/app/profile", "/app/customize"]\`, assert the clean profile frame exposes a compact button with accessible name \`Draft saved. Show draft actions\`, \`aria-expanded="false"\`, and no visible \`Save draft\` button. Activate it, assert \`aria-expanded="true"\`, \`Save draft\`, and \`Publish\` are visible, then activate \`Collapse draft actions\` and assert the compact button returns. Edit \`Bio or role\` on \`/app/profile\`; on \`/app/customize\`, open the \`Identity\` tab and select the \`Jade\` radio. Assert the compact button is replaced by the expanded action region and \`Save draft\` is visible. This verifies both automatic expansion and the manually reversible presentation state.

\`\`\`ts
test("profile draft actions collapse cleanly and expand for edits", async ({ page }) => {
await resetDemoHarness(page);
await signInAsCustomer(page);

for (const route of ["/app/profile", "/app/customize"] as const) {
await page.goto(route);

    const compact = page.getByRole("button", { name: "Draft saved. Show draft actions" });
    await expect(compact).toHaveAttribute("aria-expanded", "false");
    await expect(compact).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);

    await compact.click();
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Collapse draft actions" }).click();
    await expect(page.getByRole("button", { name: "Draft saved. Show draft actions" })).toBeVisible();

    if (route === "/app/profile") {
      await page.getByLabel("Bio or role").fill("Draft action bar test");
    } else {
      await page.getByRole("tab", { name: "Identity" }).click();
      await page.getByRole("radio", { name: "Jade" }).check();
    }

    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Draft saved. Show draft actions" })).toHaveCount(0);

}
});
\`\`\`

- [ ] **Step 2: Update the existing profile layout E2E assertion without weakening links coverage.**

In \`editor actions stay beside the preview on desktop and fit on mobile\`, keep \`/app/links\` assertions unchanged. For \`/app/profile\`, first activate the compact \`Draft saved. Show draft actions\` control, then run the existing preview/save/publish desktop and mobile assertions. This keeps the existing fixed-bar and horizontal-overflow checks while acknowledging that a clean profile bar is intentionally compact.

- [ ] **Step 3: Update unit-controller setup points before implementation.**

In \`tests/unit/profile-editor.test.tsx\`, add a small local test helper that clicks \`Draft saved. Show draft actions\` when it exists, and use it only in tests that need clean-state \`Publish\` or \`Save draft\` controls before making a change. Keep tests that make an edit first unchanged because dirty state must auto-expand the frame. The helper should not change the component contract or assert implementation details outside the accessible control name.

- [ ] **Step 4: Run the focused tests and record the expected pre-implementation failure.**

Run:

\`\`\`bash
npx playwright test e2e/customer.spec.ts --project chromium --workers=1
npx vitest run tests/unit/profile-editor.test.tsx
\`\`\`

Expected: the new E2E scenario fails because the compact trigger does not exist yet; the unit suite may fail at updated clean-state lookups until the frame implementation is present. Do not change production code in this task.

## Task 2: Implement the disclosure presentation in the shared frame

**Files:**

- Modify: \`src/components/forms/ProfileWorkspaceFrame.tsx\`

- [ ] **Step 1: Add the explicit dirty-state prop and local presentation state.**

Extend \`ProfileWorkspaceFrameProps\` with:

\`\`\`ts
hasDraftChanges: boolean;
\`\`\`

Import \`useEffect\`, \`useId\`, and \`useState\` from React, plus compact disclosure icons such as \`CaretDownIcon\` and \`CaretUpIcon\` from \`@phosphor-icons/react\`. Derive in the component:

\`\`\`ts
const actionRegionId = \`profile-draft-actions-\${useId().replaceAll(":", "")}\`;
const isBusy = saveLoading || publishLoading;
const shouldExpand = hasDraftChanges || isBusy;
const [isExpanded, setIsExpanded] = useState(shouldExpand);

useEffect(() => {
setIsExpanded(shouldExpand);
}, [shouldExpand]);
\`\`\`

This makes clean initial renders compact, expands on a clean-to-dirty or idle-to-loading transition, keeps dirty/loading states prominent, and still lets a user manually collapse without an unrelated re-render reopening the bar. Disable or omit the collapse control while \`isBusy\` so a save/publish operation cannot be hidden.

- [ ] **Step 2: Render the compact saved-status control with native disclosure semantics.**

Keep the fixed outer wrapper and its existing bottom-space reservation. When \`isExpanded\` is false, render a full-width semantic button with:

\`\`\`tsx
type="button"
aria-controls={actionRegionId}
aria-expanded={false}
aria-label="Draft saved. Show draft actions"
onClick={() => setIsExpanded(true)}
\`\`\`

Show the existing check icon, \`draftStatus ?? "Draft saved"\`, and an upward disclosure icon. Use the existing Tapit line/surface/ink tokens, \`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus\`, and \`motion-reduce:transition-none\`. The compact state must remain at least 44px tall, wrap safely on narrow screens, and retain enough bottom padding for the fixed control not to cover form fields.

- [ ] **Step 3: Keep the existing actions in an accessible expanded region.**

Move the current expanded contents into a region with \`id={actionRegionId}\` and \`hidden={!isExpanded}\`. Preserve the existing \`Draft changes\` label, live \`draftStatus\`, Save draft button props/icons, Publish button props/icons, and all callbacks. Add an accessible \`Collapse draft actions\` button beside the actions with \`aria-controls={actionRegionId}\`, \`aria-expanded={true}\`, native keyboard activation, and the same visible-focus treatment. Keep \`aria-live="polite"\` and \`role="status"\` on the status text. Do not infer dirtiness from \`saveDisabled\`, because media/image processing can disable saving without creating a draft change.

- [ ] **Step 4: Run the frame-focused checks.**

Run:

\`\`\`bash
npx vitest run tests/unit/profile-editor.test.tsx
npx tsc --noEmit
\`\`\`

Expected: the frame compiles and existing controller tests pass once the editor supplies the new prop in Task 3; if TypeScript reports missing props at the two call sites, complete Task 3 before treating the result as a regression.

## Task 3: Wire demo/live dirtiness into both profile workspace branches

**Files:**

- Modify: \`src/components/forms/ProfileEditor.tsx\`

- [ ] **Step 1: Pass \`isDirty\` to the demo frame.**

In \`DemoProfileEditor\`, add \`hasDraftChanges={isDirty}\` to the existing \`ProfileWorkspaceFrame\` call. Keep \`saveDisabled={!isDirty || cropFile !== null || imagePending || mediaBusy}\` unchanged so the frame receives the semantic dirty state separately from operational disablement.

- [ ] **Step 2: Pass \`isDirty\` to the live frame.**

In \`LiveProfileEditorContent\`, add \`hasDraftChanges={isDirty}\` to the existing \`ProfileWorkspaceFrame\` call. Keep the existing \`saveLoading\`, \`publishLoading\`, \`pending\`, media, validation, and navigation-save behavior unchanged.

- [ ] **Step 3: Run the focused acceptance suites.**

Run:

\`\`\`bash
npx vitest run tests/unit/profile-editor.test.tsx
TAPIT_E2E_PORT=3011 npm run test:e2e:demo -- e2e/customer.spec.ts --workers=1
\`\`\`

Expected: the controller suite passes for demo and mocked live branches, and the customer E2E scenario passes on both \`/app/profile\` and \`/app/customize\` with the clean compact state, accessible expansion/collapse, and dirty auto-expansion.

- [ ] **Step 4: Commit the focused implementation.**

\`\`\`bash
git add src/components/forms/ProfileWorkspaceFrame.tsx src/components/forms/ProfileEditor.tsx e2e/customer.spec.ts tests/unit/profile-editor.test.tsx
git commit -m "feat: collapse clean profile draft actions"
\`\`\`

Do not stage the preserved untracked user paths listed by \`git status\`.

## Task 4: Full verification and repeatable E2E artifact

**Files:**

- Verify: all files changed above and the existing repository checks.

- [ ] **Step 1: Check the worktree and patch hygiene.**

Run:

\`\`\`bash
git status --short --branch
git diff --check
git diff HEAD^ --stat
\`\`\`

Expected: only the focused commit is added to the feature branch, the known user-owned untracked paths remain untouched, and there is no whitespace error.

- [ ] **Step 2: Run the complete demo E2E suite with one worker.**

Run:

\`\`\`bash
TAPIT_E2E_PORT=3011 npm run test:e2e:demo -- --workers=1
\`\`\`

Expected: all local/demo Chromium tests pass. Preserve the generated \`test-results/e2e-results.json\` report and any failure traces/screenshots as the repeatable verification artifact; do not run live or production E2E for this UI-only change.

- [ ] **Step 3: Run repository verification.**

Run:

\`\`\`bash
npm run verify
\`\`\`

Expected: typecheck, lint, tests, and build verification pass. If the known environment-only Turbopack bind restriction recurs, report it explicitly and retain the passing \`npx next build --webpack\` evidence without changing unrelated configuration.

- [ ] **Step 4: Review the final behavior against the approved design.**

Confirm manually from the E2E artifact that:

- clean \`/app/profile\` and \`/app/customize\` show only the compact saved-status control;
- activating it exposes Save draft and Publish with \`aria-expanded="true"\`;
- collapsing it does not modify the draft;
- editing either workspace automatically expands the action region;
- existing save/publish labels and feedback remain intact;
- \`/app/links\` remains unchanged; and
- fixed-bar mobile layout has no horizontal overflow or covered controls.
