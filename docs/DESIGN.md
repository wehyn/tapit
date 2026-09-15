# Design: Tapit

## Design goals

- Make the visitor journey immediate: tap or scan, then see a clear profile without an app or account.
- Make customer profile editing, preview, and publication predictable.
- Keep card ownership and destructive operations administrator-controlled and auditable.
- Keep the public page lightweight, mobile-first, accessible, and professional.
- Never expose unpublished or former profile content through inactive or unavailable paths.
- Use Tapit-owned UI components and restrained themes rather than a generic component-library appearance.
- Preserve every boundary in spec.md: no rich content, billing, team management, official identity verification, or native app.

## Information architecture

### Visitor-facing paths

- Stable public profile: https://<tapit-domain>/<slug>
- Unique card resolver: https://<tapit-domain>/c/<card-token>
- Published profile state.
- Unavailable-profile state for unpublished or suspended profiles.
- Inactive-card state for deactivated or replaced cards.
- Friendly temporary-error state.

Visitors have no Tapit navigation. They can view published content, select enabled links, and use Save contact.

### Customer paths

- /login: shared customer/administrator login.
- /setup/<token>: one-time setup from an administrator invitation.
- /app/profile: identity fields, public URL, theme, draft/publish state, and preview.
- /app/links: link creation and ordering.
- /app/analytics: profile and link analytics.
- /app/account: password change, account email display, deletion request, and support.

Customer navigation intentionally excludes a Cards screen. Customers do not register, assign, transfer, replace, or deactivate cards.

### Administrator paths

- /admin/customers: account creation, invitation status, and customer management.
- /admin/profiles: profile search, editing, publication, suspension, and status.
- /admin/cards: URL registration, assignment, deactivation, replacement, QR preview, and downloads.
- /admin/analytics: authorized cross-customer aggregate analytics.
- /admin/audit-log: administrative history.
- /admin/settings: platform settings, including generic support/contact destination.

## Main user journeys

### Administrator provisions a customer and card

1. Administrator opens Customers and creates a customer account with an email address.
2. Administrator enters the unique URL already encoded on a physical NFC card.
3. Tapit validates the URL and rejects duplicates.
4. Administrator creates or selects a unique profile slug and assigns the card to the profile.
5. Administrator confirms the assignment and sends the one-time setup invitation.
6. The UI shows account, card, assignment, and invitation results separately so partial failures are visible.

### Customer creates and publishes a profile

1. Customer opens the setup link, sets a password, and enters the authenticated app.
2. Profile displays the required name and at-least-one-link checklist.
3. Customer adds optional image/logo, bio/role, email, phone, website, booking, social, and other links.
4. Customer selects a restrained theme and manages labels, icons, enabled state, and link order.
5. Customer saves a draft and previews phone and desktop layouts.
6. Customer explicitly publishes after validation passes.
7. Tapit exposes the published profile at the stable URL.

### Visitor taps or scans

1. Visitor taps the NDEF URI or scans the QR code.
2. The card resolver checks card status and assigned profile state.
3. Active cards resolve to the stable public profile; inactive cards show the inactive-card page.
4. A published profile loads in the visitor’s browser without login or app installation.
5. The visitor selects a link or Save contact.
6. External links open in a new tab where supported and the profile remains available in the original tab.

### Customer updates a published profile

1. Customer edits the draft in Profile or Links.
2. The last published version remains public while changes are saved or unpublished.
3. Preview shows pending changes only.
4. Publish updates all active card paths without NFC re-encoding or URL changes.

### Administrator replaces a card

1. Administrator opens the assigned card in Cards.
2. A confirmation identifies the card and states that it will become inactive immediately.
3. After confirmation, the old card shows the inactive-card page.
4. Administrator registers and assigns a new pre-encoded card URL.
5. The audit log records deactivation, replacement, assignment, actor, timestamp, and state changes.
6. The new card resolves to the stable profile.

### Customer requests deletion

1. Customer submits and confirms a deletion request in Account.
2. Administrator reviews and executes or approves the request.
3. Tapit immediately unpublishes the profile and deactivates assigned cards.
4. Minimal administrative audit history remains.
5. Personal and profile data are permanently deleted after the retention period, which is TBD.

## Screens and pages

### Public profile page

Purpose: present the published identity and useful destinations.

Content:

- Profile photo or business logo when provided.
- Name.
- Short bio or role when provided.
- Ordered enabled links with custom labels and optional preset icons.
- Save contact when sufficient approved vCard fields exist.
- Tapit branding appropriate to the selected theme.

Actions:

- Select an enabled link.
- Select Save contact.
- Use normal browser navigation.

Navigation: no in-page navigation is required. External links open in a new tab where supported.

Rules: render only published public fields. Never show drafts, disabled links, analytics, card identifiers, or administrator controls. Generate title, description, image, and URL metadata while applying noindex by default.

### Card resolver and inactive-card page

Purpose: resolve the unique card URL while enforcing card state.

Active state: resolve to the assigned stable profile URL and display the published profile.

Inactive/replaced state: show fixed accessible Tapit branding, the message “This card is inactive,” and the configured support/contact destination when available. Do not query or display the former profile.

Visitor action: optional support/contact action only. No reactivation or reassignment control is exposed.

### Unavailable-profile page

Purpose: explain that the assigned profile is not currently public.

Content: fixed accessible Tapit branding, the message “This profile is currently unavailable,” and the configured support/contact destination when available.

Actions: optional support/contact action. Do not display unpublished identity, links, images, analytics, or former content.

### Login page

Purpose: authenticate existing customers and administrators, or let a new customer create a profile.

Content: a sign-in mode with email and password, plus a customer-only signup mode with display name, profile slug, email, password, password confirmation, stable URL preview, validation messages, and support route.

States: initial, submitting, invalid credentials, invalid/reserved/duplicate slug, rate limited, unavailable auth service, provisioning error, and authenticated redirect.

Constraint: public signup is customer-only; no administrator role selector or administrator signup path is exposed. Email verification and password reset remain deferred by specification and must be treated as pre-production security gates.

### Customer setup page

Purpose: consume a one-time invitation and establish the customer password.

Content: account email context, password, password confirmation, password guidance, and setup confirmation.

Actions: set password and continue to Profile.

States: valid token, expired/invalid/used token, mismatched passwords, password shorter than 8 characters, submitting, success, and service error. Expiry/resend/invalidation policy is TBD.

### Customer Profile page

Purpose: manage identity fields, stable URL, theme, draft state, and publication.

Content:

- Required name.
- Optional profile image/logo upload, crop, and preview.
- Optional short bio or role.
- Optional email, phone, and website.
- Immutable-after-publication slug.
- Copyable stable public URL.
- Draft, published, or unpublished status.
- Save draft, Preview, and Publish actions.
- Validation checklist for name and at least one valid link.

Actions: save draft, preview phone/desktop layouts, publish, unpublish, upload/crop image, copy URL, and request deletion through Account.

### Customer Links page

Purpose: manage the ordered destination list.

Content: link rows showing custom label, optional preset icon, destination type, enabled/disabled state, and order.

Actions: add, edit, label, select icon, enable/disable, delete, reorder, save draft, preview, and publish.

Validation: accept valid HTTPS, mailto:, and tel: actions; reject javascript:, data:, malformed, or empty destinations. Maximum link count is TBD.

### Customer Analytics page

Purpose: show aggregate reach and engagement.

Content: lifetime, 7-day, 30-day, and 90-day profile views, unique views, and link clicks; link-level aggregate results where data exists; privacy explanation.

Actions: select time range and inspect link-level results.

Empty state: explain that metrics appear after visitors view the profile or select a link. Do not imply visitor identities are available.

### Customer Account page

Purpose: provide account controls and deletion/support entry points.

Content: account email, password-change form, support destination, deletion explanation, and confirmation action.

Actions: change password, request and confirm deletion, and open support.

Constraint: no card assignment or status controls. Self-service account email changes are TBD.

### Administrator Customers page

Purpose: create and manage customer accounts.

Content: customer list, email, profile/status summary, setup status, and creation form.

Actions: create account, send or resend setup invitation when supported, open profile, open cards, and initiate deletion handling.

### Administrator Profiles page

Purpose: support and govern customer profiles.

Content: searchable profile list, customer, slug, publication state, last update, and suspension/unavailability state.

Actions: edit profile, publish/unpublish, suspend, restore where allowed, and view audit history.

Rule: administrative edits are auditable and never expose unpublished content publicly.

### Administrator Cards page

Purpose: manage the physical-card registry and URL assignments.

Content: manual URL registration, duplicate validation, card status, assigned customer/profile, assignment date, replacement relationship, QR preview, QR downloads, and audit link.

Actions: register URL, assign profile, deactivate, replace with a new card, preview QR, download PNG/SVG, and inspect history.

Confirmation: deactivation and replacement identify the exact card and profile and state that the old card becomes inactive immediately.

### Administrator Analytics page

Purpose: provide authorized cross-customer operational visibility.

Content: aggregate profile views, unique views, link clicks, time ranges, and operational card/profile status.

Rule: no raw visitor-level history.

### Administrator Audit log page

Purpose: make account, profile, card, moderation, and deletion changes traceable.

Content: actor, action, target account/profile/card, timestamp, and relevant before/after state.

Actions: inspect and apply proportional filters. This is not an advanced reporting surface.

### Administrator Settings page

Purpose: configure the generic support/contact destination and limited platform settings.

Content: current support/contact destination and setting status.

Actions: edit and save the support/contact destination.

## Wireframes

### Public profile, phone-first

    ┌──────────────────────────────┐
    │          [logo/photo]        │
    │          Person Name          │
    │          Role / short bio     │
    │                              │
    │  [ LinkedIn              ↗ ] │
    │  [ WhatsApp              ↗ ] │
    │  [ Website               ↗ ] │
    │  [ Email                 ↗ ] │
    │  [ Booking               ↗ ] │
    │                              │
    │       [ Save contact ]       │
    │                              │
    │           Tapit              │
    └──────────────────────────────┘

Identity precedes links. Save contact is prominent but is not styled as an external destination.

### Customer Profile page

    ┌────────────────────────────────────────────┐
    │ Tapit                         [Account]     │
    ├────────────────────────────────────────────┤
    │ Profile   Links   Analytics                 │
    ├──────────────────────┬─────────────────────┤
    │ Edit profile          │ Live preview        │
    │ Name *                │   [photo/logo]     │
    │ [__________________]  │   Person Name      │
    │ [Upload image]        │   Role / bio       │
    │ Bio / role            │   [link button]    │
    │ [__________________]  │   [Save contact]   │
    │ Public URL [copy]     │ [Phone] [Desktop]  │
    │ [Save draft] [Publish]│                     │
    └──────────────────────┴─────────────────────┘

On narrow screens, editor and preview become a vertical flow.

### Administrator Cards page

    ┌────────────────────────────────────────────────────┐
    │ Customers  Profiles  Cards  Analytics  Audit Settings│
    ├────────────────────────────────────────────────────┤
    │ Register pre-encoded card URL                       │
    │ [https://________________________] [Register]       │
    │                                                    │
    │ Card URL       Customer/Profile       Status        │
    │ /c/abc...      Person Name            Active        │
    │                                  [QR] [Replace]     │
    │ /c/xyz...      Person Name            Inactive      │
    │                                  [History]         │
    └────────────────────────────────────────────────────┘

### State page

    ┌──────────────────────────────┐
    │            [Tapit]            │
    │                              │
    │   This card is inactive      │
    │   This profile is currently  │
    │   unavailable                │
    │                              │
    │      [Contact support]       │
    └──────────────────────────────┘

Inactive-card and unavailable-profile are separate states. A card can be inactive while its former profile remains valid elsewhere.

## UI states

### Global state rules

- Every mutation has idle, submitting, success, validation failure, authorization failure, and service failure behavior.
- Success feedback stays near the affected object and is announced to assistive technology.
- Destructive actions require confirmation and explain their immediate public effect.
- The last known valid published state remains public when draft save or publication fails.
- Loading states prevent duplicate submissions without making controls disappear unexpectedly.

### State matrix

| Area | Loading | Empty | Error/validation | Success | Disabled/permission |
|---|---|---|---|---|---|
| Public profile | Lightweight profile loading | Unavailable page for hidden profile | Friendly service or missing-profile state | Profile rendered and view recorded without blocking | Inactive-card page |
| Profile editor | Skeleton/field progress | Explain name + one link | Required-field, URL, image, or save errors | Draft saved or published | Publish disabled until valid |
| Links | Row/form progress | Add-link guidance | Unsafe scheme, malformed URL, missing label | Saved/reordered/enabled/deleted | Actions disabled while saving |
| Image upload | Upload/crop progress | Upload prompt | Type, size, crop, or storage failure | Optimized preview shown | Existing image preserved on failure |
| Customer analytics | Metric skeleton | Explain how metrics appear | Friendly analytics error | Time-range metrics shown | Own profile only |
| Customer account | Form progress | No special empty state | Password/action error | Password/deletion confirmation | No card controls |
| Admin customers | Table/form progress | Prompt to create customer | Invalid/duplicate email | Account/setup status shown | Administrator only |
| Admin cards | Registration/assignment progress | Prompt to register URL | Duplicate/invalid URL | Assignment/deactivation/replacement/QR confirmation | Customers cannot access |
| Admin analytics | Metric skeleton | No data explanation | Friendly query error | Authorized aggregate metrics | Unauthenticated users blocked |
| Audit log | Table progress | No-actions explanation | Query error | New entries visible | Customers blocked |
| Setup | Token/password progress | Not applicable | Invalid/used/expired token or mismatch | Password set and redirect | Token cannot be reused |

### Permission states

- Unauthenticated visitor: published public content only.
- Unauthenticated dashboard visitor: redirect to Login.
- Customer: own Profile, Links, Analytics, and Account only.
- Customer: no Cards screen, card registration, transfer, reassignment, or deactivation.
- Administrator: all authorized customer/profile/card/analytics/audit/settings operations.
- Cross-customer customer request: generic permission error without confirming another record exists.
- Unpublished/suspended profile: unavailable page, never partial content.
- Inactive/replaced card: inactive-card page, never former content.

## Responsive behavior

- Public profile is designed for phone portrait first because NFC/QR use occurs in person.
- Public layout is a single column with comfortable tap targets and no required horizontal scrolling.
- Identity-to-links hierarchy remains stable across phone, tablet, and desktop.
- Customer editor and preview use a split layout where space permits and a vertical flow on narrow screens.
- Administrator tables collapse into stacked labeled records on mobile.
- QR preview and download controls remain usable at narrow widths.
- Buttons and links do not depend on hover.
- Use native document scrolling; no feature depends on precise dragging, hover, or horizontal scrolling.
- Profile images use responsive optimized sizes.
- Keyboard and screen-reader order remain logical when layouts change.

## Accessibility requirements

- Target the WCAG 2.2 AA basics agreed in spec.md.
- Use semantic landmarks, headings, lists, tables, buttons, links, and form controls.
- Give every field a visible or programmatically associated label.
- Provide meaningful alternative text for profile images/logos or an explicit decorative choice.
- Preserve readable contrast for all theme variants, statuses, errors, disabled states, and focus indicators.
- Provide visible keyboard focus and logical tab order.
- Make every action available without drag, hover, color recognition, or pointer precision.
- Provide Move up/Move down alternatives for link ordering.
- Announce validation, save, publish, deactivation, replacement, and deletion results.
- Keep focus inside confirmation dialogs and restore it to the trigger on close.
- Never use color alone for active, inactive, unpublished, suspended, or error status.
- Respect reduced-motion preferences.
- Give external-link and Save contact actions clear accessible names.
- Test public, customer, and administrator journeys with keyboard navigation and automated checks followed by manual review.

## Visual direction

### Overall character

Tapit should feel clean, professional, calm, and trustworthy during a quick business introduction. The public page is a polished digital business card, not a social feed or full website builder.

Exact logo, colors, typeface, corner radius, shadow treatment, and final theme catalog are TBD. Themes must remain restrained and preserve contrast.

### Layout and spacing

- Use a centered public profile column with generous breathing room.
- Keep link buttons visually consistent and easy to scan.
- Use a consistent spacing scale across forms, rows, cards, and sections.
- Keep one primary action per context: Publish, Add link, Register/Assign, or Save contact.
- Use consistent corner radius, border, focus, and shadow decisions across custom components; exact values are TBD.

### Color

- Use a neutral application base and restrained accent for primary actions.
- Allow profile themes to alter controlled colors without reducing contrast.
- Pair status colors with text or iconography.
- Validate or constrain customer-selected colors when they reduce legibility.

### Typography

- Use a legible sans-serif system or selected brand typeface; exact choice is TBD.
- Establish levels for name, role/bio, link labels, navigation, form labels, helper text, errors, and status text.
- Avoid overly small public-profile metadata.

### Components and interaction

- Build Tapit-owned components with Tailwind CSS.
- Use accessible behavior for dialogs, menus, tabs, toggles, and reordering without adopting an opinionated visual library.
- Prefer direct manipulation with explicit save/publish semantics.
- Keep draft and published states visible in editing contexts.
- Confirm deactivation, replacement, deletion, and suspension.
- Provide immediate, specific feedback for validation and server outcomes.
- Avoid automatic publication, hidden destructive behavior, and hover-only interactions.

## Component inventory

### Foundations

- App shell and responsive navigation.
- Page container and section layout.
- Typography hierarchy.
- Theme tokens and contrast-safe status tokens.
- Focus ring and reduced-motion utilities.

### Public profile

- Profile identity header.
- Profile image/logo frame.
- Ordered public link list.
- Public link button with optional preset icon.
- Save contact button.
- Metadata configuration.
- Inactive-card page.
- Unavailable-profile page.
- Friendly service-error page.

### Forms and feedback

- Labeled text input and textarea.
- Password input and confirmation field.
- URL/action input with scheme validation.
- Image upload, crop, and preview.
- Theme selector and style controls.
- Draft/publish action bar.
- Inline validation message.
- Live-region success message.
- Service/permission alert.
- Destructive-action confirmation dialog.
- Loading skeleton and progress indicator.

### Link management

- Link row.
- Preset-icon selector.
- Enable/disable control.
- Reorder controls with keyboard alternative.
- Add/edit link form.
- Empty link state.

### Customer dashboard

- Customer navigation shell.
- Profile editor.
- Responsive profile preview.
- Stable public URL copy control.
- Publication status indicator.
- Analytics metric card.
- Analytics time-range selector.
- Account/deletion-request panel.

### Administrator dashboard

- Administrator navigation shell.
- Customer list and creation form.
- Profile status table/detail view.
- Card URL registration form.
- Card assignment control.
- Card status row.
- Replacement/deactivation dialog.
- QR preview.
- QR PNG/SVG download controls.
- Aggregate analytics cards/table.
- Audit-log row/detail view.
- Support/contact destination setting.

## Design decisions and tradeoffs

- Public profile first, card mechanics hidden: visitors need speed; card ownership is administrative. Supports FR-023, FR-033, and FR-048.
- Explicit publish instead of automatic public saves: protects the last published version and supports FR-018–FR-020.
- Stable profile URL plus unique card URL: stable sharing prevents broken links while card-specific status enables replacement. Supports FR-021–FR-023.
- Fixed inactive/unavailable pages: reduces leakage and design drift, at the cost of less personalization.
- No customer Cards screen: respects administrator ownership of physical inventory and prevents accidental reassignment.
- Basic themes with custom UI: supports Tapit’s own visual language, while increasing accessibility responsibility.
- Aggregate analytics only: preserves privacy, but limits diagnostic detail and unique-view accuracy.
- Save contact as one focused public action: supports the business-card outcome without introducing CRM features.
- External links open separately where supported: preserves the Tapit profile, while browser behavior cannot be fully controlled.
- Mobile-first public page and responsive dashboards: follows the highest-frequency visitor path while serving operational users.

## Open questions

- Exact Tapit logo, color palette, typeface, corner radius, shadows, and theme catalog are TBD.
- Production domain and final public URL branding are TBD.
- Maximum links per profile is TBD.
- Setup-link expiry, resend, and invalidation behavior are TBD.
- Email verification and password reset remain deferred; final pre-production treatment is TBD.
- Transactional email provider is TBD; invitation UI must remain provider-agnostic.
- Customer account email-change behavior is TBD.
- Generic support/contact destination is TBD.
- Unique-view calculation and privacy-preserving retention window are TBD.
- Launch jurisdiction, privacy notice, analytics disclosure/consent, and deleted-data retention period are TBD.
- Vercel/Convex production plan, monitoring, backups, recovery, and incident-response design are TBD.
- Exact QR-generation library and output limits are TBD.
- Exact measurement method for “usable within 2 seconds on normal 4G” is TBD.
- Pilot size and adoption threshold are TBD.

No design decision here changes spec.md. Requests for rich content, custom domains, team profiles, payments, official identity verification, customer card claiming, or native apps require a specification change rather than an implicit design addition.
