# Plan: Tapit

Status: draft  
Source documents: `intent.md`, approved `spec.md`  
Repository state: greenfield; no application code exists  
Repository guidance: no `CLAUDE.md` was found

## Scope and traceability

This plan builds the first working Tapit MVP described by `spec.md`. It does not include physical card manufacturing, card inventory procurement, customer billing, native applications, rich content, custom domains, or other future scope.

| Plan workstream | Traceability to `spec.md` |
|---|---|
| Project foundation, authentication, account lifecycle | FR-001–FR-006, FR-047; AC-001–AC-003 |
| Profile, links, themes, drafts, preview, publication | FR-007–FR-021, FR-043, FR-049–FR-050; AC-004–AC-014, AC-022–AC-024 |
| Card registry, assignment, deactivation, replacement | FR-022–FR-029, FR-043–FR-046; AC-015–AC-021, AC-029 |
| QR generation and public resolution | FR-030–FR-033; AC-017–AC-022 |
| vCard and visitor actions | FR-034–FR-035; AC-022–AC-023 |
| Aggregate analytics | FR-036–FR-042; AC-025–AC-028 |
| Administration, moderation, audit, deletion | FR-043–FR-048, FR-050; AC-019–AC-021, AC-024, AC-029–AC-030 |
| Responsive UX and accessibility | UX requirements; FR-010–FR-020, FR-033–FR-035; AC-006, AC-022–AC-024, AC-031 |
| Security, privacy, performance, reliability | Security and performance sections; AC-010, AC-014, AC-016, AC-019, AC-024, AC-030–AC-034 |

Traceability must be maintained in pull requests and test names. Every FR and AC should be either implemented and tested, explicitly deferred, or listed as blocked by a named TBD decision.

## Recommended technical decisions

### Application stack

- **Language:** TypeScript in strict mode.
- **Package manager:** npm with a committed `package-lock.json`.
- **Web framework:** current stable Next.js release using the App Router. Use server-rendered public-page shells where practical and client components only for interactive editing/dashboard behavior.
- **Styling:** Tailwind CSS. Build Tapit’s own UI components and visual system; do not adopt a full opinionated component library.
- **Backend/database:** Convex for typed queries/mutations/actions, database storage, and file storage.
- **Authentication:** Convex Auth with email/password. Use Convex Auth’s Next.js provider and route protection. Email verification and password reset remain deferred by product decision and are a pre-production gate.
- **Deployment:** Vercel for the Next.js application, with separate Convex development and production deployments.
- **CI:** GitHub Actions for pull-request and main-branch checks.
- **Testing:** Vitest for unit/domain tests, React Testing Library for component behavior, Playwright for browser workflows, and Playwright accessibility checks with an axe integration where practical.
- **Image storage:** Convex file storage, with server-side validation, crop/preview, resizing, and optimized responsive variants.
- **QR generation:** use a small maintained QR library capable of deterministic SVG and PNG output. The exact package is a plan-time implementation choice; recommendation is a package that can run in Node/server actions and browser preview without shipping unnecessary weight to public pages.
- **Validation:** use one shared schema/validation layer for profile fields, link destinations, card URLs, and administrative inputs. The exact validation package is TBD; recommendation is a small TypeScript schema library compatible with Convex and server/client reuse.

### Why this stack

- Next.js and Vercel provide a natural fit for lightweight public profiles, dynamic routes, metadata, previews, and responsive dashboards.
- Convex keeps the database, typed backend functions, authentication integration, and profile-image storage in one backend model, reducing greenfield integration overhead.
- Tailwind permits a custom Tapit visual language while keeping responsive states explicit and maintainable.
- npm is the requested package manager and is broadly available in local and CI environments.
- Vitest, React Testing Library, and Playwright cover domain behavior, UI behavior, and the real browser/NFC-adjacent journeys respectively.

### Proposed route model

The recommended URL model is:

- Public profile: `https://<tapit-domain>/<slug>`.
- Card resolver: `https://<tapit-domain>/c/<card-token>`.
- Customer application: `/app/...`.
- Administrator application: `/admin/...`.
- Authentication/setup: `/login` and `/setup/<token>`.

The production domain is TBD. The card resolver must validate card status, resolve the assigned profile, and prevent former profile exposure before redirecting or rendering the profile. The precise redirect/render strategy should be chosen during implementation so profile-view analytics are counted once.

## Project foundation

### Repository structure

Use a single Next.js application with a clear separation between route composition, domain/UI components, Convex functions, and tests:

```text
tapit/
├── .github/workflows/
├── convex/
├── public/
├── src/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── styles/
├── tests/
├── e2e/
├── .env.example
├── .gitignore
├── eslint.config.*
├── next.config.*
├── package.json
├── package-lock.json
├── playwright.config.*
├── postcss.config.*
├── tailwind.config.* or CSS-first Tailwind configuration
├── tsconfig.json
└── README.md
```

### Package and scripts

Initialize the project with npm and pin the exact Next.js, React, TypeScript, Convex, Convex Auth, Tailwind, and test-tool versions selected at implementation time. The project should expose scripts for:

- local development;
- production build and start;
- linting;
- strict type checking;
- formatting and formatting verification;
- unit tests and watch mode;
- browser tests and Playwright UI mode;
- Convex development and production deployment;
- a combined CI verification command.

The CI verification command should run formatting check, lint, typecheck, unit tests, the production build, and appropriate browser tests.

### TypeScript and code quality

- Enable strict TypeScript settings.
- Avoid `any` in application and Convex domain code.
- Keep public profile, link, card, status, and permission types centralized and shared between UI and backend boundaries.
- Treat all client input as untrusted even when forms perform client-side validation.
- Use Prettier for formatting and ESLint for code-quality rules.
- Add a Tailwind class-sorting formatter plugin only if it does not conflict with the selected Tailwind setup.
- Keep custom UI primitives small, composable, and documented by usage rather than building a generic design system prematurely.

### Environment configuration

Commit `.env.example` containing variable names and safe placeholders only. Keep real values in local, preview, and production environments. Expected categories include:

- Convex deployment URL and deployment environment identifiers;
- Convex Auth configuration;
- transactional email configuration, once selected;
- public application URL/domain;
- analytics and operational settings that are safe to configure;
- any Vercel/Convex integration values required by deployment.

Never commit passwords, auth secrets, API keys, setup tokens, or production URLs if they are confidential. Document which variables are required for local development, preview deployments, and production.

### Local development setup

The README should explain:

1. Required Node.js and npm versions.
2. `npm install` and local environment setup.
3. Starting the Next.js development server and Convex development deployment.
4. Creating or seeding a local administrator.
5. Testing customer invitation/setup flows without a production email provider.
6. Registering sample card URLs and opening sample public profiles.
7. Running unit, browser, accessibility, and build checks.
8. Running the NFC/QR real-device test flow with a pre-encoded card.

Local development should use a development email adapter or captured setup-link flow until a transactional email provider is selected. It must never send accidental production invitations.

## Architecture

### Application layers

1. **Route layer:** Next.js App Router pages, layouts, loading boundaries, metadata, redirects, and error boundaries.
2. **UI layer:** Tapit-owned Tailwind components for forms, buttons, link rows, profile preview, analytics cards, tables, dialogs, status badges, and empty/error states.
3. **Application/domain layer:** shared validation, profile publication rules, link-scheme rules, card state transitions, vCard generation, QR generation, and analytics event normalization.
4. **Convex function layer:** authenticated queries, mutations, actions, public profile resolution, card resolution, image URL handling, audit writes, and aggregate analytics updates.
5. **Persistence layer:** Convex schema, indexes, file storage references, aggregate analytics buckets, and audit records.
6. **Operations layer:** Vercel deployments, Convex environments, GitHub Actions, logs, monitoring, backup/recovery procedures, and support configuration.

### Public request data flow

#### Direct profile URL

1. Visitor requests `/<slug>`.
2. The route resolves the stable slug.
3. Tapit checks the profile state.
4. Published profiles render public fields and enabled links only.
5. Unpublished or suspended profiles render the branded unavailable page.
6. Aggregate view recording is performed without blocking initial rendering.

#### NFC or QR card URL

1. Visitor taps an NDEF URI or scans a QR code containing `/c/<card-token>`.
2. Tapit looks up the card URL and status.
3. Inactive/replaced cards render the branded inactive-card page without querying or exposing the former profile content.
4. Active cards resolve to their assigned profile.
5. The profile state is checked before public content is returned.
6. The visitor sees the same published profile content as a direct URL visitor.

The implementation must avoid counting a card request and its profile resolution as two profile views. Card-level analytics are not required in the MVP.

### Customer data flow

1. Convex Auth establishes the customer session.
2. Protected `/app` routes load the authenticated customer’s account/profile.
3. Customer mutations validate ownership and input on the server.
4. Draft changes are stored separately from the last published snapshot or are versioned so unpublished edits cannot leak publicly.
5. Explicit publish promotes a valid draft to the public profile state.
6. Public routes read only published, public-safe fields.

### Administrator data flow

1. Administrator authentication establishes the administrator role.
2. Protected `/admin` routes require the administrator claim/role on every backend operation.
3. Customer creation, card registration, assignment, suspension, replacement, and deletion operations are transactional where possible.
4. Each sensitive state transition writes an audit record with actor, target, timestamp, action, and relevant before/after state.

### State machines

Profile states:

- Draft: editable and not public.
- Published: latest published version is public.
- Unpublished: intentionally hidden; assigned cards remain assigned but show unavailable page.
- Suspended: hidden by administrator policy action; assigned cards do not expose content.

Card states:

- Registered/unassigned: known card URL awaiting profile assignment.
- Active: card resolves to its assigned profile.
- Inactive: card shows inactive-card page.
- Replaced: historical state for a card superseded by a new card.

The implementation must prevent invalid transitions such as customer reassignment, arbitrary card claiming, reactivation of retired cards, and publication without a name and at least one valid link.

## Data and authentication setup

### Convex setup

- Create separate Convex development and production deployments.
- Keep schema and backend functions under `convex/`.
- Generate typed Convex API bindings as part of the normal development workflow.
- Use indexes for stable profile slug lookup, card URL lookup, customer-to-profile lookup, card-to-profile lookup, profile links ordered by position, analytics time buckets, and audit filtering.
- Use Convex file storage for profile images and store only file references in profile data.
- Define explicit server-side public/private field projections so private draft data cannot be returned accidentally.

### Data model

Implement the entities described in `spec.md`:

- Customer account.
- Profile.
- Profile draft or published profile version.
- Profile link.
- NFC card.
- QR output metadata if persistence is needed.
- Aggregate analytics buckets.
- Audit log.
- Customer deletion request.
- Setup/invitation token.

The schema must support:

- one customer account to one profile;
- multiple cards assigned to one profile;
- immutable published profile slug;
- unique card URL registration;
- explicit profile and card states;
- replacement relationships and historical auditability;
- customer ownership checks;
- permanent deletion of personal/profile data while retaining only the minimal allowed audit record.

### Authentication setup

- Configure Convex Auth for email/password.
- Integrate the Convex Auth Next.js provider in the application root.
- Protect `/app` and `/admin` routes with server and backend authorization checks.
- Seed or invite administrator accounts; there is no public administrator signup.
- Create administrator-managed customer accounts and one-time setup tokens.
- Consume setup tokens once and invalidate them after successful password setup.
- Keep setup-token lifetime, resend, and invalidation policy as TBD until confirmed.
- Do not implement email verification or password reset in the initial MVP, but document both as pre-production security gates.
- Enforce the 8-character minimum password requirement and login rate limiting.

### Email integration

The provider is TBD. Build a small application-level invitation interface so the account workflow is independent of the chosen provider:

- Development adapter: logs or displays a safe local setup link without sending email.
- Preview adapter: uses a controlled test mailbox/provider configuration.
- Production adapter: selected transactional email provider.

Options are Resend, Postmark, or SendGrid. Recommendation: evaluate Resend first, but do not hard-code that provider until deliverability, pricing, and launch-jurisdiction requirements are confirmed.

## Order of work

### 0. Resolve plan gates before implementation

- Confirm repository location and Git remote.
- Confirm final Next.js/Tailwind/Convex Auth versions at project creation.
- Confirm the production domain strategy, even if the exact domain remains TBD.
- Define how development setup links are captured safely.
- Record the email provider as TBD with an implementation adapter.
- Record hosting capacity, budget, launch jurisdiction, data-retention period, analytics unique-view method, and password recovery as explicit gates.

### 1. Create the repository foundation

- Initialize the Next.js App Router project with TypeScript and npm.
- Add Tailwind CSS and establish the first Tapit design tokens without building product screens yet.
- Configure strict TypeScript, ESLint, Prettier, test scripts, and CI commands.
- Add `.env.example`, README setup instructions, and safe secret-handling conventions.
- Add GitHub Actions for formatting, lint, typecheck, unit tests, and build.

### 2. Establish Convex and authentication

- Create development and production Convex deployments.
- Add Convex schema skeleton and generated bindings.
- Configure Convex Auth email/password.
- Add seeded/invited administrator access.
- Add administrator-created customer accounts and one-time setup-token workflow.
- Add route guards and backend authorization tests.

### 3. Implement the core schema and domain rules

- Implement account/profile/card/link states and relationships.
- Add slug uniqueness and immutability-after-publication rules.
- Add unique pre-encoded card URL registration rules.
- Add shared validation for required profile fields, link schemes, image types/sizes, and state transitions.
- Add audit event contracts before implementing destructive/admin workflows.

### 4. Build public resolution and status pages

- Build the stable public profile route.
- Build the unique card resolver route.
- Implement published, unpublished, suspended, inactive-card, and temporary-error experiences.
- Ensure inactive/replaced card paths cannot expose former profile content.
- Add generated metadata and `noindex` behavior.
- Add lightweight loading and error boundaries.

### 5. Build the customer profile experience

- Implement customer navigation: Profile, Links, Analytics, Account.
- Build profile editor with name, optional image/logo, bio/role, email, phone, website, and public URL display.
- Add basic image crop/preview and optimized upload workflow.
- Add draft save, responsive preview, validation, and explicit publish.
- Keep customer Cards navigation absent from the MVP.

### 6. Build link management and custom UI

- Implement add/edit/delete/enable/disable/reorder link behavior.
- Add custom labels and preset icons.
- Validate HTTPS, `mailto:`, and `tel:` destinations server-side and client-side.
- Build the custom Tapit profile theme system with colors, fonts, button styles, and restrained themes.
- Implement accessible keyboard alternatives for link reordering.

### 7. Build administrator customer/profile/card management

- Implement administrator navigation: Customers, Profiles, Cards, Analytics, Audit log, Settings.
- Build customer creation/invitation workflow.
- Build manual pre-encoded card URL registration and duplicate validation.
- Build assignment to a profile.
- Build deactivation and replacement workflow with immediate state changes.
- Build profile edit, publish/unpublish, suspension, and support actions.
- Add audit records to every relevant state transition.

### 8. Build QR and vCard features

- Generate QR codes from unique card URLs.
- Add administrator QR preview and PNG/SVG download.
- Generate vCards containing only selected name, email, website, and public profile URL.
- Add public Save contact action and appropriate empty/disabled states.

### 9. Build privacy-preserving analytics

- Define aggregate event contracts for profile views and link clicks.
- Count NFC/card, QR, and direct visits as profile views without double-counting the resolver path.
- Count destination selection as link click.
- Store time-bucketed aggregate data sufficient for lifetime, 7-day, 30-day, and 90-day views.
- Implement customer-scoped analytics and administrator-wide analytics.
- Add privacy-preserving unique-view logic only after the method is decided; do not retain raw visitor-level history.
- Ensure analytics recording cannot block public profile rendering.

### 10. Build account deletion, moderation, and operational controls

- Implement customer deletion request and confirmation.
- Implement administrator execution/approval.
- Immediately unpublish profiles and deactivate assigned cards.
- Retain only the minimal permitted audit record.
- Implement administrator profile suspension and fixed branded unavailable page.
- Add configurable generic support/contact destination.

### 11. Verify UX, accessibility, and real-device behavior

- Run unit, component, browser, and accessibility tests.
- Test current iPhone and Android devices with a real NDEF card.
- Test QR codes from generated PNG and SVG outputs.
- Verify direct URL, NFC, and QR paths show the same published profile.
- Verify deactivated cards never show former content.
- Measure public-page usability on a normal 4G connection.
- Test loading, empty, validation, unavailable, inactive, and temporary-error states.

### 12. Deploy the working MVP

- Configure Vercel preview and production projects.
- Configure Convex preview/development and production deployments.
- Configure production email only after provider selection.
- Configure monitoring, error reporting, backups, and recovery ownership.
- Run production smoke tests and the real-device acceptance suite.
- Complete the pilot with independent professionals and recipients.

## Files and folders to create

The following is the expected implementation shape. Names may be adjusted slightly to match the selected Next.js version, but responsibilities should remain clear.

### Root configuration

- `package.json`: npm scripts and dependencies.
- `package-lock.json`: reproducible dependency lockfile.
- `tsconfig.json`: strict TypeScript configuration.
- `next.config.*`: Next.js configuration and image handling.
- `eslint.config.*`: lint rules.
- `.prettierrc*` and `.prettierignore`: formatting rules.
- Tailwind/PostCSS configuration or the selected CSS-first Tailwind configuration.
- `playwright.config.*`: browser test projects, base URL, traces, and artifact policy.
- `.env.example`: documented environment variable names only.
- `.gitignore`: local environment, build, test, and generated files.
- `README.md`: setup, scripts, environments, test workflow, and deployment notes.

### Application routes

- `src/app/layout.tsx`: root metadata, providers, global structure.
- `src/app/globals.css`: Tailwind import and Tapit design tokens/base styles.
- `src/app/page.tsx`: safe landing or product entry route, if needed.
- `src/app/(public)/[slug]/page.tsx`: published public profile route.
- `src/app/(public)/[slug]/loading.tsx`: public profile loading state.
- `src/app/(public)/[slug]/error.tsx`: public profile error state.
- `src/app/(public)/[slug]/not-found.tsx`: missing profile state.
- `src/app/(public)/c/[cardToken]/route.ts`: card URL resolution and inactive-card handling.
- `src/app/(auth)/login/page.tsx`: shared customer/admin login.
- `src/app/(auth)/setup/[token]/page.tsx`: one-time customer setup.
- `src/app/app/layout.tsx`: customer route guard and navigation shell.
- `src/app/app/profile/page.tsx`: customer profile editor.
- `src/app/app/links/page.tsx`: customer link management.
- `src/app/app/analytics/page.tsx`: customer analytics.
- `src/app/app/account/page.tsx`: account settings, deletion request, and support.
- `src/app/admin/layout.tsx`: administrator route guard and navigation shell.
- `src/app/admin/customers/page.tsx`: customer management.
- `src/app/admin/profiles/page.tsx`: profile management.
- `src/app/admin/cards/page.tsx`: card registration, assignment, status, replacement, and QR.
- `src/app/admin/analytics/page.tsx`: administrator analytics.
- `src/app/admin/audit-log/page.tsx`: audit history.
- `src/app/admin/settings/page.tsx`: support destination and platform settings.
- `src/app/error.tsx` and `src/app/not-found.tsx`: global fallbacks.

### Components and domain modules

- `src/components/ui/`: Tapit-owned buttons, inputs, dialogs, tabs, menus, badges, tables, alerts, loading states, and accessible primitives.
- `src/components/profile/`: public profile header, link list, Save contact action, theme renderer, and responsive preview.
- `src/components/forms/`: profile, link, account, customer, card, and deletion forms.
- `src/components/admin/`: customer, profile, card, analytics, audit, and settings views.
- `src/components/analytics/`: metric cards, time-range controls, and empty states.
- `src/components/qr/`: QR preview and download controls.
- `src/components/auth/`: login, setup, session, and auth-state components.
- `src/lib/validation/`: shared schemas and field/link/card validation.
- `src/lib/vcard/`: vCard generation and safe field projection.
- `src/lib/qr/`: QR generation abstraction and output handling.
- `src/lib/analytics/`: event normalization and privacy-safe aggregation contracts.
- `src/lib/permissions/`: role and ownership checks shared by UI guards and server boundaries.
- `src/lib/constants/`: statuses, supported link schemes, time ranges, and theme definitions.

### Convex modules

- `convex/schema.ts`: tables, indexes, and data constraints.
- `convex/auth.ts`: Convex Auth configuration.
- `convex/http.ts`: only required HTTP actions/resolution endpoints.
- `convex/customers.ts`: administrator customer account operations.
- `convex/profiles.ts`: profile queries/mutations, drafts, publication, suspension, and public projections.
- `convex/links.ts`: link CRUD, ordering, validation, and public enabled-link projection.
- `convex/cards.ts`: card registration, assignment, resolution, deactivation, and replacement.
- `convex/analytics.ts`: aggregate event ingestion and reporting queries.
- `convex/audit.ts`: audit writes and administrator audit queries.
- `convex/storage.ts`: image upload authorization, metadata, and cleanup.
- `convex/invitations.ts`: setup-token creation, consumption, expiry, resend, and invalidation.
- `convex/admin.ts`: administrator role checks and seeded-admin support.

### Tests and CI

- `tests/unit/`: domain, validation, state transition, vCard, QR, and analytics tests.
- `tests/components/`: customer/admin/public component tests.
- `tests/integration/`: Convex function and authorization tests against an isolated environment.
- `e2e/customer.spec.ts`: customer setup, profile, links, preview, publish, and account flows.
- `e2e/admin.spec.ts`: customer/card/profile/admin workflows.
- `e2e/public-profile.spec.ts`: direct URL, card URL, QR destination, vCard, statuses, and metadata.
- `e2e/accessibility.spec.ts`: keyboard and automated accessibility checks.
- `e2e/real-device-checklist.md`: manual iPhone/Android/NFC/QR test matrix.
- `.github/workflows/ci.yml`: formatting, lint, typecheck, tests, build, and browser checks.

## Test and proof strategy

### Unit and domain tests

Prove deterministic behavior without a browser:

- profile publish validation: name and at least one valid link;
- draft versus published isolation;
- immutable slug after publication;
- allowed/blocked link schemes;
- link ordering and enabled/disabled projection;
- card state transitions and prohibition of reactivation/reassignment;
- replacement relationship and old-card deactivation;
- vCard field projection;
- QR input/output contract;
- analytics time-range aggregation;
- deletion state transition and audit payloads;
- role and ownership predicates.

### Component tests

Prove user-visible behavior for:

- required-field and URL validation;
- image upload states and 5 MB/type errors;
- draft/publish controls;
- responsive preview;
- link reorder keyboard alternative;
- customer navigation without Cards;
- administrator card registration and duplicate errors;
- QR preview/download controls;
- analytics empty and populated states;
- inactive/unavailable/error screens;
- accessible labels, focus, status messaging, and non-color-only state indicators.

### Integration tests

Run Convex functions against an isolated development/test environment and prove:

- customer cannot read or mutate another customer’s profile;
- customer cannot register, claim, transfer, assign, deactivate, or replace cards;
- administrator can perform authorized customer/card/profile actions;
- duplicate card URLs are rejected;
- public queries expose published fields only;
- unpublished/suspended/inactive states expose no former profile content;
- audit entries contain actor, target, timestamp, action, and state transition;
- deletion deactivates all assigned cards before personal/profile deletion.

### Browser end-to-end tests

Use Playwright to cover the main workflows from `spec.md`, including:

- administrator creates customer and registers a card URL;
- customer completes setup and creates a valid profile;
- customer drafts, previews, publishes, updates, and republishes;
- visitor opens direct URL and card resolver URL;
- visitor downloads vCard;
- visitor clicks external links and analytics update;
- administrator generates PNG/SVG QR outputs;
- administrator deactivates/replaces card;
- administrator suspends/unpublishes profile;
- customer requests deletion and administrator completes it.

### Accessibility proof

- Run automated axe checks against public, customer, and administrator screens.
- Run keyboard-only journeys for forms, dialogs, tabs, link reordering, publish, and deletion confirmation.
- Verify focus restoration after dialogs and error announcements.
- Verify image alternative text and form error associations.
- Perform a manual contrast and responsive review because automated checks do not prove all WCAG 2.2 AA basics.

### Real-device proof

Maintain a manual matrix containing at least:

- current iPhone with NFC enabled;
- current Android phone with NFC enabled;
- iPhone QR scan;
- Android QR scan;
- direct profile URL on both platforms;
- active card;
- deactivated/replaced card;
- unpublished/suspended profile;
- vCard download and contact import behavior.

Record device model, OS/browser version, card URL, result, and evidence. Do not call NFC acceptance complete from a desktop browser test alone.

### Performance and availability proof

- Measure the public profile on a normal 4G connection using a repeatable browser/performance test.
- Measure time until the profile is usable, not merely server response time.
- Confirm lightweight image behavior and loading state.
- Run a production-like smoke test after deployment.
- Establish monitoring before using the 99.9% availability target as a launch claim.
- Document the measurement method for unique views before analytics acceptance is final.

## Deployment and operations

### Environments

- Local: Next.js local server plus Convex development deployment and safe email adapter.
- Preview: Vercel preview deployment connected to an isolated Convex preview/development environment and test email behavior.
- Production: Vercel production deployment connected to Convex production, production email provider, final domain, and operational monitoring.

Do not point local or preview environments at production Convex data or production email without an explicit operational reason and safeguards.

### Deployment method

- Connect the repository to Vercel for preview deployments on pull requests and production deployment from the protected main branch.
- Deploy Convex functions/schema through the approved Convex deployment command and environment-specific configuration.
- Require CI checks before merging to the production branch.
- Keep Vercel and Convex environment variables documented and separately managed.
- Run database/schema changes in a controlled order and include rollback or forward-fix notes for each migration-like change.

### Monitoring and support

Before broad launch, define:

- public profile availability monitor;
- error logging and alert routing;
- failed authentication/invitation monitoring;
- card resolver and inactive-card error monitoring;
- analytics ingestion failure monitoring;
- image/QR generation failure monitoring;
- backup and recovery ownership;
- incident-response owner and support destination.

The exact tools, plan tiers, recovery objectives, and monthly budget are TBD. The 99.9% target cannot be treated as guaranteed merely because Vercel and Convex are selected.

### Release gates

Do not call the MVP production-ready until:

- email onboarding works with the selected provider or an explicitly accepted operational workaround;
- password recovery/email verification risk is reviewed;
- launch jurisdiction and privacy handling are reviewed;
- production domain and card URL strategy are final;
- data retention and deletion policy are final;
- monitoring and recovery ownership are assigned;
- real-device NFC/QR tests pass;
- performance and accessibility acceptance passes;
- the pilot has been completed and its size/results recorded.

## Risks and alternatives

### Deferred account recovery and verification

Risk: email/password accounts without verification or password reset create account-recovery and ownership risk.

Mitigation: keep the implementation behind an explicit product/security gate; use Convex Auth-native flows or a managed provider before broad launch.

### Transactional email provider remains TBD

Risk: setup-link delivery cannot be proven without a real provider.

Mitigation: build a provider adapter and safe local adapter; select and test a provider before the real pilot.

### Card URL entry errors

Risk: manual entry of a pre-encoded URL can associate the wrong card.

Mitigation: normalize and validate URLs, reject duplicates, show a confirmation/preview before assignment, and retain audit history. A future scan-assisted workflow is an alternative but remains out of MVP.

### NFC behavior varies by device and OS

Risk: NFC support, browser opening, and device settings vary.

Mitigation: standard NDEF URI records, QR fallback, no-app flow, real-device matrix, and clear fallback messaging.

### Analytics uniqueness and privacy

Risk: unique-view metrics can encourage visitor tracking or be inaccurate across devices.

Mitigation: use aggregate time-bucketed data only, select a privacy-preserving method, document its limits, and avoid raw visitor-level history.

### Public profile performance

Risk: client-heavy rendering, oversized images, or analytics writes can miss the 2-second target.

Mitigation: keep public UI lightweight, optimize images, isolate analytics recording from rendering, and measure on normal 4G.

### Availability and vendor dependence

Risk: the 99.9% target depends on Vercel, Convex, email, domain, and operational practices.

Mitigation: select appropriate plans, monitor dependencies, document recovery, and keep a self-hosting/alternate backend option as a future contingency.

### Convex fit at larger scale

Risk: aggregate analytics volume, storage, or future team functionality may outgrow the initial model.

Mitigation: keep domain boundaries clear, avoid raw event retention, monitor usage, and revisit backend choice only if measured requirements exceed Convex’s fit.

### Custom UI accessibility burden

Risk: building UI primitives instead of using a component library increases accessibility responsibility.

Mitigation: keep primitives small, test keyboard/focus/error behavior, use accessible headless behavior where appropriate without adopting an opinionated visual system, and perform manual review.

## Open questions and assumptions

### Confirmed assumptions used by this plan

- Project name is Tapit.
- Greenfield repository; no existing codebase or `CLAUDE.md`.
- TypeScript with npm.
- Current stable Next.js App Router.
- Tailwind CSS with Tapit-owned UI components.
- Convex backend/database/storage and Convex Auth.
- Vercel deployment with separate Convex development/production environments.
- GitHub Actions CI.
- Vitest, React Testing Library, Playwright, ESLint, and Prettier.
- Administrators create/invite customer accounts and own card assignment.
- Customers log in to create/manage profiles but do not have a Cards screen.
- Real NDEF card, iPhone, and Android devices are available for testing.

### TBD decisions requiring resolution

- Author/team name.
- Production domain and final public URL branding.
- Exact Next.js, Convex, Convex Auth, Tailwind, and test-tool versions at initialization.
- Transactional email provider.
- Setup-link expiry, resend, and invalidation policy.
- Email verification and password-reset approach before production.
- Customer account email-change policy.
- Maximum links per profile.
- Privacy-preserving unique-view algorithm and retention window; aggregate analytics are retained for the profile lifetime, but raw visitor history is not retained.
- Launch jurisdiction, privacy notice, analytics disclosure/consent, and compliance requirements.
- Deleted personal/profile data retention period.
- Vercel/Convex plan, monthly budget, expected initial customers/cards/traffic, monitoring, backups, recovery objectives, and incident ownership.
- Exact QR generation library and image/QR operational limits.
- Exact card resolver implementation for counting one profile view across card resolution and profile rendering.
- Generic support/contact destination.
- Pilot customer/card/tap count and adoption threshold.

### Technical options and recommendations

- **Email:** Resend, Postmark, or SendGrid. Recommendation: evaluate Resend first through an adapter.
- **Authentication:** Convex Auth or an external managed provider. Recommendation: Convex Auth for MVP because it is selected and integrates with Convex; reassess if recovery/verification requirements cannot be met.
- **Public card resolution:** redirect card URL to stable profile URL or render profile through a resolver. Recommendation: preserve unique card status checks and count profile views once; choose the simpler implementation after an analytics proof test.
- **Unique views:** rotating pseudonymous identifiers, coarse time-bucketed counters, or privacy-oriented edge aggregation. Recommendation: choose the least reconstructable method that still supports the required dashboard ranges.
- **Hosting plans:** Vercel/Convex managed plans versus later self-hosting. Recommendation: managed plans for MVP, subject to a budget and availability review.
- **UI primitives:** fully custom primitives versus accessible headless behavior with custom Tailwind styling. Recommendation: custom Tapit visuals with proven headless interaction behavior where keyboard/dialog complexity is high.

## Definition of done

- A clean greenfield repository is initialized with TypeScript, npm, current stable Next.js App Router, Tailwind CSS, Convex, Convex Auth, and the selected test tooling.
- Local, preview, and production environment setup is documented and separated.
- CI runs formatting verification, lint, strict typecheck, unit tests, build, and agreed browser tests.
- Administrator onboarding creates customer accounts, registers manually entered unique card URLs, assigns cards, and sends a safe setup link.
- Customers can authenticate, complete a profile, manage links, customize the profile, save drafts, preview responsive layouts, and explicitly publish.
- Published profiles are available through stable URLs and active NFC/QR card paths without a visitor account or native app.
- Profile updates do not require NFC re-encoding or URL changes.
- External links, contact actions, labels, icons, ordering, and enable/disable behavior work as specified.
- QR codes can be previewed and downloaded as PNG and SVG.
- vCards contain only selected name, email, website, and public profile URL fields.
- Customer and administrator analytics provide the agreed aggregate lifetime, 7-day, 30-day, and 90-day views/clicks without raw visitor-level history.
- Administrators can edit, publish/unpublish, suspend, deactivate, replace, and audit the relevant profiles/cards.
- Deactivated/replaced cards show the branded inactive-card page and never expose former profile content.
- Unpublished/suspended profiles show the branded unavailable page and never expose unpublished data.
- Customer deletion requests require confirmation and administrator execution/approval, immediately unpublish/deactivate, preserve minimal audit history, and follow the final retention policy.
- Customer authorization prevents cross-account access and all customer card assignment/transfer/deactivation controls.
- Public and dashboard screens meet the agreed WCAG 2.2 AA baseline, including keyboard operation, focus, contrast, error messaging, alt text, and responsive behavior.
- Real current iPhone and Android NFC/QR tests pass, including active, inactive, replaced, unpublished, and suspended states.
- Public profile usability meets the 2-second normal-4G target under a documented measurement method.
- Production monitoring is in place and the service is ready to measure the 99.9% monthly public-profile availability target.
- All significant TBD decisions are resolved or explicitly accepted as launch blockers, and the real pilot is completed with its final success threshold recorded.
