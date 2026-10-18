# Profile Avatar Upload Size Design

## Goal

Let customers and administrators use profile photos larger than 5 MB while keeping browser image work and stored avatar variants bounded.

## Current behavior

`validateProfileImageFile` rejects the selected source file above 5 MB before the crop dialog can prepare it. The shared validator is used by customer and administrator profile editors. The crop flow already draws the chosen square crop into a 384 by 384 canvas, exports opaque images as JPEG at quality 0.82, and preserves transparency as PNG.

The active profile-image HTTP route receives that prepared crop, not the original file. It enforces a separate 5 MB upload ceiling. Server processing requires the 384 by 384 dimensions, creates a 192 by 192 variant, and limits the combined stored image set to 5 MB. Those limits protect processed data and remain in place.

Profile gallery and background uploads have their own 5 MB policy. They are not part of this change.

## Design

### Source file acceptance

Raise the selected avatar source-file ceiling from 5 MB to 20 MB. Continue to accept JPEG, PNG, and WebP. Reject larger files before image decoding with the message `Images must be 20 MB or smaller.`

### Browser processing guard

Decode the source through a temporary object URL when supported, and revoke that URL after crop preparation completes or fails. This avoids making a base64 copy of the full source file during the crop operation. Keep the existing data-URL fallback for browsers without object-URL support.

After decoding, reject source images with an edge longer than 12,000 pixels or more than 24 million total pixels. Show `This image has too many pixels to crop. Choose a lower-resolution image.` Keep the existing 16 million pixel crop-area guard as a separate check.

### Crop output and storage

Keep the current 384 by 384 crop and its JPEG/PNG behavior. The client continues to upload only the prepared crop. Keep every backend 5 MB check, the 192 by 192 variant, and the combined image-set ceiling unchanged. No new image-processing dependency or storage migration is needed.

### User-facing behavior

Show `JPG, PNG, or WebP. Max 20 MB.` in the customer and administrator photo controls. A valid source between 5 MB and 20 MB opens the existing crop dialog and can be applied. A source above 20 MB, unsupported type, decode failure, or excessive pixel count shows a specific error and leaves the current avatar unchanged.

## Acceptance criteria

- A valid avatar source above 5 MB and at or below 20 MB can be cropped and applied in the customer editor.
- The same shared validation accepts that source in the administrator editor.
- A source above 20 MB is rejected with the 20 MB message before decoding.
- An image above either decoded-dimension limit is rejected with the pixel-count message.
- Crop output remains 384 by 384; the live route and stored avatar variant limits remain 5 MB.
- Profile gallery/background uploads continue to use their existing 5 MB limit.
- Cancelled or failed avatar changes preserve the current photo.

## Verification

Use the existing profile-photo crop E2E flow with a generated, valid PNG larger than 5 MB. Update the existing shared-validator boundary coverage before implementation, and cover the decoded-pixel guard. Run the focused local demo E2E and `npm run verify` after implementation, following the repository's demo-mode safety rules.

## Scope boundaries

This change does not alter profile gallery/background media limits, public profile rendering, Convex schemas, image ownership, revision behavior, publication flow, or any deployment configuration.
