# Issues #195 and #196: Multiple Cards and Lost Card Return Flow

**Status:** Design refined in conversation; updated spec ready for review
**Date:** 2026-10-30
**Issues:** [#195 — Allow multiple NFC cards for one profile](https://github.com/wehyn/tapit/issues/195), [#196 — Show return instructions for lost NFC cards](https://github.com/wehyn/tapit/issues/196)
**Related:** [#190 — Buyer card setup](https://github.com/wehyn/tapit/issues/190), [#191 — Admin card reassignment](https://github.com/wehyn/tapit/issues/191), [#193 — Permanent card URLs](https://github.com/wehyn/tapit/issues/193)

## Goal

Allow a profile to use multiple independently managed NFC cards. Keep an existing card usable when an administrator adds a replacement or extra card. Let administrators mark an individual card lost and show a dedicated return page at that card's existing permanent URL, without revealing its profile or owner's information.

## Current behavior

- Convex card assignment and reassignment do not require the destination profile to be cardless. The admin card list already permits multiple cards for one profile.
- Local demo and Convex both permit multiple admin-assigned cards. Both retain a guard against claiming a second unassigned card during recipient setup.
- The current Replace action changes the old card to `replaced` and copies its claim state to the new card. This couples two physical cards and prevents both from remaining independently usable.
- Card resolution already routes by token through `cards.resolve`. Inactive and replaced cards use a neutral page. There is no lost state or dedicated return-instructions setting.
- Admin Settings already stores scoped settings and records setting changes in the audit log.

## Behavior for #195: Multiple cards per profile

- A profile may have multiple active or claimable cards. Assignment, reassignment, claim completion, reactivation, deactivation, and replacement creation operate on the selected card only; sibling tokens, URLs, statuses, and claim state remain unchanged.
- An administrator may assign a registered card to a profile that already has active or claimable cards. Reassignment remains allowed when the destination profile already has a card, as required by #191.
- Completing a claim for an assigned card changes only that card's claim state and corresponding card-derived owner access. It does not claim, deactivate, or otherwise update siblings. Keep the existing matching Convex/demo guard for a recipient trying to claim an unassigned card after their profile already has a live card.
- Reactivating an inactive or replaced card continues to invalidate that card's prior claim state and require a fresh claim. It does not change sibling cards.
- Adding a replacement creates a separate card record assigned to the same profile. The existing card keeps its current status, token, URL, and claim history. The new card starts with independent, unclaimed history and requires its own one-time code and claim. Administrators deactivate or mark the older card lost as a separate action.
- Label the admin action **Add replacement** and confirm that the old card remains active until it is separately deactivated or marked lost.
- Existing recipient correction requests retain their #190 rule: a request stays pending when the requester's profile already has another active or claimable card. This does not limit administrator assignment or reassignment.
- Profile publication continues to update attached claimable cards according to the existing profile-state rules; the independence requirement applies to card-level actions.

## Behavior for #196: Lost-card return page

- Add a `lost` card status and a per-card **Mark lost** action in `/admin/cards`. Confirm the selected token and explain that its URL will show return instructions instead of profile or setup content.
- An administrator may mark any card record lost unless it is already lost or has an open correction request. If the card is archived, keep its archive state; marking it lost changes public resolution, not registry visibility. Resolve an open correction request first, matching the existing guards on other status-changing actions.
- Marking a card lost updates only that card. It preserves the card record, token, permanent URL, assignment, and claim history. Existing claim checks reject lost cards by status; other cards assigned to the profile continue working.
- Lost status changes public card resolution only. Profile-owner features remain available under the existing rules when any card has a completed claim or an administrator has granted a separate access override.
- If an assigned lost card is physically recovered, an administrator can use the existing **Reactivate** action. Reactivation invalidates that card's previous claim and pending challenges; the owner must receive a fresh code and claim it again. Restore an archived card before reactivating it. Until the fresh claim succeeds, card-derived owner features come from another claimed card or a separate access override.
- If a lost card has no profile assignment, recovery returns it to `registered` and invalidates its prior package code. The administrator must assign it and issue a fresh code before the recipient can claim it.
- Record the administrator and event time in the card audit entry, along with the card and its before/after status.
- Add a dedicated, scoped **Lost-card return instructions** setting under Admin Settings. The administrator supplies plain text for this purpose; tell them this text is public to anyone who scans a lost card. Do not infer it from an owner's profile, reuse customer details, or render it as HTML.
- A lost card's existing URL returns a dedicated page with the message, “If you found this card, please contact and return it using the instructions below.” If return instructions are empty, use the explicitly configured site-wide support destination as a contact link; if neither is configured, show a neutral fallback asking the finder to return the card to its issuing organization.
- The resolver returns return instructions and, only as a fallback, the configured support destination for a lost card. It does not load or return profile data. For every other status, neither setting is included in the public response.
- Marking a card lost does not change its URL or QR code. QR continues to encode the same permanent URL and therefore reaches the lost-card page through the resolver.

## Data, scope, and safety

- Extend the shared card status type, Convex card validator/schema, and local-demo persisted-state validation with `lost`. No existing card rows require a migration; the new setting is optional.
- Store return instructions in the existing scoped settings table, with matching browser-local state in local demo. Only the lost-card resolver response exposes the configured value or fallback support destination.
- Render return details as plain text. Keep the safe fallback independent of profile and account data.
- Do not add a separate `found` status. Assigned cards use the existing reactivation and fresh-claim flow; unassigned cards return to `registered` with the old code invalidated.
- Local demo and Convex must have the same assignment, claim, replacement, lost-card, return-page, and audit behavior.

## Admin and public flows

1. The administrator registers a new card and assigns it to an existing profile. Existing sibling cards remain untouched.
2. For a replacement, the administrator chooses **Add replacement**, creates a new card for the same profile, and generates a fresh code for that card. The confirmation states that the previous card remains usable until separately deactivated or marked lost.
3. A card owner claims each physical card with its own code. Opening a claimed active card URL still resolves to the profile's current published content.
4. If a card is lost, the administrator marks that card lost. Its existing URL displays the dedicated return page; sibling cards continue resolving under their own states.
5. The administrator can update the shared return instructions in Settings. If the setting is empty, the lost page uses the configured generic support destination, or the neutral fallback if neither setting is configured.

## Implementation touchpoints

- Shared card types and transition rules, Convex schema and validators, local-demo state validation and fixtures.
- Both runtime paths in `src/components/admin/CardsManager.tsx`: replacement creation, independent lost/recovery actions, status display, and confirmations. Existing registry search can find the `lost` status; a separate Lost filter is not required.
- Convex card mutations and audit event; public card resolver and `CardResolverClient` rendering.
- Scoped return-instructions setting in `convex/settings.ts`, Admin Settings, and local-demo state.
- Card claim and reactivation integration coverage, local-demo verification coverage, `docs/spec.md`, and `docs/CHANGELOG.md` when implemented.

## Acceptance criteria

1. An administrator can assign an additional registered card to a profile that already has active or claimable cards.
2. Multiple active or claimable cards can coexist. Claiming or reactivating one card leaves every sibling's status, URL, and claim state unchanged.
3. **Add replacement** does not deactivate the existing card or copy its claim history. Each card requires its own claim code and retains its own URL and history.
4. An administrator can deactivate or mark lost one card without disabling other cards for the same profile.
5. An administrator can mark a specific card lost in `/admin/cards`; the audit log identifies who did it and when.
6. Opening a lost card's permanent URL shows the return page, not the owner's profile, setup flow, or private account data.
7. The return page uses the fixed found-card message and shows configured return instructions, then the configured generic support destination if return instructions are empty, or the safe fallback if both are unset.
8. Updating return instructions is scoped to the current environment and uses the existing admin authorization and audit patterns.
9. The lost card keeps its token and URL. Other active cards assigned to its profile continue to resolve normally.
10. Local demo and Convex behavior match for all criteria above.
11. Mark lost is rejected while a correction request is open; resolving that request leaves the card's current neutral correction page intact until a separate status change.
12. Marking a card lost does not revoke profile-owner features that remain available through another claimed card or a separate access override.
13. An administrator can recover a lost card: assigned cards use the existing reactivation flow and require a fresh code and claim; unassigned cards return to `registered` with the old code invalidated and require assignment and a newly generated code. An archived lost card must be restored first.

## Validation approach

Exercise assignment, claiming, replacement creation, reactivation, and deactivation with at least two cards assigned to one profile. Check after each card-level action that sibling URLs, statuses, and claim state are unchanged. Confirm a replacement receives a fresh claim and the older card remains active until explicitly changed.

Mark a claimed card lost and open its permanent URL. Verify that configured text appears without profile or account data, that the fallback contact and neutral fallback work, that the audit entry contains the administrator and timestamp, and that a sibling card still resolves. Recover the lost card, verify its old claim fails and a fresh claim succeeds, and check that sibling state is unchanged. Also recover a lost unassigned card and confirm its old package code stays invalid after assignment. Repeat the essential flows in local demo and Convex mode. Verify QR output remains the same permanent card URL.

Automated test implementation and execution belong to implementation work; this specification defines the behaviors those checks must prove.

## Out of scope

- Replacing the permanent URL, encoding claim codes in NFC or QR, or changing the public URL routing contract from #193.
- Changing recipient-submitted correction-request behavior from #190.
- Per-card or per-owner return contacts, notifications to the owner, contact forms, or finder identity collection.
- Adding a separate `found` status or a second recovery workflow.
