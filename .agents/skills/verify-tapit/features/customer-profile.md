# Customer profile and publication

Customers edit their profile, save a private draft, confirm visitors still see the published version, and publish only when they choose to make the changes public.

## Sub-features

- `profile-edit` opens the Profile workspace and edits the profile bio.
- `profile-draft` saves the new bio without changing the public snapshot.
- `profile-publish` publishes the draft and exposes it on the public slug.
- `profile-mobile-preview` switches between editing and preview on a phone without losing the draft.

## How to get to it (user POV)

- Sign in to the local demo as Mara and choose `Profile` in the customer workspace navigation.
- Open `/app/profile` directly after local demo sign-in.

## Driving it with Playwright

Preconditions:

- The local demo starts successfully through `npm run test:e2e:demo`.
- Use the fictional local customer account `mara@example.test` with password `tapit-demo`.

- **Edit and save a private draft.** Run `env -u TAPIT_E2E_PORT NEXT_PUBLIC_DEMO_MODE=true NEXT_PUBLIC_DEMO_STORAGE=local npx playwright test e2e/customer.spec.ts --project chromium --grep "customer drafts stay private until link and profile publication" --workers=1 --trace=on`. The test signs in through the `/login` form, opens `/app/profile`, enters `A private draft bio` in the `Bio or role` field, and chooses `Save draft`.
- **Enter through customer navigation.** Run `npm run test:e2e:demo -- --grep "desktop sidebar shows customer sections and Account and Help" --workers=1 --trace=on`. The journey is in `e2e/customer.spec.ts`; it checks the customer sections and Account/Help links in both the sidebar and account menu, then chooses `Profile` and requires `/app/profile` to be active.
- **Edit and save a private draft.** Run `npm run test:e2e:demo -- --grep "customer drafts stay private until link and profile publication" --workers=1 --trace=on`. The journey is in `e2e/customer.spec.ts`; it signs in through the `/login` form, opens `/app/profile`, enters `A private draft bio` in the `Bio or role` field, and chooses `Save draft`.
- **Check the public version before publishing.** In the same test run, the browser opens `/mara-velasquez`; `Brand systems for independent teams.` remains visible and `A private draft bio` is absent.
- **Publish and confirm from the visitor route.** The test chooses `Publish changes`, requires the `Profile published. Your active card paths now show this version.` status, then reopens `/mara-velasquez` and requires `A private draft bio` to be visible.
- **Proof.** Retain the configured JSON result and trace. The test's pre-publish and post-publish assertions are the second-view proof of draft privacy and publication.

## Gotchas

- Save draft and Publish changes are separate user actions. A saved draft alone must not be reported as published.
- The recipe changes only the isolated browser context's local demo state; it does not write to Convex.
- If local demo sign-in fails, stop and check Doctor and the exact mode before trying any other credentials.
