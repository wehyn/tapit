# Specification: GitHub Issue #105

**Issue:** [#105 — Improve the first-time user experience across the profile flow](https://github.com/wehyn/tapit/issues/105)
**Status:** Approved
**Date:** 2026-10-20

## Goal

Help first-time customers understand the profile workspace navigation with a short guided tour that spotlights one navigation item at a time.

## User behavior

1. A first-time customer enters the customer workspace and is shown the navigation tour.
2. The rest of the page is dimmed while a spotlight highlights the current navigation item.
3. A coach mark briefly explains the item and shows tour progress, **Next**, and **Skip tour** controls.
4. **Next** advances to the following item. **Skip tour** ends the tour and returns the customer to the workspace.
5. On mobile, the navigation drawer opens before the first navigation step and stays open while those items are introduced so the highlighted target remains visible.
6. **Next** on the last item, **Skip tour**, closing the drawer, or pressing Escape ends the tour. On mobile, the drawer closes and focus returns to its opener.

## Requirements

- Cover the customer workspace navigation items in order: **Profile**, **Customize**, **Links**, **Build card**, **Analytics**, and **Account**.
- Introduce one item per step with its label and concise, plain-language guidance about where it leads.
- Use a dimmed backdrop, a visible spotlight around the current item, and a compact coach-mark popover anchored beside the target.
- Show the current step and total tour progress, with keyboard-accessible **Next** and **Skip tour** controls.
- On mobile, open the existing collapsed navigation before the first navigation coach mark appears. Keep the drawer open through the navigation steps and keep each target visible.
- If the drawer is closed or Escape is pressed during a mobile navigation step, end the tour with the drawer so no coach mark points to a hidden target.
- Preserve the navigation drawer’s modal focus handling, Escape and close behavior, visible keyboard focus, and focus restoration.
- Make the coach-mark text, current step, and controls understandable to assistive technology; do not use color alone to identify the highlighted item.
- Keep normal navigation usable after the tour ends or is skipped.

## Acceptance criteria

- A first-time customer is shown the tour in the customer workspace.
- Each of the six customer navigation items receives its own spotlight step, short explanation, and progress indication.
- **Next** advances one item at a time; **Skip tour** exits the tour.
- On mobile, the drawer is open before its navigation items are spotlighted and remains open while those steps are visible.
- Closing the drawer or pressing Escape during a mobile navigation step exits the tour cleanly, without leaving a coach mark on a hidden target.
- Completing or skipping the tour on mobile closes the drawer and restores focus to the navigation opener.
- Tour controls and step information are usable with a keyboard and exposed accessibly to assistive technology.
- The tour works at desktop and mobile viewport sizes without obscuring the active target or preventing normal navigation afterward.

## Out of scope

- Admin-only navigation or admin workspace tours.
- Changes to navigation labels, routes, or destinations.
- Guidance for profile editing, publishing, homepage calls to action, or other onboarding gaps tracked separately.
- Changes to profile data or the existing navigation destinations.

## Verification notes

- At desktop width, advance through all six customer navigation items and confirm each spotlight, explanation, and progress state.
- At mobile width, confirm the drawer opens before the first navigation step, stays open for the tour steps, and closes with focus restored after the final **Next**, **Skip tour**, drawer close, or Escape.
- Verify **Next**, **Skip tour**, drawer close, and Escape behavior with a keyboard; check that focus remains visible and step information is announced to assistive technology.
- Confirm the tour can be dismissed without blocking access to the existing workspace navigation.
