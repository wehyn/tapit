# Admin Profile Details Popup and Slug Changes

## Status

Core conversation design approved. Written-spec review pending. Slug reuse after a rename is recorded as an open policy question. Implementation has not started.

## Purpose

Keep the searchable profile registry on `/admin/profiles`, open a profile popup when an administrator selects a registry row, and make the popup useful for reviewing the complete customer profile. Give administrators a safe way to change a profile slug, including after publication, while preventing normal customers from changing an assigned slug.

## Goals

- Show all customer profile content in the administrator popup without adding a separate navigation page.
- Preserve the draft and published versions as distinct views of profile content.
- Let an administrator change the slug before or after publication.
- Enforce administrator-only slug changes on the server.
- Ensure the old direct URL stops resolving after a rename without redirecting.
- Keep existing card URLs assigned to the profile working after a slug change.
- Record slug changes in the audit log.

## Non-goals and scope boundary

- Do not expand the popup into full customer-account management or a complete card-details screen. Show the customer email and assigned-card summary as profile context, but do not show authentication secrets, card tokens, claim codes, or unrelated account/card data.
- Do not make every profile field editable from this popup. Keep existing administrator name/bio editing and profile moderation/publication actions; add slug editing. Other profile fields are for inspection in this view.
- Do not create redirects or aliases from former profile URLs.
- Do not change the rule that customer content edits require explicit publication.

## Administrator Profiles experience

The searchable registry remains visible on `/admin/profiles`. Selecting a row opens an accessible popup with a close control, Escape support, focus management, and a scrollable body.

The popup shows:

- Profile name and current slug.
- Customer email and assigned-card summary where available.
- Profile status and its available lifecycle timestamps: created, updated, published, unpublished, and suspended.
- The saved draft values and the published snapshot when one exists.
- Image preview, bio, public email, phone, website, theme, redirect settings, and ordered links, including whether each link is enabled.

When a field differs between the saved draft and published snapshot, both values remain visible and are labeled clearly. The admin can inspect unpublished content without making it public.

The slug control is editable to an administrator and displays the current public URL. Before applying a change, it explains that the former direct URL will stop resolving. Existing moderation and publication actions remain available.

## Slug policy

- Self-service customers may choose an initial slug during signup. Administrators assign initial slugs for invited profiles.
- After profile creation, a normal customer cannot change the slug, including while the profile is an unpublished draft.
- Only an administrator may change an existing slug. The server must reject customer attempts even if they bypass or modify the UI.
- A valid administrator change takes effect immediately, whether the profile is draft, published, unpublished, or suspended. It does not publish other draft changes or alter the profile status.
- The current slug, draft slug, and published snapshot slug are updated together when a published snapshot exists.
- The former URL receives no redirect or alias and resolves to the existing missing/unavailable-profile state.
- An active card URL remains assigned by profile identity and continues resolving to that profile using its current slug.

## Authorization, validation, and audit

The administrator Profiles registry and detail data remain administrator-only and scope-checked. Draft and unpublished values must never be added to a public projection.

Slug editing uses a dedicated administrator-only mutation rather than relying on a UI-disabled field or general profile draft save. The mutation normalizes the slug, validates syntax and reserved words, checks current slugs for uniqueness, updates the profile atomically, and writes an audit event containing actor, profile, old slug, new slug, and timestamp. If retired slugs are reserved, the mutation and all slug-allocation paths must check that registry too. Failed validation leaves the profile and audit history unchanged.

Normal customer profile saves reject any change to the assigned slug, regardless of publication state. The customer Profile editor presents the slug as read-only after profile creation. Initial signup continues to accept a customer-selected slug.

### Open policy question: reuse of retired slugs

The approved behavior is that the old direct URL stops resolving immediately after an administrator changes a slug and no redirect is created. The prior slug could later be reused for a different customer, which would make that address resolve again. Recommended default: keep retired slugs reserved to avoid stale links opening another person’s profile. This reservation behavior is not included in `docs/spec.md` until the user confirms it.

## Public routing effects

Public profile lookup uses current slugs only. After an administrator changes a slug, requests to the former slug receive the missing/unavailable result; they are not redirected. Active card routes continue to look up the assigned profile and display its current published profile at the current slug. No customer draft content becomes public as a result of changing the slug.

## Documentation changes

- Update `docs/spec.md` with the customer/admin slug permissions, no-redirect behavior, popup detail requirements, and acceptance criteria.
- Align `docs/DESIGN.md` and `docs/intent.md` with the same behavior.
- Revise the prior administrator-personal-profile design note so it follows the global admin-only slug policy.
- Reconcile the implementation details in `docs/plan.md` after the written spec is reviewed and approved.

## Implementation review gates

Before coding, review this written design and the updated product documents. The subsequent implementation plan must cover the chosen retired-slug policy, server-side role enforcement, popup projection and layout, audit recording, old direct URL behavior, and card URL continuity. Implementation and verification remain a later step.
