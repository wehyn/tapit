# Customer Utility Copy Clarity

Date: 2026-10-14
Status: Draft for review

## Goal

Make the current availability of card-design actions and the consequences of Account actions clear without adding card-ordering or support capabilities.

## Design

On Build card, state that customers can prepare a design now and custom ordering is not open yet. Keep the existing Canva and upload actions. Make the “coming soon” status refer specifically to ordering so it does not imply that design preparation is unavailable.

On Account, replace the Support card’s implementation-specific “intentionally generic in this local build” wording and repeated reassurance with one concise, accurate help sentence. Keep the existing support destination and whether it is available in each environment; do not invent a support address or add a new service.

Make the deletion request copy match the current behavior: confirming the request immediately makes the public profile unavailable and deactivates assigned cards; an administrator reviews the request before permanent removal. Keep the request button, confirmation dialog, audit behavior, and separate Unpublish control unchanged.

## Scope

- Customer routes: /app/account/build-card and /app/account.
- Customer-facing copy and page hierarchy only.

## Constraints

- Preserve the existing Canva destination, upload validation, file-size limits, and custom-ordering availability.
- Preserve account password changes, support link target, unpublish behavior, deletion request side effects, confirmation, and admin review.
- Keep deletion visually separated from routine settings.
- No fulfillment, payment, ordering, support-system, authentication, or account-erasure changes.

## Acceptance criteria

1. Build card copy clearly distinguishes available design preparation from unavailable custom ordering.
2. Canva and upload actions remain accessible and work as they do today.
3. Support copy appears once, contains no local-build implementation language, and keeps its current destination/availability.
4. The deletion request explains the immediate profile/card effects and that an administrator reviews it before permanent removal.
5. The Unpublish control stays separate from deletion and retains its existing confirmation and behavior.
6. Customer and accessibility flows remain usable at 390 and 1280 CSS pixels.

## Implementation boundary

This design changes copy and layout only. It does not open custom card orders, create a support service, or alter deletion semantics.
