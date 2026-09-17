# Pricing section design

## Goal

Expand the existing landing-page pricing section so it presents Tapit's four pricing options and a bulk-order path in the visual language of the approved reference mockup.

## Scope

Update only the pricing area on the landing page (`src/app/page.tsx`) by adding:

1. Four pricing cards:
   - **Pre-order** — Founding 25 — **₱250**
   - **Student** — 25% Discount — **₱375**
   - **Regular** — Your Tapit — **₱500**
   - **Teams** — 10-card Batch — **₱4,000**, with supporting copy of ₱400 per card.
2. A bulk-order strip:
   - **Need more than 10?**
   - Custom and bulk orders are available with volume pricing.
   - Request a quote.

The existing pricing eyebrow, heading, and workspace link remain in place above the new cards.

## Out of scope

- Card hero imagery or physical-card presentation.
- The “Every Tapit includes” benefits section.
- Checkout, payments, order management, or quote-request workflows.
- New backend data, Convex functions, or database changes.
- New global design tokens or changes to unrelated landing-page sections.

## Visual design

- Use the existing Tapit neutral paper background, ink/muted text colors, border token, accent green, and rounded-card language.
- Desktop uses four equal-width cards with a small consistent gap.
- Tablet collapses to two columns; mobile stacks cards vertically without horizontal scrolling.
- Pre-order is the featured card: pale green surface, stronger green border, restrained shadow, and a `LIMITED TO FIRST 25` pill.
- Each card uses a consistent vertical rhythm: plan name, descriptor, price, explanatory copy, then a full-width CTA anchored to the bottom.
- Card CTAs use the existing `/login` entry point until ordering routes exist. The bulk CTA also uses `/login` as the current safe entry point; it does not imply that a quote workflow is implemented.
- The bulk-order strip spans the card grid, uses a lightly elevated neutral surface, includes a small building/business visual marker, and places its CTA on the right at larger widths.
- Preserve the existing section container width and responsive padding.

## Content and interaction

The card labels and copy use the approved reference wording:

- Pre-order: “Get your custom Tapit card at our launch price. Limited to the first 25 customers.” CTA: “Pre-order your Tapit”.
- Student: “Valid student ID required. Same features, made more accessible for students.” CTA: “Get student pricing”.
- Regular: “One custom NFC + QR card with your Tapit profile. No monthly fees.” CTA: “Get your Tapit”.
- Teams: “₱400 per card. Made for teams, organizations, and groups.” CTA: “Order for your team”.
- Bulk strip: “Custom and bulk orders are available with volume pricing.” CTA: “Request a quote”.

All actions are standard links with visible text and existing keyboard focus behavior. No hover-only interaction is required.

## Technical approach

Keep the change local to the landing page. Define the four plans as a typed or inferred local data array and map them into a shared card markup within the existing pricing section. This keeps repeated content consistent without introducing a component that has no second consumer yet.

Use existing Phosphor icons for arrows and the bulk-order marker. Do not add dependencies or raster assets.

## Accessibility and responsive acceptance criteria

- Cards are represented as semantic articles within a labeled pricing region or equivalent heading structure.
- Every CTA has a unique, descriptive accessible name.
- Color and border differences are supplementary; the featured card remains understandable from its text and badge.
- Keyboard focus remains visible through the existing global focus style.
- At mobile widths, the pricing section fits the viewport with no horizontal overflow.
- All content remains readable at the existing base font size and meets the project's established contrast expectations.

## Verification

- Run formatting and lint/type checks appropriate to the changed page.
- Run the existing unit suite if the implementation changes shared rendering logic.
- Perform a visual check at desktop, tablet, and narrow mobile widths.
- Confirm that the card hero and benefits section were not added.
