# Account Unpublish Control Design

## Goal

Make the destructive publication action discoverable from the customer Account page while keeping publication status and readiness feedback on Profile.

## User experience

- The Profile page keeps the existing Publication panel, including status, draft/publish readiness, and success messaging.
- The Profile page no longer renders the `Unpublish` button.
- The Account page adds a focused “Publication” panel for customers whose profile is currently published.
- The Account panel explains that unpublishing makes the public profile unavailable, then exposes the existing `Unpublish` action.
- Unpublishing uses the existing demo state update or Convex `profiles.setStatus` mutation, so behavior and audit logging remain unchanged.
- Unpublished, draft, and suspended profiles do not receive an enabled unpublish action.

## Implementation boundaries

`ProfilePublicationPanel` becomes a status/readiness-only component. `AccountSettings` owns the account-page action and reads the current customer profile in both local demo and live modes. The existing event handlers are moved or reused without changing backend contracts.

## Verification

Run the focused profile editor tests, exercise the local demo Account flow in the browser, and run `npm run verify` before claiming completion.
