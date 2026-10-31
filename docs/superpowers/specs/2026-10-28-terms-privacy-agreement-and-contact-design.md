# Terms, Privacy, Agreement, and Contact Design

**Status:** Draft for review
**Date:** 28 October 2026
**Issue:** [#179](https://github.com/wehyn/tapit/issues/179)

## Goal

Make Tapit's public Terms and Privacy Notice accurate and available before account access, require account holders to acknowledge the current documents, and use `officialntap.it@gmail.com` as Tapit's legal/privacy contact and default support email.

The root `spec.md` already describes card-order codes and payment uploads. This feature design belongs here so that existing specification remains intact.

## Current state

- `/terms` and `/privacy` are public routes linked from the homepage and authentication screens.
- `/login` supports customer signup and sign-in; live authentication uses Google. `/setup/[token]` completes administrator-invited setup.
- The public Terms describe agreement through account creation or service use, but the app does not collect or record explicit acceptance.
- `docs/privacy-notice-draft.md` documents unresolved facts and current implementation limits, including analytics keys, retention, account erasure, provider details, and notice updates.
- The workspace Help link uses `wayneegarcia@gmail.com`; Convex and demo defaults use `support@example.test`; other help surfaces use an administrator-configurable destination.

## Public documents

Keep `/terms` and `/privacy` as the canonical public documents. Keep both reachable from the homepage, login/signup, and invited setup before users submit credentials or finish account setup. The acceptance gate links directly to both pages and does not require an account to read them.

Revise the Terms to describe the service, account and profile-owner responsibilities, acceptable use, availability, privacy link, support contact, and effective date. Revise the Privacy Notice to match Tapit's deployed behavior and identify the operator as Wayne Garcia in the Philippines, with `officialntap.it@gmail.com` for privacy requests and contact.

The Privacy Notice must accurately cover account and Google sign-in data; profile and card content; published-profile visibility; aggregate view/click analytics and the browser session key; the keyed network-address hash used for abuse prevention; operational and administrator records; and processing by Google, Convex, and Vercel. It must distinguish current behavior from proposals. In particular, it must not claim automatic retention cleanup or complete account erasure until those controls are deployed and verified.

Resolve the publication questions in `docs/privacy-notice-draft.md` before treating the notice as final. Confirm the required operator address details, analytics disclosure and lawful basis, provider entities and processing locations, retention/deletion behavior, and how material updates will be communicated. Do not invent legal conclusions or operational guarantees. Obtain appropriate legal review before production publication.

Each document has a small explicit version identifier maintained with the document. Increment only the document whose substantive terms change. No administrative version-management UI is needed.

## Acceptance flow

Require a separate affirmative control for the Terms and the Privacy Notice. The Terms control records agreement; the Privacy control records acknowledgment and must not claim that acknowledgment is the lawful basis for analytics or other processing.

- **Customer signup:** require both controls before creating the account. For Google signup, carry the acceptance through the OAuth return and record it only after the account identity is established.
- **Invited setup:** require both controls before setup completes and the customer enters the workspace.
- **Existing customer and administrator accounts:** after authentication, block access to protected workspace content until the current document versions are accepted. Keep public routes and profile visits available without an account.
- **Later document changes:** require acceptance again only when the accepted version differs from the current version. Unchanged documents do not prompt again.

Persist the accepted Terms version, Privacy Notice version, account identity, and timestamp. Store this in Convex for hosted-demo/live accounts and in the deterministic local-demo store for local accounts. Do not collect IP address or user-agent data for acceptance. Preserve prior acceptance records when a version changes so the record identifies which versions the account accepted.

Enforce the gate at the authenticated application boundary, not only by disabling a client button. A direct visit to a protected route must reach the same acceptance step before account content is available. Return users to their requested route after acceptance, using the existing safe return-path handling.

The user must be able to read either document in a new tab without losing form state. Acceptance controls need visible labels, keyboard operation, and an announced validation error when unchecked. Existing sign-in and signup behavior should remain unchanged after valid acceptance.

## Support and contact email

Use `mailto:officialntap.it@gmail.com` for the legal/privacy contact and the default app support destination.

Update the public legal pages, privacy draft, workspace Help destination, Convex fallback, local-demo and Convex demo defaults, support-related product documentation, and affected assertions. Account help, authentication help, and inactive-card/unavailable-profile states should use the configured support destination where the app already supports an override. Keep that administrator setting; an intentional configured destination takes precedence over the default. Update saved values that exactly match the old personal address or placeholder default, and preserve other intentional overrides.

Audit active product copy and configuration for stale support addresses. Keep test/customer profile emails and historical administrator identities unchanged. Historical deployment notes should identify old contact details as historical or be updated when they describe the current support contact.

## Verification

- The legal routes and links from the homepage, login/signup, and invited setup work while signed out.
- Signup, Google account creation, invited setup, and existing customer/admin sign-in all require current acceptance before account access.
- Direct protected-route access cannot bypass the gate; accepting the current versions returns the user to the intended route.
- Acceptance is recorded once per current document-version pair with the authenticated account and timestamp, and version changes request new acceptance without affecting public profile visitors.
- Local demo and Convex-backed modes behave consistently, and demo fixtures remain deterministic.
- The default support destination is `mailto:officialntap.it@gmail.com` across app surfaces; the admin override still works and non-default saved values remain intact.
- Legal copy contains no unsupported retention, deletion, provider, or notice-delivery promises. Keyboard and assistive-technology checks cover acceptance controls and links.

## Out of scope

- Adding analytics opt-out or visitor consent controls. The Privacy Notice must disclose current analytics accurately; any analytics product change needs its own decision.
- Changing profile visibility, signup eligibility, authentication providers, or account-deletion policy.
- Replacing customer-facing profile contact details or test-account identities with the support address.
- Deploying retention, erasure, or provider changes as part of the document update.
