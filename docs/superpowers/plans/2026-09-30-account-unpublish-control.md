# Account Unpublish Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the customer-facing Unpublish control from Profile to Account while preserving the existing publication status UI and backend behavior.

**Architecture:** Keep `ProfilePublicationPanel` focused on publication status and readiness. Add the action to `AccountSettings` in both demo and live branches, using the same demo state transition and `api.profiles.setStatus` mutation already used by ProfileEditor. The Account page will own success/error feedback for the action.

**Tech Stack:** Next.js App Router, React client components, Convex mutations, local demo state, Vitest/Testing Library, Playwright.

---

### Task 1: Remove the action from the Profile publication status panel

**Files:**

- Modify: `src/components/forms/ProfilePublicationPanel.tsx`
- Modify: `src/components/forms/ProfileEditor.tsx`
- Test: `tests/unit/profile-editor.test.tsx`

- [ ] **Step 1: Update the publication panel contract**

Remove `onUnpublish` from `ProfilePublicationPanelProps`, its destructuring, and the conditional button block. Remove the `onUnpublish` prop at both ProfileEditor call sites. Keep the published status, readiness copy, and all validation behavior unchanged.

- [ ] **Step 2: Update the focused test expectation**

Change the existing published-profile test so it asserts the Profile editor no longer exposes a button named `Unpublish`, while retaining the published status assertions.

- [ ] **Step 3: Run the focused test**

Run `npx vitest run tests/unit/profile-editor.test.tsx`.

Expected: the test suite passes with the updated Profile behavior.

### Task 2: Add the Unpublish action to Account in demo mode

**Files:**

- Modify: `src/components/forms/AccountSettings.tsx`

- [ ] **Step 1: Add demo publication state and feedback**

In `DemoAccountSettings`, add local state for an unpublish success/error message. Reuse the existing `profile.status` and `updateDemoState` flow to set the profile status to `unpublished`, prepend the same `profile.unpublished` audit record, and show the existing success copy. Catch failures and show the existing error copy.

- [ ] **Step 2: Render the account publication section**

Add a `Panel` titled `Publication` after the Account identity panel and before password settings. Render it when the profile is published, with explanatory copy and a quiet `Unpublish` button. Render the message in a `Notice` with success/error tone. Do not render an enabled action for other profile states.

- [ ] **Step 3: Exercise the local demo flow**

Start the app with `NEXT_PUBLIC_DEMO_MODE=true npm run dev`, sign in to the demo customer, open `/app/account`, click `Unpublish`, and verify the success message appears. Refresh `/app/profile` and verify the Profile publication panel shows the unpublished state without an Unpublish button.

### Task 3: Add the Unpublish action to Account in live mode

**Files:**

- Modify: `src/components/forms/AccountSettings.tsx`
- Modify: `convex/profiles.ts`

- [ ] **Step 1: Add a customer-scoped Convex mutation**

Add a public `unpublishMine` mutation with empty args and a `{ status }` return validator. Derive the authenticated user with `requireUser`, load the customer through the `by_userId` index, require an active customer with an owned profile, verify the profile scope and owner, patch only the profile status/timestamp fields, and insert the `profile.unpublished` audit row using the customer's email as actor label. Reject missing or non-customer ownership before any write.

- [ ] **Step 2: Add live mutation state and handler**

In `LiveAccountSettings`, use `api.profiles.mine` to read the owned profile and `api.profiles.unpublishMine` for the action. Add a publication message state and call the mutation only when the live profile is published. Preserve the existing success and error copy.

- [ ] **Step 3: Render the live publication section**

Render the same Account `Publication` panel and quiet `Unpublish` button for the live published state, using the live publication message state. Keep the existing Account, Support, and Delete account sections unchanged.

- [ ] **Step 4: Run static checks**

Run `npm run lint` and `npm run typecheck`.

Expected: no lint or TypeScript errors.

### Task 4: Run project verification

**Files:**

- No additional files.

- [ ] **Step 1: Run the full verification command**

Run `npm run verify`.

Expected: formatting, lint, typecheck, unit tests, and production build all pass.

- [ ] **Step 2: Review the final diff**

Run `git diff --check` and inspect `git diff --stat` plus the changed source files. Confirm only the approved Account/Profile relocation and its required planning documents are present.
