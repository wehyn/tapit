# Upload Preview and Compact Contact Display

## Status

Design approved during brainstorming on 2026-09-28. Implementation has not started.

## Summary

Improve the profile editing experience in two focused ways:

1. Show a selected background or slideshow image in the live preview immediately while the image is uploading to cloud storage.
2. Add compact contact-info presentation choices so Email, Phone, and Website can render as icon-only actions instead of icon-plus-label actions.

The upload preview is optimistic only in the editor. Persistence and publication remain cloud-backed and are blocked until the upload settles. Existing profiles keep the current full-label contact presentation by default.

## Goals

- Make an image selection feel immediately applied in the editor preview.
- Make upload progress and blocked actions understandable.
- Preserve the selected local image when an upload fails so the user does not lose editing context.
- Keep cloud persistence, media ownership, revision checks, cleanup, and publication safety unchanged.
- Offer two compact contact styles: icon-only circles and icon-only soft squares.
- Keep contact actions accessible and preserve their existing email, phone, and website destinations.
- Keep demo mode, live mode, draft saving, publishing, and public projection behavior consistent.

## Non-goals

- No change to the media upload endpoint or cloud storage lifecycle.
- No change to the published public profile while a draft upload is pending.
- No new image-processing pipeline, progress percentage, resumable upload protocol, or upload queue.
- No replacement of the existing full-label contact presentation.
- No additional contact fields or contact-management workflow.

## Approved UX decisions

### Media upload preview

Use the local-first behavior shown in the visual companion:

- The browser shows the selected file immediately through a client-local preview URL.
- A compact status communicates that the image is uploading.
- Save draft and Publish are disabled while the upload is pending.
- If a save or publish attempt reaches the editor while the upload is pending, show an explicit message that the image must finish uploading first.
- A refresh or close attempt while an upload is pending uses the native leave-page warning and the visible status reminds the user to keep the page open.
- On success, replace the local preview URL with the cloud-backed image returned by the existing upload flow.
- On failure, keep the local preview visible, show an actionable error, and keep persistence actions blocked until the user retries or removes the image. Retain the selected `File` long enough to offer a direct “Retry upload” action; selecting a different file replaces that pending selection.
- When replacing an existing image, the new local selection takes over the preview immediately; the previous cloud-backed image remains the persisted draft value until the upload succeeds.

The local-first option was selected over:

- A separate pending-media layer that would add more state and commit the draft only after success.
- Keeping the old image visible until the upload finishes, which is safer but makes the editor feel unresponsive.

### Compact contact presentation

Persist one display choice on Warm Studio customization:

- `labels`: current icon plus visible label behavior.
- `icons-circle`: icon-only circular actions.
- `icons-soft-square`: icon-only soft-square actions.

Circles and soft squares are equally supported selectable choices. The editor exposes all three as one mutually exclusive choice, avoiding invalid combinations such as a compact mode without a style.

- Existing records without this field normalize to `labels`.
- New profiles also default to `labels`; compact presentation is opt-in.
- Only populated email, phone, and website fields render.
- `mailto:`, `tel:`, and HTTPS website destinations remain unchanged.
- Icon-only controls keep accessible names and hover/focus labeling for Email, Phone, and Website.
- Compact controls retain comfortable tap targets and visible focus states.
- The live preview updates immediately; the public profile changes only after the draft is published.

## Architecture and data flow

### Upload state

The transient local preview must remain separate from the persisted `ProfileMediaPresentation`:

1. `ProfileMediaEditor` validates the selected file and creates a browser-local object URL.
2. The editor passes a client-only media projection into the live preview while the existing upload promise is pending.
3. `ProfileEditor` owns the overall pending/busy state used by Save, Publish, navigation-save, and refresh guards.
4. When the existing upload returns, the editor replaces the local image with the returned `ProfileMediaImage` and updates the draft.
5. The local object URL remains active while a failed selection is available for retry, then is revoked when the upload succeeds, the selection is removed/replaced, retry state is dismissed, or the component unmounts.
6. `draftForPersistence` continues removing URLs before sending draft content to Convex. Local `blob:` URLs must never reach Convex or public projection code.

Do not invent a fake Convex asset ID for a pending local image. Pending state is client-only and must not be treated as a valid persisted media asset.

The existing upload endpoint, authenticated profile scope, media revision header, ownership checks, and unreferenced-media cleanup remain the source of truth for cloud state.

### Contact display state

The new display choice flows through the existing customization path:

1. Shared profile customization types define the three display values and default behavior.
2. Normalization accepts missing legacy values and resolves them to `labels`.
3. The Convex customization validator accepts the persisted value on draft and published snapshots.
4. The customization editor updates the draft immediately.
5. `profileForPreview` and the public projection carry the value to `ProfileContactStrip`.
6. `ProfileContactStrip` renders the selected visual treatment while preserving action destinations and accessible labels.

No data migration is required because missing values have a backward-compatible rendering default.

## Components and responsibilities

Expected implementation touch points:

- `src/lib/profile-customization.ts`: display type, default, normalization, validation, and safe resolution.
- `convex/validators.ts`: persisted customization validator.
- `src/components/forms/ProfileCustomizationEditor.tsx`: contact display choice in the existing layout/customization controls.
- `src/components/profile/ProfileContactStrip.tsx`: labels, circular icons, and soft-square icons with accessible names.
- `src/components/forms/ProfileMediaEditor.tsx`: local object URL lifecycle, pending target state, and immediate preview handoff.
- `src/components/forms/ProfileEditor.tsx`: shared pending-media state, action guards, refresh warning, success/failure cleanup, and demo/live parity.
- `src/lib/profile-workspace.ts`: classify any new customization validation messages under the correct editor category.
- `src/lib/domain/index.ts` or the existing preview projection boundary only if needed to carry the client-only preview safely; persisted/public projection must remain URL-safe.
- Existing demo fixtures/state and profile projection paths: default and round-trip support for the new contact choice.

Avoid unrelated refactors or changes to storage, media processing, or publication authorization.

## Error and edge-case behavior

### Media

- Invalid file type/size: retain existing validation behavior and do not create a pending preview.
- Upload rejected or network failure: retain the local preview and selected file, show the failure message with “Retry upload,” and keep Save/Publish disabled until retry succeeds or the image is removed.
- User selects a newer file for the same target: the newest request wins; stale responses cannot overwrite the current preview or draft.
- Component unmount or navigation cancellation: invalidate the request and revoke the local object URL.
- Existing image replacement: do not delete or detach the prior cloud asset until the normal persisted-draft/publication lifecycle says it is unreferenced.
- Pending upload plus save/publish: block the operation and announce the reason through the existing message/status treatment.
- Pending upload plus refresh/close: use the browser leave-page warning.
- Demo mode must show the same pending, success, failure, and blocked-action semantics even though its storage implementation is local.

### Contact

- Missing customization field: render full labels.
- Missing email, phone, or website: omit that action without leaving a gap or placeholder.
- Invalid persisted customization value: normalize to the existing safe default.
- Icon-only action: expose an accessible name even though the visible text label is absent.
- Narrow screens: allow the action row to wrap without clipping or reducing the tap target below the existing minimum.

## Accessibility and responsive behavior

- Use real links for contact actions with their existing destinations.
- Provide accessible names on every icon-only link and preserve visible focus indicators.
- Do not rely on color alone for upload pending or error state; include text and status semantics.
- Use an `aria-live="polite"` status for upload state and action-blocking messages where the existing editor status pattern allows it.
- Keep contact actions keyboard reachable in the same order as the full-label version.
- Verify phone, desktop, and narrow responsive previews; compact contact actions must wrap cleanly.
- Honor reduced-motion preferences for any upload-state transitions.

## Verification plan

Follow the project’s E2E-first policy. Do not add unit tests after implementation unless an isolated test is unavoidable and the failure modes are documented first.

Run demo E2E coverage for:

1. Selecting a valid background image immediately changes the live preview before the upload promise resolves.
2. Selecting a slideshow image has the same immediate-preview behavior.
3. Pending upload status is visible and Save/Publish are disabled.
4. A save/publish attempt during upload produces the explicit pending-upload message.
5. A successful upload swaps the local URL for the cloud-backed result and re-enables eligible actions.
6. A failed upload preserves the local preview, exposes the error, and allows retry/removal without losing the selection.
7. A newer upload cannot be overwritten by an older response.
8. Existing profiles without the new customization field still render labeled contacts.
9. Each of labels, icon-only circles, and icon-only soft squares renders correctly in editor preview and after publish.
10. Email, phone, and website accessible names and destinations remain correct in compact modes.

Run the project verification command before completion:

```sh
npm run verify
```

Keep demo evidence separate from any Preview/Production or physical-device evidence. Do not use Production for E2E or provisioning.

## Acceptance criteria

- A selected background or slideshow image is visible in the editor preview immediately while cloud upload is pending.
- Pending upload state clearly explains why Save and Publish are unavailable.
- Refresh/close while pending warns the user.
- Upload failure does not discard the local preview and offers a clear recovery path.
- No local object URL, fake asset ID, or pending upload record is persisted.
- Existing media revision, ownership, cleanup, and publication behavior remain intact.
- Users can choose full labels, icon-only circles, or icon-only soft squares for populated contact actions.
- Existing profiles default to full labels without migration.
- Compact actions remain accessible, keyboard-operable, and responsive.
- Demo E2E coverage and `npm run verify` pass before the work is considered complete.
