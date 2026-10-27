# Card Order Administration and Payment Uploads

**Issues:** [#151](https://github.com/wehyn/tapit/issues/151), [#152](https://github.com/wehyn/tapit/issues/152), [#153](https://github.com/wehyn/tapit/issues/153)

**Related design:** [Card Ordering](docs/superpowers/specs/2026-10-23-card-ordering-design.md), [Fixed-price referral codes](docs/superpowers/specs/2026-10-26-founding-referral-price-design.md)

**Date:** 2026-10-27
**Status:** Draft for review

## Goal

Extend the existing card-order workflow with a dedicated referral-code workspace, optional QR images on payment methods, and customer-uploaded payment receipts. Keep current card pricing, referral eligibility and commission calculations, manual payment confirmation, and fulfillment transitions intact.

The three issue scopes can ship independently. QR images and receipts share order-scoped private-file requirements, but code administration does not depend on either upload feature.

## Existing behavior to preserve

- Card orders use one referral code at most. A code applies either the existing 10% discount or its configured fixed card price; these offers do not stack.
- Shipping is quoted separately. Referral commission is calculated from the pre-discount card price, excluding shipping.
- Orders snapshot their card price, discount, payment details, referral details, and commission when submitted. Editing settings or referral codes does not rewrite an order.
- Payment is manual. An administrator marks an order paid after reviewing the payment; uploads never change payment or fulfillment status.
- Local demo behavior must match Convex behavior.

## Scope

### #151 — Admin Codes workspace and usage history

- Add a **Codes** item to administrator navigation and a `/admin/codes` route.
- Move referral-code management out of `/admin/settings`. Settings keeps the launch date, payment methods, and other existing settings.
- List active and inactive codes with the code, internal referrer label, pricing rule, status, and submitted-order usage count.
- Support creating, editing, activating, and deactivating a code. Prefill edits, provide save/cancel feedback, normalize code input consistently, reject duplicates, and validate fixed prices using the existing rule: positive whole centavos and no more than ₱599. An unset fixed price continues to mean 10% off.
- Provide a usage view for each code. Show each matching submitted order's date, order ID, customer name or account identifier when available, payment status, fulfillment status, and commission status. Link each row to the existing admin order view. Do not show delivery address or phone number in this view.
- Count every submitted order associated with the code, including canceled, refunded, and unpaid orders. Include inactive codes and their historical uses.
- Determine usage from the saved order association and referral snapshot, not from the current active-code list or current code text. Keep code records available for history; deactivate rather than hard-delete them.
- Restrict the Codes workspace and its order/customer data to administrators.

### #152 — Optional QR images on payment methods

- Let administrators upload, preview, replace, and remove an optional QR image while creating or editing a payment method. Saving a method without an image continues to work; changing an image must not overwrite unrelated method fields.
- Accept PNG and JPEG files under 5 MiB. For images, enforce the existing card-order image limits at the upload boundary: no more than 6 megapixels and no edge over 12,000 pixels. Client validation may provide early feedback, but server validation is authoritative.
- Show the configured image beside the selected payment method's label, account details, and instructions in customer payment instructions. Use responsive sizing and useful alternative text. Methods without an image retain the current text-only view.
- Snapshot the QR asset reference alongside the payment details on new orders. Existing orders continue to use the method details and QR image selected when submitted, even after the method is edited, replaced, or deactivated.
- Keep QR assets private. Administrators may manage them; customers may access an image for an active method shown in checkout or for their own order snapshot. Do not expose asset references in public profile data or provide unauthenticated access to other customers' files.
- Retain an old QR asset while any payment method or order snapshot references it. Remove it only after it is unreferenced under the existing storage cleanup policy.

### #153 — Customer payment receipts

- In the customer order/account view, let the owner upload a receipt for an order only while it is `awaiting_payment` and unpaid.
- Allow the owner to replace the receipt until payment is confirmed. Show the selected file name, upload status, validation errors, and retry feedback.
- Accept PNG, JPEG, and PDF files under 5 MiB. Enforce the byte limit and actual content type at the upload boundary; enforce the existing 6-megapixel and 12,000-pixel image limits for PNG and JPEG files.
- Keep receipts private. Only the order owner and administrators reviewing that order may resolve or download its receipt. Do not publish receipt files at unauthenticated, shareable URLs.
- In the admin order detail, show the receipt file name and upload time, with an accessible image preview or a download/open action for formats that cannot be previewed inline.
- Uploading or replacing a receipt never changes payment or fulfillment status. Administrators continue to review the receipt and manually mark payment received.
- Keep the final attached receipt available for admin review after payment, cancellation, or refund, subject to the existing order-retention policy. When a replacement succeeds, clean up the replaced file only if no retained record references it. Clean up abandoned or interrupted uploads without removing the last successfully attached receipt.
- At upload finalization, recheck order ownership and payment state. If the order is no longer awaiting payment, reject the attachment and safely clean up the unattached upload.

## Data, access, and lifecycle

- Store QR and receipt references as private order/payment assets using the existing upload and storage conventions. Keep their metadata (file name, validated content type, byte size, and upload time where applicable) with the owning payment method or order. Do not store a public URL as the durable reference.
- Resolve an asset only after checking the caller's role and scope. QR access is allowed to an administrator, or to a customer viewing an active payment method or their own order snapshot. Receipt access is limited to the order owner and administrators with access to that order.
- Snapshot the payment method's text fields and QR reference when the order is created. Preserve referral code and referrer snapshots and the calculated price/commission fields on the order. Later edits change future orders only.
- Associate code usage with the saved referral-code record ID and order snapshot so code edits, deactivation, and historical statuses do not change the count or historical display.
- Apply the same validation, state transitions, authorization, snapshot rules, and cleanup behavior in local demo mode and Convex mode. Local demo assets remain in the existing browser-local asset store and must not become public URLs.
- Treat replacement as an atomic handoff: validate and attach the new asset before releasing an old asset. Failed uploads or saves leave the existing QR image or receipt usable.

## Error handling

- Reject unsupported, oversized, corrupt, or dimensionally invalid uploads with a useful message before attaching them to a record.
- Reject code duplicates and invalid fixed prices with field-level feedback; a failed edit leaves the saved code unchanged.
- If a customer attempts to attach or replace a receipt after the order leaves `awaiting_payment`, keep the order state unchanged and do not expose the unattached file.
- If cleanup cannot prove that a file is unreferenced, retain it for a later cleanup pass rather than risk breaking a live order or payment method.

## Acceptance criteria

### Codes

- Administrators manage codes at `/admin/codes`; the referral-code editor/list no longer appears in Settings.
- Active and inactive codes show an accurate count and a usage view with the specified order/customer identifiers and current statuses.
- Duplicate codes and invalid fixed prices are rejected. Admins can create, edit, activate, and deactivate codes.
- Editing or deactivating a code leaves submitted order totals, referral labels, commissions, and usage history unchanged.
- Customer checkout still accepts at most one code and preserves existing fixed-price, 10% discount, eligibility, and commission behavior.

### Payment QR images

- Admins can save a payment method with or without a QR image, preview an upload, replace it, and remove it without losing other method fields.
- Customers see a readable image only for a configured method, while text-only methods still work.
- Existing orders continue to show their original payment details and QR image after method edits or deactivation.
- Unauthorized users cannot resolve an image; unsupported, oversized, corrupt, or invalid-dimension uploads are rejected.

### Receipts

- A customer can upload or replace a receipt only for their own unpaid order while it awaits payment; another customer cannot view or change it.
- Administrators can access the receipt from the matching order and identify its file name and upload time.
- Receipt upload and replacement do not mark an order paid. The existing admin action remains the only way to confirm payment.
- The attached receipt remains available for review after payment, cancellation, or refund, subject to order retention. Failed or interrupted replacement does not break the previously attached receipt.

### Parity and regression

- The above behavior and validation are equivalent in local demo and Convex modes.
- Existing orders, payment methods without QR images, and codes without a fixed price continue to work.
- No receipt, QR image, customer address, or phone number is exposed through public profile data or to an unrelated customer.

## Validation approach

Review the customer and admin flows in both local demo and Convex modes. Cover code usage for active/inactive codes and canceled/refunded orders; edited-code snapshots; QR upload boundaries and old-order access after replacement/deactivation; receipt ownership, state-gated upload/replacement, failed replacement, retention after status changes, and manual-only payment confirmation. Check that cleanup never deletes a referenced asset and that unauthorized callers cannot resolve either file type.

Automated test implementation and execution belong to the implementation work; this document defines the behaviors those checks must prove.
