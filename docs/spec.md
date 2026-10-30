# Spec: Tapit

Document status: draft  
Author: `<name/team>`  
Date: 2026-10-30

## Product summary

Tapit is a mobile-first digital profile service for independent professionals, with the same one-account/one-profile model available to small businesses. A buyer receives a pre-encoded NFC card and completes setup by opening its permanent URL, authenticating, and explicitly attaching the card to their own profile. A recipient can tap the card, scan its QR fallback, or open the customer’s public profile URL to view the published profile and useful contact links.

Tapit addresses two connected problems: professionals need to share multiple contact destinations quickly in person, and they need to update those destinations without replacing printed or encoded cards. Each physical card has a permanent URL stored and encoded in full for NFC and QR. The URL identifies the card but does not prove ownership. Tapit resolves it according to the card’s current state and, after setup, to the profile’s current published content. Slug changes and approved assignment corrections do not change the card URL.

Live and hosted-demo customers authenticate with Google. New customers complete profile onboarding before being asked whether to attach a card; existing customers review their own profile before confirming. Skipping leaves an unassigned card available and the customer in the existing cardless limited-access state; scanning again resumes setup. Administrators manage customer accounts, profiles, NFC card records, package codes, assignments, replacements, correction requests, owner-access exceptions, suspensions, analytics, and audit history. Visitors need no Tapit account and no app.

Administrators can designate an active customer as Demo before promoting that account to Administrator. Demo remains a customer classification with ordinary customer permissions. A Demo customer can reset Tapit-owned account data and linked cards, then sign in with the same identity and complete onboarding again; ordinary customer deletion remains a separate flow.

## Goals

- Make in-person sharing of a professional identity and contact links fast through NFC and QR.
- Give each customer one public profile URL that can be updated without re-encoding a card; administrators may change its slug when needed.
- Support a clear, professional, accessible mobile profile experience.
- Let customers publish a small set of useful identity fields and ordered links.
- Give administrators controlled ownership of physical card records and assignments.
- Provide safe deactivation and replacement workflows that never expose a former profile through an inactive card.
- Provide privacy-preserving aggregate profile-view and link-click analytics.
- Provide a downloadable vCard containing only selected public contact fields.
- Establish a small, reliable MVP that can be validated with real professionals and recipients.

## Non-goals and future scope

The following are explicitly outside the MVP:

- Government-ID replacement, official identity verification, visitor authentication, or access control.
- Physical card manufacturing, sourcing, inventory management, encoding operations, and shipping.
- Customer-controlled card transfer, arbitrary reassignment, or a customer Cards screen. Buyers may attach an eligible card to their own profile through the protected setup flow; mistaken assignments require administrator review.
- Native iOS or Android applications.
- Custom domains, custom CSS, advanced layouts, and complex page builders.
- Uploading a custom `.ico` logo or picture for an individual link icon; links currently use built-in presets.
- Posts, videos, storefronts, courses, communities, or other rich content systems.
- Additional authentication providers and direct LinkedIn, WhatsApp, or other social-platform APIs.
- Multi-profile accounts, team workspaces, employee management, or granular administrator roles.
- Bulk card import, advanced attribution, demographics, cross-platform reporting, or visitor-level analytics.
- Automated moderation and public profile-reporting workflows.
- Customer billing, subscriptions, paid plans, and in-app payments.
- Lost-card return instructions and the dedicated lost-card page; issue #196 follows this work and adds them.

Potential future scope includes custom domains, richer content, team management, card inventory/fulfillment, customer billing, additional social integrations, and advanced analytics.

## Target users

### Primary: independent professionals

Independent professionals use Tapit at networking events, client meetings, business introductions, and other in-person situations. They need to share a professional identity and multiple destinations, including LinkedIn, WhatsApp, website, email, phone, booking pages, and social profiles. They value a profile they can update without replacing their card.

### Secondary: small businesses

Small businesses use the same one-account/one-profile model to present a business identity and contact destinations. Multi-profile employee/team management is not part of the MVP.

### Secondary: recipients and visitors

Recipients receive or tap a card. They need to view the published profile quickly on a phone, without installing an app or creating a Tapit account. They may tap NFC, scan a QR code, open a shared URL, select a link, or save a vCard.

### Operational: platform administrators

Administrators provision customer accounts and physical card records, generate and invalidate package codes, assign cards, correct reported assignment mistakes, deactivate and replace cards, manage profiles, view analytics, suspend content, and inspect audit history. MVP has one administrator role with full administrative access.

## Main user workflows

### 1. Customer starts with Google

1. A visitor continues with Google from the public login page or a card setup page.
2. A new user completes onboarding with a display name; Tapit creates one customer account and private draft profile with a unique slug.
3. If the user arrived from a card, Tapit returns them to that card URL after onboarding and then asks whether to attach it.
4. An existing customer returns to their workspace or card setup without creating a second account.

### 2. Administrator creates and invites a customer

1. An administrator creates an invitation for the customer’s verified email and profile display name.
2. Tapit provides a manually shareable invitation link; no authentication email provider is required.
3. The invited customer continues with Google from the link and must match the verified invitation email.
4. Tapit activates the pre-created customer and preserves the administrator-created profile.

### 3. Customer creates and publishes a profile

1. The customer signs in with Google.
2. The customer enters the required name and at least one link.
3. The customer optionally adds a profile photo or business logo, short bio/role, email, phone, website, booking link, social links, and other allowed links.
4. The customer chooses basic visual customization and orders the links.
5. The customer saves a draft and previews responsive desktop/mobile layouts.
6. The customer explicitly publishes the profile.
7. Tapit exposes the new published version at the current profile URL.

### 4. Customer updates a published profile

1. The customer signs in and edits profile fields, links, or theme settings.
2. Changes remain in draft until explicitly published.
3. The customer previews the change and publishes it.
4. Tapit updates the content shown at the current profile URL and through all active card URLs.
5. The NFC card does not need to be re-encoded.

### 5. Visitor uses a Tapit card

1. The visitor taps the NFC card or scans its QR code.
2. The complete permanent card URL resolves according to the card’s current state.
3. Tapit records an aggregate profile view without storing visitor identity.
4. Tapit displays the published profile on the visitor’s mobile browser.
5. The visitor may select a link, save a vCard, or return to the profile.
6. Selecting an external destination records an aggregate link click and opens the destination in a new tab where supported.

### 6. Visitor opens a direct profile URL

1. The visitor opens the current profile URL from a message, social bio, or other source.
2. Tapit records an aggregate profile view.
3. Tapit displays the same published profile as the NFC and QR paths.

### 7. Administrator replaces a card

1. An administrator selects an assigned card.
2. The administrator deactivates the old card immediately.
3. The old card URL begins showing a neutral unavailable-card page without revealing the former profile.
4. The administrator registers a new pre-encoded card URL and assigns it to the same profile.
5. Tapit records assignment, deactivation, and replacement events in the audit log.
6. The new card resolves to the profile’s current public URL.

Administrators may reactivate a visible inactive or replaced card assigned to an eligible profile. Reactivation preserves its token and profile assignment, sets it to active for a published profile or claimable otherwise, invalidates prior claim state, and requires a separately generated fresh one-time claim code. Inactive and replaced cards remain ineligible for reassignment.

### 8. Administrator corrects a card assignment

1. An administrator selects an active or claimable card that is attached to the wrong profile and chooses **Reassign card**.
2. Before committing, Tapit identifies the current and destination profiles and confirms that the card token and URL will stay the same and that the destination owner must make a fresh claim.
3. On confirmation, Tapit moves the card assignment without replacing the card, invalidates its prior claim codes and challenges, and removes card-derived owner access from the former profile owner.
4. The destination owner completes a fresh claim using the card token and a new one-time code. The destination may already have another active or claimable card.
5. Other cards and separate owner-access grants remain unchanged. Inactive and replaced cards remain ineligible for reassignment.
6. Tapit records the administrator and the old and new profile assignments in the audit log.

### 9. Administrator manages a profile

An administrator can view and edit customer profile content, publish or unpublish a profile, suspend it for policy enforcement, deactivate assigned cards, and inspect related audit history. An unpublished or suspended profile shows a branded unavailable-profile page and does not expose unpublished content.

### 10. Administrator grants or revokes owner-feature access

1. An administrator opens an active customer in `/admin/customers` and grants or revokes the admin owner-access override.
2. Tapit records each actual grant or revocation in the audit log; repeating the current state makes no change.
3. The override grants or removes only override-based card-owner access without creating or changing a card record; revoking it leaves access from a successful card attachment intact.
4. Card attachment still requires a package code and a current one-time verification challenge.

### 11. Customer requests account deletion

1. The customer submits a deletion request from Account.
2. The customer confirms the request.
3. An administrator reviews and executes or approves the deletion.
4. Tapit immediately unpublishes the profile and deactivates assigned cards.
5. Tapit retains a minimal administrative audit record.
6. Personal and profile data are permanently deleted after a retention period that is TBD.

### 12. Administrator designates or promotes a Demo customer

1. An administrator promotes an active customer to Demo in `/admin/customers`.
2. The account remains a customer with its existing profile and sign-in identity.
3. The administrator may later promote that Demo customer to Administrator. This replaces the Demo classification and preserves the account data and sign-in identity.
4. A customer cannot be promoted directly to Administrator, and administrators cannot be marked Demo.

### 13. Demo customer resets their account

1. A Demo customer chooses **Reset account** in Account and confirms removal of their Tapit data and linked cards.
2. Tapit removes the account's profile/onboarding data, links, customization, media, analytics, card orders and uploads, claim state, and linked or claimed cards while preserving shared or unrelated records.
3. Tapit retains the account's sign-in identity and Demo classification, then routes the account to customer onboarding.
4. The customer completes onboarding under the same identity. Ordinary customers keep the existing **Delete Account** request flow.

### 13. Buyer sets up a registered card

1. An administrator registers a pre-encoded card URL and leaves the card unassigned. The administrator may generate a package code before assignment.
2. The buyer opens the permanent NFC or QR URL. Its query string is an entry hint only and does not prove ownership.
3. The buyer signs in with Google or completes new-customer profile onboarding.
4. Tapit shows the customer’s own profile details and slug. The customer enters the package code, reviews the profile, and explicitly confirms attachment.
5. Successful confirmation attaches the card to the authenticated customer’s server-owned profile and consumes the package code. A profile with another live card cannot receive a second card.
6. Skipping leaves the card unassigned and the package code available. The customer stays in the existing cardless limited-access state and can resume by opening the same URL later.

### 14. Customer requests correction of a mistaken assignment

1. A signed-in customer proves possession of the package code through a current verification challenge and requests correction.
2. The permanent URL pauses on a neutral unavailable page while the request is pending; no profile data is returned.
3. An administrator reviews the request and may correct the assignment to the requester’s own profile.
4. Correction preserves the physical card, token, complete URL, and unused package code. The customer scans again and confirms the corrected profile.
5. If the requester’s profile already has a live card, the request remains pending and the admin interface explains the conflict.

## Functional requirements

- **FR-001:** The system shall support one customer account with one customer profile.
- **FR-002:** The system shall support one platform administrator role with full customer, profile, card, analytics, settings, and audit-log access.
- **FR-003:** Administrators shall be able to create customer accounts using an email address.
- **FR-004:** Administrators shall be able to create manually shareable customer invitation links that activate a pre-created customer after Google authentication with the matching verified email.
- **FR-005:** Live and hosted-demo customers shall authenticate with Google OAuth. Local deterministic demo authentication shall remain available and unchanged.
- **FR-006:** Account identity, role, and ownership shall be derived and enforced server-side; administrator interfaces shall not expose authentication secrets.
- **FR-007:** Administrators shall be able to create customer profiles and assign a unique slug before publication.
- **FR-008:** Self-service onboarding shall generate a unique slug from the customer’s display name. Customers may change it later through a dedicated authorized control; profile-save and publish operations shall not change it implicitly.
- **FR-009:** Administrators shall be able to change a profile slug at any time, including after publication. The system shall validate and reserve the new slug, update the current public URL immediately, and make the old direct profile URL stop resolving without a redirect.
- **FR-010:** The system shall require a name and at least one link before publication.
- **FR-011:** The system shall support an optional profile photo or business logo.
- **FR-012:** The system shall support an optional short bio or role.
- **FR-013:** The system shall support optional email, phone, website, booking, social, and other contact destinations.
- **FR-014:** The system shall accept valid HTTPS URLs and safe `mailto:` and `tel:` actions, and reject unsafe schemes such as `javascript:` and `data:`.
- **FR-015:** Customers shall be able to add, edit, label, enable, disable, delete, and reorder links.
- **FR-016:** Customers shall be able to select preset icons, including portfolio-friendly briefcase, gallery, palette, code, camera, and GitHub choices, and provide custom link labels. Uploading a personal `.ico` logo or picture in place of a preset icon is a future option.
- **FR-017:** Customers shall be able to customize profile colors, fonts, button styles, and select from a small set of themes.
- **FR-018:** The system shall support draft, published, unpublished, and suspended profile states.
- **FR-019:** Customers shall be able to save drafts and preview profile changes before publication.
- **FR-020:** Customer content changes to a published profile shall not become public until the customer explicitly publishes them. An authorized customer or administrator slug change shall update the public URL immediately without publishing pending content changes.
- **FR-021:** The system shall expose a platform-hosted public profile URL derived from the profile’s current slug.
- **FR-022:** The system shall store each physical card’s unique pre-encoded URL on the canonical `https://tapit-eosin.vercel.app` origin, in full including its query string, and preserve that value for NFC and QR. Relative `/c/<token>` inputs shall normalize to this origin; absolute URLs on other origins shall be rejected.
- **FR-023:** A claimed active card URL shall resolve to the assigned profile’s current published content, including after a slug change; the URL shall not prove ownership.
- **FR-024:** Administrators shall enter a relative `/c/<token>` path or a full URL on the canonical origin; the system shall reject duplicate tokens and preserve the validated URL and query.
- **FR-025:** Administrators shall be able to assign cards to profiles and generate a package code for a registered unassigned card or an eligible attached but unclaimed card.
- **FR-026:** Administrators shall be able to deactivate cards and issue replacements.
- **FR-027:** Deactivated or replaced cards shall not reveal the former profile.
- **FR-028:** Administrators shall be able to reactivate visible inactive or replaced cards assigned to an eligible profile. Reactivation shall preserve the token and profile assignment, set the card to active for a published profile or claimable otherwise, invalidate prior claim state, and require a separate fresh one-time claim code; inactive or replaced cards shall not be reassigned.
- **FR-029:** The system shall support standard NFC Forum NDEF URI records encoded with the exact stored card URL.
- **FR-030:** Administrators shall be able to generate a QR code for any registered card URL, including unassigned cards.
- **FR-031:** Administrators shall be able to preview and download card QR codes as PNG and SVG files.
- **FR-032:** NFC and QR shall use the same complete card URL and resolve to the same card state and profile content. Direct profile URLs resolve independently by current slug.
- **FR-033:** Visitors shall be able to view published profiles without a Tapit account or native app.
- **FR-034:** The public profile shall include a Save contact action when a name and at least one published contact field, profile photo, or enabled profile link are available.
- **FR-035:** Generated vCards shall contain the selected name, published profile photo, selected email and phone number, and every enabled published profile link with its label. They shall omit the Profile identity Website field and Tapit public profile URL, and duplicate link destinations shall appear once.
- **FR-036:** The system shall record aggregate total and unique profile views.
- **FR-037:** The system shall record aggregate link clicks.
- **FR-038:** NFC, QR, and direct profile visits shall count as profile views; selecting a destination shall count as a link click.
- **FR-039:** Analytics shall provide lifetime, 7-day, 30-day, and 90-day views.
- **FR-040:** The system shall not retain raw visitor-level analytics history.
- **FR-041:** Customers shall view analytics for their own profile.
- **FR-042:** Administrators shall view analytics and operational status for all profiles and cards.
- **FR-043:** Administrators shall be able to view all profile details, change profile slugs, edit and publish profile content, unpublish, suspend, or restore profiles for support and policy enforcement.
- **FR-044:** Administrators shall be able to view customer, profile, and card status.
- **FR-045:** The system shall record administrator actions for card assignment, deactivation, replacement, profile changes including slug changes, suspension, and deletion handling.
- **FR-046:** Audit entries shall include the administrator, action, affected account/card/profile, timestamp, and relevant before-and-after status.
- **FR-047:** Customers shall be able to view their account email, request account deletion, and access support. Live and hosted-demo authentication is managed by Google.
- **FR-048:** Customers shall not have a Cards screen or arbitrary card assignment controls. Buyers may attach a code-proven card to their own profile through the public setup flow.
- **FR-049:** Customers shall be able to copy and share their current public profile URL from the Profile area.
- **FR-050:** Deleted or unpublished profiles shall not expose unpublished profile information.
- **FR-051:** A visitor shall be able to begin customer onboarding through Google OAuth, including from a card setup return path.
- **FR-052:** A new customer shall complete onboarding with a display name and receive one account and private draft profile, without an invitation or published snapshot.
- **FR-053:** The system shall derive the signup email and account role from the authenticated server identity and shall never accept a caller-supplied user ID or role for provisioning.
- **FR-054:** The system shall normalize, validate, reserve, and uniquely enforce profile slugs at creation and on authorized customer or administrator changes. Customers shall not change a slug through profile-save or publish operations.
- **FR-055:** A self-service customer shall receive a platform-hosted profile URL after onboarding, unavailable to visitors until publication requirements are met. Card setup shall ask about attachment only after the profile and slug exist.
- **FR-056:** Self-service customers shall be able to use the existing labeled-link editor for portfolio, TikTok, social, contact, booking, and other destinations allowed by FR-014.
- **FR-057:** Selecting a profile in the administrator Profiles registry shall open a popup on an **Edit profile** tab and provide a separate **Details & slug** tab for the complete profile record, including the overview, draft and published values, image, contact fields, theme, redirect, links and their enabled state, publication state, and available profile timestamps.
- **FR-058:** Administrators shall be able to change a profile slug from the **Details & slug** tab. The slug change shall be authorized by the server, validated for format and uniqueness, synchronize the current slug in the draft and published profile, and record the actor and before-and-after values in the audit log.
- **FR-059:** A slug change shall not create a redirect or alias from the old direct profile URL. The old URL shall return the existing unavailable/missing-profile state until the slug is assigned to another profile, while assigned active card URLs shall continue resolving to the original profile at its current slug.
- **FR-060:** Before applying a slug change, the administrator control shall warn that the old direct URL will stop resolving and may later be assigned to another profile.
- **FR-061:** After an administrator changes a slug, the former slug shall be available for reuse. If assigned to another profile, the URL shall resolve directly to that profile and shall not redirect to the original profile.
- **FR-062:** Administrators shall be able to grant or revoke an audited owner-feature access override for an active customer. This exception shall not change card records; attachment still requires an authenticated customer, package code, and current one-time challenge.
- **FR-063:** Administrators shall promote an active customer to Demo before promoting that account to Administrator. Demo remains a customer classification; administrator promotion clears it and preserves the account data and sign-in identity.
- **FR-064:** A signed-in Demo customer shall be able to confirm an account reset that removes account-owned Tapit data and linked or claimed cards while preserving the sign-in identity, Demo classification, shared files, and unrelated account data, then complete customer onboarding again under that identity. Ordinary customer deletion behavior shall remain unchanged.
- **FR-065:** Newly registered cards shall remain unassigned by default. Administrators may generate codes for registered unassigned cards and eligible attached unclaimed cards.
- **FR-066:** A package code shall be stored as a hash and remain valid until used or explicitly invalidated/replaced. Show the raw code only in the administrator’s generation response. Legacy expiry timestamps shall not invalidate otherwise valid codes.
- **FR-067:** Package-code verification shall use a separate, one-time challenge that expires after 10 minutes. Expiring or replaying the challenge shall not consume the code.
- **FR-068:** Before attachment, the customer shall see their own profile details and explicitly confirm. The server shall derive the target profile from the authenticated customer.
- **FR-069:** Skipping shall leave the unassigned card and package code available, retain the cardless limited-access state, and allow setup to resume from the same URL.
- **FR-070:** A customer may request correction of a mistaken assignment only after proving the package code through a current challenge; requesting correction shall not consume the code.
- **FR-071:** A correction-pending card shall resolve to a neutral unavailable page without profile data until an administrator resolves it.
- **FR-072:** Administrator correction shall assign only to the requester’s server-owned profile and preserve the card record, token, full URL, and unused code. A second live card is blocked and remains an admin-visible conflict.
- **FR-073:** The resolver shall route a registered unassigned card to setup, an eligible unclaimed card to claim, a claimed active card to its current published profile, and inactive, replaced, correction-pending, or missing cards to a neutral unavailable page.
- **FR-074:** No public resolver response shall expose private drafts, unpublished or suspended profiles, foreign profiles, or data for unavailable cards.
- **FR-075:** NFC and QR shall preserve and use the full stored URL, including query strings. Query values never authorize ownership; package codes never appear in URLs or QR.
- **FR-076:** Lost-card status, administrator lost-card actions, configured return instructions, and the dedicated lost-card page are issue #196 follow-up scope after this work.
- **FR-077:** Administrators shall archive inactive or replaced cards without deleting their record, token, assignment, claim history, or audit history; restoring shall clear only the archive timestamp.
- **FR-078:** A profile may have multiple active or claimable cards, and changing one card shall not change the status, URL, or claim history of its siblings.
- **FR-079:** Administrators shall be able to correct an active or claimable card's profile assignment without replacing the card. Before confirmation, the administrator shall see the old and destination profiles and the unchanged card token/URL, and be told that the destination owner must make a fresh claim. Reassignment shall invalidate prior claim codes and challenges and remove card-derived owner access from the former owner. The destination shall be able to claim the card with a fresh one-time code even if that profile already has another active or claimable card. Other cards and separate owner-access grants shall remain unchanged. Inactive or replaced cards shall remain ineligible. The audit entry shall identify the administrator and old and new profile assignments.

## User experience

### Card resolver and setup flow

| Card state | Resolver result | Public profile data |
|---|---|---|
| Registered, no profile assignment | Setup | None |
| Claimable, package code not used | Claim | None |
| Claimable, code used, profile still a private draft | Setup | None |
| Active, package code not used | Claim | None |
| Active, code used, profile published | Active | Current published projection |
| Inactive or replaced | Inactive, shown as unavailable | None |
| Correction request pending | Unavailable | None |
| Token not found | Missing, shown as unavailable | None |

The resolver result, not a query such as claim=1, determines the page. NFC and QR retain the same full stored URL. Neither the URL nor its query proves ownership; package codes are entered only in the setup flow. Unpublished, suspended, foreign, or otherwise unavailable profile data is never returned by a public resolver.

### Information architecture and navigation

Customer navigation:

- Profile: identity fields, current public URL, read-only assigned slug, draft/published state, preview, and publish controls.
- Links: link list, add/edit forms, labels, icons, enabled state, and ordering.
- Analytics: profile views, unique views, link clicks, and time ranges.
- Account: Google account email display, deletion request, and support.

Administrator navigation:

- Customers: customer invitation creation/revocation, account status, and customer search. Invitation links are shared manually.
- Profiles: profile status, content management, publication, suspension, and support actions.
- Cards: full card URL registration, duplicate-token validation, initially unassigned cards, package-code generation/invalidation, assignment, correction review, replacement, QR generation, and QR downloads.
- Analytics: profile and link analytics across customers.
- Audit log: searchable administrative history.
- Settings: administrator and platform settings, including the configurable generic support/contact destination.

### Public profile screen

The public page should contain, in order:

1. Profile photo or business logo when available.
2. Name.
3. Short bio or role when available.
4. Ordered link buttons with labels and optional preset icons.
5. Save contact action when vCard data is available.

The page should be clean, professional, mobile-first, high contrast, and restrained. It should not require visitor registration. Profiles should emit generated page title, description, image, and URL metadata while remaining `noindex` by default.

### Customer profile editor

The editor should distinguish draft content from the currently published version. Required fields should be visibly marked. The customer should be able to save a draft, preview responsive layouts, and explicitly publish. The interface should show the current public URL and provide a copy action. Customers may change their slug through a dedicated control; administrators may also change it from the Profiles area.

### Link editor

The link editor should provide:

- Destination URL/action field.
- Custom display label.
- Preset service selector where available.
- Optional preset icon.
- Enable/disable control.
- Reordering control.
- Delete control with confirmation where appropriate.

Validation should explain invalid URL schemes, malformed addresses, missing labels, and duplicate or empty destinations without silently discarding user input. Maximum links per profile is TBD.

### Administrator card screen

The administrator card workflow should provide:

- Manual complete card URL entry with duplicate-token validation.
- Registration in an unassigned state by default.
- Assignment controls and package-code generation/invalidation for eligible cards.
- Pending correction requests with requester profile, current assignment, and correction action.
- Status: registered, claimable, active, inactive, replaced, correction-pending, or otherwise unavailable. Lost-card state follows in #196.
- Reassignment of eligible active or claimable cards, with confirmation of the old and destination profiles, unchanged token/URL, and fresh-claim requirement.
- QR preview and PNG/SVG download.
- Relevant audit history.

### Loading states

- Public profiles should show a lightweight loading state if profile data is not immediately available.
- Dashboard screens should show skeleton or progress states during account, profile, card, QR, image, and analytics operations.
- Publish, deactivate, suspend, replacement, and deletion actions must show in-progress feedback and prevent accidental duplicate submissions.

### Empty states

- New profiles should explain that a name and at least one link are required before publishing.
- Empty link lists should provide an Add link action and examples of useful destinations.
- Empty analytics should explain that views and clicks appear after visitors interact with the profile.
- An administrator with no customers or cards should see clear creation and registration actions.
- A customer should not see a Cards navigation area in the MVP.

### Validation and errors

- Required-field errors should be inline, specific, and associated with the relevant control.
- Unsafe URL schemes must be rejected before save.
- Duplicate card URLs must prevent registration and explain that the card is already registered.
- A signed-out buyer opening an eligible card URL can continue with Google and return to the same path and query string.
- Card setup shows only the signed-in customer’s own profile and never returns a foreign draft.
- Skipping setup leaves the card unattached and explains that rescanning the same URL resumes setup.
- Inactive, replaced, correction-pending, and missing cards show a neutral unavailable page without former or private profile data.
- An unavailable profile should show the fixed branded “This profile is currently unavailable” page.
- An inactive/replaced card should show the fixed branded “This card is inactive” page and must not show the former profile.
- Temporary service failures should show a friendly error page with the configured generic support/contact destination where appropriate.
- Failed avatar uploads should preserve the existing image and explain accepted JPG, PNG, and WebP formats and the 20 MiB source limit. Profile gallery and background uploads retain a separate 5 MiB source limit.
- Failed publish or card actions must leave the last known valid state intact and explain how to retry.

### Responsive behavior

- Public profiles must prioritize phone portrait layouts and remain usable on small screens.
- Customer and administrator dashboards must work responsively on modern desktop and mobile browsers.
- Link buttons, Save contact, form controls, QR previews, tables, and dialogs must remain usable without horizontal scrolling at supported widths.
- Images should be resized and optimized into responsive sizes.

### Accessibility

Tapit should target the agreed WCAG 2.2 AA basics:

- Semantic headings, labels, buttons, links, and form controls.
- Keyboard access for all dashboard and public interactions.
- Visible focus states.
- Sufficient text and control contrast.
- Alternative text for profile images and logos.
- Clear error messages associated with fields.
- Non-color-only status communication.
- Accessible drag/reorder alternative for links.
- Reduced-motion-friendly behavior where motion is introduced.

## Data and integrations

### Core data entities

#### Customer account

- Internal account identifier.
- Login email.
- Authentication reference managed by Convex Auth.
- Account status.
- Associated profile identifier.
- Created and updated timestamps.
- Deletion-request status and timestamps.

#### Profile

- Internal profile identifier.
- Current unique slug, changeable only by an administrator after profile creation.
- Display name.
- Profile image/logo reference.
- Short bio or role.
- Optional email.
- Optional phone.
- Optional website.
- Publication state: draft, published, unpublished, or suspended.
- Selected theme, colors, fonts, and button style.
- Created, updated, published, unpublished, and suspended timestamps as applicable.

#### Profile link

- Internal link identifier.
- Profile identifier.
- Destination value using an allowed scheme.
- Custom display label.
- Optional preset service/icon identifier.
- Enabled/disabled state.
- Display order.
- Created and updated timestamps.

#### NFC card

- Internal card identifier.
- Unique pre-encoded card URL on the canonical `https://tapit-eosin.vercel.app` origin, preserved exactly including any query string. Relative `/c/<token>` input is normalized to the canonical origin.
- Token derived from and unique within the card URL.
- Optional assigned profile identifier; new cards are unassigned by default.
- Card status, package-code hash and lifecycle timestamps, and correction-pending state.
- Assignment timestamp.
- Deactivation/replacement timestamp and reason where provided.
- Replacement relationship to prior or new card where applicable.
- Created and updated timestamps.

Package codes remain valid until used or explicitly invalidated/replaced. A separate one-time verification challenge expires after 10 minutes. A successful attachment consumes the code; a correction request proves possession but leaves it available for confirmation after administrator correction.

#### Card correction request

- Card and requesting customer/profile identifiers.
- Request status and request timestamp.
- Resolution timestamp and administrator identifier when resolved.
- No raw package code.

#### QR code

- Card identifier.
- Encoded unique card URL.
- Generated file references or reproducible generation metadata.
- PNG/SVG output metadata.

#### Aggregate analytics

- Profile identifier.
- Optional link identifier for click events.
- Event type: profile view or link click.
- Time bucket sufficient for lifetime, 7-day, 30-day, and 90-day reporting.
- Aggregate total and privacy-preserving unique counts.
- No visitor name, contact data, raw visitor history, or behavioral profile.

#### Audit log

- Audit entry identifier.
- Administrator identifier.
- Action type.
- Affected account, profile, and/or card identifier.
- Timestamp.
- Before and after status or relevant summarized values.
- Minimal metadata needed for support and accountability.

### Image handling

- Accept JPG, PNG, and WebP avatar source uploads up to 20 MiB. Reject a decoded
  image whose longest edge exceeds 12,000 pixels or whose total pixel count
  exceeds 24 million. Profile gallery and background uploads retain their
  separate 5 MiB source limit.
- Provide a 1:1 crop and preview before saving; the browser sends exactly one
  384×384 crop. The processed avatar request and combined stored avatar
  variants remain limited to 5 MiB.
- Store the 384×384 crop as the canonical large variant and generate a
  192×192 responsive variant. Opaque crops are JPEG; crops containing alpha
  remain PNG, without silently flattening transparent logos.
- Enforce a combined maximum of 5 MiB for the large and small output files.
- Store image references separately from profile records. A failed, cancelled,
  or invalid upload preserves the existing image and reports an actionable
  validation, upload, or service-failure state.
- Abandoned upload blobs are eligible for bounded cleanup only after 24 hours
  and only when they are unreferenced. This orphan grace period is separate
  from the unresolved legal/account-deletion retention period, which remains a
  launch decision.
- Draft image references and upload records are returned only to the owning
  account; public projections expose only published image URLs and never storage
  IDs, upload-job records, or raw uploaded bytes. A direct storage URL is
  reusable by anyone who obtains it; revocable draft media needs a separate
  authenticated serving decision before production.

### Required integrations

- **Convex:** backend functions, database, authentication integration, and profile image/file storage.
- **Vercel:** deployment for the Next.js web application.
- **Google OAuth:** live and hosted-demo authentication provider, configured separately for development, Preview, and Production.
- **Invitation links:** manually shared; no transactional email provider is required for authentication or invitations.
- **NFC:** no software API integration is required for visitors; cards use standard NDEF URI records.
- **Social platforms:** no API integrations in MVP. LinkedIn, WhatsApp, and other destinations are stored as ordinary links or safe direct actions.

### Technical architecture decision

Preferred architecture:

- Next.js serves public profile routes and responsive customer/administrator dashboards.
- Convex Auth manages Google OAuth authentication; Convex stores application data, runs backend functions, and stores profile images.
- Vercel deploys the Next.js application.
- An active card URL identifies the card, the backend resolves the card to its assigned profile, and the visitor receives the published profile.

Alternatives if this preferred architecture is not accepted:

- Keep Next.js and Vercel but use a managed authentication provider such as Clerk, with Convex integrated as the application backend.
- Keep Next.js but self-host the application and use another managed database/authentication platform.

Recommendation: use Next.js + Convex + Vercel for the MVP, but confirm production plan limits, monitoring, backups, and data-handling requirements before making it mandatory.

## Authentication and permissions

### Roles

| Capability | Customer | Administrator |
|---|---:|---:|
| Sign in with Google OAuth | Yes | Yes |
| Create/edit own profile | Yes | Yes |
| Save drafts and preview | Yes | Yes |
| Publish/unpublish own profile | Yes | Yes |
| Manage own links and theme | Yes | Yes |
| View own analytics | Yes | Yes |
| View all customer analytics | No | Yes |
| View assigned card details | No Cards screen in MVP | Yes |
| Register card URLs | No | Yes |
| Attach an eligible card to own profile through setup | Yes | N/A; admins use assignment controls |
| Arbitrary assign/reassign cards | No | Yes |
| Deactivate or replace cards | No | Yes |
| Suspend another profile | No | Yes |
| View audit log | No | Yes |
| Request account deletion | Yes | Yes for operational handling |
| Reset Demo account | Demo customers only | No |
| Execute or approve deletion | No | Yes |
| Promote customer to Demo / Demo to Administrator | No | Yes, in sequence |

### Authentication lifecycle

- Live and hosted-demo customer onboarding uses Google OAuth. New customers complete self-service onboarding; invited customers use a manually shared invitation link and matching verified email. Local deterministic demo authentication remains separate.
- The first administrator remains operator-provisioned. The public signup path never exposes an administrator role or creates an administrator account.
- Customer promotion to Administrator requires the account to be designated Demo first. Demo does not grant additional customer permissions; administrator promotion clears Demo while preserving customer data and sign-in identity.
- Demo customers may reset their account from Account. Reset removes their account-owned profile, media, links, customization, analytics, orders/uploads, claims, and linked or claimed cards; it preserves their sign-in identity and Demo classification and returns them to onboarding. Shared files still referenced elsewhere and unrelated account data remain intact.
- New Google users receive a pending customer state with access limited to onboarding. Completing onboarding creates or activates one customer account and one private draft profile through an authenticated server-side mutation.
- Invited customers authenticate with Google from the invitation link; a matching verified email activates the pre-created customer and preserves its profile.
- Customers do not need an account to visit a public profile.
- Convex Auth is the selected authentication implementation.
- Invitation links are reusable until revoked and are limited to the matching verified Google identity. They have no automatic expiry; administrators can revoke and replace them.

## Security, privacy, and compliance

- Card IDs/URLs must be unique and protected against duplicate registration.
- Card inventory, administrative assignment, and correction must be controlled by administrators. A buyer may attach only an eligible card to their own server-derived profile after proving the package code and confirming the profile.
- Customers must not be able to transfer cards, choose another profile, or access another customer’s profile-management data.
- A correction request requires package-code proof and administrator review. While pending, the card URL returns no profile data; correction preserves the permanent URL and unused package code.
- An administrator may grant or revoke owner-feature access for an active customer as an audited exception. The override does not change card records; attachment still requires a package code and one-time verification challenge.
- Server-side authorization must enforce account/profile ownership for every customer operation.
- Administrator actions affecting accounts, profiles, cards, owner-access overrides, suspensions, and deletion must be audited.
- Public profile fields must be opt-in at the field/link level; nothing is shown unless added and published by the owner.
- Visitor analytics must not store visitor names, contact information, raw visitor-level history, or behavioral profiles.
- The unique-view calculation must use a privacy-preserving method; exact method and retention window are TBD.
- Public profiles should be `noindex` by default while remaining accessible through direct URL, NFC, and QR.
- Allowed link schemes must be validated server-side as well as client-side.
- Profile-image upload validation must enforce type and size limits.
- Authentication must use Convex Auth with Google OAuth in live and hosted-demo environments; local demo authentication remains isolated.
- Rate limiting must protect login and sensitive administrative actions.
- Profile suspension and card deactivation must take effect immediately for public requests.
- Deletion must immediately hide profile content and deactivate cards, retain only the minimal audit record, and permanently delete personal/profile data after a TBD retention period.
- The initial operating jurisdiction is the Philippines. Before production, define the privacy notice, analytics disclosure/consent approach, data-processing responsibilities, and retention policy for that jurisdiction.
- The product must not represent a Tapit profile card as government identification, verified identity, or an access credential.

## Performance and reliability expectations

- The public profile should become usable within 2 seconds on a normal 4G connection.
- Public pages should use lightweight assets, optimized responsive images, and a clear loading state.
- The public profile service target is 99.9% monthly availability, excluding planned maintenance.
- Temporary failures should produce a clear, friendly error page rather than a blank screen or raw stack trace.
- Card lookup and profile rendering should not depend on a visitor-side native application.
- Analytics recording should not block or materially delay the public profile response.
- Publish, deactivation, and replacement operations should be consistent: after a successful response, subsequent public requests must reflect the new state.
- Monitoring, alerting, backups, recovery objectives, and the production Vercel/Convex plan are TBD and must be selected to support the availability target.

## MVP definition

The MVP is complete in scope when it provides:

- Google OAuth customer onboarding and administrator-invited customer accounts, with deterministic local demo authentication retained.
- One profile per customer account.
- Required name and one-link publication validation.
- Optional identity/contact fields and profile image/logo.
- Editable, reorderable links with custom labels, preset icons, and safe URL validation.
- Draft, preview, explicit publish, and unpublish behavior.
- Basic restrained profile customization.
- Profile slugs generated from a new customer’s display name or assigned by administrators for invited customers; authorized customers and administrators may change them.
- Pre-encoded card URL registration by manual entry, preserving the complete URL.
- Registered, initially unassigned cards with administrator-generated package codes.
- Buyer setup to attach a code-proven card to the buyer’s own profile after preview and explicit confirmation.
- Package codes that remain valid until used or invalidated, with a separate 10-minute one-time verification challenge.
- Skip and later resume behavior, plus administrator-reviewed correction requests that pause card resolution.
- Permanent card URL routing by card state to current published content only after successful attachment.
- QR-code preview and PNG/SVG downloads.
- Visitor profile access from NFC, QR, or direct URL without an account or app.
- vCard download with the approved field set.
- Privacy-preserving lifetime, 7-day, 30-day, and 90-day analytics.
- Administrator card deactivation and new-card replacement workflow.
- Neutral unavailable-card and unavailable-profile pages that do not expose former, draft, or unpublished profile data.
- Profile suspension and administrative audit log.
- Customer account deletion request and administrator execution/approval workflow.
- Responsive desktop/mobile dashboards and mobile-first public pages.
- WCAG 2.2 AA baseline accessibility work.
- Performance and availability validation against the agreed targets.

## Acceptance criteria

### Account and onboarding

- **AC-001:** Given an administrator creates a customer invitation, when Tapit creates it, then the administrator receives a manually shareable link that remains usable until revoked.
- **AC-002:** Given an invited customer opens the invitation link and continues with Google, when their verified email matches, then Tapit activates the pre-created customer and preserves its profile.
- **AC-003:** Given a new visitor continues with Google and completes onboarding with a display name, when provisioning succeeds, then Tapit creates one customer account and one private draft profile.

### Profile creation and publication

- **AC-004:** Given a customer has no profile content, when they attempt to publish, then Tapit identifies the missing required name and at least one link.
- **AC-005:** Given a customer enters a name and at least one valid link, when they save a draft, then the draft is stored without changing the public profile.
- **AC-006:** Given a customer previews a draft, when they switch between supported responsive layouts, then the preview reflects the draft without publishing it.
- **AC-007:** Given a valid draft, when the customer explicitly publishes it, then the profile becomes publicly accessible at its current URL.
- **AC-008:** Given a published profile has pending edits, when the customer saves without publishing, then visitors continue to see the last published version.
- **AC-009:** Given a customer publishes updated profile content, when a visitor loads the current profile URL, then the new content is shown without NFC re-encoding.

### Links and profile design

- **AC-010:** Given a customer adds an unsafe URL scheme, when they save the link, then Tapit rejects it with an actionable validation message.
- **AC-011:** Given a customer has multiple enabled links, when they reorder them and publish, then visitors see the new order.
- **AC-012:** Given a customer disables a link, when the profile is published, then the disabled link is not displayed publicly and is not counted as clickable.
- **AC-013:** Given a customer uploads a decodable JPG, PNG, or WebP avatar source of no more than 20 MiB and within the decoded-pixel limits, when they apply a 1:1 crop and save it, then Tapit stores a 384×384 canonical crop and a 192×192 responsive variant, uses JPEG for opaque output or alpha-preserving PNG for transparent output, and rejects a processed request or combined output exceeding 5 MiB.
- **AC-014:** Given a customer selects an unsupported, malformed, undecodable, zero-dimension, over-pixel-limit, oversized-source, or over-combined-output image, or a crop/upload encounters a validation, service, or authorization failure, when the upload is attempted, then Tapit reports an actionable failure and preserves the existing image and published state. Avatar source files above 20 MiB and gallery/background source files above 5 MiB are rejected. Unreferenced partial upload blobs are eligible for cleanup after 24 hours; this rule does not resolve account-deletion retention.

### NFC, QR, and card administration

- **AC-015:** Given an administrator registers an unused card URL, when registration succeeds, then Tapit creates an unassigned record, normalizes a relative path to the canonical origin, and preserves the complete URL and query. Absolute URLs on other origins are rejected.
- **AC-016:** Given an administrator enters a card URL already registered, when they submit it, then Tapit rejects the registration and identifies the duplicate condition.
- **AC-017:** Given an active card is claimed for a published profile, when its NFC URL is opened, then Tapit displays that profile’s current published content.
- **AC-018:** Given an administrator generates a QR code for a registered card, when they preview or download it, then both PNG and SVG encode the exact stored URL, including its query string.
- **AC-019:** Given a card is inactive, replaced, correction-pending, or missing, when a visitor opens its URL, then a neutral unavailable-card page appears without former or private profile data.
- **AC-020:** Given an old card is replaced, when the new card is assigned, then the old card remains inactive and the new card resolves to the assigned profile.
- **AC-021:** Given a customer uses the workspace, when they look for card management, then no Cards screen or arbitrary reassignment control is available; a code-proven buyer may attach only through the public setup flow.

### Public profile and vCard

- **AC-022:** Given a visitor opens an active profile through NFC, QR, or direct URL, when the page loads, then the profile is usable without a Tapit account or native app.
- **AC-023:** Given a profile has a name and published contact content, when a visitor selects Save contact, then Tapit downloads a vCard containing the name, published profile photo when available, each published email and phone number, and every enabled profile link with its label, without the Profile identity Website field, Tapit public profile URL, draft content, or duplicate link entries.
- **AC-024:** Given a profile is unpublished or suspended, when a visitor opens its profile or an assigned active card, then the branded unavailable-profile page appears without unpublished data.

### Analytics and audit

- **AC-025:** Given a visitor successfully loads a profile, when the visit is processed, then Tapit increments aggregate profile-view metrics without storing visitor identity.
- **AC-026:** Given a visitor selects an enabled destination link, when the redirect/open action occurs, then Tapit increments the corresponding aggregate link-click metric.
- **AC-027:** Given a customer opens Analytics, when data exists, then lifetime, 7-day, 30-day, and 90-day aggregate views and clicks are available for that customer’s profile.
- **AC-028:** Given an administrator opens Analytics, when data exists, then the administrator can view aggregate analytics for supported profiles and cards’ operational status.
- **AC-029:** Given an administrator changes card or profile state, when the operation succeeds, then the audit log records actor, action, target, timestamp, and relevant state transition.

### Deletion, privacy, accessibility, and reliability

- **AC-030:** Given a customer submits and confirms a deletion request, when an administrator executes or approves it, then the profile is unpublished and all assigned cards are deactivated immediately.
- **AC-031:** Given a customer uses a keyboard to navigate supported screens, when they interact with forms and controls, then all required functions remain operable with visible focus.
- **AC-032:** Given a visitor uses a supported current iPhone or Android phone on a normal 4G connection, when they open an active card URL, then the profile becomes usable within 2 seconds under the agreed measurement method.
- **AC-033:** Given the public profile service experiences a temporary failure, when a visitor requests a profile, then Tapit shows the friendly error page rather than an unhandled error.
- **AC-034:** Given the service is measured over a calendar month after production monitoring is established, when planned maintenance is excluded, then public-profile availability meets the 99.9% target.
- **AC-035:** Given Google onboarding creates a profile, when the customer opens the workspace, then the current profile URL is shown and the customer is directed to add links before publication.
- **AC-036:** Given a customer or administrator requests a slug that is invalid, reserved, or already in use, when the slug change is submitted, then Tapit rejects it with an actionable error and preserves the existing profile URL.
- **AC-037:** Given a newly signed-up customer saves a bio or links without publishing, when a visitor opens the profile URL, then the visitor sees the existing missing/unavailable state and no draft content.
- **AC-038:** Given a customer adds enabled Portfolio and TikTok HTTPS links and publishes a valid profile, when a signed-out visitor opens the profile URL, then the profile name, bio, and both labeled links are visible without authentication.
- **AC-039:** Given a visitor attempts to create an administrator account through the public login page, when signup is submitted, then no administrator path or role selection is available.
- **AC-040:** Given an invited customer opens a valid invitation and authenticates with the matching verified Google email, when access is granted, then the existing customer and profile are activated without replacing profile data.
- **AC-041:** Given a customer has a draft profile, when they attempt to change its slug through a general save or publish request, then the server rejects the implicit change; a dedicated authorized slug change remains available.
- **AC-042:** Given an administrator changes a profile slug, when the new slug is valid and unused, then the profile’s current URL changes immediately, the old direct URL shows the unavailable/missing-profile state without redirecting, and active card URLs continue resolving to the same profile.
- **AC-043:** Given an administrator enters an invalid, reserved, or already-used slug, when they submit the change, then Tapit rejects it and preserves the existing profile URL.
- **AC-044:** Given an administrator changes a slug, when the operation succeeds, then the audit log records the administrator, profile, old slug, new slug, and timestamp.
- **AC-045:** Given an administrator selects a profile in the Profiles registry, when its popup opens, then **Edit profile** is active, and selecting **Details & slug** exposes the overview, draft and published details, timestamps, and slug editor without changing the profile owner or card assignments.
- **AC-046:** Given an administrator changes a profile from an old slug to a new one, when the old slug is later assigned to another profile, then the old URL resolves to the newly assigned profile without redirecting to the original profile.
- **AC-047:** Given an administrator uses the profile popup, when they navigate between **Edit profile** and **Details & slug**, then both tabs work with keyboard input and fit the supported viewport without horizontal page scrolling.
- **AC-048:** Given an administrator promotes an ordinary customer, when the customer is first promoted to Demo, then the account remains a customer with its existing data and identity; only a Demo customer can then be promoted to Administrator, which clears Demo and preserves the existing data and identity.
- **AC-049:** Given a signed-in Demo customer confirms **Reset account**, when reset completes, then Tapit removes the account-owned data, claim state, and linked or claimed cards, preserves the sign-in identity and Demo classification, and returns the customer to onboarding under the same identity.
- **AC-050:** Given an ordinary customer requests deletion, when they use Account, then the existing deletion request and administrator approval flow remains available; Demo reset is unavailable to them.
- **AC-051:** Given a Demo reset removes account data, when shared files or unrelated records remain referenced, then those records and files remain available to their other owners.
- **AC-052:** Given an administrator registers a card, when registration succeeds, then the card remains unassigned and the administrator can generate a package code before assignment.
- **AC-053:** Given a package code has not been used or invalidated, when time passes or its legacy expiry timestamp is in the past, then it remains valid; a verification challenge expires after 10 minutes and can be used only once.
- **AC-054:** Given a signed-out recipient opens an eligible card URL, when they continue with Google as an existing or new customer, then Tapit returns them to that exact URL with its original query string.
- **AC-055:** Given a new customer arrives from a card URL, when profile onboarding completes, then the slug exists before Tapit asks whether to attach the card; an existing customer sees their own profile details before confirmation.
- **AC-056:** Given a customer verifies a valid package code and confirms their own profile, when attachment succeeds, then the card attaches to that server-derived profile and the code is consumed; a profile with another live card cannot receive a second attachment.
- **AC-057:** Given a customer skips card attachment, when they open the same card URL later, then the card and code remain available and setup resumes while the customer remains in the cardless limited-access state.
- **AC-058:** Given a card URL is resolved, when its record is registered/unassigned, eligible but unclaimed, active and claimed, inactive/replaced, correction-pending, or missing, then the resolver returns setup, claim, the current published profile, or neutral unavailable state without treating the query as ownership proof.
- **AC-059:** Given a claimed active card’s profile slug or approved assignment changes, when the same full card URL is opened, then it resolves to the current assigned profile’s published content and the stored URL remains unchanged.
- **AC-060:** Given an authenticated customer proves a package code and reports a mistaken assignment, when the request is pending, then the card URL shows a neutral unavailable page without profile data and the code remains unconsumed.
- **AC-061:** Given an administrator resolves a correction request, when assignment correction succeeds, then the same card record, token, full URL, and package code are preserved and the customer must rescan and confirm the corrected profile.
- **AC-062:** Given NFC and QR are generated for a card URL with a query string, when each is inspected, then both use the exact stored URL and contain no package code.
- **AC-063:** Given a card or profile is missing, unavailable, unpublished, or suspended, when its permanent URL is opened, then Tapit exposes no private draft, foreign, or former-owner data.
- **AC-064:** Given a correction request targets a profile that already has a live card, when an administrator reviews it, then the request remains pending, the conflicting card is unchanged, and the admin interface explains the conflict.
- **AC-065:** Given an administrator archives an inactive or replaced card, when they open Archived and restore it, then the token and history remain reserved, the prior status returns, and the URL remains inactive.
- **AC-066:** Given an administrator reactivates a visible inactive or replaced card, when reactivation succeeds, then its status follows the current profile state, old claim state is invalidated, and a separate fresh one-time code can be generated and claimed.
- **AC-067:** Given multiple active or claimable cards are assigned to one profile, when an administrator reactivates one card, then every sibling card keeps its own status, URL behavior, and claim state.

## Open questions and decisions

### Confirmed decisions

- Project name: Tapit.
- MVP audience: independent professionals first, with small businesses supported through the same one-account/one-profile model.
- Primary problem: updateable contact information and fast in-person sharing, with multiple useful links as the core content.
- Primary usage: networking, client meetings, events, and business introductions.
- Onboarding: new customers start with Google OAuth and complete profile onboarding; invited customers use a manually shared invitation link and matching Google identity.
- Customer dashboard: Profile, Links, Analytics, and Account. No customer Cards screen.
- Administrator dashboard: Customers, Profiles, Cards, Analytics, Audit log, and Settings.
- Authentication implementation: Convex Auth with Google OAuth for live and hosted-demo environments; local deterministic demo authentication remains separate.
- Preferred application stack: Next.js, Convex, and Vercel, subject to production validation.
- Card format: NFC Forum NDEF URI record.
- Card administration: administrators manually enter full card URLs, validate token uniqueness, leave new cards unassigned, generate/invalidate package codes, assign cards, review corrections, deactivate cards, and issue replacements.
- Card links: permanent URLs identify cards and route by current state to the current published profile only after successful attachment.
- QR: administrator preview plus downloadable PNG and SVG.
- Public URL: platform-hosted and derived from a unique slug; self-service customers may choose the initial slug, and administrators may change it at any time. Customers cannot change an existing slug. A changed slug does not redirect the old URL, and the former slug becomes available for reuse; active card URLs continue resolving to the profile’s current URL.
- Profile publication: name plus at least one link required; draft, preview, and explicit publish.
- Profile links: arbitrary valid HTTPS plus safe `mailto:` and `tel:` actions, with labels, preset icons, enable/disable, and ordering.
- Public design: clean, professional, mobile-first, strong contrast, restrained themes.
- vCard: selected name, published profile photo, selected email and phone, and all enabled published profile links with labels; the Profile identity Website field, Tapit public profile URL, and duplicate link destinations are omitted.
- Analytics: aggregate profile views and link clicks; lifetime, 7-day, 30-day, and 90-day views; no raw visitor-level history. Both customers and administrators can see analytics within their permissions.
- Card/profile states: neutral unavailable-card page for inactive, replaced, correction-pending, and missing cards; unavailable-profile page for unpublished/suspended profiles. #196 adds lost-card return instructions and a dedicated page after this work.
- Deletion: customer request and confirmation, administrator execution/approval, immediate unpublish/deactivation, minimal audit retention, later permanent deletion.
- Accessibility: WCAG 2.2 AA basics.
- Performance/reliability: usable within 2 seconds on normal 4G and 99.9% monthly public-profile availability excluding planned maintenance.
- Billing and physical card fulfillment: deferred/out of scope for MVP.

### TBD items and technical options

- **Author:** `<name/team>` is not yet provided.
- **Production domain:** TBD. Options are a Tapit-owned domain, a subdomain of an existing company domain, or a temporary deployment domain. Recommendation: use a Tapit-owned production domain before issuing cards at scale.
- **Maximum links per profile:** TBD. Options are no product cap, a fixed MVP cap, or a plan-based cap. Recommendation: use a documented MVP cap only if needed for performance or usability; otherwise begin without a user-visible cap and monitor.
- **Customer recovery:** Google account recovery is provided by Google for live and hosted-demo authentication. Any future provider or identity-replacement flow requires a separate decision.
- **Invitation-link policy:** manually shared, reusable until revoked, and limited to the matching verified email.
- **Customer account email changes:** TBD. Options are disallowing changes in MVP or requiring administrator-mediated verification. Recommendation: disallow self-service email changes in MVP and handle exceptional changes administratively.
- **Unique-view calculation:** TBD. Options include privacy-preserving rotating pseudonymous identifiers, coarse time-bucketed counting, or aggregate edge analytics. Recommendation: choose a method that cannot reconstruct visitor history and document its retention window.
- **Deleted-data retention period:** TBD. Recommendation: define the period with the launch jurisdiction’s privacy requirements before production.
- **Launch jurisdiction and compliance:** The operator confirmed the Philippines as the initial jurisdiction. The privacy notice, analytics disclosure/consent, data-processing responsibilities, and retention obligations remain to be resolved.
- **Hosting capacity and budget:** TBD. Required inputs are expected initial customers/cards, monthly traffic, and monthly spending limit. Recommendation: establish a pilot capacity and cost ceiling before selecting production Vercel and Convex plans.
- **Availability operations:** TBD. Monitoring, alerting, backup, recovery, and incident-response ownership must be defined before claiming the 99.9% target.
- **Card registration input:** manual URL entry is confirmed. Whether a future scan-assisted workflow is added is out of scope for MVP.
- **Support destination:** configurable generic support/contact destination is required, but its final URL or email is TBD.
- **Pilot validation size:** TBD. Recommendation: test with a small group of real independent professionals and recipients, then add an explicit customer/card/tap target.
- **Physical card inventory source:** pre-encoded cards are assumed to already exist, but the inventory owner and exact card URL generation/encoding process are TBD outside the application scope.

## Definition of done

- The final product requirements, UX, data model, permissions, privacy rules, and operational assumptions are agreed or explicitly marked TBD.
- Every MVP functional requirement has an implementation approach and testable acceptance criterion.
- Customer and administrator navigation and all required loading, empty, validation, unavailable, inactive, and error states are specified.
- The public profile, NFC path, QR path, direct URL path, vCard action, and analytics behavior are tested on real current iPhones and Android phones.
- Customer authorization prevents access to other profiles and arbitrary card transfer, reassignment, or deactivation; a buyer may attach only a code-proven card to their own profile after confirmation.
- Administrator card registration rejects duplicate tokens, preserves the full NFC/QR URL, and supports unassigned setup, package-code controls, assignment, correction, deactivation, replacement, QR generation, and audit history.
- Package codes remain valid until used or invalidated; verification challenges expire after 10 minutes and are single-use.
- Card routing follows the documented state table and never exposes private profile data from setup or unavailable responses.
- Profile updates require explicit publication and never require NFC re-encoding.
- Deactivated cards never reveal former profile content; unpublished or suspended profiles never expose unpublished content.
- Image validation, URL-scheme validation, OAuth authorization, rate limiting, audit logging, and deletion behavior are implemented and reviewed.
- Accessibility checks cover the agreed WCAG 2.2 AA basics across public and dashboard screens.
- Public-page performance is measured on a normal 4G connection and meets the 2-second usability target.
- Production monitoring demonstrates or is ready to measure 99.9% public-profile availability, excluding planned maintenance.
- The selected Vercel and Convex plans, Google OAuth environment configuration, production domain, launch jurisdiction, data-retention rules, and operational ownership are resolved before broad public launch.
- A real-device pilot with independent professionals and recipients validates the core workflows; the final pilot size and adoption threshold are recorded when decided.
