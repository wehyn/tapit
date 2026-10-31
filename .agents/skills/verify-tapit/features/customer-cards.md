# Customer Cards

The local-demo journeys for the signed-in customer's assigned cards and lost-card public resolution. They cover the `/app/card` list, `/app/card/order` designer link, owner actions, and both public lost-page choices.

## Driving it with Playwright

- **Manage assigned cards.** Run `npm run test:e2e:demo -- e2e/customer.spec.ts --grep "customer manages assigned cards" --workers=1`. The customer journey creates a new profile through signup, checks the empty Cards state and order link, then signs in as Mara and checks assigned-card display, secret exclusion, disabling, lost-marking with return instructions selected by default, and reactivation guidance.
- **Check lost-page privacy.** Run `npm run test:e2e:demo -- e2e/public-profile.spec.ts --grep "lost card selection renders public page without profile data" --workers=1`. The journey checks return-instructions and inactive resolution for a lost card and asserts neither page shows profile or owner identity.

Run only after the customer Cards route and owner actions are integrated. Each journey uses normal signup, sign-in, administrator, and customer UI flows. It does not set demo storage directly or call test-only APIs. The tests are local-demo only and do not prove Convex, hosted demo, live/Preview/Production, NFC writing, or physical-device behavior.

## Gotchas

- The demo browser context starts with Mara's active claimed and inactive assigned cards; signup provides a separate customer with no assigned cards for the empty-state check.
- Reactivation does not deliver a claim code. The owner must wait for an administrator to issue a fresh one-time code and then complete the existing claim flow.
