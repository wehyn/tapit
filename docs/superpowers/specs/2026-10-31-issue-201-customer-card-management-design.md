# Issue #201: Customer Card Management

**Status:** Approved for implementation
**Date:** 2026-10-31
**Issue:** [#201 — Let customers view and control their assigned cards](https://github.com/wehyn/tapit/issues/201)
**Related:** [#187 — Card archive, restore, and reactivation](https://github.com/wehyn/tapit/issues/187), [#193 — Permanent card URLs](https://github.com/wehyn/tapit/issues/193), [#195 — Multiple cards per profile](https://github.com/wehyn/tapit/issues/195), [#196 — Lost-card return page](https://github.com/wehyn/tapit/issues/196)

## Goal

Give signed-in customers a clear list of every card assigned to their own profile and let them disable or report a currently claimed card lost. A customer can also choose the public page for any lost card assigned to their profile. Keep physical card assignment and claim-code generation under administrator control, preserve the permanent URL, and keep every card action isolated from its siblings.

## Current behavior

- `/app/card` currently opens the card design experience. `/app/card/order-card` is the printed-card order form.
- The admin registry supports multiple cards per profile, archives inactive or replaced cards without deleting their assignment, and lets administrators deactivate, mark lost, restore, or reactivate cards.
- A lost card currently resolves to the configured shared return instructions. Inactive and replaced cards resolve to the neutral unavailable page.
- Reactivating an inactive, replaced, or lost card is administrator-only. It clears the prior claim, after which an administrator generates a fresh one-time code and the customer claims the card again.
- The customer workspace derives the signed-in account and owned profile from the authenticated session. Convex and local demo keep separate data and action paths.

## Customer Cards area

- Make the existing `/app/card` route the customer's assigned-card list. Keep its current navigation entry and label it **Cards**.
- Move the current `BuildCardExperience` view from `/app/card` to `/app/card/order`. The Cards page's **Order more cards** action opens that view; its existing action continues to `/app/card/order-card`, which remains the printed-card order form.
- Show the Cards entry to every active customer, including customers with no assigned cards. Show a clear empty state when the profile has no assigned cards.
- Let the empty state and populated list open the same order flow. Do not gate `/app/card` or `/app/card/order` on existing card-owner features.
- List all cards assigned to the signed-in customer's profile, including admin-assigned cards that have not been claimed and archived cards that remain assigned. Do not list unassigned inventory or another customer's cards.
- Show each card's permanent URL and current status. Show archive state separately where applicable, and explain that an archived card must be restored by an administrator before reactivation. A lost card also shows whether its URL currently uses the shared return instructions or the neutral inactive page.
- Do not return or display claim codes, claim-code hashes, claim challenges, or other claim secrets. The permanent card URL remains visible because it is the requested card destination.
- Derive the customer and profile from the authenticated session. Do not accept a client-supplied profile ID as the authority for list or mutation access. Every card mutation must verify that the selected card remains assigned to that profile and in the same scope.

## Customer and admin card capabilities

| Capability                       | Customer                                                                                                                                                                                                | Admin                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| View cards                       | See all cards assigned to their own profile, including unclaimed and archived cards. Cannot see unassigned inventory or another customer's cards.                                                       | See cards in the administrator's scope, including unassigned inventory and archived records.             |
| View URL and status              | See the permanent URL and status for assigned cards; see the selected public page for lost cards. No claim codes, hashes, or challenges.                                                                | Manage the in-scope registry, assignments, status, and permanent URLs. Claim hashes remain private.      |
| Order more cards                 | Use **Order more cards** at `/app/card/order`; continue through the existing `/app/card/order-card` order form.                                                                                         | Can use the same order flow for their own account and manage fulfillment through the admin Orders area.  |
| Register, assign, or reassign    | Cannot register cards, change assignments, or reassign a card.                                                                                                                                          | Can register, assign, and reassign cards within their scope.                                             |
| Claim and claim codes            | Complete the existing one-time-code claim flow for an eligible card. Cannot generate or retrieve claim codes from the Cards page.                                                                       | Generate or invalidate one-time codes and share the generated code through the existing admin workflow.  |
| Disable                          | Disable only an active card with a successful current claim, assigned to their profile.                                                                                                                 | Deactivate an active card in their scope.                                                                |
| Mark lost and choose public page | Mark a currently claimed card assigned to their profile as lost. Choose return instructions or inactive page; may change the page for any assigned lost card, including an unclaimed admin-marked card. | Mark eligible cards lost, recover cards, and manage the shared return instructions and support fallback. |
| Reactivate                       | Start reactivation only for a card they disabled. An admin must issue a fresh code, which the owner claims before profile content returns.                                                              | Restore archived cards, reactivate inactive/replaced/lost cards, and generate the fresh code.            |
| Archive and restore              | View archived cards that remain assigned; cannot archive or restore them.                                                                                                                               | Archive or restore eligible records.                                                                     |
| Audit                            | Customer actions are recorded; customers do not get the admin audit-log view.                                                                                                                           | Review in-scope audit events, including customer card changes.                                           |

## Customer card actions

### Disable

- A customer can disable only an active card that has a successful current claim.
- Disabling changes only that card to `inactive`. It keeps the card's URL, token, profile assignment, and claim history. Its public URL uses the existing neutral inactive page; sibling cards remain unchanged.
- Record an optional `ownerDisabledAt` timestamp on that card. This identifies cards the customer may start reactivating without allowing them to override an administrator's deactivation. Do not expose this marker in the customer list response.
- Require a confirmation that explains the card URL will stop showing the profile and that reactivation requires a fresh claim code from an administrator.

### Mark lost and choose the public page

- A customer can mark an assigned card lost only while it has a successful current claim. The card must not already be lost, and any pending assignment correction must be resolved first. After reactivation clears a claim, the owner must complete the fresh claim before using customer card actions again.
- Marking a card lost preserves its assignment, URL, token, claim history, and archive state. It updates only the selected card and records the customer's choice for its public page.
- Clear the customer-disabled marker when the card becomes lost so the lost-card recovery path remains administrator-controlled.
- The owner chooses between the existing shared lost-card return instructions and the neutral inactive page as part of marking the card lost. Default to return instructions, preserving #196 behavior. The customer can change the choice later while the card remains assigned to their profile.
- A customer may change the page choice for any lost card assigned to their profile, including a card an administrator marked lost before the customer claimed it. Assignment ownership authorizes this display preference; it does not authorize the customer to mark an unclaimed card lost.
- Store the preference as an optional per-card `lostCardResolution` value: `return` or `inactive`. Keep the card's physical status as `lost` even when its URL uses the inactive page, so the admin recovery workflow remains available.
- When `lostCardResolution` is absent on existing records, treat it as `return`. Do not add a data migration.
- The return page continues to use only the shared, public instructions and existing generic support fallback. It must not load or return profile, owner, or account data.

### Reactivate a customer-disabled card

- A customer may start reactivation only for a card they disabled themselves. They cannot reactivate a card disabled by an administrator or a card marked lost; those remain administrator-controlled.
- Require the card to remain assigned to the signed-in customer's profile, remain `inactive`, and have the customer-disabled marker. Reject stale, archived, or correction-pending actions without changing state. An archived card must be restored by an administrator before it can be reactivated.
- Starting reactivation clears the old claim state and pending challenge eligibility, then sets the card to `active` or `claimable` using the existing profile-state rule. Clear the customer-disabled marker and audit the change.
- Clear the marker when an administrator action replaces the customer-disabled state, including administrator deactivation or reactivation.
- The owner does not receive or generate a claim code from the Cards page. An administrator generates a fresh one-time code through the existing admin flow; the owner completes the existing claim flow with that code. Until the fresh claim succeeds, the card URL must not show profile content.
- After starting reactivation, tell the owner to contact support for the fresh code. The admin can see the reactivation audit event and use the existing registry to generate the code; do not add automated notifications or a new delivery channel.
- When an administrator recovers a lost card, clear its lost-page preference so a future lost event defaults to return instructions again.
- If the card's profile is not published, it remains claimable and does not expose profile content. Reactivation and claiming one card leave all siblings unchanged.
- If no sibling card remains claimed and there is no access override, existing card-owner features remain unavailable until the fresh claim succeeds.

## Authorization, audit, and parity

- Convex list and action functions require an active authenticated customer account with an owned profile. They derive that account and profile from the session, then verify card assignment and scope on every action.
- The local-demo path uses the active customer session and the same ownership, status, archive, and claim-history rules.
- Validate current card state inside each mutation. Unauthorized, stale, correction-pending, or otherwise ineligible actions leave the card unchanged and return an error.
- Audit every successful customer state or display-choice change with actor, card, profile, time, and before/after values. Keep existing administrator audit events and controls.
- Card actions never update sibling cards. Disabling or marking a card lost does not change existing card-owner access rules, which remain based on claim history or an administrator access override. Starting reactivation clears the selected card's claim state, so it may remove card-derived access until that card is claimed again.
- Convex and local demo must behave the same for card listing, disable, lost-page choice, owner-started reactivation, claim completion, audit, and public URL resolution.

## Customer and public flows

1. A customer opens `/app/card` and sees all cards assigned to their profile, including unclaimed cards. A customer with none sees the empty state and can continue to `/app/card/order`.
2. A customer chooses **Order more cards** from `/app/card`; the existing design view opens at `/app/card/order` and its order action continues to `/app/card/order-card`.
3. A customer disables an active, currently claimed card. That card's URL becomes neutral and its siblings continue to resolve as before.
4. A customer marks a currently claimed assigned card lost and chooses return instructions or inactive page. The URL changes only for that card, while its lost status remains available to administrators.
5. An administrator marks an unclaimed assigned card lost. The customer may change that card's public page because it is assigned to their profile, but cannot mark it lost themselves until it has been claimed.
6. A customer starts reactivation for a card they disabled. The prior claim cannot be reused. An administrator issues a fresh code, and the customer claims it before the card URL serves the profile again.
7. An administrator continues to register, assign, reassign, archive, restore, mark lost, reactivate, and generate codes through the existing admin workflows.

## Acceptance criteria

1. Every active customer can open `/app/card`; the page lists every card assigned to their own profile, including unclaimed and archived assigned cards, and shows an empty state when there are none.
2. The existing card design experience is available at `/app/card/order`, and its existing printed-card form remains at `/app/card/order-card`. Customers can reach the design and order flow from the Cards page even before a card has been claimed.
3. A customer cannot list another customer's cards or unassigned inventory. Customer queries and actions derive profile ownership from the authenticated session.
4. The customer view exposes card ID as needed for actions, permanent URL, status, archive state where applicable, and lost-page choice, but no claim code, claim-code hash, challenge, or other claim secret.
5. Only an active, currently claimed card can be customer-disabled. Its own status and public resolution change to inactive; its URL, assignment, and claim history stay intact, and every sibling remains unchanged.
6. A customer can mark a card lost only while it has a successful current claim and only when no correction is pending. The action changes only that card, records the chosen public page, and retains its URL, token, assignment, and archive state.
7. A customer may set the public page for any lost card assigned to their profile, including an admin-marked lost card the customer has not claimed. The default is shared return instructions; selecting inactive uses the existing neutral page.
8. A lost URL in either display mode reveals no profile, owner, or account data. Return mode uses the existing scoped public instructions and generic support fallback.
9. A customer can start reactivation only for a card marked as customer-disabled. The old claim and challenges cannot be reused; a fresh admin-generated code and successful owner claim are required before profile content returns.
10. A customer cannot reactivate an admin-disabled, archived, or lost card through the customer flow. Existing admin restore and recovery actions continue to work.
11. Every successful customer action records the actor, card, time, and before/after state. Failed or stale actions leave card state unchanged.
12. Local demo and Convex match for the customer list, action eligibility, authorization, audit events, lost-page resolution, fresh-claim reactivation, and sibling-card independence.
13. Existing admin assignment, claim-code generation, archive/restore, deactivation, lost-card, and recovery flows continue to work.

## Data and implementation touchpoints

- Add optional `lostCardResolution` state, defaulting missing values to return instructions, and an optional `ownerDisabledAt` marker. Extend the Convex card schema/validator, shared card record, demo fixture, and persisted-state validation. Existing records need no migration.
- Add customer-scoped Convex list and mutation functions in `convex/cards.ts`. Use the existing card index and pagination so the customer can reach all assigned cards.
- Change the existing `/app/card` page and navigation label to the customer Cards list. Move `BuildCardExperience` to `/app/card/order`; keep `OrderCardExperience` at `/app/card/order-card`.
- Update `WorkspaceShell` so the Cards list and card-ordering design view remain available without card-owner features; keep the existing analytics access gate.
- Add matching local-demo list and actions using the signed-in demo session.
- Update `cards.resolve` and `CardResolverClient` so a lost card with inactive-page preference returns the existing inactive result; otherwise preserve the current lost response.
- Add readable audit labels for customer actions. Preserve existing administrator controls and code-generation rules.
- Update `docs/spec.md` to replace the current non-goal for a customer Cards screen, and add the implemented behavior to `docs/CHANGELOG.md` when shipped.

## Validation approach

- Convex integration coverage: own-profile list, no unassigned or cross-customer card access, no claim secrets, action eligibility, stale/correction guards, audit contents, and sibling-state preservation.
- Card resolver coverage: lost return mode, lost inactive mode, unchanged return default for legacy cards, and no profile or owner data in either lost response.
- Reactivation coverage: owner-disabled cards require a fresh admin-generated code and successful claim; prior claims/challenges fail; admin-disabled and lost cards remain unavailable to customer reactivation; sibling cards remain unchanged.
- Local-demo coverage mirrors the same scenarios with deterministic fixtures.
- UI verification covers the empty state, navigation, URLs/statuses, confirmation copy, accessible controls, and both lost-page choices at phone and desktop widths.

No implementation or test execution is included in this design spec.

## Out of scope

- Customer registration, assignment, reassignment, or access to unassigned inventory.
- Customer claim-code generation, display, or claim-code hash access.
- Customer marking an unclaimed card lost or disabling an unclaimed card.
- Customer reactivation of an administrator-disabled or lost card.
- Per-card return instructions, owner-specific contact details, finder identity collection, notifications, or a new recovery workflow.
- Changes to profile-owner feature eligibility or to the restriction on claiming a second unassigned card.
