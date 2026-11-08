# State machines

Every lifecycle in Tapit is a state machine, whether or not it is written down as one. The rule: **one pure transition function per lifecycle, in `src/lib/domain/state-machines.ts`, called by Convex, the local demo, and UI gating alike.** If a component or mutation re-writes `status === "x" && other === "y"`, that is a copy of a machine that will drift between demo and live.

Tests: `tests/unit/state-machines.test.ts` (tables) plus the `convex/integration/*.test.ts` suites (behaviour).

## Registered machines

| Machine | Field(s) | Transition function | Notes |
| --- | --- | --- | --- |
| Customer | `customers.status` | `transitionCustomerStatus` | pending / invited / active / deleted |
| Deletion | `customers.deletionStatus` | `transitionDeletionStatus` | an older row may be `active` with an open request; the request record is authoritative |
| Deletion request | `deletionRequests.status` | `transitionDeletionRequestStatus` | `rejected` is in the schema but has no entering event yet |
| Prepared setup | `customers.setupState` | `transitionPreparedSetup` | `null` / waiting / draft / active |
| Profile | `profiles.status` | `transitionProfileStatus` | owners have a narrower path than administrators |
| Card | `cards.status` | `transitionCardStatus`, `canTransitionCardStatus` | event payloads carry `published` / `hasProfile` |
| Card order | `paymentStatus` + `fulfillmentStatus` + `commissionStatus` | `transitionCardOrder`, `canTransitionCardOrder`, `isCardOrderAwaitingPayment` | **one machine over three fields**; never gate on a single field |
| Upload (design, QR, receipt, profile job) | `status` on each upload table | `transitionUploadStatus(kind, from, event)` | each kind has its own table |
| Invitation | derived from timestamps | `invitationState`, `transitionInvitationState` | |
| Claim code / challenge | derived from timestamps | `claimCodeState`, `claimChallengeState` | |
| Card correction | `cardCorrectionRequests.status` | `transitionCorrectionStatus` | |
| Promo offer availability | `expiresOn`, `usageCount`, `usageLimit` | `cardOrderOfferAvailability` (`src/lib/card-ordering.ts`) | available / expired / exhausted; used by Convex, demo, and the admin Codes list |
| Setup claim (client) | reducer state | `transitionClaimState` | `src/components/auth/setup-claim-state.ts` |
| Pending media upload (client) | queued / uploading / failed | `transitionPendingMediaUpload` | |

## Known implicit machines not yet registered

These work today but are encoded as flag clusters. Convert one at a time, with its own test.

1. **Public card resolution** (`convex/cards.ts` `resolve`). A derived view state (missing / unavailable / inactive / lost / setup / claim / ownerSetup / active) computed from `card.status`, `correctionRequestedAt`, `lostCardResolution`, claim state, owner and profile. Behaviour is covered by `card-routing.test.ts`. Extracting it as a pure `deriveCardResolution` is the next step.
2. **`uploadAssets` status** (`convex/uploadPolicies.ts`). A ten-state union with no transition table. It also reuses the name `UploadStatus`, which collides with the registry type of the same name. Rename one when this is registered.
3. **Account phase.** `customers.status`, `setupState`, `deletionStatus`, and `deletionRequests.status` move together but are validated separately. Impossible combinations are only prevented by call-site discipline.
4. **Client flag clusters.** Impossible states are representable in:
   - `ProfileEditor.tsx`: `imagePending`, `imageApplied`, `imageError`, `mediaBusy`, `mediaError`, plus `pending` and `draftConflict`.
   - `OrderCardExperience.tsx`: `submitting` / `submitError` / `submittedOrderId`, and the receipt and QR upload blocks (`file`, `url`, `error`, `selectionError`, `status`, `busy`).
   - `ProfilesManager`, `CodesManager`, `SettingsManager`: `busy` + `message: {tone,text} | null`, repeated.
   Prefer a discriminated union (`idle | working | failed | done`) like `ClaimState`.
5. `CorrectionStatus` includes `"pending"`, which the schema does not.

## Adding or changing a machine

1. Put the states, events, and a pure transition function in `state-machines.ts`. Throw on an illegal event; add a `can…` helper that calls it instead of duplicating the condition.
2. Use it in Convex **and** `src/lib/demo/`. Keep demo-only extra guards next to the call.
3. Gate UI controls with the `can…` helper so a button is shown only when its event would succeed.
4. Add table tests in `tests/unit/state-machines.test.ts`.
