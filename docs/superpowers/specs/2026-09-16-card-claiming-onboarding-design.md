# Card Claiming and Customer Onboarding Design

**Date:** 2026-09-16
**Status:** Approved for planning

## Goal

Support two customer onboarding paths while keeping account creation and physical-card assignment separate:

1. An administrator creates a customer account and profile draft from an email address and the customer's design choice, then attaches a physical card.
2. A customer creates their own account and profile, after which an administrator attaches a physical card to that existing profile.

An unpublished card can be claimed by the person who received it using a one-time 8-character code delivered by email or another controlled contact channel. After the customer authenticates, confirms their profile, and publishes it, future NFC and QR visits show the public profile without rewriting the NFC card.

## Existing foundation

- Convex stores customers, profiles, cards, invitations, analytics, and audit logs.
- `customers` owns the application role and links to an authenticated Convex Auth user through `userId`.
- `profiles` have separate draft and published snapshots.
- Cards currently use unique `/c/<cardToken>` URLs and can be registered, assigned, deactivated, and replaced by administrators.
- Public profiles use `/<profile-slug>` URLs.
- The existing customer invitation/setup and email/password authentication flows remain available.
- QR output currently uses the card URL and must be extended for source attribution.

## Product model

Account/profile lifecycle and physical-card lifecycle are independent.

### Account and profile paths

#### Administrator-assisted

1. Admin creates an invited customer account with an email address.
2. Tapit creates a profile draft and applies the selected supported theme/design values.
3. Admin registers the unique physical card URL/token.
4. Admin attaches the card to the customer's profile after confirmation.
5. Admin generates a one-time claim code and sends the setup details through a controlled channel.
6. Customer claims the card, authenticates, confirms the draft, and publishes.

#### Customer-created

1. Customer signs up through the public customer signup flow.
2. Customer creates and saves their profile design/content.
3. Customer may publish before receiving a card, or leave the profile unpublished.
4. Admin registers the physical card URL/token.
5. Admin selects the existing customer/profile and confirms the attachment.
6. If the profile is already published, the card can show it immediately. If it is unpublished, the customer must claim/confirm it before publication.

An additional/replacement card for an existing customer is handled by the existing card assignment/replacement operations and does not create another account.

## Card and claim-code model

The public card token identifies the physical card. The claim code is a separate secret that proves possession of the card.

Example:

```text
NFC/card URL:  https://tapit.com/c/7H2K9P4Q
Claim code:    M4K8Z2PT
Public URL:    https://tapit.com/harley-buendia
```

Claim codes are card-level, not account-level, so multiple cards and card replacement remain manageable.

The card record gains a `claimable` operational state plus server-managed claim metadata. The card state transitions are `registered → claimable → active`; `inactive` and `replaced` remain terminal states. A card may enter `claimable` only when an administrator has attached it to a profile that is not yet published. The claim code is normalized, securely hashed, and never stored or exposed in plaintext. A code is single-use; regeneration invalidates the previous code. Claim attempts are rate-limited and use generic failure messages.

The admin UI displays a newly generated code for controlled handoff or copies it for delivery. The code is not required to be printed during the initial rollout. Automated delivery through a specific provider is not required for this slice.

## Card URL and source attribution

Use the existing card resolver so card status, assignment, replacement, and per-card identity are preserved:

```text
/c/<cardToken>             NFC/card path; existing URLs remain valid
/c/<cardToken>?source=qr   QR path
/<profile-slug>            Direct profile path; no source means direct
```

New NFC URLs may optionally use `source=nfc`, but existing bare card URLs are classified as the NFC/card path so they do not require rewriting. Source is an analytics attribution value, not an authentication or authorization mechanism; callers may forge it.

QR generation appends `source=qr` to the card resolver URL without changing the stored NFC card URL. Existing QR images that encode the bare URL cannot be retroactively separated from NFC visits.

Analytics aggregate rows gain a source dimension with the values `nfc`, `qr`, `direct`, and `unknown`. New bare `/c/<cardToken>` visits are attributed to `nfc`; QR visits use `qr`; slug visits without a source use `direct`. Existing rows are retained with `unknown` source because their original channel cannot be reconstructed.

## Unpublished-card visitor flow

When a card is associated with an unpublished profile, the resolver returns a fixed, non-private onboarding state. It must not expose draft name, image, links, email, phone, website, or design.

The screen says the card is not published and offers an owner path:

1. Visitor selects that they are the owner.
2. Visitor enters the 8-character claim code.
3. Tapit verifies the code server-side.
4. Visitor signs in or completes setup for the associated customer account.
5. The authenticated identity must match the intended account/profile before access is granted.
6. Tapit routes the customer to `/app/profile`.
7. Customer reviews/edits the draft and explicitly presses Publish.

The code alone does not create a durable authenticated session. The browser's normal Convex Auth session handles subsequent visits. If an authenticated user accesses a card belonging to another customer, the system must not reveal or edit that customer's draft.

When a profile is already published, the card resolver skips onboarding and renders or redirects to the public profile projection. Direct profile visits remain public and do not trigger owner setup based solely on a query parameter.

## Administrator dashboard

The customer-management surface supports:

- Create invited customer account by email.
- Select supported initial design/theme values and profile information where available.
- Show invitation/setup status.
- Register a unique card URL/token.
- Select an existing customer/profile for attachment.
- Preview a confirmation summary before attachment: card token, customer email, profile slug, profile status, and current card status.
- Confirm or cancel attachment.
- Generate, regenerate, invalidate, and copy the one-time claim code.
- Trigger a secure customer password-reset flow; admins never set, view, or retrieve customer passwords.
- Show account, card, claim, and publication statuses.
- Keep card deactivation and replacement operations administrator-only.
- Write audit records for account, card, code, and status changes.

Technically, card records attach to `profiles`; the dashboard displays the related customer account for usability.

## Publication rules

- Creating an account does not publish a profile.
- Saving profile content/design creates or updates a private draft.
- Publish remains an explicit action and promotes the validated draft to the public snapshot.
- If a customer already published before card attachment, no second publish is required.
- If the profile is unpublished, owner setup must complete and the customer must publish before public profile access through the card.
- No NFC URL rewrite is needed for profile edits, publication, card replacement, or ordinary content updates.

## Security and privacy

- Derive authenticated identity server-side through Convex Auth; never trust customer IDs, emails, or roles supplied by the browser for authorization.
- Treat the claim code as possession proof, not as a password or account identity.
- Hash claim codes and invalidate them after use or regeneration.
- Rate-limit claim-code attempts and password/setup operations.
- Keep unpublished drafts and private image URLs inaccessible to signed-out visitors.
- Do not reveal whether a guessed card token, code, or customer association exists beyond the minimum onboarding response.
- Audit administrative account creation, card attachment, code lifecycle, password-reset triggers, publication, and card status changes.

## Error and edge states

- Unknown or inactive card: existing missing/inactive card state.
- Unpublished card: generic onboarding state without private content.
- Invalid, expired, used, revoked, or rate-limited claim code: generic failure with retry guidance.
- Card already attached to another profile: block attachment and show a clear admin error.
- Duplicate card URL/token: block registration.
- Customer account/profile mismatch: deny claim without exposing the other account.
- Profile already published: skip owner onboarding and show the public profile.
- Profile validation failure: keep the draft private and explain what must be fixed before publishing.
- Account deletion, suspension, deactivation, and replacement continue to override card/public access according to existing rules.

## Out of scope

- Physical packaging or printed claim-code production.
- Ecommerce ordering, payments, subscriptions, or shipping workflows.
- Automated WhatsApp/SMS delivery without a selected provider.
- Custom CSS or arbitrary customer-created layouts.
- Open administrator signup.
- Visitor authentication or visitor-level analytics.

## Verification targets

- Admin can create an invited customer, configure initial design data, register a card, generate a code, attach the card, and see the confirmation/result states.
- Admin can attach a newly registered card to an already-existing customer profile without creating a duplicate account.
- A valid claim code permits only the intended customer to continue; invalid, reused, revoked, and cross-account attempts fail.
- Unpublished card access never returns draft content to signed-out or unrelated users.
- Customer authentication leads to `/app/profile`; publish makes the existing card URL resolve to the public profile.
- Published customer profiles do not require another publish after card attachment.
- NFC/card, QR, and direct source values are recorded in aggregate analytics, while legacy bare QR/NFC visits remain explicitly handled.
- Card deactivation and replacement continue to work without changing the public profile URL.
- Existing authentication, ownership, publication, card, analytics, accessibility, and demo-mode regressions remain green.
