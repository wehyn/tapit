# Sticky Workspace Header Design

## Goal

Keep the mobile customer workspace header visible while the user scrolls, and make the Account page's destructive publication action read clearly as an actionable button.

## User experience

- The authenticated mobile workspace header remains in normal document flow but sticks to the viewport's top edge during vertical scrolling.
- The header keeps its existing surface background, bottom border, menu behavior, focus behavior, and responsive breakpoint. The desktop sidebar is unchanged because it is already fixed.
- Both demo and live Account pages render `Unpublish` with the shared outlined button treatment (`secondary`) so the control has a clear boundary and hover affordance.

## Implementation boundaries

Only the shared mobile header class in `SidebarNav` and the two Account `Unpublish` button variants change. No navigation structure, drawer behavior, or publication logic changes.

## Verification

Run the customer unit tests, the targeted demo E2E flow, and `npm run verify`. Confirm the header stays visible on a narrow viewport and the Account control has the outlined button styling.
