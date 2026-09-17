# Tapit Pricing Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved four-card Tapit pricing grid and bulk-order strip to the existing landing-page pricing section.

**Architecture:** Keep the change local to `src/app/page.tsx`. Store the four plan records in a local data array and render them through one semantic card markup, with a conditional featured treatment for Pre-order. Keep the existing pricing heading, workspace link, container, tokens, and responsive padding, and route every new CTA to `/login`.

**Tech Stack:** Next.js 16.3.5 App Router, React 19.3, TypeScript, Tailwind CSS 4, `next/link`, and `@phosphor-icons/react`.

---

### Task 1: Add the pricing plans and bulk-order presentation

**Files:**
- Modify: `src/app/page.tsx:8` for the existing Phosphor import list.
- Modify: `src/app/page.tsx:10-15` for the local pricing data structure.
- Modify: `src/app/page.tsx:281-298` for the pricing section body.

- [ ] **Step 1: Define the local pricing data**

Add the existing Phosphor `Buildings` icon to the import list and add this local data structure near `navItems`:

```tsx
const pricingPlans = [
  {
    name: "Pre-order",
    descriptor: "Founding 25",
    price: "₱250",
    description:
      "Get your custom Tapit card at our launch price. Limited to the first 25 customers.",
    cta: "Pre-order your Tapit",
    featured: true,
  },
  {
    name: "Student",
    descriptor: "25% Discount",
    price: "₱375",
    description: "Valid student ID required. Same features, made more accessible for students.",
    cta: "Get student pricing",
    featured: false,
  },
  {
    name: "Regular",
    descriptor: "Your Tapit",
    price: "₱500",
    description: "One custom NFC + QR card with your Tapit profile. No monthly fees.",
    cta: "Get your Tapit",
    featured: false,
  },
  {
    name: "Teams",
    descriptor: "10-card Batch",
    price: "₱4,000",
    description: "₱400 per card. Made for teams, organizations, and groups.",
    cta: "Order for your team",
    featured: false,
  },
] as const;
```

- [ ] **Step 2: Preserve the heading and add the shared card grid**

Keep the current `Pricing` eyebrow, heading text, workspace link, `id="pricing"`, max-width, and `px-[clamp(1.25rem,5vw,5.25rem)]` classes. Give the existing heading an id and connect the section with `aria-labelledby`. Render the plans below the heading with a single map and semantic `<article>` elements:

```tsx
<section
  aria-labelledby="pricing-heading"
  className="border-t border-tapit-line py-24 sm:py-32"
  id="pricing"
>
  <div className="mx-auto w-full max-w-[95rem] px-[clamp(1.25rem,5vw,5.25rem)]">
    <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold tracking-[0.24em] text-tapit-accent uppercase">
          Pricing
        </p>
        <h2
          className="mt-5 text-5xl font-normal tracking-[-0.06em] sm:text-7xl"
          id="pricing-heading"
        >
          Start with a profile that feels like you.
        </h2>
      </div>
      <Link
        className="inline-flex min-h-12 items-center gap-3 text-sm font-semibold text-tapit-accent transition hover:text-tapit-accent-strong"
        href="/login"
      >
        Open your workspace <ArrowUpRight aria-hidden="true" size={18} />
      </Link>
    </div>

    <div className="mt-12 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {pricingPlans.map((plan) => (
        <article
          className={`flex min-w-0 flex-col rounded-[1.5rem] border p-6 sm:p-7 ${
            plan.featured
              ? "border-tapit-accent/60 bg-tapit-accent-soft shadow-[0_18px_50px_rgba(21,25,24,0.07)]"
              : "border-tapit-line bg-tapit-surface"
          }`}
          key={plan.name}
        >
          {plan.featured ? (
            <span className="mb-4 self-start rounded-full bg-tapit-accent px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.14em] text-white uppercase">
              Limited to first 25
            </span>
          ) : null}
          <h3 className="text-2xl font-medium tracking-[-0.05em]">{plan.name}</h3>
          <p className="mt-2 text-sm text-tapit-muted">{plan.descriptor}</p>
          <p className="mt-5 text-4xl font-medium tracking-[-0.08em] text-tapit-ink">
            {plan.price}
          </p>
          <p className="mt-5 max-w-xs text-sm leading-6 text-tapit-muted">{plan.description}</p>
          <Link
            className={`mt-8 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl px-5 text-sm font-semibold transition hover:-translate-y-px ${
              plan.featured
                ? "bg-tapit-accent text-white shadow-[0_8px_24px_rgba(24,116,97,0.18)] hover:bg-tapit-accent-strong"
                : "border border-tapit-line text-tapit-ink hover:border-tapit-ink/30 hover:bg-tapit-paper"
            }`}
            href="/login"
          >
            {plan.cta} <ArrowRight aria-hidden="true" size={18} weight="bold" />
          </Link>
        </article>
      ))}
    </div>

    <div className="mt-5 flex flex-col gap-4 rounded-[1.5rem] border border-tapit-line bg-tapit-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-tapit-accent-soft text-tapit-accent">
          <Buildings aria-hidden="true" size={24} weight="regular" />
        </span>
        <div>
          <h3 className="text-lg font-medium tracking-[-0.04em]">Need more than 10?</h3>
          <p className="mt-1 text-sm text-tapit-muted">
            Custom and bulk orders are available with volume pricing.
          </p>
        </div>
      </div>
      <Link
        className="inline-flex min-h-12 shrink-0 items-center justify-center gap-3 rounded-2xl border border-tapit-line px-5 text-sm font-semibold text-tapit-ink transition hover:border-tapit-ink/30 hover:bg-tapit-paper"
        href="/login"
      >
        Request a quote <ArrowRight aria-hidden="true" size={18} weight="bold" />
      </Link>
    </div>
  </div>
</section>
```

The exact final markup may adjust class ordering to satisfy the repository formatter, but it must retain the data-driven map, semantic heading/card structure, all approved copy, four CTA labels, and `href="/login"` on every new CTA.

- [ ] **Step 3: Check the changed file and diff boundaries**

Run:

```bash
git diff -- src/app/page.tsx
git diff --check
```

Expected: only the pricing section and the local pricing import/data additions are changed; no hero, benefits section, global CSS, dependency, backend, or unrelated landing-page edits appear.

- [ ] **Step 4: Commit the implementation**

Run:

```bash
git add src/app/page.tsx
git commit -m "feat: add landing page pricing cards"
```

Expected: one implementation commit on `feature/pricing-section`.

### Task 2: Verify the pricing section

**Files:**
- Test: existing project checks and `e2e/smoke.spec.ts`; do not add unrelated tests.

- [ ] **Step 1: Run formatting, lint, type, and existing relevant tests**

Run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npx playwright test e2e/smoke.spec.ts --project chromium
```

Expected: all commands pass. If the existing smoke test fails because of its pre-existing `/login` versus `/app/profile` assertion mismatch, report that exact failure without changing unrelated navigation.

- [ ] **Step 2: Visually verify responsive behavior**

With the app running, inspect `/` at these viewport sizes:

```text
1440 × 900 — four equal cards and the bulk strip below them.
900 × 900 — two-column card grid with no clipped content.
390 × 844 — one-column cards, readable CTAs, and no horizontal overflow.
```

Confirm the Pre-order card is the only featured card, all copy is present, each CTA points to `/login`, keyboard focus is visible, and the pricing section does not add the excluded hero or benefits content.

### Task 3: Independent review

**Files:**
- Review: `src/app/page.tsx` and the final diff only; no edits unless the root assigns a specific correction.

- [ ] **Step 1: Compare implementation against the approved design**

Check the final code and verification evidence for:

- exact plan names, descriptors, prices, Teams per-card copy, and bulk-strip copy;
- four-column desktop, two-column tablet, one-column mobile behavior;
- no horizontal overflow risks from grid/card markup;
- featured Pre-order badge/surface/border/shadow treatment;
- semantic section heading, articles, descriptive links, icon `aria-hidden`, and focus inheritance;
- preserved existing heading, workspace link, section container, design tokens, and unrelated landing sections;
- no hero imagery, benefits section, backend/Convex code, dependencies, or workflow claims.

Expected: reviewer returns either `approved` with evidence or a concise list of material corrections. Root integrates any correction, reruns the relevant checks, and confirms the final diff remains scoped.

