# Card Redirect Design

## Status

Draft for approval

## Summary

Add a profile-wide, toggleable redirect destination for active Tapit cards. A
customer configures the destination in `/app/links`, saves it as part of the
profile draft, and publishes it with the existing profile publication flow.
When the published setting is enabled and valid, taps and QR scans resolve
through Tapit, record the visit source, and then navigate to the configured
HTTPS destination. When it is disabled or unavailable, the existing Tapit
profile experience remains unchanged.

## User experience

The redirect control appears in the existing `/app/links` workspace, beside
the “Your links” heading area and above the profile-links table. It uses the
same surface, border, spacing, typography, switch, focus ring, and validation
patterns already used by `LinksWorkspace`.

The control contains:

- Heading: “Redirect card taps and scans”
- Supporting copy: “When enabled and published, active NFC and QR card visits
  are counted, then sent to your destination.”
- A clearly labelled toggle for enabling or disabling the redirect
- Label: “HTTPS destination URL”
- Helper text: “Use the full address, including https://.”
- A URL input, with the example value `https://www.harleystudio.com` used by
  the approved visual direction
- Inline success feedback for a valid destination: “Valid HTTPS destination”

The toggle and URL input are keyboard accessible and have explicit accessible
names. The validation message is associated with the input and announced when
appropriate. The control must remain usable at narrow mobile widths without
horizontal overflow.

## Redirect behavior

The redirect setting applies to the profile, and therefore to every active
card currently attached to that profile, including replacement cards. Per-card
overrides are intentionally out of scope.

The existing direct profile route `/<slug>` continues to render the Tapit
profile and is not redirected by this feature.

For `/c/<card-token>`:

1. Resolve the card using the existing resolver.
2. Require the same active-card, published-profile, active-customer, and
   available-profile checks currently required for the public card view.
3. If the published redirect setting is enabled and contains a valid HTTPS
   destination, record one analytics view with the existing `nfc` or `qr`
   source, then navigate to that destination.
4. Otherwise, record the normal profile view once and render the existing
   Tapit profile.

Redirects must never occur for missing, claimable, unpublished, inactive,
suspended, deleted, replaced, or otherwise unavailable cards/profiles. An
empty, disabled, malformed, unsafe-scheme, or credential-bearing destination
must fall back to the existing Tapit profile behavior.

The redirect remains Tapit-mediated so card visits continue to be counted.
Analytics must not be double-counted when a redirect is enabled. The browser
navigation should wait for the best-effort existing analytics mutation before
leaving the page; a failed analytics request must not strand the visitor on a
loading screen.

## Draft and publish semantics

Redirect configuration is part of the profile draft and published snapshot.
Saving changes updates only the draft. Until the customer publishes, active
cards continue to use the last published redirect state and destination.

Publishing must validate the redirect destination when the setting is enabled.
Disabling the redirect does not require a destination. The existing profile
publication validation, access checks, audit behavior, and success/error
messages remain intact. Unpublishing or account/profile deactivation removes
the redirectable state through the existing resolver checks.

## Data and validation contract

Add an optional redirect configuration to profile content and its published
snapshot. The shape should be explicit and small, for example:

```ts
redirect?: {
  enabled: boolean;
  destination: string;
}
```

The persisted Convex schema and server validators must accept legacy profiles
that do not have this field. Missing configuration behaves as disabled.

The shared domain validation should provide a redirect-specific validator with
these rules:

- Destination is required when enabled.
- It must parse as an absolute `https:` URL.
- It must have a nonblank hostname.
- It must not contain username or password credentials.
- Other schemes, malformed values, and blank values are invalid when enabled.

The client may show the inline valid state only when the same validation passes
that the server uses. Do not add checkout, ordering, payment, quote-request,
or unrelated profile behavior.

## Demo mode

Local/demo mode must mirror live mode closely enough to preview the control and
exercise the redirect flow using the existing demo store. Demo draft state and
published state must remain separate, and the existing demo analytics records
must receive the NFC/QR source exactly once for a redirected visit.

## Implementation boundaries

Expected changes are limited to the existing domain, profile persistence and
publication, card resolution, `/app/links` editor/workspace, demo state, and
relevant tests. Reuse existing components and design tokens. Do not add
dependencies, raster assets, new global tokens, or a separate redirect
service/checkout flow. Preserve the current public profile and unavailable
state screens.

## Verification

Add or update focused tests for:

- HTTPS redirect validation, including malformed, non-HTTPS, credential-bearing,
  blank, and valid destinations
- draft versus published redirect state
- active-card redirect resolution and NFC/QR source handling
- fallback behavior for every unavailable card/profile state
- no duplicate analytics view for redirected visits
- demo behavior where applicable

Run the repository’s formatting, lint, typecheck, and relevant existing test
commands. Visually verify `/app/links` at desktop, tablet, and narrow mobile
widths, including keyboard focus and validation states, and verify that the
card route does not introduce horizontal overflow.
