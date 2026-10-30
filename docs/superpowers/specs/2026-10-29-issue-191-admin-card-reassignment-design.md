# Issue #191: Admin Card Reassignment Design

**Issue:** [#191 — Let admins reassign a misattached card without replacing it](https://github.com/wehyn/tapit/issues/191)

**Related issues:** [#190 — Buyer card claiming and correction requests](https://github.com/wehyn/tapit/issues/190), [#195 — Multiple cards per profile](https://github.com/wehyn/tapit/issues/195)

**Date:** 2026-10-29

**Status:** Draft for review

## Goal

Let an administrator correct a card-to-profile assignment in `/admin/cards` while keeping the same physical card, NFC/QR URL, and token. If the card was already claimed, the reassignment must also remove access that came from that card's claim so the correct profile owner can claim it with a fresh code.

## Problem and terminology

A card can be assigned to the wrong profile either before or after its recipient claims it. Before a claim, the card URL opens the wrong profile. After a claim, the wrong account may also have card-derived access associated with that card.

Reassignment changes which profile the card points to. It does not delete either profile or account. If the former profile has no other assigned cards, it becomes cardless. Access the former owner has through another card or a separate grant remains unaffected.

**Card-derived access** means access associated with claiming this particular card. It does not describe the public features a visitor sees when scanning the card.

## Behavior

### Admin reassignment

- Administrators can reassign cards in the existing `/admin/cards` workflow when the card is active or claimable.
- The administrator selects the destination profile. The confirmation step clearly identifies both the current profile and destination profile, using recognizable profile details such as display name and slug.
- Reassignment is allowed when the destination profile already has another active or claimable card, as required by #195.
- Reassignment changes the profile assignment in place. It preserves the card record, token, NFC/QR URL, and independent status. Inactive or replaced cards remain ineligible for reassignment.
- The existing public card-resolution rules continue to apply. The same URL resolves through the new assignment to the destination profile's current public page when that profile is available.

### Claim and access transition

- Reassignment invalidates every previous claim code and pending claim challenge for the card. It also removes a completed claim's card-derived access from the former owner.
- After reassignment, the destination profile owner must claim the card using a fresh one-time code issued through the card-claim flow in #190. The card remains claimable until that claim is completed.
- The former profile owner loses access derived from this card. Other cards assigned to the former profile and separately granted owner access continue to work.
- A cardless former profile remains intact. Reassignment does not delete it, change its account owner, or grant the destination owner access to it.

### Audit and authorization

- Only an administrator can perform the reassignment. The authorization check must run on the server, not rely on the admin UI alone.
- The audit log records the card, old profile assignment, new profile assignment, administrator, and time of the change.
- Claim codes are not included in audit details.
- Treat the assignment, claim invalidation, access revocation, and audit record as one logical operation. If the operation fails, it must not leave the card assigned to the new profile while old claim-derived access remains active.

## Scope boundaries

Included: administrator-initiated correction of an active or claimable card; preservation of its physical URL and token; confirmation of old and new profiles; claim invalidation and fresh claim; removal of card-derived access from the former owner; audit history; and parity between local demo and Convex modes.

Excluded: recipient-submitted correction requests and the neutral pause page in #190; replacement or deactivation of cards; reassignment of inactive or replaced cards; profile or account deletion; account transfer; and changes to public card-resolution rules beyond honoring the new assignment.

## Local demo and Convex

Both modes must produce the same assignment, claim, and access results. Local demo behavior must remain deterministic. Convex mutations must authorize the administrator and enforce card eligibility on the server. A failed reassignment must leave the prior assignment and claim state usable.

## Error handling

- Reject a request if the card is missing, is no longer active or claimable, or the destination profile cannot be resolved or is rejected by the existing assignment rules.
- If the card's assignment or status changes before confirmation is submitted, require the administrator to review the current and destination profiles again.
- On a failed reassignment, preserve the old assignment and its associated claim/access state, and report that the change did not complete.
- Provide clear confirmation of success only after the assignment, claim invalidation, access revocation, and audit entry have completed.

## Acceptance criteria

1. An administrator can reassign an active or claimable card from `/admin/cards` and sees the current and destination profiles before confirming.
2. The card keeps its token, NFC/QR URL, and status. The URL resolves through the new profile assignment.
3. Reassignment is allowed even when the destination profile already has an active or claimable card.
4. Existing claim codes and pending challenges for the card are invalidated, including state from a previously completed claim.
5. The former owner loses card-derived access from this card, and the destination profile owner must claim it with a fresh one-time code.
6. Other cards assigned to the former profile and separately granted owner access remain unaffected. The former profile and account remain intact and are cardless only when no other card is assigned to that profile.
7. The audit log identifies the card, old and new profile assignments, administrator, and event time.
8. Unauthorized requests and reassignment of inactive or replaced cards are rejected without changing assignment or claim state.
9. Local demo and Convex modes produce equivalent behavior.

## Validation approach

Review the admin flow for an unclaimed card and a previously claimed card. Confirm the confirmation names both profiles, the original URL resolves through the destination profile, all prior claim state is invalidated, and a fresh code is required. Verify that a former profile with no other cards becomes cardless while its account remains intact; a former profile with another card and a separately granted owner access retain those access paths. Confirm that a destination with another active or claimable card is accepted, while inactive/replaced cards and unauthorized callers are rejected. Verify the same outcomes in deterministic local demo and Convex modes, and inspect the audit event for the old assignment, new assignment, and administrator.

Automated test implementation and execution belong to implementation work; this document defines the behaviors those checks must prove.
