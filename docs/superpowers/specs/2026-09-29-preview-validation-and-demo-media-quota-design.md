# Editor Media Preview Validation and Demo Storage Design

## Goal

Allow an uploaded background image to remain visible in the editor preview while its accessible description is still empty, but prevent the draft from being saved or published until the description is provided. Also prevent demo-mode image uploads from exhausting `localStorage`.

## Current behavior

`validateProfileMedia` correctly reports `A background image needs an accessible description.` for an empty background `altText`, but the public-profile projection normalizes invalid media out of the preview. This makes the image disappear before the user can finish editing it.

The demo upload path stores a data URL as both `url` and `previewUrl` in the persisted demo state. Large image data, especially when repeated across edits, can exceed the browser's `localStorage` quota.

## Design

### Editor-only incomplete-media preview

Keep the published/public projection strict: published profiles must continue to expose only media that passes accessible-description validation.

Add a narrowly scoped editor-preview projection path that can render draft media with an empty description. It will use the existing image source and emit `alt=""` for incomplete media. Pending object-URL previews will continue to use the existing client-only merge boundary.

The editor preview must not change `ProfileContent`, Convex validators, published snapshots, or public profile behavior.

### Save and publish validation

Use the existing media validation as the persistence gate. Both demo and live `saveDraft` paths will stop before writing when draft media validation returns errors, including the missing background description. Publish will retain its existing publication validation.

The validation message will remain associated with the Media workspace category and will be shown without hiding the preview. Adding a nonblank description clears the media error and enables saving/publishing.

### Demo media quota protection

Only the local demo upload path will change. Before persisting a successful demo upload, resize/compress the image to a bounded data URL suitable for the demo profile and store that data URL once as `url`; omit the duplicate `previewUrl` field. The existing local object URL remains responsible for the immediate pending preview.

The live upload path, cloud asset ownership, media revisions, and published storage behavior remain unchanged.

### Error handling

If demo image preparation or persistence fails, preserve the current draft and surface the existing local persistence error. A failed upload remains retryable through the existing media controls. No silent deletion or automatic clearing of user media will be introduced.

## Testing

- Add focused editor/E2E coverage that confirms incomplete background media remains visible in preview.
- Confirm Save draft and Publish are blocked until the description is entered, in both demo and live-compatible editor flows where practical.
- Confirm the successful demo upload persists one bounded image value without producing a quota error.
- Preserve existing pending-upload, retry, compact-contact, publication-privacy, and public-profile tests.
- Run formatting, lint, typecheck, unit tests, focused demo E2E, production build, and `npm run verify`.

## Scope boundaries

This change does not alter public accessibility requirements, published projection rules, Convex media ownership or revision semantics, cloud cleanup, or the compact contact display feature.
