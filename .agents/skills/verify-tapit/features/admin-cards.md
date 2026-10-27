# Administrator card registry

An administrator copies a card URL, registers and assigns a card, replaces an active card, and checks that the old URL is inactive while the replacement resolves to the profile.

## Sub-features

- `card-register` validates and registers a new pre-encoded card URL.
- `card-copy-link` copies the selected card's current-origin `/c/<token>` URL and confirms the clipboard action.
- `card-assign` attaches the new card to the selected customer profile.
- `card-replace` replaces an existing card and retires its former URL.
- `card-audit` records registration and replacement in the audit log.

## How to get to it (user POV)

- Sign in as the local demo administrator and choose `Cards` in admin navigation.
- Open `/admin/cards` directly after local demo sign-in.
- Follow a card path such as `/c/mara-card-7f2q` to check its visitor-facing result.

## Driving it with Playwright

Preconditions:

- The local demo starts successfully through `npm run test:e2e:demo`.
- Use the fictional local admin account `admin@tapit.local` with password `tapit-demo`.
- The deterministic fixture contains Mara's active card at `/c/mara-card-7f2q`.

- **Register and assign a card.** Run `npm run test:e2e:demo -- --grep "administrator registers, assigns, replaces, deactivates, and audits cards" --workers=1 --trace=on`. The journey is in `e2e/admin.spec.ts`; it opens `Cards`, enters `/c/new-card-abc` in `Pre-encoded card URL`, chooses `Register card`, and confirms `Attach card`.
- **Copy a card URL.** Before registration, the same journey selects Mara's active card, clicks `Copy link`, checks the visible confirmation, and verifies the clipboard contains the current-origin `/c/mara-card-7f2q` URL.
- **Replace and check both paths.** The test replaces the existing card with `/c/replacement-card-xyz`. It then opens `/c/mara-card-7f2q` and requires `This card is inactive`, followed by `/c/replacement-card-xyz` and the `Mara Velasquez` profile heading.
- **Check the audit record.** The test opens `/admin/audit-log` and requires `Card replaced` and `Card registered` entries.
- **Proof.** Retain the configured JSON result and trace, which contain the user actions and resulting route assertions.

## Gotchas

- Card operations here affect only the isolated local demo browser context. Never run this journey against hosted demo or a deployment containing shared records.
- An inactive former card must not resolve to the profile. Do not collapse the old and replacement URL checks into one.
- This browser journey does not verify writing an NFC tag or reading a physical card.
