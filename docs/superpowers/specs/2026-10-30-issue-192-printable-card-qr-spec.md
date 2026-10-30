# Printable Card QR Codes

**Issue:** [#192](https://github.com/wehyn/tapit/issues/192)
**Related issue:** [#193](https://github.com/wehyn/tapit/issues/193) — Route permanent card URLs by card status
**Date:** 2026-10-30
**Status:** Approved in conversation

## Goal

Let administrators preview and download a print-ready QR code for every registered card in `/admin/cards`, including cards that have not been attached to a profile. The QR code must contain the card's permanent production URL, which is also encoded in its NFC tag.

## Existing behavior

- Local demo `/admin/cards` currently renders QR controls only for active cards; Convex live mode has no card QR control.
- The current QR control adds `source=qr` to its URL and is hidden for non-active cards.
- Card records contain a `cardUrl`; issue #193 defines the permanent URL and state-routing contract.
- The project already has client-side QR generation that can produce SVG and PNG output.

## Behavior

### Availability and placement

- Extend the existing per-card QR control in `/admin/cards`.
- Show the preview and download action for every registered card, regardless of whether it is unassigned, active, deactivated, replaced, or marked lost.
- A card's QR remains available after attachment, reassignment, deactivation, replacement, or loss. Its permanent URL does not change; scanning it follows the card's current state under issue #193.
- Do not provide a QR for an unknown card that has no registered record.

### URL encoded in the QR

- Generate the QR from the card's exact permanent production URL saved in `card.cardUrl`, as established by issue #193.
- Use `https://tapit-eosin.vercel.app` as the canonical card URL origin. Admin registration and replacement resolve relative `/c/<token>` input against this origin and reject absolute URLs from other origins.
- Preserve the full origin, path, and query string. For example, if the permanent URL is `https://tapit-eosin.vercel.app/c/card-29y887jo?claim=1`, encode that complete URL unchanged.
- Do not construct the URL from `window.location.origin`, the admin's current host, or a preview/development host.
- Do not add or remove query parameters, including `source=qr`. Do not put a one-time claim code in the QR. A stable `claim=1` hint may remain when it is part of the permanent URL.
- NFC and QR use the same full URL. A QR scan therefore reaches the same current card state and profile as an NFC tap.
- If a card record has no valid permanent URL, show a clear error and do not generate output using a guessed host.

### On-demand generation and output

- Generate the QR in the browser when the administrator opens the card's QR controls. Generate the preview and downloadable files from the same URL and QR settings.
- Do not save QR images or SVG strings in Convex, browser-local card data, or file storage. Do not add a schema field, upload flow, or cleanup job for QR output.
- Repeated generation from the same URL and settings must produce a QR that decodes to the same exact URL. The QR matrix and SVG output should be deterministic for the same input and options.
- Provide an inline preview and a downloadable SVG named from the card token, such as `card-29y887jo.svg`. The existing PNG preview or download may remain, but it must encode the same exact permanent URL as the SVG.
- The SVG is square, vector-based, black on an opaque white background, and includes a quiet zone of at least four modules. It contains no logo, gradient, or decorative treatment that could reduce scan reliability. It has no fixed physical print size; the printer can scale the vector in its layout.
- Disable download until generation succeeds. If generation fails, show an actionable error and allow retry; do not fall back to the current page's origin.

### Analytics

- Exact URL parity means the QR cannot append `source=qr` to distinguish QR scans from NFC taps.
- With `source=qr` omitted, the current public resolver treats a missing source as `nfc`; QR scans will therefore be counted as NFC by current analytics.
- This feature does not add a separate QR attribution mechanism. Changing that attribution is outside this issue.

## Data, access, and mode parity

- QR output is derived from the registered card URL and is not durable application data.
- Keep the feature admin-only within `/admin/cards`, using the existing route authorization.
- Local demo and Convex modes must expose the same preview, download, URL, and error behavior. Both modes must use the permanent production URL contract from issue #193, not the browser's current origin.
- No database migration, backend QR endpoint, or asset storage is required for this issue.

## Out of scope

- Status-specific card routing and destination behavior remain in issue #193. The canonical origin, registration, replacement, copy, and legacy local-demo URL migration are included in this implementation as the approved #193 URL-contract slice.
- Storing QR assets, configuring print orders, generating physical labels, or editing the SVG layout.
- Adding QR-specific analytics parameters or another attribution mechanism.
- Placing one-time claim codes in a URL or QR code.

## Acceptance criteria

- An administrator can preview and download a registered card's QR in `/admin/cards` before the card is attached to a profile.
- QR controls remain available for all registered cards after attachment, reassignment, deactivation, replacement, or loss.
- The QR decodes to exactly the permanent production URL used by that card's NFC tag, including its full path and query string.
- The generated URL does not depend on the admin's current preview or development host and has no QR-only query parameter.
- The QR contains no one-time claim code. Attaching or reassigning the card leaves the QR destination unchanged.
- The SVG is scalable, print-ready, high contrast, and includes a sufficient quiet zone for external print layouts.
- QR output is generated on demand and is not written to the database, browser-local card records, or file storage.
- Local demo and Convex modes have matching behavior. Generation errors do not produce a QR with an incorrect URL.

## Validation approach

Review the admin behavior in local demo and Convex modes. Confirm the QR control is available for unassigned and every other registered card state. Decode generated SVG output and verify exact origin, path, and query preservation for URLs both with and without `claim=1`; verify that no `source=qr` or one-time code is added. Generate the same QR repeatedly and confirm it decodes identically, then confirm generation performs no card or file-storage write. Simulate an unavailable or invalid card URL and a generator failure to verify the error state never substitutes the current browser origin.

Automated test implementation and execution belong to implementation work; this document defines the behavior those checks should prove.
