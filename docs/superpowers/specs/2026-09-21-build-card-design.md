# Build card design

## Goal

Add a public `/build-card` experience where visitors can choose to start from Tapit’s Canva template or preview an existing card design locally before deciding to order a card.

## Scope

- Add the public `/build-card` route.
- Present a focused chooser with:
  - `Build your own with Canva`.
  - `Already got your design? Upload`.
- Link Canva to `https://canva.link/tapit-templates` in a new tab.
- Accept one local PNG or JPG upload and show it in a centered card-preview popup.
- Add an `Order a card now →` action and a `Choose another design` action.
- Make the route reachable from the authenticated customer workspace while keeping direct access public.
- Reuse existing Tapit UI components, tokens, typography, focus styling, and auth behavior.

## Out of scope

- Convex storage, schema, mutations, or persisted card-design records.
- A real card-ordering, checkout, payment, or fulfillment workflow.
- Uploading files to a server or retaining them across navigation.
- Preserving the preview through login/signup; the user will re-upload after authentication for now.
- New global design tokens, raster assets, or third-party dependencies.
- Changes to existing pricing, landing-page, or profile-editing behavior beyond the minimum route entry.

## Visual design

- Use the existing Tapit paper background, ink/muted text, accent green, soft green surface, border, and rounded panel language.
- The page uses a focused chooser layout with a `Coming soon` badge, a short explanation, and two action cards.
- Canva is the visually prominent action; upload remains a clear secondary path.
- Upload opens a modal centered in the page viewport over a soft scrim. The page remains visible behind it so the preview feels connected to the builder.
- The modal’s content order is fixed:
  1. `Looks good?`
  2. Card preview.
  3. `Order a card now →`.
  4. `Choose another design`.
- The card preview uses the uploaded image without cropping it into a stored asset. The preview container must remain usable on narrow screens.
- The modal stacks vertically on mobile and keeps both actions reachable without horizontal scrolling.

## Interaction and state flow

1. A visitor opens `/build-card` without authentication.
2. Selecting Canva opens the configured template URL in a new tab with safe external-link attributes.
3. Selecting Upload opens a single-file picker limited to PNG and JPG MIME types.
4. A valid file creates a browser-only object URL and opens the preview dialog.
5. An unsupported type or file larger than 10 MiB leaves the dialog closed and exposes an accessible inline error.
6. `Choose another design` closes the dialog, revokes the object URL, clears the selected file, and returns to the chooser.
7. An unauthenticated visitor selecting `Order a card now →` is sent to `/login?next=/build-card`. The local preview is intentionally discarded by that navigation.
8. An authenticated visitor selecting `Order a card now →` sees an honest in-place ordering-coming-soon state; no checkout or order is implied.
9. Closing the dialog with the close control or Escape returns focus to the upload trigger and revokes the object URL when the preview is cleared.

## Technical approach

Keep the route public and avoid the authenticated `CustomerShell` redirect. Add a small route component and split the client behavior into focused responsibilities:

- `src/app/build-card/page.tsx` provides the route entry.
- `src/components/card-builder/BuildCardExperience.tsx` owns chooser state, file selection, auth-aware order behavior, and the page layout.
- `src/components/card-builder/CardPreviewDialog.tsx` owns the centered preview modal, keyboard behavior, and action presentation.
- A small file-validation helper may live beside the card-builder components if it keeps MIME/size rules independently testable.

Use the project’s existing demo/live auth branches so the order action can distinguish authenticated users without adding a new auth abstraction. Use `URL.createObjectURL` for the preview and revoke each URL on replacement, clear, or unmount. Do not write selected-file data to Convex, local storage, or session storage.

Add the minimum customer-workspace navigation entry needed to reach `/build-card`; direct public access must continue to work even when no session exists. Do not change existing landing-page pricing destinations.

## Accessibility

- The upload control has a visible or programmatically associated label and an explicit accepted-file description.
- File errors use the existing `Notice`/live-region pattern and are connected to the input with `aria-describedby`.
- The preview uses a labeled `role="dialog"` with `aria-modal="true"`, a visible close control, Escape-to-close, focus restoration, and keyboard-safe focus handling.
- The card image has meaningful alternative text derived from the selected file or a neutral description.
- Primary and secondary actions have descriptive names independent of color or position.
- Existing visible focus styles remain intact.

## Verification

- Add unit coverage for the initial chooser, Canva URL/target attributes, valid upload, invalid upload, local preview modal, choose-another-design cleanup, unauthenticated order redirect, authenticated coming-soon state, and modal keyboard behavior.
- Run formatting, lint, type checking, the targeted unit test, the full unit suite, and the production build.
- Visually inspect the route at desktop and narrow mobile widths, including the centered popup, long filenames, validation errors, and no horizontal overflow.
