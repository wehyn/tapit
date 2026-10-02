# Tapit Premium Conversion UI Design

Date: 2026-10-01
Status: Approved

## Goal

Redesign Tapit's existing customer-facing interface as a polished, mobile-first product for professionals and small businesses who want an NFC business card that opens a useful digital profile. The public site should explain the card-and-profile experience quickly and lead visitors to the card-design flow. The product screens should share the updated visual language while staying clear, accessible, and faithful to their current tasks.

The redesign changes presentation, copy, and in-page interactions. It does not change authentication rules, account provisioning, profile publication, link handling, card ordering, analytics, data collection, or authorization.

## Audience and core message

- **Card owners:** professionals and small businesses sharing social profiles, work, contact details, and next steps in person.
- **Recipients:** people who tap or scan a card and need to open the profile on their phone without installing an app or creating an account.
- **Core message:** one NFC card points to an editable profile containing the owner's public social and contact links; update the profile without re-encoding the card.

## Approved direction

Use a premium light-tech system across the marketing site, public utility pages, authentication, customer workspace, and administrator workspace. Use crisp system sans-serif typography, generous spacing, bright neutral surfaces, deep ink text, emerald actions, and restrained emerald-to-teal gradients. Keep the physical-card photography tactile and let product UI mockups supply most of the technology visual. Use glass only for the sticky public navigation and decorative product overlays, with a solid-surface fallback.

The public profile remains its own phone-first experience. Customer-selected profile themes, typography, and accent settings must keep their existing appearance and must not inherit the marketing/workspace palette changes accidentally.

## Scope

### Included route families

- Marketing home page `/` and its public navigation/footer.
- Public profile routes `/{slug}`, card resolver `/c/{cardToken}`, and their loading, missing, unavailable, inactive, and error states.
- Authentication, setup, and onboarding screens.
- Customer workspace: overview, profile, customization, links, analytics, account, and card-design surfaces.
- Administrator workspace: customers, profiles, cards, analytics, audit log, and settings.
- Public legal pages and the standalone card-design page, so shared public elements remain visually consistent.

### Excluded changes

- Pricing, subscriptions, payment, shipping, physical-card ordering, or manufacturing.
- A waitlist or new lead-capture endpoint, and any new storage of prospective-customer data.
- Real customer counts, customer logos, endorsements, named testimonials, fabricated profile performance, or pricing claims.
- Authentication/signup availability, Google OAuth behavior, account provisioning, roles, and invitations.
- Customer-selected public profile themes or their published-profile output.
- New profile, analytics, admin, or physical-card capabilities.

## Landing-page structure and copy direction

The section order is:

1. **Sticky navigation:** Tapit brand, Product, How it works, FAQ, sign-in/account link, and a visible customer-profile action.
2. **Hero:** “A better introduction, in one tap.” Supporting copy explains that an NFC card opens one profile for social links, contact details, and the next step, and that profile updates do not require re-encoding the card. Use a physical-card visual beside a clearly illustrative profile preview.
3. **Product-proof band:** short factual points: NFC tap plus QR fallback, no app required for recipients, and profile links can be updated. Do not present these as third-party endorsements or usage statistics.
4. **Features:** social profiles, work/portfolio links, direct contact actions, and a save-contact option when the profile contains supported contact information.
5. **Product showcase:** a phone-sized profile preview paired with the existing physical-card image. Label the profile example as illustrative; do not imply the sample is a real customer.
6. **Benefits:** explain the value for independent professionals and small businesses, including keeping contact destinations current and making a useful next step easy to find.
7. **How it works:** set up or manage a profile, add the links and details to share, then tap or scan the card. Keep this accurate to the existing product.
8. **FAQ:** answer what a recipient sees, app requirements, NFC/QR behavior, editable details, how a visitor saves a contact, and the current card-design/ordering state. Do not promise universal NFC hardware support; describe QR as the fallback and say physical ordering is coming soon.
9. **Closing CTA:** reinforce the single-profile benefit and direct to the customer profile.
10. **Footer:** product navigation, sign-in/account, privacy, and terms.

The primary CTA is **“Go to your profile”** and links to `/app/profile`. Authenticated customers land in their profile editor. Signed-out visitors follow the existing customer-route guard to login, with `/app/profile` preserved as the return destination. Keep design exploration secondary: “Explore card designs” and the footer’s “Design a card” link open `/build-card`, where the existing Canva and upload choices remain available and custom card ordering is clearly marked as coming soon. Do not imply a visitor can currently buy or order a card.

Pricing and testimonial sections are intentionally omitted per the user's choice. Social proof is represented only by the factual capability band above. No placeholder prices, customer names, quotes, aggregate usage numbers, or logos may be added.

## Shared visual system

- Use a bright, low-noise canvas; white or near-white surfaces; deep ink headings/body text; accessible muted copy; and emerald primary actions.
- Set the shared workspace/public-shell palette to: ink `#10211C`, muted `#506158`, canvas `#F5F8F6`, surface `#FFFFFF`, soft surface `#EAF3EE`, line `#DCE7E1`, emerald action `#176B52`, strong emerald `#10543F`, and soft emerald `#E1F2E9`. Use emerald-to-teal gradients only as decoration, not as text or control fills.
- Bind customer-selected public profile themes to dedicated profile palette values so changing shared UI tokens does not change the selected paper, moss, night, or warm-studio appearance.
- Use gradients as small decorative fields around the product showcase and CTA, never behind dense body copy or important controls.
- Use system sans-serif fonts for body, controls, and display headings. Do not add a hosted font or a new visual dependency.
- Use clear, consistent heading scales and line lengths; retain comfortable paragraph leading and the existing large-content max-width discipline.
- Give primary buttons a clear filled treatment and secondary actions an outlined or quiet treatment. Preserve visible hover, focus, disabled, loading, and error states.
- Apply refined corner radii and restrained shadows to cards and mockups. Reserve blur/translucency for low-density navigation or decoration, and provide a solid fallback when reduced transparency is preferred.
- Reuse existing product assets where they fit; keep image alternative text accurate and identify sample/demo content as illustrative.

## Product surfaces

- **Public profiles:** retain the existing compact, centered, phone-first hierarchy, available links, Save contact action, user-selected theme, and visitor-facing behavior. Do not add marketing navigation or profile controls that compete with contact actions.
- **Authentication:** update typography, surfaces, spacing, inputs, notices, and buttons within the existing sign-in, signup, OAuth, setup, and onboarding states. Preserve the current production account-access rules and form behavior.
- **Customer workspace:** apply the shared surfaces, color, spacing, and type to the existing workspace chrome and screen families. Keep Profile, Customize, Links, Analytics, Account, and card-building tasks recognizable and preserve draft, preview, save, publish, and unpublish actions.
- **Administrator workspace:** apply the same system to the operations shell and existing registries, details, forms, tables, dialogs, analytics, audit, and settings. Preserve administrator navigation and operational actions.
- **Public utility states/pages:** keep legal copy, error messages, loading states, inactive-card pages, and unavailable-profile boundaries intact while styling them consistently.

No product behavior may depend on hover. Navigation, disclosure, menu, form, and dialog interactions remain keyboard operable.

## Motion and responsive behavior

- Add restrained page-entry and scroll-reveal motion to the marketing page, with a small stagger for section content, subtle ambient motion on decorative gradients, and responsive hover/focus microinteractions for actionable product cards and buttons.
- Use CSS transitions/keyframes plus a small IntersectionObserver helper where scroll entry needs viewport awareness. Do not add an animation package.
- Content must remain visible if JavaScript or the observer does not run. Animation must not block access to headings, links, controls, or the product preview.
- Respect `prefers-reduced-motion` by removing reveals, transforms, ambient movement, and nonessential transitions. Respect reduced-transparency preferences with solid surfaces.
- Design mobile-first from 320 CSS pixels upward; avoid horizontal overflow, keep touch targets at least 44 CSS pixels, and keep the sticky navigation usable with a keyboard and screen reader.

## Accessibility and quality bar

- Preserve semantic landmarks, one meaningful page-level heading, ordered heading levels, descriptive link/button names, image alternatives, and visible keyboard focus.
- Meet WCAG 2.2 AA contrast for text and controls; never use color alone to convey state.
- Keep navigation and disclosures operable without a pointer, maintain a logical focus order, and verify responsive menu state and Escape behavior.
- Keep content readable when motion and transparency are reduced.
- Preserve page performance: no new runtime dependencies or large unoptimized asset additions; eagerly load the hero visual and lazy-load below-the-fold product imagery.

## Acceptance criteria

1. The homepage contains the approved sections in order, except pricing and testimonials, and uses only product facts supported by current behavior.
2. Every primary “Go to your profile” CTA targets `/app/profile`; signed-in customers reach the editor and signed-out visitors retain that destination through the existing login guard. Secondary design-exploration links continue to open `/build-card`, where Canva/upload choices and the “ordering soon” state remain clear.
3. Desktop, tablet, and phone layouts remain legible and usable from 320 CSS pixels without horizontal page scrolling.
4. The home page, shared public chrome, authentication, customer, admin, card-design, and public utility route families follow the new light-tech visual system.
5. Published profile themes and typography remain unchanged by the shared workspace palette update.
6. Existing profile, authentication, customer, administrator, and card-design behavior is preserved; no backend, access, billing, ordering, or data-collection behavior changes.
7. Motion is subtle and progressive; reduced-motion users receive static, fully visible content.
8. Local demo browser review covers key desktop/mobile route families, keyboard interaction, reduced-motion presentation, and a repeatable screenshot artifact. Run `NEXT_PUBLIC_DEMO_MODE=true npm run verify` and `npm run test:e2e:demo` before claiming completion.

## Implementation boundary

This spec authorizes a visual redesign of existing UI only after written-spec and implementation-plan review. It does not authorize production deployment, external publishing, schema/API changes, or collection of new customer data. If implementation needs any such change, pause and seek a separate design decision.
