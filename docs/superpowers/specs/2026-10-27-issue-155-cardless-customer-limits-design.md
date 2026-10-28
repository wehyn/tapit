# Issue #155: Cardless Customer Profile Limits

**Status:** Approved for implementation on 2026-10-28
**Date:** 2026-10-27
**Issue:** [#155 — Restrict owner features for users without a Tapit card](https://github.com/wehyn/tapit/issues/155)

## Goal

Let an authenticated customer edit and publish a profile before registering a card, while reserving selected owner features for customers who successfully claim a card assigned to their profile.

Card registration is proven by the existing claim flow: the public card token identifies the card, and the one-time claim code proves possession. Google sign-in, a registered card record, or an assigned but unclaimed card does not grant full card-owner access.

## Selected access model

| Capability                                      | No successfully claimed card    | Successfully claimed card     | Administrator                    |
| ----------------------------------------------- | ------------------------------- | ----------------------------- | -------------------------------- |
| Edit and publish own profile                    | Allowed within the limits below | Existing full customer access | Existing administrator access    |
| Profile links                                   | Up to 3 total links             | Existing limit of 100         | Existing administrator access    |
| Appearance                                      | Paper, Moss, or Night preset    | Existing appearance options   | Existing administrator access    |
| Fine-tuning and custom palette                  | Unavailable                     | Existing access               | Existing administrator access    |
| Profile photo and background image uploads      | Allowed                         | Existing access               | Existing administrator access    |
| New slideshow image uploads                     | Unavailable                     | Allowed                       | Existing administrator access    |
| Owner analytics                                 | Unavailable                     | Allowed                       | Existing administrator analytics |
| Customer card-owner tools                       | Unavailable                     | Allowed                       | Existing administrator tools     |
| Account, support, card ordering, and claim flow | Allowed                         | Allowed                       | Existing access                  |

The three presets are the existing **Paper**, **Moss**, and **Night** options. **Warm Studio**, **Custom**, custom palettes, and fine-tuning controls remain available only to card owners.

“No successfully claimed card” describes account state; it does not establish whether a person physically possesses a card. The server derives this state from the authenticated account, its profile, and a successful claim for a card assigned to that same profile. A claimed card may remain `claimable` while its profile is unpublished; that status must not prevent full owner access.

## Claim and access behavior

1. A card is registered and assigned to a profile through the existing administrator workflow.
2. The authenticated customer opens the card claim flow and submits the card token and one-time claim code.
3. The existing verification challenge must complete successfully before the claim is recorded. The token alone is not proof of ownership because it is the public `/c/<token>` address.
4. Full customer access applies only when the successful claim belongs to a card assigned to the authenticated customer's own profile and scope.
5. Until then, the customer can edit and publish within the limited access model.

Do not accept client-supplied role, account, profile, or claimed-card values as proof. Keep administrator authorization on its separate existing path. Do not change claim-code replay, expiry, or invalidation behavior as part of this work.

## Limits and existing content

- Count all saved links toward the three-link limit, including disabled links. Card owners retain the current 100-link limit.
- Apply the link limit to both profile saves and publication so direct mutations cannot bypass it.
- Enforce the three allowed appearance presets in server-side save and publish validation, not only by hiding controls. Keep the existing published snapshot visible until the customer publishes an updated profile.
- Block new slideshow uploads for customers without a successful claim. Continue allowing profile-photo and background-image uploads.
- The upload request must identify whether media is intended for the background or slideshow. Store that purpose with the server-side upload and resulting asset so a direct request cannot upload as a background and later attach the asset as a slideshow image. The server rejects new slideshow uploads for limited accounts.
- Do not delete existing profile data or media when applying these limits. Existing published slideshow content remains public and intact; customers without a card cannot add new slideshow images. Existing drafts or settings outside the limited tier must be corrected before a new publish if they violate its limits.

## Owner-only areas

Customers without a claimed card cannot read their owner analytics or use customer card-owner tools, including card-building or card-sharing controls. The customer workspace should explain the limits and provide paths to order or claim a card. Ordering and claiming remain available so a customer can obtain the card that unlocks full access.

Public profile viewing and public analytics event collection do not change. Administrator customer, profile, card, analytics, and audit workflows remain unchanged.

## Enforcement and consistency

The server is authoritative for access state and each limit. Protect reads, writes, publishing, analytics queries, and upload endpoints so direct requests receive the same restrictions as the UI. Do not rely on hidden navigation or disabled controls for enforcement.

The local demo must apply the same access model and limits deterministically as Convex. A customer without a claimed card remains signed in and sees the limited workspace state; do not treat this state as an inactive or invalid account.

## Scope

Expected implementation areas include:

- Convex profile access, link and profile mutations, publication validation, customer analytics, and profile-media upload validation.
- Customer workspace access state and the profile, links, appearance, media, analytics, and card-tool UI.
- Local-demo account/card claim state, profile editing, and fixtures.
- Convex integration coverage and the existing deterministic demo E2E flow.

No schema addition is presumed for entitlement: reuse the existing successful claim record and card-to-profile association where they fully express the rule. Persist upload purpose with the upload job and asset as needed to enforce the slideshow restriction across direct requests and draft saves. Existing assets and published content must remain readable and intact.

## Verification expectations

Implementation should verify that:

1. Google sign-in without a successful claim grants limited profile editing and publication, not full card-owner access.
2. The server rejects a fourth link and disallowed theme/customization values for an unclaimed customer, while card owners retain the existing limits and options.
3. Unclaimed customers can upload profile photos and background images, but cannot upload or attach new slideshow images through either the UI or direct requests.
4. Unclaimed customers cannot read owner analytics or access card-owner tools through direct calls; ordering and claiming still work.
5. A completed token-plus-code claim unlocks the card owner's features only for the associated profile.
6. Administrators retain their existing access, public profiles remain available, and the local demo matches Convex behavior.
7. Existing profile and published data is not deleted by the limit change.

No implementation or verification is included in this draft.
