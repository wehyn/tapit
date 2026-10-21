# Admin navigation tour replay

**Issue:** [#136 — Add an admin console command to replay the navigation tour](https://github.com/wehyn/tapit/issues/136)  
**Status:** Approved for spec review  
**Date:** 2026-10-21

## Goal

Let an administrator replay the existing customer workspace navigation tour from the browser console, including after the normal first-visit tour has already been dismissed.

## Design

Expose `window.tapitStartNavigationTour()` from the existing `SidebarNav` only when an admin is viewing the customer workspace. The command restarts the tour at step one and relies on the existing tour state for desktop positioning and mobile drawer behavior. It does not clear or reset first-visit state. Remove the global command when the eligible navigation unmounts.

Pass the eligibility from `CustomerShell`, which already has the account role in both live and demo modes. Customer sessions and the separate admin workspace do not register the command. No backend or data model changes are needed because the command only changes client-side tour state.

## Behavior and failure handling

- Admins can invoke the command in the customer workspace even when the automatic first-visit tour would not run.
- The command is absent for customer sessions.
- If no tour steps are available, the command does nothing.
- Starting the tour does not write or clear the completion marker; the existing Skip and completion controls retain their current behavior.
- The normal first-visit trigger, tour content, accessibility behavior, and mobile close/focus handling remain unchanged.

## Verification

Confirm that an admin can replay from the first step after the completion marker is set, including on mobile; a customer session has no command; and the existing first-visit, skip, completion, and drawer behavior still work. The implementation should use the tour merged in PR #135.

## Scope

Only the admin console entry point and the role wiring needed to expose it are included. A separate admin navigation tour, production-facing UI control, query parameter, and changes to tour copy or persistence are out of scope.
