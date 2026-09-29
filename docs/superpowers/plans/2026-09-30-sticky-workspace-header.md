# Sticky Workspace Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the mobile customer header visible during scrolling and give Account's Unpublish control a clear outlined button treatment.

**Architecture:** Update the shared authenticated mobile header in `SidebarNav` with CSS-only sticky positioning. Reuse the existing shared `Button` component's `secondary` variant for both demo and live Account settings, leaving behavior and responsive structure unchanged.

**Tech Stack:** Next.js App Router, React, Tailwind utility classes, Playwright, Vitest.

---

### Task 1: Make the mobile workspace header sticky

**Files:**

- Modify: `src/components/layout/SidebarNav.tsx`
- Test: `e2e/customer.spec.ts`

- [ ] **Step 1: Add the sticky positioning class**

Change the mobile `<header>` class from `flex min-h-16 ...` to include `sticky top-0 z-30`. Keep `bg-tapit-surface`, the bottom border, horizontal padding, and the `lg:hidden` breakpoint unchanged.

- [ ] **Step 2: Add a narrow-viewport E2E assertion**

In the existing customer workspace layout test, use the mobile viewport and inspect the header's computed position after scrolling. Assert its computed `position` is `sticky` and its `top` is `0px`, while the navigation drawer remains usable.

- [ ] **Step 3: Run the targeted E2E test**

Run `NEXT_PUBLIC_DEMO_MODE=true NEXT_PUBLIC_DEMO_STORAGE=local npx playwright test --project chromium --grep "customer sidebar stays grouped"`.

Expected: the test passes and the mobile workspace header retains its current navigation behavior.

### Task 2: Give Unpublish an explicit button boundary

**Files:**

- Modify: `src/components/forms/AccountSettings.tsx`

- [ ] **Step 1: Use the shared outlined button variant**

Change both Account `Unpublish` buttons from `variant="quiet"` to `variant="secondary"`. This applies the existing border, surface fill, accent hover border, and hover background without changing click handlers or copy.

- [ ] **Step 2: Run focused checks**

Run `npx vitest run tests/unit/profile-editor.test.tsx` and the targeted Account E2E flow. Expected: all tests pass and the action remains available only for published profiles.

### Task 3: Run full verification and review the diff

**Files:**

- No additional files.

- [ ] **Step 1: Run project verification**

Run `npm run verify`.

Expected: formatting, lint, typecheck, unit tests, and production build pass. Existing lint warnings may remain, but no new errors should appear.

- [ ] **Step 2: Check the final diff**

Run `git diff --check` and inspect the changed source and test files. Confirm the diff contains only the sticky header and outlined Unpublish styling changes.
