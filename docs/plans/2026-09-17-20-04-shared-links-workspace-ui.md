# Shared Links Workspace UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make /app/links render the attached links-workspace design in local demo, hosted demo, and live Convex modes while preserving each mode’s existing data, authentication, and persistence boundaries.

**Architecture:** Extract the current redesigned demo markup into a mode-agnostic LinksWorkspace client component. Keep the demo and live implementations as thin controllers that load and normalize their own profile data, manage draft state, validate changes, and call their existing persistence APIs. The mode selector will choose only the controller; it will not choose a different layout.

**Tech Stack:** Next.js 16.3.5 App Router, React 19.3, TypeScript, Tailwind CSS 4, Phosphor icons, Convex 1.45.0, Vitest 5, Testing Library, and Playwright 1.63.0.

**Spec:** User-provided target screenshot at /home/dei/.codex/attachments/4d816af6-c631-407c-a361-2ef4cb3dc438/codex-clipboard-0ff8f8d5-17ad-44c6-b57a-2ef542546875.png; acceptance criteria are transcribed below.

## Global Constraints

- Both modes must render the same semantic workspace: “Your links”, “Add link”, editable rows, icon selection, enabled toggle, row actions, preview, draft footer, and publish state.
- NEXT_PUBLIC_DEMO_MODE and NEXT_PUBLIC_DEMO_STORAGE continue to select the persistence source; they must not select a different visual layout.
- Never route a live Convex account to the local demo store merely to obtain the redesigned UI.
- Preserve the existing Convex ownership checks, draft privacy, server-side validation, publication checks, and useDraftSaveRegistration navigation-save behavior.
- Reuse api.links.replaceDraft for live link draft persistence and api.profiles.publish for live publication; do not add a schema migration or duplicate persistence table.
- Reuse the existing Phosphor icon family, Tailwind tokens, WorkspacePreview, domain validators, and profile projection helpers. Add no dependency.
- Keep the current maximum of 100 links and the existing safe-destination rules for enabled links.
- The shared component must not import Convex hooks, demo-store functions, or mode helpers. Persistence-specific logic belongs in the two controllers.
- Preserve the unrelated untracked files already present in the worktree: the two existing plan files and public/images/tapit-profile-card-cutout-v2.png.
- Run Next-backed checks serially because they share .next/. Use the guarded npm run test:e2e:live command for live proof; do not bypass its preflight with direct Playwright.

## Target behavior

At desktop widths, /app/links shows a two-column workspace:

- Left: heading and helper copy, an Add link button, and a bordered link table with Link, Destination, Status, and actions columns.
- Each row supports a preset icon, editable label, editable destination, enabled/disabled toggle, move-up/move-down actions, and delete.
- Right: the existing WorkspacePreview with phone/desktop controls and a preview generated from the current draft, including unsaved edits.
- Bottom: a fixed draft-status footer with Save draft and Publish/Publish changes controls.

At mobile widths, the same controls remain available in stacked rows, the preview follows the editor, and the layout does not introduce horizontal scrolling. Demo and live users see the same control names and layout; only the row data and persistence behavior differ.

## Current implementation map

- src/components/forms/LinksEditor.tsx:94 contains the redesigned DemoLinksEditor, including the table, preview, reorder actions, and publication footer.
- src/components/forms/LinksEditor.tsx:531 contains LiveLinksEditor; its LiveLinksEditorContent currently renders the older simple row form and only saves links.
- src/components/forms/LinksEditor.tsx:527 selects the controller through isLocalDemoMode().
- src/lib/demo/mode.ts:1 treats any value other than NEXT_PUBLIC_DEMO_MODE=false as demo mode, while NEXT_PUBLIC_DEMO_STORAGE=convex makes it hosted demo rather than local demo.
- src/components/workspace/WorkspacePreview.tsx:11 is already reusable and should remain the preview implementation for both controllers.
- convex/links.ts:87 already persists ordered link arrays with labels, destinations, enabled state, and optional icons.
- convex/profiles.ts:140 already publishes the complete live profile after server-side validation.
- src/components/forms/ProfileEditor.tsx:570 already demonstrates live profile normalization, draft saving, preview projection, and publication mutation handling.

## File map

- Create: src/components/forms/LinksWorkspace.tsx — shared presentation and interaction surface matching the screenshot; no persistence or mode branching.
- Modify: src/components/forms/LinksEditor.tsx — retain demo/live controllers, move the demo markup into the shared component, and bring the live controller up to the shared contract.
- Create: tests/unit/links-workspace.test.tsx — isolated contract tests for the shared component’s accessible structure and callbacks.
- Modify: e2e/customer.spec.ts — verify the local-demo workspace and its preview/publication behavior.
- Modify: e2e/live.spec.ts — verify the live Convex workspace uses the same controls and persists/publishes correctly.
- Modify: e2e/accessibility.spec.ts — run axe against the shared links workspace.
- Do not modify: src/app/app/links/page.tsx, convex/schema.ts, or the Convex links schema unless implementation evidence shows an existing API cannot support the target behavior.

---

### Task 1: Extract the shared workspace and migrate local demo mode

**Files:**

- Create: src/components/forms/LinksWorkspace.tsx
- Modify: src/components/forms/LinksEditor.tsx:94-529
- Create: tests/unit/links-workspace.test.tsx

**Interfaces:**

- Consumes: normalized draft links, preview projection, validation state, publication state, and callbacks from either controller.
- Produces: LinksWorkspaceProps, the shared rendered workspace used by both DemoLinksEditor and LiveLinksEditorContent.

Use this prop contract so the view remains independent of the persistence source:

```tsx
export type LinksWorkspaceMessage = {
  tone: "success" | "error";
  text: string;
};

export type LinksWorkspaceProps = {
  profileUrl: string;
  links: ProfileLink[];
  theme: ProfileTheme;
  preview: PublicProfileProjection | null;
  validation: Record<string, string>;
  publicationErrors: string[];
  message: LinksWorkspaceMessage | null;
  previewMode: "phone" | "desktop";
  pendingAction: "save" | "publish" | null;
  isDirty: boolean;
  publicationLabel: string;
  onPreviewModeChange: (mode: "phone" | "desktop") => void;
  onUpdateLink: (id: string, patch: Partial<ProfileLink>) => void;
  onAddLink: () => void;
  onMoveLink: (id: string, direction: -1 | 1) => void;
  onRemoveLink: (id: string) => void;
  onSaveDraft: () => Promise<boolean>;
  onPublish: () => void | Promise<void>;
};
```

- [ ] **Step 1: Write the failing shared-view contract test.**

Create tests/unit/links-workspace.test.tsx with a live-shaped, persistence-free fixture and assert the exact semantic surface needed in both modes:

```tsx
it("renders the shared links table, preview, and action callbacks", async () => {
  const user = userEvent.setup();
  const onAddLink = vi.fn();
  const onSaveDraft = vi.fn();

  render(
    <LinksWorkspace
      profileUrl="/mara-velasquez"
      links={[
        {
          id: "linkedin",
          label: "LinkedIn",
          destination: "https://www.linkedin.com/in/mara-velasquez",
          enabled: true,
          icon: "linkedin",
        },
      ]}
      theme="paper"
      preview={{
        id: "preview",
        slug: "mara-velasquez",
        name: "Mara Velasquez",
        theme: "paper",
        links: [],
      }}
      validation={{}}
      publicationErrors={[]}
      message={null}
      previewMode="phone"
      pendingAction={null}
      isDirty={true}
      publicationLabel="Publish changes"
      onPreviewModeChange={vi.fn()}
      onUpdateLink={vi.fn()}
      onAddLink={onAddLink}
      onMoveLink={vi.fn()}
      onRemoveLink={vi.fn()}
      onSaveDraft={onSaveDraft}
      onPublish={vi.fn()}
    />,
  );

  expect(screen.getByRole("heading", { name: "Your links" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Add link" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Label for LinkedIn" })).toHaveValue("LinkedIn");
  expect(screen.getByRole("region", { name: "Live profile preview" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "Add link" }));
  expect(onAddLink).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the missing shared component.**

Run:

```bash
npm test -- tests/unit/links-workspace.test.tsx
```

Expected result before implementation: Vitest fails because LinksWorkspace does not exist yet.

- [ ] **Step 3: Extract the presentation into LinksWorkspace.tsx.**

Move the current redesigned demo markup and its view-only constants (iconOptions, linkIconMap) into the new component. Keep the existing table structure, WorkspacePreview, fixed footer, notices, row action menu, labels, aria-* attributes, and responsive Tailwind classes. Replace direct state mutations with the callbacks from LinksWorkspaceProps:

```tsx
<LinksWorkspace
  profileUrl={"/" + profile.draft.slug}
  links={links}
  theme={theme}
  preview={preview}
  validation={validation}
  publicationErrors={publicationErrors}
  message={message}
  previewMode={previewMode}
  pendingAction={pendingAction}
  isDirty={isDirty}
  publicationLabel={publicationLabel}
  onPreviewModeChange={setPreviewMode}
  onUpdateLink={updateLink}
  onAddLink={addLink}
  onMoveLink={moveLink}
  onRemoveLink={removeLink}
  onSaveDraft={saveDraft}
  onPublish={publish}
/>
```

The component must not call useDemoState, useQuery, useMutation, isLocalDemoMode, or any persistence function. It may render WorkspacePreview, Button, Notice, and Phosphor icons.

- [ ] **Step 4: Make DemoLinksEditor a controller for the shared view.**

Keep the existing demo state, validation, publication projection, save retry behavior, and demo-store updates in LinksEditor.tsx. Add a pendingAction state with the exact type `"save" | "publish" | null`; set it before each asynchronous or synchronous persistence operation and clear it in a finally block so the shared footer can disable the active action. Pass those values and callbacks to LinksWorkspace. Change only the rendering boundary; local demo data must continue to show the Mara fixture and persist through local storage.

- [ ] **Step 5: Run the shared unit test and local-demo browser tests.**

Run serially:

```bash
npm test -- tests/unit/links-workspace.test.tsx
npm run test:e2e:demo -- --workers=1
```

Expected result: the focused test passes, the existing demo draft/publication flow remains green, and the browser shows the attached table-plus-preview design.

- [ ] **Step 6: Commit the independently working extraction.**

```bash
git add src/components/forms/LinksWorkspace.tsx src/components/forms/LinksEditor.tsx tests/unit/links-workspace.test.tsx
git commit -m "refactor: share links workspace presentation"
```

### Task 2: Bring the live Convex controller onto the shared contract

**Files:**

- Modify: src/components/forms/LinksEditor.tsx:531-706
- Modify: e2e/live.spec.ts:75-93

**Interfaces:**

- Consumes: api.profiles.mine, api.links.replaceDraft, api.profiles.publish, the existing live save retry loop, and the LinksWorkspaceProps contract from Task 1.
- Produces: live-mode controller state that renders LinksWorkspace with real Convex data and supports draft save plus publication.

- [ ] **Step 1: Add the live acceptance assertions before changing the controller.**

In the existing live customer flow, after the two links have been filled and before saving them, add assertions that are absent from the current live form:

```ts
await expect(page.getByRole("region", { name: "Live profile preview" })).toBeVisible();
await expect(page.getByRole("button", { name: "phone" })).toHaveAttribute("aria-pressed", "true");
await expect(page.getByRole("button", { name: /^Publish/ })).toBeVisible();
```

Replace selectors that depend on the old Label for link N wording with stable ID locators, because the shared view names fields after their current label:

```ts
const labels = page.locator('input[id$="-label"]');
const destinations = page.locator('input[id$="-destination"]');
```

- [ ] **Step 2: Run the guarded live test and record the pre-change failure or preflight result.**

Run:

```bash
npm run test:e2e:live
```

With a configured non-production live target, the new assertions must fail against the old live editor because it has no preview or publish control. If live preflight reports missing TAPIT_LIVE_* configuration, stop at that guard and do not run direct Playwright against a live deployment; the demo and component tests still provide the local test cycle.

- [ ] **Step 3: Normalize live profile data for the shared view.**

Follow the conversion already used by LiveProfileEditorContent:

```tsx
const currentDraft: ProfileContent = {
  ...liveProfile.draft,
  links: liveProfile.draft.links.map((link) => ({
    ...link,
    icon: link.icon as LinkIcon,
  })),
};

const publishedForValidation = liveProfile.published
  ? {
      ...liveProfile.published,
      links: liveProfile.published.links.map((link) => ({
        ...link,
        icon: link.icon as LinkIcon,
      })),
      publishedAt: new Date(liveProfile.published.publishedAt).toISOString(),
    }
  : null;
```

Derive theme, link validation, publication errors, hasChangesSincePublish, publicationLabel, isDirty, and a preview from the current draft. The preview must project the draft so unsaved link edits appear immediately, while PublicProfile continues to filter disabled links from the visible profile.

- [ ] **Step 4: Add live link actions without moving persistence into the view.**

Keep the current revision counter and retry loop for api.links.replaceDraft. Add controller callbacks for:

- onUpdateLink: update the normalized draft link by ID and clear the message.
- onAddLink: append an enabled empty link unless the 100-link limit is reached.
- onMoveLink: swap adjacent array entries; the array order is the persisted position order.
- onRemoveLink: remove the selected link from the draft array.
- onSaveDraft: call api.links.replaceDraft({ profileId: liveProfile._id, links: latestDraft.links }) and preserve the existing concurrent-edit retry behavior.
- onPublish: validate locally, save dirty links if necessary, then call api.profiles.publish({ profileId: liveProfile._id }); retain the existing server error message and publication semantics.

The publish sequence must save the current links before publishing because api.profiles.publish publishes the server-side draft. Keep useDraftSaveRegistration pointed at the same save function so navigation still protects unsaved link changes.

- [ ] **Step 5: Render the live controller through LinksWorkspace.**

Keep the existing profile === undefined loading state and profile === null missing-profile error. Replace only the old live JSX with the shared component, passing profileUrl={"/" + currentDraft.slug}, the normalized draft links, preview, theme, validation, message, pending action, and callbacks.

- [ ] **Step 6: Run live-focused checks when the guarded target is available.**

Run serially:

```bash
npm test -- tests/unit/links-workspace.test.tsx
npm run test:e2e:live
```

Expected result for a configured non-production target: the live customer sees the same table, preview, row actions, draft save, and publication controls; the created links are present on the published public profile. A missing live environment is a preflight condition, not a reason to bypass the guard.

- [ ] **Step 7: Commit live parity as a separate feature-sized change.**

```bash
git add src/components/forms/LinksEditor.tsx e2e/live.spec.ts
git commit -m "feat: align live links editor with workspace UI"
```

### Task 3: Prove cross-mode UI parity, accessibility, and responsive behavior

**Files:**

- Modify: e2e/customer.spec.ts:46-70
- Modify: e2e/accessibility.spec.ts:15-23
- Modify: tests/unit/links-workspace.test.tsx

**Interfaces:**

- Consumes: the shared LinksWorkspace contract and both controllers from Tasks 1 and 2.
- Produces: automated evidence that demo and live modes expose the same user-facing workspace contract.

- [ ] **Step 1: Extend the local-demo E2E contract.**

After navigating to /app/links in the customer test, assert the shared surface and preview controls:

```ts
await expect(page.getByRole("heading", { name: "Your links" })).toBeVisible();
await expect(page.getByRole("region", { name: "Live profile preview" })).toBeVisible();
await expect(page.getByRole("button", { name: "phone" })).toHaveAttribute("aria-pressed", "true");
await expect(page.getByRole("button", { name: "desktop" })).toBeVisible();
await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
```

Exercise at least one shared interaction in demo mode: add a link, edit its label and destination through input[id$="-label"] and input[id$="-destination"], disable it, open its actions menu, and verify the publish/save result. Retain the existing assertion that disabled Private note does not leak to the public profile.

- [ ] **Step 2: Add the links route to the customer accessibility check.**

After the existing customer login in e2e/accessibility.spec.ts, navigate to /app/links, wait for the Your links heading and preview region, and run the existing expectNoA11yViolations(page) helper. This catches missing labels, invalid button names, focus issues, and the preview’s responsive controls in the actual shared route.

- [ ] **Step 3: Add a responsive browser assertion.**

In the demo customer flow, set a mobile viewport before visiting /app/links and assert the stacked editor/preview remains usable:

```ts
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("/app/links");
await expect(page.getByRole("heading", { name: "Your links" })).toBeVisible();
await expect(page.getByRole("button", { name: "Add link" })).toBeVisible();
await expect(page.getByRole("region", { name: "Live profile preview" })).toBeVisible();
expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
```

- [ ] **Step 4: Add one unit assertion for the shared disabled/pending states.**

Extend tests/unit/links-workspace.test.tsx with a second render using pendingAction="save", isDirty=false, and a validation error. Assert that Save draft is disabled, the invalid row exposes aria-invalid="true", and the validation text is rendered below the row. This keeps the state contract independent of Convex and browser credentials.

- [ ] **Step 5: Run the full local verification sequence serially.**

Run:

```bash
npm test
npm run test:e2e:demo -- --workers=1
npm run verify
git diff --check
```

If the live target is configured, run npm run test:e2e:live separately after the local sequence. The final report must include the exact test counts and any guarded-live preflight status; do not treat local/demo success as live proof.

- [ ] **Step 6: Review the final diff and commit the acceptance coverage.**

```bash
git diff --stat HEAD~3..HEAD
git status --short --branch
git add e2e/customer.spec.ts e2e/accessibility.spec.ts tests/unit/links-workspace.test.tsx
git commit -m "test: verify shared links workspace parity"
```

The final status check must show only the saved plan file and the three pre-existing untracked files, plus no unintended generated or source changes.

## Completion checklist

- [ ] Demo, hosted demo, and live modes select different data controllers but the same LinksWorkspace markup.
- [ ] Live rows use real Convex data and save through api.links.replaceDraft; no demo storage is involved.
- [ ] Live publication uses api.profiles.publish after saving dirty links.
- [ ] Preview reflects the current draft in both modes and excludes disabled links.
- [ ] Add, edit, icon selection, enable/disable, reorder, delete, save, and publish behavior is covered.
- [ ] Desktop and mobile layouts match the attached screenshot’s structure without horizontal overflow.
- [ ] Unit, demo E2E, accessibility, build, lint, typecheck, and formatting checks pass; guarded live E2E is run when its explicit non-production contract is available.
- [ ] Existing unrelated untracked files remain untouched.
