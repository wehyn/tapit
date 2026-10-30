# Tapit verification map

This is the maintained map for priority journeys in Tapit's local demo. Read this index, then the matching feature file before driving. The map currently covers the public profile and card resolver, customer profile publication, customer links, administrator profile publication, administrator card lifecycle, and administrator customer access. It does not claim coverage for every customer utility, hosted demo, live deployment, or physical device.

## Baseline preconditions

- Run feature recipes with `npm run test:e2e:demo` (the `prove` subcommand of `../scripts/tapit-verify.sh` wraps it and keeps evidence in one run directory); it starts the current checkout on `127.0.0.1:3001` with local demo mode and local storage, then stops the server it owns.
- Do not prestart or reuse a server on port `3001`. If that port is occupied, stop and identify the listener rather than driving an unknown instance.
- The Doctor server on port `3000` (`../scripts/tapit-verify.sh launch`) must be stopped before any recipe runs: Next's `.next` lock makes Playwright's `3001` server fail to start otherwise. Run `../scripts/tapit-verify.sh stop` first.
- Each Playwright test gets an isolated browser context and local demo state. Do not run the hosted-demo or live project for these recipes.
- `README.md` documents the fictional local demo accounts: `mara@example.test` and `admin@tapit.local`, both with password `tapit-demo`. Do not use these credentials outside local demo mode.

## Driving conventions

- Run the exact test command in the selected feature recipe from the repository root.
- Use accessible names and routes in the recipe as the stable handles; do not substitute internal setters or test-only endpoints for the user flow.
- A passing test must prove the resulting state named in the recipe, not only that a route loaded.
- Use `--trace=on` and retain the JSON report, trace, and any screenshots under ignored `test-results/`.
- Keep local-demo results separate from hosted-demo, live/Preview/Production, and physical-device evidence.
- If a test's seed or precondition is missing, report the failed precondition. Do not weaken the journey to make it pass.

## Features

- [Public profile and card paths](./public-profile.md) covers slug URLs, active card URLs, visitor actions, and narrow layouts.
- [Customer profile and publication](./customer-profile.md) covers private drafts and the user-controlled publish step.
- [Customer links](./customer-links.md) covers guided link entry, saved drafts, ordering, and published links.
- [Administrator profile operations](./admin-profiles.md) covers editing, publishing, and checking the public result.
- [Administrator card registry](./admin-cards.md) covers registration, assignment, replacement, deactivation, audit visibility, and permanent card QR downloads.
- [Administrator customer access](./admin-customers.md) covers granting and revoking owner-feature access for a cardless customer and checking the audit and customer-visible access state.
