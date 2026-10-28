# Specification: GitHub Issue #175

**Issue:** [#175 — Restore first-time customer navigation tour for the redesigned workspace](https://github.com/wehyn/tapit/issues/175)
**Status:** Approved
**Date:** 2026-10-28

## Context

[PR #135](https://github.com/wehyn/tapit/pull/135) introduced a first-visit customer navigation tour in the prior workspace shell. [PR #140](https://github.com/wehyn/tapit/pull/140) replaced that shell with the current desktop sidebar, mobile tab bar, and **More** sheet, and removed the tour. The Profile page now has a setup checklist, which remains useful but does not explain where workspace navigation leads.

In the current navigation, **Account** is inside the desktop account menu and the mobile **More** sheet. **Customize** and **Card** are in the mobile **More** sheet. **Analytics** is available only to customers with card-owner access. A new self-service customer may also see the **Before you publish** dialog on first entry to Profile.

On mobile, the Analytics destination is labeled **Stats** in the bottom tab bar.

## Goal

Help first-time customers find the core customer workspace destinations using a short, accessible tour that fits the current navigation on desktop and mobile.

## User behavior

1. An active customer who has not completed or skipped the tour in the current browser sees it when entering the customer workspace. The tour waits until the workspace is ready and any blocking first-visit dialog, including **Before you publish**, has closed.
2. The tour introduces the available destinations in this order: **Profile**, **Links**, **Customize**, **Card**, **Analytics** when available, and **Account**.
3. Each step spotlights its navigation target, briefly explains where it leads, and shows progress plus **Next** and **Skip tour** controls.
4. On desktop, steps spotlight sidebar links. The **Account** step opens the existing account menu so its target is visible.
5. On mobile, steps spotlight visible bottom-tab targets directly. For destinations in **More**, the sheet opens and stays open while those steps are introduced. The **Account** step uses that sheet.
6. **Next** advances one step. **Skip tour** or **Next** on the final step ends the tour and closes any menu opened for it.
7. Pressing Escape or closing the account menu / **More** sheet during a step ends the tour without leaving a spotlight on a hidden target. Focus returns to the menu opener.
8. After completion or skip, the customer can use the workspace normally and does not see the tour again in that browser. A different customer profile on the same browser gets its own first-visit tour.

## Requirements

- Show the tour only in the customer workspace for active customer accounts. Do not show it in the admin workspace, including when an administrator switches to the customer audience.
- Include the core customer destinations in the order listed above. Omit **Analytics** when the current account cannot access it. Do not include **Help**.
- Keep the displayed step count accurate when a destination is omitted.
- Use a dimmed backdrop, a visible spotlight around the current target, and a compact coach mark that does not cover the target or block the controls.
- Keep the tour controls keyboard accessible, preserve visible focus, and expose the current step and explanation to assistive technology.
- Preserve the existing account-menu and **More** sheet behavior, including their Escape handling, focus containment, and focus restoration when the tour is inactive.
- Persist completion per customer profile in browser-local storage. Reuse the prior `tapit:customer-navigation-tour:<profileId>` marker so customers who already completed or skipped the tour under PR #135 are not prompted again in that browser.
- If browser storage is unavailable, allow the customer to use and dismiss the tour without blocking workspace navigation.
- Keep the existing **Finish your profile** checklist unchanged and available independently of tour completion.
- Support both the local demo and Convex-backed customer workspace. The tour must not change authentication, profile data, or navigation destinations.

## Acceptance criteria

- A newly created customer sees the tour after entering the workspace, once any blocking first-visit dialog is dismissed.
- Existing customers with no completion marker also see the tour once; customers with a completion marker do not see it again in the same browser.
- A different customer profile receives its own tour even if another customer completed theirs in that browser.
- Every available core destination receives its own visible spotlight, explanation, and correct progress state on desktop and mobile.
- Desktop **Account** is visible during its step. On mobile, **More** is open before a secondary destination is spotlighted, stays open across consecutive **More** steps, and closes when the tour leaves that surface or ends.
- Accounts without card-owner access have no **Analytics** step and show the correct total number of steps.
- **Next**, final-step completion, **Skip tour**, Escape, and closing the active menu behave as described and leave focus in a usable location.
- Keyboard and assistive-technology users can identify the current destination and operate the tour. Normal navigation works after completion or dismissal.
- The Profile checklist continues to render according to profile completion, regardless of whether the tour has been completed.

## Out of scope

- Admin navigation tours or changes to admin navigation.
- A replay control for customers who already completed or skipped the tour.
- Changes to the Profile setup checklist or customer profile data.
- Introducing a server-side onboarding preference or synchronizing tour completion across browsers/devices.
- Changes to navigation labels, routes, access rules, or destinations.

## Verification notes

- In local demo mode, create a new customer through `/login?mode=signup`; dismiss **Before you publish** and confirm the tour starts on the Profile page.
- At desktop width, advance through all available destinations, including the Account menu, then reload and confirm the tour stays dismissed.
- At phone width, confirm Profile/Links/Analytics (labeled **Stats**) tab steps point to visible tabs and Customize/Card/Account steps open **More** with their target visible.
- Exercise **Next**, final-step completion, **Skip tour**, Escape, closing **More**, and closing the desktop account menu with a keyboard. Confirm focus restoration and visible focus.
- Repeat with an account without Analytics access and confirm the total adjusts.
- Confirm another customer profile on the same browser receives a tour, and an existing `done` marker prevents replay.
- Run the focused local-demo E2E coverage and the repo verification command before implementation is considered complete. Do not use Production for verification.

## Known limitation

Completion is browser-local. A customer may see the tour on another browser or device because the completion marker is not synchronized.
