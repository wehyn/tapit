# Admin Card Copy Link Design

**Issue:** [#163](https://github.com/wehyn/tapit/issues/163)

**Date:** 2026-10-27

**Status:** Superseded by the canonical URL contract approved for #192/#193

## Goal

Let an administrator copy the card's saved permanent URL from its details in one action, with clear feedback if clipboard access succeeds or fails.

## Behavior

- Add a **Copy link** action to the shared card details panel in the admin card registry.
- Make it available for every card state, including inactive and replaced cards. Those links continue to resolve to the card's unavailable state.
- Copy `card.cardUrl` exactly, including its canonical production origin and any permanent query string. Do not rebuild the link from the current app origin.
- On success, show a confirmation beside the action. If the Clipboard API is unavailable or rejects the write, show an error with the URL so the administrator can copy it manually.
- Keep the same behavior in local demo and Convex modes through the shared `CardDetail` component.

## Implementation shape

- Update `src/components/admin/CardsManager.tsx`; the existing `CardDetail` is shared by both admin runtime modes and receives the saved URL.
- Reuse the existing `Button`, `Notice`, and `Icon` components.
- Keep feedback local to the selected card's details. Clipboard failure must not be reported as success.
- No backend, schema, configuration, or data migration changes are required.

## Scope

Included: one copy action in card details, exact saved URL copying, all card states, success and failure feedback, and parity across local demo and Convex modes.

Excluded: registry-row copy controls, changes to public card resolution, editing stored card URLs, and any backend changes.

## Validation approach

Extend card-manager coverage to check that the action copies the exact saved canonical URL, including its query, and that clipboard success and failure produce the corresponding accessible feedback. Confirm the shared details behavior remains available for every card state. The later #192/#193 contract supersedes the original current-origin strategy described in the issue #163 plan.
