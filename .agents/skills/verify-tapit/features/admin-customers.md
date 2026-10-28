# Administrator customer access

An administrator grants or revokes owner-feature access for a cardless customer, checks the audit entry, and verifies the customer's access state. The admin override does not create a card claim; normal card claims still require the card token and one-time code.

## How to get to it (user POV)

- Sign in as the local demo administrator and choose `Customers` in admin navigation.
- Open `/admin/customers` directly after local demo sign-in.
- Create and invite a customer, complete setup through the local demo setup link, then return to Customers to manage the active account.

## Driving it with Playwright

Preconditions:

- Run only through `npm run test:e2e:demo`, which uses isolated local demo state.
- Use the fictional local admin account `admin@tapit.local` with password `tapit-demo`.
- The journey creates `override-owner@example.test` and completes its setup before testing the override.

- **Grant access.** Run `npm run test:e2e:demo -- --grep "administrator grants and revokes card-owner access for a cardless customer" --workers=1 --trace=on`. The journey is in `e2e/admin.spec.ts`; it creates and activates the customer, confirms the customer starts without Analytics access, then grants the override from Customers.
- **Check the grant.** The customer can open `/app/analytics` and see `Profile analytics`; `/admin/audit-log` shows `Customer owner access override changed`.
- **Revoke access.** The same journey revokes the override, checks the second audit transition, and confirms the customer's cardless notice `Claim a card to unlock owner tools` returns.
- **Proof.** Retain the configured JSON result and trace under ignored `test-results/`.

## Gotchas

- This recipe changes only isolated local demo browser state. Never run it against hosted demo or a deployment with shared records.
- The override is an audited access exception, not evidence of a physical card claim. Do not change card status or claim state to exercise it.
- This browser journey does not verify the separate token-and-one-time-code card claim flow.
