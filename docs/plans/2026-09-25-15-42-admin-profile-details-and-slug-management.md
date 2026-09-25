# Admin Profile Details Popup and Slug Management Implementation Plan

> **For agentic workers:** Execute the checklist one task at a time and review each deliverable before continuing. Preserve unrelated worktree changes. Keep the shared Convex and UI contracts consistent across tasks.

**Goal:** Add a complete profile-details popup to `/admin/profiles`, allow only administrators to rename an existing profile slug, and keep public and card resolution consistent with the approved slug policy.

**Architecture:** Keep the profile registry on `/admin/profiles`; selecting a row loads an admin-only detail projection into the existing accessible dialog. Add a dedicated server-authorized slug mutation that atomically updates the current, draft, and published slugs and records an audit event. Keep customer draft saves unable to change the assigned slug, and implement equivalent behavior in local demo mode.

**Tech Stack:** Next.js 16.3.5 App Router, React 19.3.0, TypeScript 5.9.3, Convex 1.45.0, existing Tailwind UI components.

**Spec:** `docs/specs/2026-09-25-15-05-admin-profile-popup-details-and-admin-slug-design.md`; product rules in `docs/spec.md`, `docs/DESIGN.md`, and `docs/intent.md`.

## Global Constraints

- Only administrators may change an assigned slug after profile creation; enforce this on the server.
- A slug change normalizes and validates the new value, preserves uniqueness, updates current/draft/published slug fields atomically, and writes an audit event with actor, old slug, new slug, and time.
- Slug changes do not publish other draft fields or change profile status.
- The former direct URL receives no redirect or alias; its slug is available for reuse and may later resolve directly to a different profile.
- Active card URLs stay assigned to the same profile identity and continue resolving after a slug change.
- Keep unpublished values out of public projections. Keep auth secrets, card tokens, claim codes, and unrelated customer/card data out of the popup.
- Preserve the pre-existing uncommitted work in `src/components/admin/ProfilesManager.tsx` while extending its current dialog.
- Before coding, read the root repository instructions, `convex/_generated/ai/guidelines.md`, and the relevant installed Next.js guide under `node_modules/next/dist/docs/`.
- Do not add or run tests unless the user explicitly asks to test or verify the implementation.

---

## File Responsibilities

| File                                       | Responsibility in this change                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `convex/profiles.ts`                       | Admin-only full details query, dedicated slug-change mutation, and draft-save slug enforcement.                         |
| `convex/validators.ts`                     | Keep slug validation errors aligned with administrator-only changes; reuse syntax and reserved-word validation.         |
| `src/lib/domain/index.ts`                  | Keep customer-side draft/publication validation aligned with a slug locked after profile creation.                      |
| `src/components/forms/ProfileEditor.tsx`   | Show a saved profile's assigned slug as read-only in both demo and live customer editors.                               |
| `src/components/admin/ProfileDetails.tsx`  | New shared detail presentation for profile metadata, draft/published content, slug confirmation, and status timestamps. |
| `src/components/admin/ProfilesManager.tsx` | Connect detail data and slug changes to the existing registry dialog in demo and live modes.                            |
| `src/components/admin/AuditLog.tsx`        | Give the slug-change event a clear name and show the old/new slug as a profile-slug change.                             |

## Task 1: Add the protected admin profile details and slug APIs

**Files:**

- Modify `convex/profiles.ts`
- Modify `convex/validators.ts`

**Interfaces:**

- Add `api.profiles.adminDetails({ profileId })`, returning `{ profile, customerEmail, assignedCardCount, assignedCardCountIsCapped }`. `profile` is the existing profile document projected with draft and published image URLs; `customerEmail` is a string or `null`. Count assigned cards with a bounded query and set the cap flag when more than 1,000 are found.
- Add `api.profiles.changeSlug({ profileId, slug })`, returning `{ slug, updatedAt }`.
- Keep `api.profiles.adminList` unchanged so current admin list consumers retain their existing result shape.

- [ ] Add `adminDetails` using `requireAdministrator`, reject missing or out-of-scope profiles, fetch the owner email, count assigned cards with a 1,001-record cap, and use `projectOwnedProfile` for image previews.
- [ ] Add `changeSlug` using `requireAdministrator`; normalize the submitted slug; validate syntax and reserved names; check the `by_slug` index and allow a match only when it belongs to the same profile.
- [ ] Allow `changeSlug` for draft, published, unpublished, and suspended profiles; do not make it alter or depend on the current profile status.
- [ ] In the same mutation, patch `profiles.slug`, `draft.slug`, and `published.slug` when a published snapshot exists, set `updatedAt`, and leave all other fields and status unchanged.
- [ ] Insert one `profile.slug_changed` audit record with administrator user ID, owner account ID, profile ID, scope, occurrence time, old slug in `before`, and normalized new slug in `after`. Do not add an audit event for a normalized no-op.
- [ ] Change `saveDraft` to reject any submitted slug that differs from the profile's currently assigned slug, including for an administrator using the general draft-save path. Save other draft fields as before and keep root/draft slug values synchronized to the existing assignment.
- [ ] Keep the publish-time draft/published consistency check, but use an error that describes a mismatch rather than saying the slug is immutable after publication.
- [ ] Update the slug validator's administrator-only error wording so it no longer promises immutability only after publication.

**Acceptance observations:** Customers cannot bypass the slug lock by calling `saveDraft` directly. A successful admin mutation frees the old `by_slug` entry, updates all slug-bearing profile snapshots together, and cannot expose any other draft field publicly.

## Task 2: Lock the assigned slug in customer editing

**Files:**

- Modify `src/components/forms/ProfileEditor.tsx`
- Modify `src/lib/domain/index.ts`

**Interfaces:**

- Customer editor state continues to use `ProfileContent`; saved live profiles display `liveProfile.slug` and demo profiles display their current `profile.draft.slug`, without offering a slug edit.
- Signup/onboarding continues to choose its initial slug through its existing creation flow, outside the saved-profile editor.

- [ ] In both demo and live customer-editor branches, render the assigned slug as disabled/read-only for every already-created profile, including a draft with no published snapshot.
- [ ] Replace publication-based helper text with concise copy explaining that administrators control assigned-slug changes; continue to show the current public URL and copy action.
- [ ] Pass the current assigned slug into customer validation so client-side validation rejects accidental changes for both draft and published profiles.
- [ ] Update domain and validator messages that currently say a slug becomes immutable after publication; use the administrator-only policy wording.
- [ ] Leave signup slug validation and initial customer-selected slug behavior unchanged.

**Acceptance observations:** A customer can still choose a slug during signup. After creation, the editor does not offer a slug change in draft, published, unpublished, or suspended states, and ordinary content editing continues to work.

## Task 3: Build the complete admin details view

**Files:**

- Create `src/components/admin/ProfileDetails.tsx`

**Interfaces:**

- Export `AdminProfileDetailsView` with `currentSlug`, `draft: ProfileContent`, `published: PublishedProfileSnapshot | null`, `status: ProfileStatus`, `customerEmail: string | null`, `assignedCardCount`, `assignedCardCountIsCapped`, and formatted lifecycle timestamps (`createdAt`, `updatedAt`, `publishedAt`, `unpublishedAt`, `suspendedAt`; absent values are `null`).
- Export a presentational component that accepts the view plus controlled slug input, slug-save callback, submission state, and validation/success feedback.

- [ ] Render the customer email, assigned-card count (showing `1,000+` when capped), current slug/current URL, profile status, and all available lifecycle timestamps.
- [ ] Render the saved draft and published snapshot as separate labeled sections; show both when they differ and show that no published snapshot exists for an unpublished draft.
- [ ] Include image preview, name, bio, public email, phone, website, theme, redirect enabled state and destination, and every ordered link's label, destination, icon where present, and enabled state.
- [ ] Do not render storage IDs, card tokens, claim data, authentication details, or unrelated customer data.
- [ ] Add the admin slug field and a confirmation message that the old direct URL will stop resolving and the former slug may later open another profile. Keep other profile fields inspection-only in this shared detail component.
- [ ] Use semantic headings and definition lists, accessible labels and feedback, responsive wrapping, and existing design tokens.

**Acceptance observations:** Every profile content field in the approved spec is inspectable. Draft and published data remain clearly distinguished; the dialog provides no accidental path to publish draft content by changing its slug.

## Task 4: Wire demo and live registry behavior to the popup

**Files:**

- Modify `src/components/admin/ProfilesManager.tsx`
- Modify `src/components/admin/AuditLog.tsx`

**Interfaces:**

- Live mode uses `api.profiles.adminDetails` for the selected profile and `api.profiles.changeSlug` for the dedicated admin slug operation.
- Demo mode builds the same `AdminProfileDetailsView` from `DemoState`, its customer entry, profile and assigned cards.

- [ ] Keep the searchable registry and existing accessible `ProfileDialog`; preserve the current uncommitted dialog implementation and existing profile moderation/name/bio behavior.
- [ ] Resolve the selected demo profile from the full profile collection and load live details by selected profile ID independently of filtered registry results, so changing the slug or search text does not close the selected profile dialog.
- [ ] Keep a clear details-loading state while the live query is pending and an inline error state when administrator detail data cannot load.
- [ ] In live mode, keep a controlled slug draft, call `changeSlug` only from the slug form, refresh the selected detail, and show server validation or success feedback beside the field.
- [ ] In demo mode, validate against all other profiles' current/draft/published slugs; update the selected profile's draft slug and published slug when present, preserve status and content, and add a demo audit event recording old and new values.
- [ ] Show the same no-redirect/reuse warning in demo and live modes. Use current `profiles.slug` for the live current URL; use synchronized draft/published slug in demo mode.
- [ ] Derive the demo customer email and assigned-card summary without rendering any card token. Preserve image preview URLs and lifecycle timestamps where available.
- [ ] Update `AuditLog.tsx` so `profile.slug_changed` reads “Profile slug changed” and its before/after values are labeled “Profile slug.”
- [ ] Confirm existing public resolution already looks up current `profiles.slug`, while card resolution uses the assigned `profileId`; change those paths only if inspection finds they do not meet the approved behavior.

**Acceptance observations:** A rename takes effect immediately for the current direct URL; the old URL stops resolving until its slug is reused, then resolves to the new owner without redirect. Active card URLs continue to resolve their original profile by profile identity. Slug changes appear in admin audit history with old/new values.

## Completion Review

- [ ] Compare the implementation against every requirement in the approved design document, including all profile detail fields, profile states, role enforcement, auditing, old URL behavior, reuse, and card continuity.
- [ ] Confirm signup's initial slug choice remains intact and customer save/publish paths cannot change an assigned slug.
- [ ] Confirm the selected profile popup survives a slug rename and displays the refreshed slug and URL.
- [ ] Confirm no auth secret, card token, claim code, storage identifier, or unpublished content is added to public projections.
- [ ] Preserve unrelated changes in the worktree.

## Verification Boundary

No tests are added or run as part of this plan unless the user explicitly asks for testing or verification. Do not claim test or build success without running the requested verification and reviewing its output.
