# Administrator card registry

An administrator copies a card URL, registers an unassigned card, generates and invalidates its claim code, replaces an active card, and checks that the old URL is inactive while the replacement resolves to the profile.

## Sub-features

- `card-register` validates and registers a new pre-encoded card URL.
- `card-copy-link` copies the selected card's saved permanent URL and confirms the clipboard action.
- `card-assign` is completed by the buyer from their own authenticated card setup flow.
- `card-replace` replaces an existing card and retires its former URL.
- `card-archive-restore-reactivate` archives inactive or replaced cards, restores their prior state, and reactivates eligible cards with a separate fresh claim code.
- `card-audit` records registration and replacement in the audit log.
- `card-qr` previews and downloads an on-demand QR generated from the card's saved URL.
- `card-reassign` corrects an active or claimable card's profile assignment without replacing its URL.

## How to get to it (user POV)

- Sign in as the local demo administrator and choose `Cards` in admin navigation.
- Open `/admin/cards` directly after local demo sign-in.
- Follow a card path such as `/c/mara-card-7f2q` to check its visitor-facing result.

## Driving it with Playwright

Preconditions:

- The local demo starts successfully through `npm run test:e2e:demo`.
- Use the fictional local admin account `admin@tapit.local` with password `tapit-demo`.
- The deterministic fixture contains Mara's active card at `/c/mara-card-7f2q`.

- **Register an unassigned card and manage its code.** Run `npm run test:e2e:demo -- --grep "administrator registers unassigned cards, manages claim codes, replaces, deactivates, and audits cards" --workers=1 --trace=on`. The journey is in `e2e/admin.spec.ts`; it opens `Cards`, enters `/c/new-card-abc` in `Pre-encoded card URL`, registers it unassigned, generates and invalidates its claim code, then generates a replacement code.
- **Copy a card URL.** Before registration, the same journey selects Mara's active card, clicks `Copy card URL for mara-card-7f2q`, checks the visible confirmation, and verifies the clipboard contains `https://tapit-eosin.vercel.app/c/mara-card-7f2q` exactly.
- **Replace and check both paths.** The test replaces the existing card with `/c/replacement-card-xyz`. It then opens `/c/mara-card-7f2q` and requires `This card is inactive`, followed by `/c/replacement-card-xyz` and the `Mara Velasquez` profile heading.
- **Check the audit record.** The test opens `/admin/audit-log` and requires `Card replaced` and `Card registered` entries.
- **Preview and download a QR.** Run `npm run test:e2e:demo -- --grep "administrator previews and downloads a permanent card QR without storing an image" --workers=1 --trace=on`. The journey registers an absolute permanent URL without attaching it, opens its QR controls, downloads the SVG artifact, and checks that browser-local card state is unchanged.
- **Archive, restore, and reactivate.** Run `.agents/skills/verify-tapit/scripts/tapit-verify.sh prove "administrator archives, restores, and reactivates cards independently" issue-187-card-lifecycle-final-2026-10-30`. The journey confirms inactive and replaced rows can be archived and restored without freeing their tokens, reactivates cards into active or claimable state, preserves siblings, rejects stale claim codes, and claims with a separately generated fresh code.
- **Reject stale lifecycle confirmations.** Run `.agents/skills/verify-tapit/scripts/tapit-verify.sh prove "administrator rejects stale card lifecycle confirmations" issue-187-stale-card-actions-check2-2026-10-30`. Two admin tabs change the same card while Remove or Reactivate confirmation is open; the stale action must report an error and leave the newer state intact.
- **Reject invalid published snapshots.** Run `.agents/skills/verify-tapit/scripts/tapit-verify.sh prove "administrator cannot reactivate cards without valid published content" issue-187-invalid-published-userflow-2026-10-30`. The journey checks both an invalid content snapshot and a missing published snapshot; each failed attempt preserves the inactive card.
- **Proof.** Retain the configured JSON result and trace, which contain the user actions and resulting route assertions.

- **Reassign a misattached card.** Run `npm run test:e2e:demo -- --grep "administrator reassigns a misattached card without replacing it" --workers=1 --trace=on`. The local deterministic fixture includes `owner@example.test`, `profile-claimable`, and the unclaimed `claimable-card-demo`, plus Mara's active `mara-card-7f2q`. Sign in as the customer and publish `profile-claimable` through the normal customer UI, sign out, then sign in as the local demo administrator. Expand Mara's card and choose **Reassign card**. Confirm the **Reassign this card?** dialog identifies Mara Velasquez and Claimed profile, retains `/c/mara-card-7f2q`, and requires a fresh claim; confirm with **Reassign card**. The URL remains unavailable until the administrator generates a fresh code and the destination owner claims it. The same URL then resolves to Claimed profile, and `/admin/audit-log` shows the readable `Card reassigned to profile` entry and both assignments.
- **Scope.** This journey uses only isolated local-demo browser state and the deterministic demo fixture. It does not prove hosted-demo, live/Preview/Production, NFC writing, QR scanning, or physical-device behavior.

## Gotchas

- Card operations here affect only the isolated local demo browser context. Never run this journey against hosted demo or a deployment containing shared records.
- An inactive former card must not resolve to the profile. Do not collapse the old and replacement URL checks into one.
- Archiving only hides a card from the normal registry; its `/c/<token>` path remains inactive, and the token stays reserved.
- Reassignment eligibility excludes inactive and replaced cards. Reassignment keeps the original URL, invalidates prior claim state, and requires a fresh destination claim.
- This browser journey does not verify writing an NFC tag or reading a physical card.
