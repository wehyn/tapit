# Administrator profile operations

An administrator selects a customer profile, changes its public details, saves an administrative draft, and publishes the approved version.

## Sub-features

- `admin-profile-select` opens Mara's profile details from the Profiles registry.
- `admin-profile-draft` saves changed name, bio, and email without changing public content.
- `admin-profile-publish` publishes the reviewed details and checks the public profile.

## How to get to it (user POV)

- Sign in as the local demo administrator and choose `Profiles` in admin navigation.
- Open `/admin/profiles` directly after local demo sign-in.
- From the Profiles registry, choose the `Mara Velasquez /mara-velasquez` profile row.

## Driving it with Playwright

Preconditions:

- The local demo starts successfully through `npm run test:e2e:demo`.
- Use the fictional local admin account `admin@tapit.local` with password `tapit-demo`.

- **Select a profile.** Run `npm run test:e2e:demo -- --grep "administrator edits and publishes the selected customer profile details" --workers=1 --trace=on`. The journey is in `e2e/admin.spec.ts`; it signs in through `/login`, opens `Profiles`, selects `Mara Velasquez /mara-velasquez`, and opens the profile dialog.
- **Save an administrative draft.** In the `Edit profile` tab, the test changes the `Name`, `Bio or role`, and `Email` fields, then chooses `Save admin draft`. The dialog reports `Administrative draft changes saved. Public content is unchanged until publication.`
- **Publish and verify.** The test chooses `Publish`, closes profile details, and opens `/mara-velasquez`. The updated name, bio, and `mailto:mara-updated@example.test` action are visible.
- **Proof.** Retain the configured JSON result and trace. The public route check proves what visitors see after publication.

## Gotchas

- Admin profile edits are separate from customer-owned drafts; follow the admin UI and do not substitute the customer recipe.
- This demo test changes local browser fixture data only. Do not use hosted-demo or live admin credentials here.
- Publishing is a consequential visible transition even in the local demo. The test is isolated to its Playwright context and should not be changed to target shared storage.
