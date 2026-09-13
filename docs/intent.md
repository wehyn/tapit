# Intent: NFC-linked digital profile cards for professionals and small businesses

Author: `<name/team>`  
Status: draft  
Date: 2026-09-14

## Problem

Independent professionals and small businesses need one easily updateable digital identity page that can be opened from an NFC business card or NFC profile card. The page should let recipients quickly access useful links such as LinkedIn, WhatsApp, websites, email, phone, booking pages, and other social profiles.

The primary people experiencing the problem are the professionals and businesses sharing their contact information. The secondary people are the recipients who need to access that information quickly from a phone without installing an app or creating an account.

## Proposed outcome

An administrator creates a customer account and assigns one or more pre-encoded NFC cards to the customer’s profile. The customer creates and manages a public profile containing their name, profile photo or business logo, short bio or role, and selected contact or external links.

Each NFC card has a unique card URL that resolves to the customer’s stable public profile URL. A recipient can tap the card, scan its QR-code fallback, or open the public profile URL directly and immediately see the published profile without an app or account.

Customers can save drafts, preview changes, and explicitly publish updates without re-encoding the NFC card or changing the public URL. Visitors can download a vCard containing only the owner’s selected name, email, website, and public profile URL. Customers and administrators can view basic aggregate profile-view and link-click analytics.

Administrators can assign, deactivate, suspend, and replace cards, and can manage profile publication. A deactivated card shows a branded inactive-card page without revealing the former profile; an unpublished profile shows a branded unavailable-profile page while remaining assigned to its cards.

## Affected users and systems

- Users: independent professionals and small businesses as primary customers; people receiving or tapping their cards as secondary visitors; one platform administrator role with full customer, profile, card, analytics, and audit access.
- Systems: customer account and profile management; administrator dashboard; public profile pages; NFC card registry, assignment, deactivation, replacement, and audit log; QR-code fallback; email setup-link onboarding; vCard generation; aggregate analytics; moderation/suspension workflows.
- Preferred technology: Next.js for the web application, Convex for the backend/database, and Vercel for deployment. This is a preferred stack, not yet a mandatory constraint.

## Constraints

- Owner access uses email-based accounts with passwords. Administrators create accounts by entering a customer email; the system sends a one-time setup link for the customer to create their password. Administrators must not know or store customer passwords. Email verification and password-reset flows are deferred for now.
- The public experience must work on current iPhones and Android phones using their default mobile browsers, without a dedicated app. Cards use standard NFC Forum NDEF URI records. Every card also has a QR-code fallback.
- NFC cards are assumed to be pre-encoded and already available to the platform team. Card manufacturing, inventory management, and shipping are out of scope. Administrators manually enter or scan each card’s unique ID/URL, validate that it is unused, and assign it to a customer profile. Bulk import is out of scope.
- One customer account manages one profile. Multiple cards may point to that profile. Customers cannot claim arbitrary cards or transfer card ownership. Administrators can manage customer accounts, profiles, and cards; there is one administrator role in v1.
- The public profile URL uses the platform URL. An administrator creates a unique slug during account setup, the customer may suggest or confirm it before publishing, and the slug cannot change after publication. NFC card URLs are unique per card and resolve to the stable public profile URL; QR and manual sharing can use the profile URL directly.
- Owners control which fields and links are public. Supported destinations include valid HTTPS URLs plus safe `mailto:` and `tel:` actions; unsafe schemes such as `javascript:` and `data:` are rejected. Nothing appears publicly unless the owner adds and publishes it.
- Profiles support basic customization only: profile photo or logo, colors, fonts, button styles, and a small set of themes. Custom CSS, advanced layouts, and custom domains are out of scope.
- Public pages and dashboards should meet the agreed WCAG 2.2 AA basics, including mobile responsiveness, readable contrast, keyboard access, semantic controls, visible focus states, and alternative text for profile images or logos.
- The public profile should become usable within 2 seconds on a normal 4G connection, use lightweight assets, and show a clear loading state. The target is 99.9% monthly availability for public profiles, excluding planned maintenance, with a friendly error page during temporary outages.
- Analytics are privacy-preserving aggregate counts: total and unique profile views plus link clicks. A successful NFC, QR, or direct profile visit counts as a profile view; selecting a destination counts as a link click. Visitor names, contact details, and behavioral profiles are not collected in v1. Customers see their own analytics, and administrators can see analytics and operational status for support and auditing.
- Deleting a customer account or profile immediately unpublishes the profile and deactivates its cards. A minimal administrative audit record is retained, while personal and profile data are permanently deleted after a retention period that has not yet been defined.
- Administrators can suspend or unpublish profiles and deactivate cards. Automated moderation and public user-reporting are out of scope.
- Official identity verification, government-ID replacement, visitor authentication, and access control are out of scope. “ID card” means a public profile card only.
- Richer content such as posts, videos, storefronts, courses, and community features is out of scope. Social login, multi-profile/team management, granular administrator roles, advanced reporting, advanced attribution, demographics, cross-platform reporting, customer billing, subscriptions, and in-app payments are also out of scope for v1.
- There is no fixed launch deadline. The priority is a small, reliable release focused on the core card and profile workflows.

## Success looks like

- All core workflows pass end-to-end on real iPhones and Android phones: administrator card provisioning; customer profile creation, editing, preview, and publishing; NFC tap; QR scan; direct URL sharing; link clicks; vCard download; analytics; card deactivation; profile suspension/unpublishing; and card replacement.
- An active card, QR code, or direct profile URL opens the correct published profile without an app or visitor account. Updating and publishing profile content changes what visitors see without re-encoding the NFC card or changing the stable public URL.
- A replacement deactivates the old card immediately, the old card shows the branded inactive-card page without exposing the former profile, and administrators can see the relevant assignment/replacement history in the audit log.
- The public experience becomes usable within 2 seconds on a normal 4G connection, satisfies the agreed accessibility baseline, and meets the 99.9% monthly public-profile availability target.
- Customers can download a vCard containing only the selected name, email, website, and public profile URL. Customers and administrators can distinguish profile reach from link engagement through aggregate views and clicks.

## Open questions

- Who should be listed as the author: an individual, product team, or organization?
- What exact retention period applies before deleted personal and profile data are permanently removed?
- What password-reset and email-verification approach is required before production, given that both are deferred for now?
- Should the preferred Next.js, Convex, and Vercel stack become a mandatory constraint, and which production plans, monitoring, backups, and operational controls will support the 99.9% availability target?
- What exact platform brand/domain will host the permanent public profile URLs and card URLs?
- Will administrators register each physical card by manually entering its unique URL, scanning it, or support both workflows in the first release?
- What precise method and retention window will be used to calculate unique profile views while preserving visitor privacy?
- What pilot size, customer adoption target, or usage threshold should supplement the functional success criteria?
