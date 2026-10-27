# Admin Card Copy Link Design

**Issue:** [#163](https://github.com/wehyn/tapit/issues/163)

**Date:** 2026-10-27

**Status:** Approved in conversation

## Goal

Let an administrator copy a card's public `/c/<token>` URL from its details in one action, using the current app origin and receiving clear feedback if clipboard access succeeds or fails.

## Behavior

- Add a **Copy link** action to the shared card details panel in the admin card registry.
- Make it available for every card state, including inactive and replaced cards. Those links continue to resolve to the card's unavailable state.
- Build the copied URL from `window.location.origin` and the card token, using the existing `cardUrlFromToken` helper. Do not use a stored origin, which may belong to another environment.
- On success, show a confirmation beside the action. If the Clipboard API is unavailable or rejects the write, show an error with the URL so the administrator can copy it manually.
- Keep the same behavior in local demo and Convex modes through the shared `CardDetail` component.

## Implementation shape

- Update `src/components/admin/CardsManager.tsx`; the existing `CardDetail` is shared by both admin runtime modes and already receives the token.
- Reuse `cardUrlFromToken(token)` and the existing `Button`, `Notice`, and `Icon` components.
- Keep feedback local to the selected card's details. Clipboard failure must not be reported as success.
- No backend, schema, configuration, or data migration changes are required.

## Scope

Included: one copy action in card details, current-origin URL construction, all card states, success and failure feedback, and parity across local demo and Convex modes.

Excluded: registry-row copy controls, changes to public card resolution, editing stored card URLs, and any backend changes.

## Validation approach

Extend the existing card-manager unit coverage to check that the action copies `/c/<token>` on the current origin even when a card's stored URL has a different origin, and that clipboard success and failure produce the corresponding accessible feedback. Confirm the shared details behavior remains available for every card state. Automated test execution is not part of this design approval.
