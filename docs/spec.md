# Spec: Tapit

Document status: draft  
Author: `<name/team>`  
Date: 2026-09-14

## Product summary

Tapit is a mobile-first digital profile service for independent professionals, with the same one-account/one-profile model available to small businesses. A customer receives a pre-encoded NFC card. When a recipient taps the card, scans its QR fallback, or opens the customer’s public profile URL, Tapit displays a published profile with the customer’s identity and useful contact links.

Tapit addresses two connected problems: professionals need to share multiple contact destinations quickly in person, and they need to update those destinations without replacing printed or encoded cards. NFC card URLs are unique per physical card and resolve to a stable public profile URL, allowing administrators to deactivate or replace an individual card without changing the profile.

The MVP supports two customer onboarding paths: a visitor can self-sign up from the public login page, or an administrator can provision an invited customer. Administrators manage customer accounts, profiles, NFC card records, assignments, replacements, suspensions, analytics, and audit history. Customers use email/password access to create, edit, preview, publish, and analyze their own profile. Visitors need no Tapit account and no app.

## Goals

- Make in-person sharing of a professional identity and contact links fast through NFC and QR.
- Give each customer one stable public profile URL that can be updated without re-encoding a card.
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
- Customer self-service card claiming, card transfer, or customer-controlled card reassignment.
- Native iOS or Android applications.
- Custom domains, custom CSS, advanced layouts, and complex page builders.
- Posts, videos, storefronts, courses, communities, or other rich content systems.
- Social-login integrations and direct LinkedIn, WhatsApp, or other social-platform APIs.
- Multi-profile accounts, team workspaces, employee management, or granular administrator roles.
- Bulk card import, advanced attribution, demographics, cross-platform reporting, or visitor-level analytics.
- Automated moderation and public profile-reporting workflows.
- Customer billing, subscriptions, paid plans, and in-app payments.
- Email verification and password-reset flows for the initial MVP; these must be reconsidered before production launch.

Potential future scope includes custom domains, richer content, team management, card inventory/fulfillment, customer billing, social integrations, self-service card claiming, and advanced analytics.

## Target users

### Primary: independent professionals

Independent professionals use Tapit at networking events, client meetings, business introductions, and other in-person situations. They need to share a professional identity and multiple destinations, including LinkedIn, WhatsApp, website, email, phone, booking pages, and social profiles. They value a profile they can update without replacing their card.

### Secondary: small businesses

Small businesses use the same one-account/one-profile model to present a business identity and contact destinations. Multi-profile employee/team management is not part of the MVP.

### Secondary: recipients and visitors

Recipients receive or tap a card. They need to view the published profile quickly on a phone, without installing an app or creating a Tapit account. They may tap NFC, scan a QR code, open a shared URL, select a link, or save a vCard.

### Operational: platform administrators

Administrators provision customer accounts and physical card records, assign cards to profiles, deactivate and replace cards, manage profiles, view analytics, suspend content, and inspect audit history. MVP has one administrator role with full administrative access.

## Main user workflows

### 1. Customer self-signs up

1. A visitor chooses customer signup on the public login page.
2. The visitor enters a display name, desired profile slug, email, password, and password confirmation.
3. Tapit authenticates the customer and creates one active customer account plus one draft profile without an invitation or published snapshot.
4. The customer enters the existing workspace and is guided to add links before publishing.

### 2. Administrator creates and provisions a customer

1. An administrator signs in through the administrator interface.
2. The administrator creates a customer account using the customer’s email address.
3. The administrator registers a pre-encoded NFC card by manually entering its unique card URL.
4. Tapit validates that the card URL is unused.
5. The administrator creates or selects the customer’s permanent unique profile slug and assigns the card to the customer’s profile.
6. Tapit sends the customer a one-time setup link.
7. The customer uses the link to set a password and access the profile editor.

### 3. Customer creates and publishes a profile

1. The customer signs in with email and password.
2. The customer enters the required name and at least one link.
3. The customer optionally adds a profile photo or business logo, short bio/role, email, phone, website, booking link, social links, and other allowed links.
4. The customer chooses basic visual customization and orders the links.
5. The customer saves a draft and previews responsive desktop/mobile layouts.
6. The customer explicitly publishes the profile.
7. Tapit exposes the new published version at the stable profile URL.

### 4. Customer updates a published profile

1. The customer signs in and edits profile fields, links, or theme settings.
2. Changes remain in draft until explicitly published.
3. The customer previews the change and publishes it.
4. Tapit updates the content shown at the stable profile URL and through all active card URLs.
5. The NFC card does not need to be re-encoded.

### 5. Visitor uses a Tapit card

1. The visitor taps the NFC card or scans its QR code.
2. The card URL resolves through the card registry to the stable profile URL.
3. Tapit records an aggregate profile view without storing visitor identity.
4. Tapit displays the published profile on the visitor’s mobile browser.
5. The visitor may select a link, save a vCard, or return to the profile.
6. Selecting an external destination records an aggregate link click and opens the destination in a new tab where supported.

### 6. Visitor opens a direct profile URL

1. The visitor opens the stable profile URL from a message, social bio, or other source.
2. Tapit records an aggregate profile view.
3. Tapit displays the same published profile as the NFC and QR paths.

### 7. Administrator replaces a card

1. An administrator selects an assigned card.
2. The administrator deactivates the old card immediately.
3. The old card URL begins showing the branded inactive-card page without revealing the former profile.
4. The administrator registers a new pre-encoded card URL and assigns it to the same profile.
5. Tapit records assignment, deactivation, and replacement events in the audit log.
6. The new card resolves to the stable profile URL.

Deactivated cards are not reactivated or reassigned. A new card is assigned instead.

### 8. Administrator manages a profile

An administrator can view and edit customer profile content, publish or unpublish a profile, suspend it for policy enforcement, deactivate assigned cards, and inspect related audit history. An unpublished or suspended profile shows a branded unavailable-profile page and does not expose unpublished content.

### 9. Customer requests account deletion

1. The customer submits a deletion request from Account.
2. The customer confirms the request.
3. An administrator reviews and executes or approves the deletion.
4. Tapit immediately unpublishes the profile and deactivates assigned cards.
5. Tapit retains a minimal administrative audit record.
6. Personal and profile data are permanently deleted after a retention period that is TBD.

## Functional requirements

- **FR-001:** The system shall support one customer account with one customer profile.
- **FR-002:** The system shall support one platform administrator role with full customer, profile, card, analytics, settings, and audit-log access.
- **FR-003:** Administrators shall be able to create customer accounts using an email address.
- **FR-004:** The system shall send a one-time setup link allowing a customer to set an initial password and access profile setup.
- **FR-005:** Customers shall be able to sign in with email and password.
- **FR-006:** The system shall not expose or store customer passwords in administrator interfaces.
- **FR-007:** Administrators shall be able to create customer profiles and assign a permanent unique slug before publication.
- **FR-008:** Customers shall be able to suggest or confirm their slug before the profile is published.
- **FR-009:** The public profile slug shall not change after publication.
- **FR-010:** The system shall require a name and at least one link before publication.
- **FR-011:** The system shall support an optional profile photo or business logo.
- **FR-012:** The system shall support an optional short bio or role.
- **FR-013:** The system shall support optional email, phone, website, booking, social, and other contact destinations.
- **FR-014:** The system shall accept valid HTTPS URLs and safe `mailto:` and `tel:` actions, and reject unsafe schemes such as `javascript:` and `data:`.
- **FR-015:** Customers shall be able to add, edit, label, enable, disable, delete, and reorder links.
- **FR-016:** Customers shall be able to select preset icons where available and provide custom link labels.
- **FR-017:** Customers shall be able to customize profile colors, fonts, button styles, and select from a small set of themes.
- **FR-018:** The system shall support draft, published, unpublished, and suspended profile states.
- **FR-019:** Customers shall be able to save drafts and preview profile changes before publication.
- **FR-020:** Changes to a published profile shall not become public until the customer explicitly publishes them.
- **FR-021:** The system shall expose a stable platform-hosted public profile URL.
- **FR-022:** The system shall store and manage a unique pre-encoded card URL for each physical NFC card.
- **FR-023:** Each NFC card URL shall resolve to the assigned profile’s stable public profile URL while the card is active.
- **FR-024:** Administrators shall manually enter each card’s unique pre-encoded URL and the system shall reject duplicate registrations.
- **FR-025:** Administrators shall be able to assign a card to a profile.
- **FR-026:** Administrators shall be able to deactivate cards and issue replacements.
- **FR-027:** Deactivated or replaced cards shall not reveal the former profile.
- **FR-028:** Deactivated cards shall not be reactivated or reassigned; a new card shall be used instead.
- **FR-029:** The system shall support standard NFC Forum NDEF URI records encoded with card URLs.
- **FR-030:** Administrators shall be able to generate a QR code for each assigned card URL.
- **FR-031:** Administrators shall be able to preview and download card QR codes as PNG and SVG files.
- **FR-032:** QR codes and manually shared profile URLs shall resolve to the same profile content as active NFC cards.
- **FR-033:** Visitors shall be able to view published profiles without a Tapit account or native app.
- **FR-034:** The public profile shall include a Save contact action when the profile has enough contact information to generate a vCard.
- **FR-035:** Generated vCards shall contain only the selected name, email, website, and public profile URL.
- **FR-036:** The system shall record aggregate total and unique profile views.
- **FR-037:** The system shall record aggregate link clicks.
- **FR-038:** NFC, QR, and direct profile visits shall count as profile views; selecting a destination shall count as a link click.
- **FR-039:** Analytics shall provide lifetime, 7-day, 30-day, and 90-day views.
- **FR-040:** The system shall not retain raw visitor-level analytics history.
- **FR-041:** Customers shall view analytics for their own profile.
- **FR-042:** Administrators shall view analytics and operational status for all profiles and cards.
- **FR-043:** Administrators shall be able to edit, publish, unpublish, or suspend profiles for support and policy enforcement.
- **FR-044:** Administrators shall be able to view customer, profile, and card status.
- **FR-045:** The system shall record administrator actions for card assignment, deactivation, replacement, profile changes, suspension, and deletion handling.
- **FR-046:** Audit entries shall include the administrator, action, affected account/card/profile, timestamp, and relevant before-and-after status.
- **FR-047:** Customers shall be able to change their password, view their account email, request account deletion, and access support.
- **FR-048:** Customers shall not have a Cards navigation screen or card reassignment controls in the MVP.
- **FR-049:** Customers shall be able to copy and share their stable public profile URL from the Profile area.
- **FR-050:** Deleted or unpublished profiles shall not expose unpublished profile information.
- **FR-051:** A visitor shall be able to choose customer self-service signup from the login page using display name, profile slug, email, password, and password confirmation.
- **FR-052:** Customer self-service signup shall create one active customer account and one draft profile owned by that account, with no invitation and no published snapshot.
- **FR-053:** The system shall derive the signup email and account role from the authenticated server identity and shall never accept a caller-supplied user ID or role for provisioning.
- **FR-054:** The system shall normalize, validate, reserve, and uniquely enforce customer profile slugs before creating or saving a profile.
- **FR-055:** A self-service customer shall receive a stable platform-hosted profile URL immediately, but that URL shall remain unavailable to visitors until explicit publication requirements are met.
- **FR-056:** Self-service customers shall be able to use the existing labeled-link editor for portfolio, TikTok, social, contact, booking, and other destinations allowed by FR-014.

## User experience

### Information architecture and navigation

Customer navigation:

- Profile: identity fields, public URL, slug confirmation before publication, draft/published state, preview, and publish controls.
- Links: link list, add/edit forms, labels, icons, enabled state, and ordering.
- Analytics: profile views, unique views, link clicks, and time ranges.
- Account: password change, account email display, deletion request, and support.

Administrator navigation:

- Customers: customer account creation, invitation/setup status, and customer search.
- Profiles: profile status, content management, publication, suspension, and support actions.
- Cards: manual card URL registration, duplicate validation, assignment, status, replacement, QR generation, and QR downloads.
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

The editor should distinguish draft content from the currently published version. Required fields should be visibly marked. The customer should be able to save a draft, preview responsive layouts, and explicitly publish. The interface should show the stable public URL and provide a copy action.

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

- Manual unique card URL entry.
- Duplicate/unused validation.
- Customer/profile assignment.
- Status: active, inactive, replaced, or otherwise unavailable as applicable.
- Assignment and replacement actions.
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
- An unavailable profile should show the fixed branded “This profile is currently unavailable” page.
- An inactive/replaced card should show the fixed branded “This card is inactive” page and must not show the former profile.
- Temporary service failures should show a friendly error page with the configured generic support/contact destination where appropriate.
- Failed image uploads should preserve the existing image and explain accepted formats and the 5 MB limit.
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
- Stable immutable slug after publication.
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
- Unique pre-encoded card URL.
- Assigned profile identifier.
- Card status.
- Assignment timestamp.
- Deactivation/replacement timestamp and reason where provided.
- Replacement relationship to prior or new card where applicable.
- Created and updated timestamps.

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

- Accept JPG, PNG, and WebP uploads up to 5 MB.
- Provide basic crop and preview before saving.
- Resize and optimize images into responsive sizes.
- Store image references separately from profile records.
- Exact storage retention and deletion behavior must follow the account-deletion policy.

### Required integrations

- **Convex:** backend functions, database, authentication integration, and profile image/file storage.
- **Vercel:** deployment for the Next.js web application.
- **Transactional email provider:** required for setup links, but provider selection is TBD. Options include Resend, Postmark, and SendGrid. Recommendation: evaluate Resend first for the small MVP, subject to cost, deliverability, and regional requirements.
- **NFC:** no software API integration is required for visitors; cards use standard NDEF URI records.
- **Social platforms:** no API integrations in MVP. LinkedIn, WhatsApp, and other destinations are stored as ordinary links or safe direct actions.

### Technical architecture decision

Preferred architecture:

- Next.js serves public profile routes and responsive customer/administrator dashboards.
- Convex Auth manages email/password authentication; Convex stores application data, runs backend functions, and stores profile images.
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
| Sign in with email/password | Yes | Yes |
| Create/edit own profile | Yes | Yes |
| Save drafts and preview | Yes | Yes |
| Publish/unpublish own profile | Yes | Yes |
| Manage own links and theme | Yes | Yes |
| View own analytics | Yes | Yes |
| View all customer analytics | No | Yes |
| View assigned card details | No Cards screen in MVP | Yes |
| Register card URLs | No | Yes |
| Assign/reassign cards | No | Yes |
| Deactivate or replace cards | No | Yes |
| Suspend another profile | No | Yes |
| View audit log | No | Yes |
| Request account deletion | Yes | Yes for operational handling |
| Execute or approve deletion | No | Yes |
| Manage administrator roles | No | No granular roles in MVP |

### Authentication lifecycle

- Customer onboarding has two supported paths: customer self-service signup from the public login page, and administrator-created or administrator-invited customer setup through the existing one-time setup link.
- The first administrator remains operator-provisioned. The public signup path never exposes an administrator role or creates an administrator account.
- Self-service customers authenticate with Password sign-up, then receive one active customer record and one private draft profile through an authenticated server-side provisioning mutation.
- Invited customers use the setup link to set their password and then sign in normally.
- Customers do not need an account to visit a public profile.
- Convex Auth is the selected authentication implementation.
- Email verification and password reset are deferred and must be treated as a pre-production security decision rather than silently assumed.
- Setup-link expiration, resend behavior, and invalidation are TBD.

## Security, privacy, and compliance

- Card IDs/URLs must be unique and protected against duplicate registration.
- Card ownership and reassignment must be controlled by administrators because the platform owns the physical card inventory.
- Customers must not be able to claim arbitrary cards, transfer card ownership, or access another customer’s profile-management data.
- Server-side authorization must enforce account/profile ownership for every customer operation.
- Administrator actions affecting accounts, profiles, cards, suspensions, and deletion must be audited.
- Public profile fields must be opt-in at the field/link level; nothing is shown unless added and published by the owner.
- Visitor analytics must not store visitor names, contact information, raw visitor-level history, or behavioral profiles.
- The unique-view calculation must use a privacy-preserving method; exact method and retention window are TBD.
- Public profiles should be `noindex` by default while remaining accessible through direct URL, NFC, and QR.
- Allowed link schemes must be validated server-side as well as client-side.
- Profile-image upload validation must enforce type and size limits.
- Authentication must use Convex Auth’s secure password handling; administrators must never see customer passwords.
- Rate limiting must protect login and sensitive administrative actions.
- Profile suspension and card deactivation must take effect immediately for public requests.
- Deletion must immediately hide profile content and deactivate cards, retain only the minimal audit record, and permanently delete personal/profile data after a TBD retention period.
- Initial operating jurisdiction and compliance requirements are TBD. Before production, define the privacy notice, analytics disclosure/consent approach, data-processing responsibilities, and retention policy for the launch jurisdiction.
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

- Customer self-service and administrator-invited customer accounts.
- Customer email/password login through Convex Auth.
- One profile per customer account.
- Required name and one-link publication validation.
- Optional identity/contact fields and profile image/logo.
- Editable, reorderable links with custom labels, preset icons, and safe URL validation.
- Draft, preview, explicit publish, and unpublish behavior.
- Basic restrained profile customization.
- Stable platform profile slugs selected during self-service signup or created by administrators for invited customers and confirmed before publication.
- Pre-encoded NFC card URL registration by manual entry.
- One or more active cards assigned to a profile by administrators.
- Unique card URL resolution to a stable profile URL.
- QR-code preview and PNG/SVG downloads.
- Visitor profile access from NFC, QR, or direct URL without an account or app.
- vCard download with the approved field set.
- Privacy-preserving lifetime, 7-day, 30-day, and 90-day analytics.
- Administrator card deactivation and new-card replacement workflow.
- Branded inactive-card and unavailable-profile pages.
- Profile suspension and administrative audit log.
- Customer account deletion request and administrator execution/approval workflow.
- Responsive desktop/mobile dashboards and mobile-first public pages.
- WCAG 2.2 AA baseline accessibility work.
- Performance and availability validation against the agreed targets.

## Acceptance criteria

### Account and onboarding

- **AC-001:** Given an administrator enters a new customer email, when the account is created, then Tapit creates the customer account and sends a one-time setup link.
- **AC-002:** Given a customer opens a valid setup link, when they set a password, then they can sign in and access their profile editor.
- **AC-003:** Given a visitor chooses Create your profile, when valid customer signup data is submitted, then Tapit authenticates the customer and provisions one active customer account with one private draft profile.

### Profile creation and publication

- **AC-004:** Given a customer has no profile content, when they attempt to publish, then Tapit identifies the missing required name and at least one link.
- **AC-005:** Given a customer enters a name and at least one valid link, when they save a draft, then the draft is stored without changing the public profile.
- **AC-006:** Given a customer previews a draft, when they switch between supported responsive layouts, then the preview reflects the draft without publishing it.
- **AC-007:** Given a valid draft, when the customer explicitly publishes it, then the profile becomes publicly accessible at its stable URL.
- **AC-008:** Given a published profile has pending edits, when the customer saves without publishing, then visitors continue to see the last published version.
- **AC-009:** Given a customer publishes updated profile content, when a visitor loads the stable profile URL, then the new content is shown without NFC re-encoding.

### Links and profile design

- **AC-010:** Given a customer adds an unsafe URL scheme, when they save the link, then Tapit rejects it with an actionable validation message.
- **AC-011:** Given a customer has multiple enabled links, when they reorder them and publish, then visitors see the new order.
- **AC-012:** Given a customer disables a link, when the profile is published, then the disabled link is not displayed publicly and is not counted as clickable.
- **AC-013:** Given a customer uploads a JPG, PNG, or WebP image of no more than 5 MB, when they crop and save it, then Tapit stores an optimized responsive image.
- **AC-014:** Given a customer uploads an unsupported or oversized image, when the upload is attempted, then Tapit rejects it without removing the existing image.

### NFC, QR, and card administration

- **AC-015:** Given an administrator enters an unused pre-encoded card URL, when they register it, then Tapit creates an active card record available for assignment.
- **AC-016:** Given an administrator enters a card URL already registered, when they submit it, then Tapit rejects the registration and identifies the duplicate condition.
- **AC-017:** Given an active card is assigned to a published profile, when its NFC URL is opened, then Tapit resolves the card to the correct stable profile URL and displays the published profile.
- **AC-018:** Given an administrator generates a QR code for an active card, when they preview or download it, then both PNG and SVG outputs encode the unique card URL.
- **AC-019:** Given an administrator deactivates a card, when a visitor opens its NFC or QR URL, then the inactive-card page appears and the former profile is not exposed.
- **AC-020:** Given an old card is replaced, when the new card is assigned, then the old card remains inactive and the new card resolves to the assigned profile.
- **AC-021:** Given a customer tries to access card assignment controls, when they use the customer interface, then no customer Cards screen or reassignment control is available.

### Public profile and vCard

- **AC-022:** Given a visitor opens an active profile through NFC, QR, or direct URL, when the page loads, then the profile is usable without a Tapit account or native app.
- **AC-023:** Given a profile has selected name, email, website, and public profile URL fields, when a visitor selects Save contact, then Tapit downloads a vCard containing only those selected fields.
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
- **AC-035:** Given signup creates a profile, when the customer opens the workspace, then the stable profile URL is shown and the customer is directed to add links before publication.
- **AC-036:** Given a requested slug is invalid, reserved, or already in use, when signup is submitted, then Tapit rejects provisioning with an actionable error and does not create a second account or profile.
- **AC-037:** Given a newly signed-up customer saves a bio or links without publishing, when a visitor opens the stable URL, then the visitor sees the existing missing/unavailable state and no draft content.
- **AC-038:** Given a customer adds enabled Portfolio and TikTok HTTPS links and publishes a valid profile, when a signed-out visitor opens the stable URL, then the profile name, bio, and both labeled links are visible without authentication.
- **AC-039:** Given a visitor attempts to create an administrator account through the public login page, when signup is submitted, then no administrator path or role selection is available.
- **AC-040:** Given the existing invitation setup flow is used, when the invited customer completes setup, then the invitation remains one-time and the customer can still access the same profile workflow.

## Open questions and decisions

### Confirmed decisions

- Project name: Tapit.
- MVP audience: independent professionals first, with small businesses supported through the same one-account/one-profile model.
- Primary problem: updateable contact information and fast in-person sharing, with multiple useful links as the core content.
- Primary usage: networking, client meetings, events, and business introductions.
- Onboarding: administrator-created or administrator-invited accounts; customers log in to complete their profiles.
- Customer dashboard: Profile, Links, Analytics, and Account. No customer Cards screen.
- Administrator dashboard: Customers, Profiles, Cards, Analytics, Audit log, and Settings.
- Authentication implementation: Convex Auth with email/password.
- Preferred application stack: Next.js, Convex, and Vercel, subject to production validation.
- Card format: NFC Forum NDEF URI record.
- Card administration: administrators manually enter card URLs, validate uniqueness, assign cards, deactivate old cards, and assign new replacement cards.
- Card links: unique per-card URLs resolve to stable profile URLs.
- QR: administrator preview plus downloadable PNG and SVG.
- Public URL: platform-hosted, administrator-created slug, confirmed by customer before publication, immutable after publication.
- Profile publication: name plus at least one link required; draft, preview, and explicit publish.
- Profile links: arbitrary valid HTTPS plus safe `mailto:` and `tel:` actions, with labels, preset icons, enable/disable, and ordering.
- Public design: clean, professional, mobile-first, strong contrast, restrained themes.
- vCard: selected name, email, website, and public profile URL only.
- Analytics: aggregate profile views and link clicks; lifetime, 7-day, 30-day, and 90-day views; no raw visitor-level history. Both customers and administrators can see analytics within their permissions.
- Card/profile states: inactive-card page for deactivated/replaced cards; unavailable-profile page for unpublished/suspended profiles.
- Deletion: customer request and confirmation, administrator execution/approval, immediate unpublish/deactivation, minimal audit retention, later permanent deletion.
- Accessibility: WCAG 2.2 AA basics.
- Performance/reliability: usable within 2 seconds on normal 4G and 99.9% monthly public-profile availability excluding planned maintenance.
- Billing and physical card fulfillment: deferred/out of scope for MVP.

### TBD items and technical options

- **Author:** `<name/team>` is not yet provided.
- **Production domain:** TBD. Options are a Tapit-owned domain, a subdomain of an existing company domain, or a temporary deployment domain. Recommendation: use a Tapit-owned production domain before issuing cards at scale.
- **Maximum links per profile:** TBD. Options are no product cap, a fixed MVP cap, or a plan-based cap. Recommendation: use a documented MVP cap only if needed for performance or usability; otherwise begin without a user-visible cap and monitor.
- **Transactional email provider:** TBD. Options include Resend, Postmark, or SendGrid. Recommendation: evaluate Resend first, then verify deliverability, pricing, and regional requirements.
- **Setup-link policy:** TBD. The system needs an expiry period, resend behavior, and invalidation behavior. Recommendation: one-time links with a short expiry and administrator-controlled resend/invalidation, subject to security review.
- **Email verification and password reset:** deferred by decision, but required as a pre-production security review item. Options are Convex Auth-native flows or a managed authentication provider. Recommendation: do not launch broadly without a secure recovery path.
- **Customer account email changes:** TBD. Options are disallowing changes in MVP or requiring administrator-mediated verification. Recommendation: disallow self-service email changes in MVP and handle exceptional changes administratively.
- **Unique-view calculation:** TBD. Options include privacy-preserving rotating pseudonymous identifiers, coarse time-bucketed counting, or aggregate edge analytics. Recommendation: choose a method that cannot reconstruct visitor history and document its retention window.
- **Deleted-data retention period:** TBD. Recommendation: define the period with the launch jurisdiction’s privacy requirements before production.
- **Launch jurisdiction and compliance:** TBD. This determines privacy notice, analytics disclosure/consent, data-processing responsibilities, and retention obligations.
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
- Customer authorization prevents access to other profiles and prevents customer card claiming, transfer, reassignment, or deactivation.
- Administrator card registration rejects duplicates and supports assignment, deactivation, replacement, QR generation, and audit history.
- Profile updates require explicit publication and never require NFC re-encoding.
- Deactivated cards never reveal former profile content; unpublished or suspended profiles never expose unpublished content.
- Image validation, URL-scheme validation, password handling, rate limiting, audit logging, and deletion behavior are implemented and reviewed.
- Accessibility checks cover the agreed WCAG 2.2 AA basics across public and dashboard screens.
- Public-page performance is measured on a normal 4G connection and meets the 2-second usability target.
- Production monitoring demonstrates or is ready to measure 99.9% public-profile availability, excluding planned maintenance.
- The selected Vercel and Convex plans, email provider, production domain, launch jurisdiction, data-retention rules, recovery flows, and operational ownership are resolved before broad public launch.
- A real-device pilot with independent professionals and recipients validates the core workflows; the final pilot size and adoption threshold are recorded when decided.
