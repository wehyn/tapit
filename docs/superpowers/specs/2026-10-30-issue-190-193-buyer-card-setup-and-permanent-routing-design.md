# Buyer Card Setup and Permanent URL Routing

**Status:** Approved design
**Date:** 2026-10-30
**Issues:** [#190](https://github.com/wehyn/tapit/issues/190), [#193](https://github.com/wehyn/tapit/issues/193)
**Follow-up:** [#196](https://github.com/wehyn/tapit/issues/196)

## Goal

Let buyers attach a registered, pre-encoded card to their own Tapit profile. Keep the card’s full NFC and QR URL permanent while routing visitors according to the card’s current state and published profile.

## Decision summary

- Combine #190 buyer setup and #193 permanent card routing in one implementation.
- Newly registered cards remain unassigned. Administrators can generate a package code before assigning a card.
- A permanent card URL identifies the card; it does not prove ownership. The package code is entered only in the authenticated setup flow.
- Package codes remain valid until used or explicitly invalidated/replaced. A separate one-time verification challenge expires after 10 minutes.
- Buyers review their own profile and explicitly confirm before attachment. Skipping leaves an unassigned card available for later setup.
- A buyer can request administrator review of a mistaken assignment. The card pauses on a neutral page while the request is pending.
- Follow #192’s canonical URL contract: relative `/c/<token>` inputs normalize to `https://tapit-eosin.vercel.app`, and absolute URLs must use that HTTPS origin. Preserve the full registered URL, including query strings, for NFC and QR. Slug changes and approved assignment corrections do not change it.
- Issue #196 follows this work. It adds lost-card status, administrator actions, configured return instructions, and a dedicated lost-card page.

## Buyer setup

### Existing customer

1. The customer opens the card’s NFC or QR URL.
2. If signed out, the customer continues with Google and returns to the same card path and query string.
3. Tapit displays only that customer’s own profile details and slug.
4. The customer enters the package code, reviews the profile, and explicitly confirms attachment.
5. On success, Tapit attaches the card to the customer’s server-owned profile and consumes the package code.

### New customer

1. The buyer opens the card URL and continues with Google.
2. Tapit completes customer onboarding first, using the Google identity and a display name to create a private draft profile with a unique slug.
3. Tapit returns the customer to the original card URL and presents the attachment choice only after the profile and slug exist.
4. The buyer can attach the card or skip for now.

### Skip and resume

Skipping does not consume or invalidate the package code and does not assign an unassigned card. The customer remains in the existing cardless limited-access state. Opening the same card URL later resumes setup.

The setup flow is available from the public card route. Customers do not receive a Cards navigation screen or arbitrary card assignment controls.

## Package-code lifecycle

- Administrators can generate a package code for a registered unassigned card and for an eligible attached but unclaimed card.
- Store only a hash of the package code. Show the raw code only in the administrator’s generation response.
- Do not apply a time expiry to the package code. A previously stored legacy expiry timestamp does not invalidate a code.
- Administrators can invalidate or replace an unused code. A successfully completed attachment consumes it.
- Verification creates a separate challenge that expires after 10 minutes and can be used once. Challenge expiry or replay does not consume the package code.
- Rate limits and server-side checks continue to protect verification and attachment.
- Enforce one live card per profile.

## Permanent URL and resolver behavior

Normalize relative `/c/<token>` inputs to the canonical origin from #192. Accept absolute URLs only on `https://tapit-eosin.vercel.app`, with the exact `/c/<token>` path; reject other origins, invalid protocols, credentials, mismatched tokens, and fragments. Preserve the complete query on accepted URLs. NFC and QR encode the same stored URL without rebuilding or dropping its query.

A query such as ?claim=1 is an entry hint only. The resolver result determines the page. Query values never prove ownership or force a claim state. Never put the package code in the URL or QR.

| Card state                                                   | Resolver result                | Public profile data                  |
| ------------------------------------------------------------ | ------------------------------ | ------------------------------------ |
| Registered, no profile assignment                            | Setup                          | None                                 |
| Claimable, package code not used                             | Claim                          | None                                 |
| Claimable, code used, assigned profile still a private draft | Setup                          | None                                 |
| Active, package code not used                                | Claim                          | None                                 |
| Active, code used, assigned profile published                | Active                         | Current published profile projection |
| Assigned profile unpublished or suspended                    | Unavailable                    | None                                 |
| Inactive or replaced                                         | Inactive, shown as unavailable | None                                 |
| Correction request pending                                   | Unavailable                    | None                                 |
| Token not found                                              | Missing, shown as unavailable  | None                                 |

Slug changes update the profile’s current URL without changing the card URL. The old direct profile URL does not redirect. A claimed active card resolves to the currently assigned profile’s published content. Missing, inactive, replaced, correction-pending, unpublished, suspended, and draft states do not expose profile data.

## Assignment correction

1. An authenticated customer proves possession of the package code through a current verification challenge and requests correction.
2. The challenge is marked used, but the package code is not consumed.
3. While the request is pending, the permanent card URL resolves to a neutral unavailable page with no profile data.
4. The administrator reviews the requester profile and current assignment. The correction action can assign the card only to the requester’s server-owned profile.
5. Correction preserves the card record, token, complete URL, and package code. The customer rescans the same card and confirms the corrected profile to consume the code.
6. If the requester’s profile already has a live card, correction remains pending. The admin interface explains the conflict; the customer cannot force a second attachment.

Do not store the raw package code in a correction request. Do not offer a customer-controlled rejection or reassignment path.

## Authorization and privacy

- Derive account and profile ownership from the authenticated server identity. Do not accept a client-selected profile or customer ID for attachment.
- A package code is required to attach a physical card. The card URL and query string are not ownership credentials.
- Show the buyer only their own profile preview. Do not return a foreign profile or private draft from a public resolver.
- Keep setup, claim, missing, inactive, correction-pending, unpublished, and suspended responses free of profile data.
- Record administrator assignment, correction, invalidation, and replacement actions in the existing audit log.
- Preserve rate limits, scope checks, and the one-live-card-per-profile rule.

## Local demo and hosted demo

Mirror the card states and transitions in Convex and the deterministic local demo. The local demo must remain repeatable without Google OAuth, Convex, or production data. Demo package codes are deterministic, remain outside the card URL, and use the same challenge and correction behavior as the product flow. Hosted-demo records remain demo-scoped.

## Acceptance criteria

1. Registering a card creates an unassigned record, normalizes relative input to the canonical origin, and preserves the complete URL and query. A duplicate token is rejected.
2. An administrator can generate a package code before card assignment. The code is stored as a hash, shown only in the generation response, and remains valid until use or invalidation.
3. A legacy package-code expiry timestamp does not invalidate the code. Verification challenges expire after 10 minutes and cannot be replayed.
4. Signed-out users can choose an existing Google account or complete new-customer onboarding, then return to the exact original card URL including its query.
5. New customers receive a profile and slug before the attachment choice. Existing customers see their own profile and slug before confirmation.
6. Successful attachment targets only the authenticated customer’s profile, consumes the code, and rejects a second live card for that profile.
7. Skipping leaves an unassigned card and its code available, retains the cardless limited-access state, and lets the customer resume by scanning the same URL.
8. NFC and QR encode the identical full registered URL. Query values do not authorize ownership, and package codes never appear in URLs or QR codes.
9. Resolver behavior matches the documented state table. A claimed active card returns the current published profile; an unpublished or draft profile is never exposed.
10. A code-proven correction request pauses public resolution without consuming the package code or returning profile data.
11. An administrator can correct a pending assignment to the requester’s own profile without changing the card record, token, or full URL. The customer must rescan and confirm.
12. A correction that would give a profile a second live card stays pending and shows the conflict to the administrator.
13. Slug changes and approved correction preserve the permanent card URL. Inactive, replaced, pending-correction, and missing cards resolve to a neutral unavailable page.
14. Convex, hosted demo, and deterministic local demo follow the same buyer setup, skip/resume, code, and correction rules.

## Issue #196 sequencing

Issue #196 continues after the combined #190/#193 work; it is not a prerequisite for this implementation. #196 adds the lost card state, administrator Mark lost action and audit event, configured return contact/instructions, and the dedicated lost-card page. The full card URL remains unchanged for a lost card, and other cards assigned to the same profile remain unaffected.

## Scope boundaries

- Do not add customer card transfer, arbitrary reassignment, or a customer Cards management screen.
- Do not expose drafts or use the permanent URL as proof of card ownership.
- Do not add package-code expiry; only successful use or administrator invalidation/replacement ends validity.
- Do not implement #196’s lost-card state or return page as a prerequisite to this work.
- Do not change physical card manufacturing, encoding operations, shipping, or fulfillment.

No implementation or verification is included in this spec change.
