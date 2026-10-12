# Profile Slideshow Upload Queue and Order Controls

## Status

Design approved during brainstorming on 2026-10-13. Written spec awaits user review before implementation planning.

## Goal

Make slideshow editing reliable when users add images in quick succession, and make the order of images easy to understand and change. The queue should avoid overlapping media uploads that can race the shared profile media revision used by draft saving.

## Scope

- Let users select another slideshow image while an upload is active; enqueue it instead of disabling selection or starting a parallel request.
- Show every queued image with its current status and position.
- Add clear, accessible controls for changing slideshow image order.
- Preserve the existing slideshow image limit of 10, counting uploaded, uploading, queued, and failed items.
- Keep Save draft and Publish unavailable until all queued uploads succeed or the user removes the failed item and the remaining queue drains.

This work does not change the upload endpoint, storage format, image processing, media ownership rules, or publication model. The reported `profiles:saveDraft` error motivates safer upload sequencing; its exact cause is not established by this design.

## Approved interaction design

### Upload queue

Selecting a valid image adds it to the end of a FIFO queue. The active upload finishes before the next queued item starts, so only one upload for the profile is in flight at a time. The file chooser and add-image control remain usable while another image uploads.

Each item displays a thumbnail, its current position, and a text status such as Uploading, Waiting, or Upload failed. Selection order determines queue order. A queued item may be removed before it starts. Reordering uploaded slideshow images changes display order; it does not reorder the upload queue or change which upload starts next.

The 10-image limit includes successfully uploaded slides and all pending or failed queue entries. At capacity, adding another image is disabled and the limit is explained in text. Invalid type or size continues to use the existing validation behavior and does not enter the queue.

Uploads continue serially after success. On failure, the queue pauses at the failed item so later selections cannot silently pass it. Keep the failed file and its preview available, identify the failure, and offer Retry and Remove. Retry resumes that item before later queued items. Remove discards the failed item and resumes the queue. Do not discard later queued files when one upload fails.

### Image order controls

Use visual companion layout B: place a distinct order strip above each image’s description and other settings. The strip contains:

- A visible numbered position (for example, “Image 2 of 5”).
- A visible drag handle for pointer and touch reordering.
- Move up and Move down buttons as keyboard-accessible alternatives; disable the button at the corresponding boundary.
- A polite status announcement after an image changes position.

Description, background treatment, and remove controls remain in the image settings area below the order strip. They must not appear to be part of the drag handle or reorder action. Dragging must not interfere with text inputs or settings controls.

The controls should fit narrow mobile widths without horizontal overflow, maintain comfortable touch targets and visible keyboard focus, and support keyboard operation through the move buttons. Reordering an uploaded item updates the draft and live preview immediately. Reordering is unavailable for queued items that do not yet represent uploaded slideshow images; their position remains governed by upload order.

## State and data flow

The editor owns an ordered client-side upload queue. Each entry retains the selected `File`, a local preview URL, a stable client key, and a status (`queued`, `uploading`, `failed`, or `uploaded`). The existing persisted slideshow model remains the source of truth for completed cloud-backed images and their order; transient queue state and `blob:` preview URLs stay client-only.

For each queued item, the editor starts the existing upload flow with the current media revision. On success, it advances the shared revision from the response, replaces that entry’s local preview with the cloud-backed image, commits the uploaded image into the draft, and starts the next queued item. The queue must not start another upload until the previous response has been applied. This sequencing is intended to prevent concurrent uploads from using the same stale revision.

On retry, use the latest known revision. Once a request has started, its response remains authoritative for the shared media revision even if the editor no longer displays that item; advance the revision from every successful response, but only update the visible draft when the item still belongs to the active editor state. Do not allow removing an actively uploading item to discard that response. Revoke each object URL when its queue item is removed, successfully replaced by the cloud image, or the editor unmounts. No local URL or queue metadata may be sent to Convex or included in a public profile projection.

Pending queue entries participate in the existing shared pending-media guard. Save draft and Publish remain blocked while an upload is active, queued, or failed. Navigation and refresh protection continue to cover pending work. When the queue is fully clear, existing save and publish behavior resumes.

## Error behavior

- Validation errors are shown on the selected file and do not block uploads already in the queue.
- Network or server failure pauses the queue at the failed entry, preserves its selected file and preview, blocks Save/Publish, and exposes Retry and Remove actions.
- Retry uses the latest media revision and preserves the failed entry’s place ahead of later selections.
- Removing a failed entry releases its preview URL and resumes later queued uploads.
- A stale response cannot reinsert a removed item or replace newer visible content. Every successful upload response still advances the shared media revision, even if its item is no longer displayed.
- Capacity checks account for uploaded and pending entries, including failed ones, so the user cannot exceed 10 slides.
- Upload completion updates the preview and draft without requiring a separate apply action.

## Accessibility and responsive behavior

- Use a semantic ordered list for slideshow images and expose each slide’s position in its accessible name or description.
- Provide an accessible name for the drag handle and each move button; announce completed moves through a polite live region.
- Keep reorder controls keyboard reachable and show focus visibly. Move buttons provide the complete non-drag alternative.
- Upload status and errors use text and status semantics; do not communicate state by color alone.
- Keep settings controls independently keyboard reachable and prevent drag activation from their interactive area.
- At phone widths, stack or wrap the order strip without clipping its number, handle, or buttons.
- Respect reduced-motion preferences for reorder and upload status transitions.

## Components and responsibilities

Expected touch points:

- `src/components/forms/ProfileMediaEditor.tsx`: queue entries, selection while busy, per-entry status, retry/remove behavior, order controls, announcements, and preview URL lifecycle.
- `src/components/forms/ProfileEditor.tsx`: serialize uploads through the existing upload mutation/request path, apply each successful response and media revision before continuing, and include all active/failed queue states in save, publish, navigation, and refresh guards.
- `src/lib/profile-media-preview.ts`: extend or replace the singular pending-preview projection so multiple local queue previews can be represented safely without persisting local URLs.
- Existing slideshow reorder and profile customization helpers: retain uploaded image order in the draft and preview using established state patterns.
- Slideshow editor styles and relevant E2E coverage: verify distinct order/settings regions and narrow layouts.

Do not alter Convex schema or the upload endpoint unless implementation inspection demonstrates that the existing API cannot support serialized uploads. If the save error still reproduces with serialized uploads, investigate and fix the proven revision/error path within this scope.

## Verification plan

After implementation, use the project’s existing E2E-first policy and verify:

1. Selecting a second image during an active upload immediately adds it to the visible queue and starts it only after the first settles.
2. Queue order follows selection order; a successful item updates the shared media revision before the next upload begins.
3. Uploaded, queued, uploading, and failed entries all count toward the 10-image limit.
4. A failed upload pauses later work, preserves its preview and file, blocks Save/Publish, and supports retry or removal.
5. Removing a failed entry resumes the remaining queue; retry runs before later entries.
6. Stale completion after removal or unmount cannot mutate the current draft or preview.
7. Reordering works with pointer/touch and Move up/Move down, announces the new position, and updates the live preview.
8. Dragging does not activate from description, background, or remove settings.
9. Reorder controls fit narrow widths and remain operable by keyboard with visible focus.
10. Existing slideshow images, save flow, publish flow, and demo/live upload behavior remain valid.

Run the project verification command before completion:

```sh
npm run verify
```

## Acceptance criteria

- Users can add another image while one is uploading; valid selections queue instead of being rejected or uploaded in parallel.
- The queue is serial, visible, ordered, retryable, and removable, with a clear paused state on failure.
- The 10-image limit includes every uploaded and pending queue item.
- Save draft and Publish are blocked until pending queue work has succeeded or been removed.
- Each uploaded slide has a visible position and drag handle plus accessible Move up and Move down controls.
- A successful move is announced and immediately reflected in the live preview and draft.
- Reorder controls are visually distinct from image description, background, and remove settings.
- Mobile layout and keyboard operation remain usable.
- No local preview URL or transient queue state reaches Convex or public profile data.
- The existing upload endpoint and ownership model remain intact unless a reproduced defect proves a scoped change is required.
