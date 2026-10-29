# Issue #187: Card Archive, Restore, and Reactivation Design

**Status:** Approved in conversation
**Date:** 2026-10-30
**Issue:** [#187 — Add a Remove action for inactive cards](https://github.com/wehyn/tapit/issues/187)
**Related:** [#195 — Allow multiple NFC cards for one profile](https://github.com/wehyn/tapit/issues/195), [#196 — Show return instructions for lost NFC cards](https://github.com/wehyn/tapit/issues/196)

## Goal

Let administrators remove inactive cards from the main registry without deleting their records or releasing their tokens. Administrators can view and restore archived cards, and reactivate an inactive or replaced card with a fresh customer claim performed through the existing one-time-code flow.

## Card lifecycle behavior

- Add an optional `archivedAt` timestamp to the existing card record. Archiving is separate from the card's `status`; it does not delete the row, token, profile assignment, claim history, or audit history.
- Show **Remove** beside **Copy link** only for inactive and replaced cards. Confirm before archiving. The card leaves the regular registry views and counts, and appears in an **Archived** view.
- **Restore** clears `archivedAt` only. The card returns to the registry with its previous inactive or replaced status. Its URL continues to resolve as inactive.
- A visible inactive or replaced card has a separate **Reactivate** action. Reactivation keeps its token and profile assignment, changes its status to `active` for a currently published profile or `claimable` otherwise, and invalidates the card's prior claim code and pending claim challenges. The customer must claim it again.
- Reactivation does not issue a code. After it succeeds, the administrator uses the existing **Generate claim code** action to issue a fresh one-time code. Existing expiration, rate limiting, and one-time-use rules remain in effect.
- A card may be reactivated while other active or claimable cards remain assigned to the same profile. Each card's URL, status, and claim state are independent, as specified by #195.
- The public resolver continues to use the card's status. Archive and restore do not change public behavior; reactivation restores the normal active or claimable behavior for the assigned profile.

## Authorization and state changes

- Convex archive, restore, and reactivate mutations require an administrator and a card in the administrator's scope. Each mutation validates that the requested transition is valid before writing.
- Archive accepts only unarchived `inactive` or `replaced` cards. Restore accepts only archived cards and clears the archive timestamp without changing status.
- Reactivate accepts only visible `inactive` or `replaced` cards with an existing same-scope profile and active owner. It sets `active` or `claimable` using the same profile-state rule as card attachment. The operation does not require siblings to be deactivated.
- Reactivation clears the current claim state and invalidates previous codes/challenges so prior access cannot be reused. It leaves historical audit entries and claim-challenge records intact; stale challenges fail validation against the new claim state.
- The local-demo path mirrors the same eligibility, status, archive, claim-state, and audit behavior.
- Archive, restore, and reactivate are audited as distinct card events. Fresh code generation continues to use the existing `card.claim_code_generated` audit event.
- Failed or stale actions leave the card unchanged and surface the existing admin error feedback.

## Admin workflow

- Regular registry filters and counts exclude archived cards; the **Archived** filter shows them with **Restore**.
- Remove and Reactivate use the existing confirmation-dialog pattern. The archive confirmation explains that the URL remains inactive and its token stays reserved. The reactivation confirmation explains that the URL may show the published profile again and that the owner needs a fresh claim code for card-owner features.
- Restoring is a direct reversible action; it returns the card to its existing inactive or replaced state. Reactivation is a separate action and does not silently restore an archived card.
- After reactivation, the existing Generate claim code control is available. If code generation fails, the card remains active or claimable with old claim state invalidated, and the administrator can retry code generation.

## Data and token safety

- Keep archived records in the `cards` table so token uniqueness checks continue to reject attempts to register the same token again.
- Do not delete or rewrite old audit entries, claim history, or claim-challenge records when archiving or restoring.
- Archived cards remain resolvable by their existing token. Because their stored status remains inactive or replaced, the URL stays on the inactive-card experience until an administrator reactivates the card.
- Reactivation preserves the existing profile assignment and token. It does not reassign the card or modify sibling card records.

## Local demo, Convex, and audit log

Implement matching behavior in both `src/components/admin/CardsManager.tsx` runtime paths and the Convex card registry. Extend the card schema and shared/local card records with the optional archive timestamp. Add Convex mutations with server-side administrator and scope checks; mirror them in local-demo state updates. Add readable audit labels for archive, restore, and reactivate events.

Update `docs/spec.md` to replace FR-028's blanket prohibition on reactivation with the new admin reactivation and fresh-claim behavior. Expand #195's acceptance criteria to state explicitly that multiple active and claimable cards may coexist and that reactivating one card does not change the state or claim history of its siblings. Add the user-visible behavior to `docs/CHANGELOG.md` when implemented.

## Verification expectations

- Local-demo E2E covers Remove confirmation, hiding from normal views/counts, appearance in Archived, Restore with original status and inactive URL, and Reactivate alongside active and claimable siblings.
- E2E verifies that reactivation does not change sibling card status or URLs, the old claim cannot be reused, and the existing Generate claim code action issues the fresh one-time code needed to claim again.
- Convex integration coverage verifies admin and scope enforcement, eligibility for each transition, token reservation after archive, status preservation after restore, multi-card independence, stale-code/challenge invalidation, and successful use of a fresh code.
- Audit-log coverage verifies archive, restore, and reactivation events, while code generation remains recorded through the existing event.
- No implementation or test execution is included in this design document.

## Scope boundaries

- The lost-card return page and lost-card state belong to #196; this design covers existing `inactive` and `replaced` statuses.
- Reassignment to a different profile remains in #191.
- Reactivation does not generate the new claim code automatically and does not add a new code format or delivery channel.
- Archived cards remain in the Archived filter; permanent deletion and token reuse are not supported.
