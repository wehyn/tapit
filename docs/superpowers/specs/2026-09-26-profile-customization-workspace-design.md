# Profile Customization Workspace

## Status

Approved design. This document defines the first implementation slice for moving visual profile customization into its own customer workspace route.

## Summary

Add a dedicated `/app/customize` workspace to the customer navigation. The existing `/app/profile` page will focus on profile content and publication, while `/app/customize` will focus on visual presentation. Both routes continue to edit the same profile draft, use the same live preview and draft-saving behavior, and publish the complete profile.

## Goals

- Make visual customization discoverable without placing it in the middle of profile-content editing.
- Keep profile details, content, and links in their existing workflows.
- Preserve the current demo/live data behavior, validation contract, preview behavior, and draft-saving safeguards.
- Give customization a focused desktop and mobile layout that can grow without another long mixed-purpose form.
- Keep the existing identity-color behavior, including allowing custom white identity text when a background image is active.

## Non-goals

- No database or Convex schema changes.
- No new visual customization capabilities beyond the controls already present.
- No move of profile name, bio/role, contact details, profile photo/logo, About/Services content, or Featured link into Customize.
- No change to the public profile appearance contract.
- No admin navigation changes.

## Navigation and page boundaries

Add a customer-sidebar item labeled **Customize**, linked to `/app/customize`. It uses the existing sidebar active-state and mobile-drawer behavior.

### `/app/profile`

The Profile workspace retains:

- Name, bio/role, email, phone, website, and stable slug.
- Profile photo or logo.
- Public URL and copy action.
- About/Services content.
- Featured link selection.
- Publication status, validation summary, save draft, publish, and unpublish actions.
- The live profile preview.

When a visual customization error blocks publication, Profile shows a concise warning with an **Open Customize** action instead of requiring the user to discover the error in a hidden or removed section.

### `/app/customize`

The Customize workspace retains:

- Warm Studio or legacy appearance selection.
- Accent, type scale, and link/button treatment.
- Name and bio/role identity colors.
- Background image, hero height, slideshow, autoplay, and related media controls.
- Content order.
- The live profile preview.
- Save draft and publish actions.

The page opens on the Overview category by default. Category changes are local page state; they do not create additional routes or change the public URL.

## Customize sub-navigation

The Customize workspace uses a focused internal sub-navigation with four categories:

1. **Overview** — Warm Studio preset, accent, type scale, and link/button treatment.
2. **Identity** — Name and bio/role colors.
3. **Media** — Background image, hero height, slideshow, autoplay, and image metadata/crop controls.
4. **Layout** — Links-first versus About/Services-first content order.

On desktop, the sub-navigation sits beside the active control panel and the preview remains sticky on the right. On mobile, it becomes a horizontally scrollable tab row above the active control panel and the preview moves below the controls.

Each category renders one focused control group. Category buttons expose their selected state accessibly, and categories with blocking validation errors show an error indicator. The global action bar remains available regardless of the selected category.

## Component and data architecture

Refactor the current profile editor into shared route-facing pieces rather than duplicating the live and demo workflows:

- A shared profile-workspace shell owns the heading, preview placement, action bar, draft status, and navigation-save registration.
- A details composition owns the Profile identity form, About/Services content, featured-link controls, and publication panel.
- A customization composition owns the four-category sub-navigation and the existing visual controls.
- The preview panel remains a shared component and receives the projected current draft.
- Demo mode continues to read and write through the demo store; live mode continues to use the Convex profile query and mutations.

The existing profile customization and media value types remain the source of truth. Route separation is a UI composition change, not a persistence-model change.

## Draft, save, and publish flow

1. A route loads the current profile from the live query or demo store.
2. The route initializes the same local draft shape currently used by the profile editor.
3. Editing details or customization updates the local draft and immediately updates the shared preview projection.
4. The existing `DraftSaveContext` registration saves dirty drafts before sidebar navigation or other registered navigation.
5. Explicit **Save draft** writes the complete draft using the existing live mutation or demo-store update.
6. **Publish** validates and publishes the complete profile, regardless of whether it was triggered from Profile or Customize.
7. Uploading or image-processing work keeps save/publish disabled until the operation is settled, matching current behavior.

The two routes do not need a cross-route client store because navigation already invokes the registered draft-save handler, and both routes reload the persisted draft after navigation.

## Validation and error behavior

The existing publication validator remains authoritative. UI errors are partitioned by the control category:

- Overview: preset, accent, type scale, and link-treatment errors.
- Identity: name and bio/role color errors.
- Media: profile-media validation and upload errors.
- Layout: content-order errors.

Customize displays the exact error in the relevant category and marks that category in the sub-navigation. Profile displays an aggregated customization warning with a link to `/app/customize` when those errors prevent publishing. Existing non-blocking Featured link guidance remains with the Featured link control on Profile.

The current contrast rule remains unchanged: custom white is rejected on plain Warm Studio surfaces and accepted when an active background image provides the integrated image surface. The editor passes the same background context into validation.

Legacy profiles retain the existing migration path. Customize opens on Overview with the **Use Warm Studio** action; visual categories that require Warm Studio remain unavailable until the user opts in. Choosing Warm Studio uses the existing default customization values.

## Accessibility and responsive behavior

- The sidebar item uses the existing `aria-current` behavior on desktop and mobile.
- The internal category controls expose a clear selected state and a programmatic relationship to the active panel.
- Error indicators are not color-only; they include accessible text or an associated summary.
- Existing focus handling for the mobile sidebar drawer remains unchanged.
- The preview remains visible on desktop and is placed after the controls on mobile.
- Existing keyboard access for buttons, fields, sliders, dialogs, and color pickers is preserved.

## Verification plan

Add or update tests for:

- Customer navigation rendering and active Customize state on desktop/mobile shells.
- `/app/profile` retaining details/content/publication controls while no longer rendering visual customization controls.
- `/app/customize` rendering the four categories and switching between them without losing draft values.
- Preview updates from customization changes on both routes.
- Draft auto-save when navigating between Profile and Customize in demo and live flows.
- Category-level validation indicators and the Profile-to-Customize error action.
- Legacy profiles and the Warm Studio opt-in state.
- Media upload/busy behavior and the white identity-color background exception.
- Existing full unit, integration, typecheck, build, formatting, and lint verification.

## Acceptance criteria

- A customer can reach Customize from the sidebar at `/app/customize`.
- Profile content editing no longer presents the visual customization editor inline.
- Customize presents only visual customization controls in the agreed four-category structure.
- Both routes show the same current draft in the live preview.
- Navigating between routes does not lose unsaved changes.
- Publishing from either route applies the complete validated profile.
- No schema or public-profile projection changes are required for the route split.
