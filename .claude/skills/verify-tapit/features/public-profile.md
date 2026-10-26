# Public profile and card paths

Visitors open a published Tapit profile by its slug or by following an active card URL, then use its visible contact and profile-link actions.

## Sub-features

- `public-slug` resolves the published slug, including mixed-case direct URLs.
- `public-card` resolves an active card URL to the same published profile.
- `public-actions` exposes the profile links and Save contact action at narrow phone widths.
- `public-layout` keeps identity content centered without horizontal overflow.

## How to get to it (user POV)

- Open `/mara-velasquez` from a shared profile link or QR code.
- Open `/c/mara-card-7f2q` from the active demo card URL. This checks the URL resolver only; it does not simulate an NFC tap or scan hardware.

## Driving it with Playwright

Preconditions:

- The local demo starts successfully through `npm run test:e2e:demo`.
- The deterministic local fixture includes the published Mara Velasquez profile and active card URL.

- **Open the profile slug.** Run `npm run test:e2e:demo -- --grep "public profiles resolve lowercase and mixed-case direct URLs" --workers=1 --trace=on`. The journey is in `e2e/public-profile.spec.ts`; it opens `/mara-velasquez` and its mixed-case variant, and the `Mara Velasquez` heading is visible on both.
- **Open the active card URL.** Run `npm run test:e2e:demo -- --grep "direct and active card paths show the same published profile" --workers=1 --trace=on`. The journey is in `e2e/public-profile.spec.ts`; it checks `/mara-velasquez` and `/c/mara-card-7f2q`, which both resolve to the same published profile.
- **Check visitor actions and layout.** Run `npm run test:e2e:demo -- --grep "public profile (identity stays centered across screen widths|keeps its primary actions usable at narrow phone widths)" --workers=1 --trace=on`. The journeys are in `e2e/public-profile.spec.ts`; the `Mara Velasquez` heading, LinkedIn link, `Save contact` button, centered identity, and no-overflow assertions pass at the stated widths. The centering test writes `test-results/public-profile-mobile.png`.
- **Proof.** Retain the configured JSON result, Playwright trace, and `test-results/public-profile-mobile.png`. The test names and route assertions in `e2e/public-profile.spec.ts` identify each exercised entry point.

## Gotchas

- The `mara-card-7f2q` path is fixture data, not proof that a physical NFC card or QR reader works.
- A slug route and a card route are distinct entry points. Do not report one as proof of the other.
- Local demo data is browser-local. Do not compare it with hosted-demo or live Convex data.
