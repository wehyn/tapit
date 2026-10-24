# Customer links

Customers add and arrange the destinations visitors can open from a public profile, save link changes as a private draft, and publish those changes through the customer workspace.

## Sub-features

- `links-guided` creates email and phone destinations without asking users to type URL schemes.
- `links-save` saves edits and restores them after reopening the Links workspace.
- `links-order` changes the order of profile destinations.
- `links-publish` makes a changed link visible on the public profile after publication.

## How to get to it (user POV)

- Sign in as Mara and choose `Links` in the customer workspace navigation.
- Open `/app/links` directly after local demo sign-in.

## Driving it with Playwright

Preconditions:

- The local demo starts successfully through `npm run test:e2e:demo`.
- Use the fictional local customer account `mara@example.test` with password `tapit-demo`.

- **Enter through customer navigation.** Run `npm run test:e2e:demo -- --grep "desktop sidebar groups customer navigation and pins Account and Help" --workers=1 --trace=on`. The journey is in `e2e/customer.spec.ts`; after demo sign-in, it chooses `Links` in `Customer navigation` and requires `/app/links` to be active.
- **Add email and phone destinations.** Run `npm run test:e2e:demo -- --grep "guided link creation adds email and phone without scheme typing" --workers=1 --trace=on`. The journey is in `e2e/customer.spec.ts`; it opens `/app/links`, chooses `Add link`, then `Email address` and `Phone number`, and enters `hello@example.com` and `+1 555 123 4567` in the named fields.
- **Save and reopen.** The same test chooses `Save draft`, reloads `/app/links`, and requires the `Work email` and `Call me` destination fields to contain the saved values.
- **Publish a link change.** Run `npm run test:e2e:demo -- --grep "Portfolio link can use a new preset icon through publication" --workers=1 --trace=on`. The journey is in `e2e/customer.spec.ts`; it saves a Portfolio icon change, chooses `Publish changes`, opens `/mara-velasquez`, and verifies the visitor-facing Portfolio link has the new icon.
- **Proof.** Retain the configured JSON result and trace. The save/reopen assertions verify persisted draft state; the publication test verifies the resulting public link.

## Gotchas

- The guided email and phone recipe proves draft persistence; it does not publish those two new destinations.
- Link draft save and profile publication have separate controls. Report only the state proved by the selected recipe.
- Drag order uses a pointer interaction in the spec; if it fails, retain the trace and report the failed assertion rather than manually rearranging the fixture.
