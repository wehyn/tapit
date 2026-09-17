# Customer Workspace Draft Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make customer workspace navigation preserve drafts, improve profile guidance, mirror account email into new profile drafts, and accurately communicate publication state.

**Architecture:** Keep Convex as the source of truth for hosted/live drafts and keep local demo behavior parity through the existing local store. A customer-only draft-save coordinator will intercept workspace tab navigation, flush the mounted editor’s current valid draft before routing, and cancel navigation when saving fails. Publication labels will compare the current draft with the last published snapshot; saving a draft will never publish it.

**Tech Stack:** Next.js App Router, React 19, Convex Auth/Convex mutations, existing local demo store, TypeScript, Vitest, Playwright.

---

## Scope and invariants

- Anonymous visitors continue seeing `Sign in` linking to `/login`.
- Signed-in customers see `Profile` linking to `/app/profile`; signed-in administrators see `Dashboard` linking to `/admin/customers`.
- New account/profile creation initializes the profile contact email from the normalized account email. Later profile edits may intentionally use a different public contact email.
- Profile and link edits are saved as drafts before switching customer workspace tabs. Invalid drafts remain on the current page and show the existing validation error.
- `Save draft` never changes `profiles.status` or `profiles.published`.
- A profile is considered published/current only when its draft content equals its published snapshot apart from `publishedAt`.
- A published profile with changed draft content shows `Publish changes`; a published profile with no draft changes shows `Published` and disables that action.
- Existing production/live auth behavior, local demo behavior, card claiming, and public published projections remain intact.

## File map

- Create `src/components/layout/DraftSaveContext.tsx` for customer-only asynchronous draft-save registration.
- Modify `src/components/layout/AppShell.tsx` to await the registered save before customer tab navigation.
- Modify `src/components/layout/CustomerShell.tsx` to provide the coordinator around both demo and live customer workspaces.
- Modify `src/components/forms/ProfileEditor.tsx` and `src/components/forms/LinksEditor.tsx` to register their current save handlers and expose profile field hints.
- Modify `src/app/page.tsx` to split the landing-page account action into demo-aware and Convex-auth-aware client components.
- Modify `convex/customers.ts` and `src/lib/demo/store.ts` to initialize profile draft email from account email.
- Modify `src/lib/domain/index.ts` with one persistence-agnostic helper for comparing a draft to a published snapshot.
- Modify `tests/unit/domain.test.ts`, `tests/unit/demo-signup.test.ts`, and relevant auth/profile tests for deterministic behavior.
- Modify `e2e/signup.spec.ts`, `e2e/customer.spec.ts`, and `e2e/hosted-demo.spec.ts` for workspace navigation and publication-label coverage. Keep `e2e/live.spec.ts` selectors aligned where the shared UI changes.

### Task 1: Add publication-state comparison and account-email initialization

**Files:**

- Modify `src/lib/domain/index.ts` near `publishProfile`.
- Modify `convex/customers.ts` in `createCustomer` and `createSelfServiceAccount` profile inserts.
- Modify `src/lib/demo/store.ts` in `createDemoSelfServiceAccount`.
- Test `tests/unit/domain.test.ts`, `tests/unit/demo-signup.test.ts`, and `convex/integration/auth-ownership.test.ts`.

- [ ] Add a helper that removes only the published timestamp before comparing snapshots:

```ts
export function hasUnpublishedChanges(
  draft: ProfileContent,
  published: PublishedProfileSnapshot | null | undefined,
): boolean {
  if (published === null || published === undefined) return true;
  const { publishedAt: _publishedAt, ...publishedContent } = published;
  return JSON.stringify(draft) !== JSON.stringify(publishedContent);
}
```

- [ ] Initialize invited and self-service Convex profile drafts with the already-normalized `email` value:

```ts
draft: {
  ...emptyProfile(slug),
  email,
  ...(args.name !== undefined ? { name: args.name.trim() } : {}),
  ...(args.bio !== undefined ? { bio: args.bio } : {}),
  ...(args.theme !== undefined ? { theme: args.theme } : {}),
},
```

and:

```ts
draft: { name, slug, email, links: [] },
```

- [ ] Initialize local demo self-service profiles with `draft: { name, slug, email, links: [] }`.
- [ ] Add tests proving the email is copied at creation, `hasUnpublishedChanges` ignores `publishedAt`, detects changed content, and treats a never-published profile as changed.
- [ ] Run `npm test -- --run tests/unit/domain.test.ts tests/unit/demo-signup.test.ts convex/integration/auth-ownership.test.ts` and `npm run typecheck`.
- [ ] Run `npx convex dev --once` against the configured non-production development deployment.

### Task 2: Add the customer draft-save coordinator and navigation flush

**Files:**

- Create `src/components/layout/DraftSaveContext.tsx`.
- Modify `src/components/layout/AppShell.tsx`.
- Modify `src/components/layout/CustomerShell.tsx`.
- Test `tests/unit/draft-save-context.test.tsx` and the affected workspace E2E tests.

- [ ] Implement a single-handler context with this contract:

```ts
export type DraftSaveHandler = () => Promise<boolean>;

export function DraftSaveProvider({ children }: { children: React.ReactNode }): JSX.Element;
export function useDraftSaveRegistration(handler: DraftSaveHandler | null): void;
export function useDraftSave(): DraftSaveHandler;
```

The provider stores the latest handler in a ref. Registration must clean up only the handler that the registering editor supplied, so a stale unmount cannot clear a newer editor.

- [ ] Extend `AppShell` with an optional `beforeNavigate?: (href: string) => Promise<boolean>` prop and intercept only ordinary left-click navigation. Modified clicks, middle-clicks, external destinations, and already-prevented events must retain normal browser behavior.
- [ ] In `CustomerShell`, wrap the customer `AppShell` in `DraftSaveProvider` and pass a callback that runs the registered save handler before `router.push(href)`. If the handler returns `false`, keep the user on the current page.
- [ ] Do not wrap `AdminShell` in the provider and do not change admin navigation.
- [ ] Add a focused component test proving a successful save precedes route navigation and a failed save cancels navigation.
- [ ] Run `npm test -- --run tests/unit/draft-save-context.test.tsx` and the existing customer navigation tests.

### Task 3: Register profile and links save handlers and improve profile hints

**Files:**

- Modify `src/components/forms/ProfileEditor.tsx` in both `DemoProfileEditor` and `LiveProfileEditor`.
- Modify `src/components/forms/LinksEditor.tsx` in both `DemoLinksEditor` and `LiveLinksEditor`.

- [ ] Register each editor’s save handler with `useDraftSaveRegistration`. The handler must return `true` when there are no changes, persist the current draft through the existing demo store or Convex mutation when valid, return `true` after success, and return `false` after showing the existing error message.
- [ ] Keep the existing explicit `Save draft` buttons and reuse the same persistence functions; navigation saving must not introduce a second data model.
- [ ] For profile fields, add these user-facing hints while preserving existing IDs and validators:

```tsx
<Field id="profile-name" label="Name" placeholder="e.g. Alex Morgan" ... />
<TextareaField
  id="profile-bio"
  label="Bio or role"
  placeholder="e.g. Designer helping small teams"
  help="A short introduction people can scan quickly."
  ...
/>
<Field
  id="profile-email"
  label="Email"
  placeholder="you@example.com"
  help="This appears as a contact option on your published profile."
  ...
/>
<Field id="profile-phone" label="Phone" placeholder="+63 917 555 0184" ... />
<Field
  id="profile-website"
  label="Website"
  placeholder="https://yourwebsite.com"
  ...
/>
<Field
  id="profile-slug"
  label="Stable profile slug"
  placeholder="alex-morgan"
  help={slugLocked ? "The slug is immutable after first publication." : "Use lowercase letters, numbers, and hyphens."}
  ...
/>
```

- [ ] Apply the same hints to local demo and hosted/live profile branches.
- [ ] Add link-editor draft-save registration without changing the existing link validation rules.
- [ ] Run `npm run typecheck`, focused form tests, and `npm test -- --run`.

### Task 4: Make the landing-page account action authentication-aware

**Files:**

- Modify `src/app/page.tsx`.
- Test a new focused landing-navigation test or extend `e2e/smoke.spec.ts` and `e2e/customer.spec.ts`.

- [ ] Keep `HomePage` as a client component and split the header action into mode-specific components so hooks are never called outside their provider:

```tsx
function AccountLink() {
  return isLocalDemoMode() ? <DemoAccountLink /> : <LiveAccountLink />;
}
```

- [ ] `DemoAccountLink` uses `useDemoSession`; anonymous users see `Sign in` → `/login`, customers see `Profile` → `/app/profile`, and admins see `Dashboard` → `/admin/customers`.
- [ ] `LiveAccountLink` uses `useConvexAuth` and `api.admin.currentAccess` with the existing `isAuthenticated ? {} : "skip"` pattern. While auth is loading, render the anonymous-safe `Sign in` label. Authenticated customers see `Profile`; administrators see `Dashboard`.
- [ ] Replace only the header’s current `Sign in` link. Keep the landing-page create-profile CTA unchanged.
- [ ] Run `npm run typecheck` and the landing/customer navigation tests.

### Task 5: Add publication labels without changing draft/publication semantics

**Files:**

- Modify `src/components/forms/ProfileEditor.tsx` in both profile editor branches.
- Modify `src/components/forms/LinksEditor.tsx` only where the shared publication status/action is displayed.
- Test `tests/unit/domain.test.ts` and relevant E2E flows.

- [ ] Compute `hasChangesSincePublish` with `hasUnpublishedChanges(currentDraft, profile.published)` rather than using local `isDirty`. Keep `isDirty` for the separate “local unsaved changes” indicator.
- [ ] Use this action-label rule:

```ts
const publicationLabel =
  profile.status === "published" && !hasChangesSincePublish
    ? "Published"
    : profile.status === "published"
      ? "Publish changes"
      : "Publish";
```

- [ ] When the label is `Published`, disable the action. When it is `Publish changes` or `Publish`, preserve current validation and publish handlers.
- [ ] Keep `Save draft` text and behavior unchanged. A saved draft may leave `profile.status === "published"` while the public projection still serves the previous snapshot.
- [ ] Update status copy to distinguish `Draft saved`, `Unsaved draft changes`, and `Changes ready to publish`.
- [ ] Update E2E selectors that currently require exact `Publish` after a profile has already been published.
- [ ] Run `npm test -- --run`, `npm run typecheck`, and the focused E2E project.

### Task 6: Verify the integrated workspace before the separate live E2E run

**Files:**

- Modify `e2e/signup.spec.ts`.
- Modify `e2e/customer.spec.ts`.
- Modify `e2e/hosted-demo.spec.ts`.
- Modify `e2e/live.spec.ts` only for shared-label selector updates.
- Modify `docs/live-e2e.md` only if the final command or environment separation needs clarification.

- [ ] Add coverage for profile edits, switching to Links without clicking Save, returning to Profile, and seeing the draft value preserved.
- [ ] Add coverage for link edits, switching to Analytics/Account, returning to Links, and seeing the link draft preserved.
- [ ] Add coverage that saving a draft after publication does not change the public profile until `Publish changes` is clicked.
- [ ] Add coverage that the initial account email appears in the profile email field after self-service signup.
- [ ] Run local deterministic E2E with `npm run test:e2e:demo`.
- [ ] Run the complete regression suite with `npm run verify`; report any pre-existing repository-wide formatting warnings separately from changed-file failures.
- [ ] For Convex-backed E2E, configure a separate `dev:<deployment>` or `preview/<branch>` deployment, keep its `NEXT_PUBLIC_CONVEX_URL` matched, satisfy the existing live preflight contract, and run only `npm run test:e2e:live`. Do not reset or seed the shared personal hosted-demo deployment.

### Task 7: Final review and handoff

- [ ] Dispatch an independent reviewer for navigation races, draft privacy/publication behavior, hydration, auth-provider boundaries, and test coverage.
- [ ] Resolve every material review finding and rerun typecheck, tests, lint, and the Convex deployment check.
- [ ] Document the final behavior in the changelog or workspace documentation without recording credentials, deployment secrets, or customer data.
- [ ] Commit the implementation only after the separate E2E deployment has been identified and the local verification evidence is recorded.

## Self-review checklist

- The plan covers all five requested changes: signed-in home navigation, profile hints, email mirroring, draft persistence across workspace tabs, and publication labels.
- The plan preserves the approved explicit draft → publish lifecycle and does not treat `Save draft` as publication.
- The plan accounts for local demo, hosted Convex demo, and production/live authentication differences.
- The plan keeps E2E data isolated from the user’s shared hosted-demo deployment.
- No task requires editing generated Convex bindings by hand.
