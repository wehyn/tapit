# Public profile customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guided Warm Studio customization system to the public Tapit profile while preserving draft privacy, legacy profile appearances, direct/card parity, and the existing physical-card boundary.

**Architecture:** Add a typed, bounded `customization` object to profile draft and published snapshots. A shared pure resolver converts legacy themes or Warm Studio settings into safe presentation tokens; the same `PublicProfile` renderer serves direct URLs, active card paths, and live previews. The editor becomes a split workspace with guided sections, while About/Services remains one typed collapsed section rather than a general block builder.

**Tech Stack:** Next.js 16.3.5, React 19.3, TypeScript, Convex 1.45, Tailwind CSS, Vitest, Testing Library, Playwright, and `convex-test`.

---

## File map and ownership

Create the following focused units:

- `src/lib/profile-customization.ts` — customization types, defaults, safe token resolution, contact derivation, featured-link fallback, and pure validation helpers.
- `src/components/profile/ProfileContactStrip.tsx` — automatic email/phone/website actions.
- `src/components/profile/ProfileSectionDisclosure.tsx` — accessible collapsed About/Services rendering.
- `src/components/forms/ProfileCustomizationEditor.tsx` — guided customization controls and section editing.
- `tests/unit/profile-customization.test.ts` — pure customization contract tests.
- `tests/unit/profile-customization-editor.test.tsx` — editor control and callback tests.
- `convex/integration/profile-customization.test.ts` — Convex draft/publication/privacy tests.

Modify the existing boundaries as follows:

- `src/lib/domain/index.ts` — add customization to profile content/projection and route publication comparison through the pure rules.
- `convex/schema.ts`, `convex/validators.ts`, `convex/profiles.ts`, `convex/profileProjection.ts` — persist and project the validated customization object.
- `convex/customers.ts`, `convex/demo.ts`, `convex/bootstrap.ts` — initialize Warm Studio for new profile creation paths while retaining explicit legacy-theme compatibility.
- `src/lib/demo/fixtures.ts`, `src/lib/demo/store.ts` — keep local demo profiles and persistence aligned with the live content shape.
- `src/components/forms/ProfileEditor.tsx` — embed the guided editor, preserve the existing save/publish lifecycle, and share the same draft behavior between demo and live modes.
- `src/components/profile/PublicProfile.tsx`, `src/components/profile/PublicProfileScreen.tsx`, `src/components/profile/CardResolverClient.tsx` — render the resolved customization without separate card styling.
- `src/components/workspace/WorkspacePreview.tsx`, `src/components/forms/LinksEditor.tsx`, `src/components/forms/LinksWorkspace.tsx` — pass the complete projected profile to previews instead of maintaining a separate theme-only path.
- `src/components/admin/CustomersManager.tsx` — remove the old initial-theme selector from new customer creation; new profiles receive Warm Studio by default.
- `tests/unit/public-profile-component.test.tsx`, `tests/unit/public-hydration.test.ts`, `tests/unit/links-workspace.test.tsx`, `tests/unit/demo-signup.test.ts` — extend existing coverage without weakening legacy assertions.
- `convex/integration/auth-ownership.test.ts`, `convex/integration/hosted-demo.test.ts` — assert new defaults and draft privacy.
- `e2e/customer.spec.ts`, `e2e/public-profile.spec.ts`, `e2e/accessibility.spec.ts` — cover the owner flow, direct/card rendering, and keyboard/disclosure behavior.
- `docs/CHANGELOG.md` — record the shipped customer-facing customization slice after verification.

Do not hand-edit `convex/_generated/*`; regenerate bindings after backend contract changes.

### Task 1: Establish the pure customization contract

**Files:**
- Create: `src/lib/profile-customization.ts`
- Modify: `src/lib/domain/index.ts`
- Create: `tests/unit/profile-customization.test.ts`
- Modify: `tests/unit/domain.test.ts`

- [ ] **Step 1: Write failing domain tests for the supported customization shape.**

Add tests that lock the exact v1 contract:

~~~ts
import {
  DEFAULT_WARM_STUDIO_CUSTOMIZATION,
  getAutomaticContactActions,
  getFeaturedProfileLink,
  validateProfileCustomization,
} from "../../src/lib/profile-customization";

const links = [
  { id: "booking", label: "Book a call", destination: "https://cal.example", enabled: true },
  { id: "hidden", label: "Hidden", destination: "https://hidden.example", enabled: false },
];

it("provides the Warm Studio default", () => {
  expect(DEFAULT_WARM_STUDIO_CUSTOMIZATION).toMatchObject({
    preset: "warm-studio",
    accent: "coral",
    typeScale: "comfortable",
    linkTreatment: "filled",
    contentOrder: "links-first",
  });
});

it("derives only populated contact fields", () => {
  expect(getAutomaticContactActions({ email: "mara@example.test", website: "https://mara.test" })).toEqual([
    { kind: "email", href: "mailto:mara@example.test", label: "Email" },
    { kind: "website", href: "https://mara.test", label: "Website" },
  ]);
});

it("does not feature a disabled or missing link", () => {
  expect(getFeaturedProfileLink(links, "hidden")).toBeUndefined();
  expect(getFeaturedProfileLink(links, "missing")).toBeUndefined();
});

it("validates About and Services limits", () => {
  expect(validateProfileCustomization({
    ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
    section: { kind: "about", body: "A short introduction." },
  }, links)).toEqual([]);

  expect(validateProfileCustomization({
    ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
    section: { kind: "services", body: "Choose a service.", items: ["One", "Two", "Three", "Four"] },
  }, links)).toContain("A Services section can contain at most three items.");
});
~~~

Add `projectPublicProfile` assertions in `tests/unit/domain.test.ts` proving that `published.customization` is included in the public projection while an unpublished draft customization is not exposed.

- [ ] **Step 2: Run the focused tests and verify they fail for the missing contract.**

Run:

~~~bash
npx vitest run tests/unit/profile-customization.test.ts tests/unit/domain.test.ts
~~~

Expected: FAIL because the customization module, fields, and projection assertions do not exist yet.

- [ ] **Step 3: Implement the pure types, defaults, and resolver helpers.**

Define the shared type contract in `src/lib/profile-customization.ts`:

~~~ts
export type ProfileAccent = "coral" | "jade" | "ink";
export type ProfileTypeScale = "compact" | "comfortable" | "editorial";
export type ProfileLinkTreatment = "filled" | "outlined";
export type ProfileContentOrder = "links-first" | "section-first";

export type ProfileSection =
  | { kind: "about"; body: string }
  | { kind: "services"; body: string; items?: string[] };

export interface ContactAction {
  kind: "email" | "phone" | "website";
  href: string;
  label: string;
}

export interface ProfileCustomization {
  preset: "warm-studio";
  accent: ProfileAccent;
  typeScale: ProfileTypeScale;
  linkTreatment: ProfileLinkTreatment;
  contentOrder: ProfileContentOrder;
  featuredLinkId?: string;
  section?: ProfileSection;
}

export interface ResolvedProfileAppearance {
  mode: "legacy" | "warm-studio";
  accent: ProfileAccent;
  typeScale: ProfileTypeScale;
  linkTreatment: ProfileLinkTreatment;
}
~~~

Export `DEFAULT_WARM_STUDIO_CUSTOMIZATION`, `resolveProfileAppearance`, `validateProfileCustomization`, `getAutomaticContactActions`, and `getFeaturedProfileLink`. `resolveProfileAppearance` must return the legacy mode when customization is absent and a Warm Studio token set when it is present. Contact actions must emit only nonblank email/phone/website fields with `mailto:`, `tel:`, or `https:` destinations. `getFeaturedProfileLink` must return only an enabled link with a matching id.

- [ ] **Step 4: Add the customization field to domain profile types and projection.**

Update `ProfileContent` and `PublicProfileProjection` in `src/lib/domain/index.ts` with `customization?: ProfileCustomization`. Make `projectPublicProfile` copy customization only from the published snapshot. Keep `theme` as the legacy fallback. Call `validateProfileCustomization` from the existing publication validation without turning a missing featured-link reference into a publication error.

- [ ] **Step 5: Run the focused tests and commit the contract.**

Run:

~~~bash
npx vitest run tests/unit/profile-customization.test.ts tests/unit/domain.test.ts
~~~

Expected: PASS, including the existing publication and draft-privacy assertions.

Commit:

~~~bash
git add src/lib/profile-customization.ts src/lib/domain/index.ts tests/unit/profile-customization.test.ts tests/unit/domain.test.ts
git commit -m "feat: add profile customization domain contract"
~~~

### Task 2: Persist and project customization through Convex

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/validators.ts`
- Modify: `convex/profiles.ts`
- Modify: `convex/profileProjection.ts`
- Create: `convex/integration/profile-customization.test.ts`
- Modify: `convex/integration/auth-ownership.test.ts`

- [ ] **Step 1: Write failing Convex tests for draft privacy, publication, and server validation.**

Create a `convex-test` fixture with an authenticated owner, a published profile, and a valid enabled link. Cover this sequence:

~~~ts
await owner.mutation(api.profiles.saveDraft, {
  profileId,
  draft: {
    ...draft,
    customization: {
      preset: "warm-studio",
      accent: "coral",
      typeScale: "editorial",
      linkTreatment: "outlined",
      contentOrder: "section-first",
      featuredLinkId: "booking",
      section: { kind: "about", body: "Private draft copy." },
    },
  },
});

expect(await t.query(api.profiles.publicBySlug, { slug: "owner" })).toMatchObject({
  theme: "paper",
});

await owner.mutation(api.profiles.publish, { profileId });

expect(await t.query(api.profiles.publicBySlug, { slug: "owner" })).toMatchObject({
  customization: { preset: "warm-studio", contentOrder: "section-first" },
});
~~~

Add rejection cases for an unknown accent, a Services section with four items, a body over its limit, and a customization object supplied by a non-owner. Extend the existing theme-privacy test in `auth-ownership.test.ts` to assert customization remains draft-private until publication.

- [ ] **Step 2: Run the focused Convex tests and verify they fail.**

Run:

~~~bash
npx vitest run convex/integration/profile-customization.test.ts convex/integration/auth-ownership.test.ts
~~~

Expected: FAIL because Convex validators and public projections do not yet accept or return customization.

- [ ] **Step 3: Add matching Convex value validators and schema fields.**

In `convex/validators.ts`, add validators matching the domain contract:

~~~ts
const profileSectionValidator = v.union(
  v.object({ kind: v.literal("about"), body: v.string() }),
  v.object({ kind: v.literal("services"), body: v.string(), items: v.optional(v.array(v.string())) }),
);

export const profileCustomizationValidator = v.object({
  preset: v.literal("warm-studio"),
  accent: v.union(v.literal("coral"), v.literal("jade"), v.literal("ink")),
  typeScale: v.union(v.literal("compact"), v.literal("comfortable"), v.literal("editorial")),
  linkTreatment: v.union(v.literal("filled"), v.literal("outlined")),
  contentOrder: v.union(v.literal("links-first"), v.literal("section-first")),
  featuredLinkId: v.optional(v.string()),
  section: v.optional(profileSectionValidator),
});
~~~

Add `customization: v.optional(profileCustomizationValidator)` to both the draft and published content validators in `convex/schema.ts` and `convex/validators.ts`. Extend `validateDraftSafety` to enforce the exact length and item-count limits from the spec.

- [ ] **Step 4: Thread customization through profile mutations and public projection.**

Update `convex/profiles.ts` so `saveDraft` accepts the new validator and `publish` returns the new optional field. Update `convex/profileProjection.ts` to copy `profile.published.customization` into public results while leaving all draft-only data private. Keep the current owner checks, slug rules, image checks, card-claim checks, and audit behavior unchanged.

- [ ] **Step 5: Regenerate Convex bindings and rerun focused tests.**

Run the repository's installed Convex workflow against the configured non-production deployment:

~~~bash
npx convex codegen --typecheck enable
npx vitest run convex/integration/profile-customization.test.ts convex/integration/auth-ownership.test.ts
npm run typecheck
~~~

Expected: generated bindings contain the updated profile validators, focused Convex tests pass, and TypeScript reports no schema or API errors. Do not edit generated files by hand.

- [ ] **Step 6: Commit the backend contract.**

~~~bash
git add convex/schema.ts convex/validators.ts convex/profiles.ts convex/profileProjection.ts convex/integration/profile-customization.test.ts convex/integration/auth-ownership.test.ts convex/_generated
git commit -m "feat: persist profile customization safely"
~~~

### Task 3: Initialize Warm Studio and preserve legacy profiles

**Files:**
- Modify: `convex/customers.ts`
- Modify: `convex/demo.ts`
- Modify: `convex/bootstrap.ts`
- Modify: `src/lib/demo/fixtures.ts`
- Modify: `src/lib/demo/store.ts`
- Modify: `src/components/admin/CustomersManager.tsx`
- Modify: `tests/unit/demo-signup.test.ts`
- Modify: `convex/integration/hosted-demo.test.ts`
- Modify: `convex/integration/auth-ownership.test.ts`

- [ ] **Step 1: Add failing default and compatibility assertions.**

Assert that self-service, invited, hosted-demo, and bootstrap-created profiles contain `customization.preset === "warm-studio"` when no legacy theme is explicitly requested. Assert that a preexisting profile containing only `theme: "paper"` remains legacy and that an explicit legacy theme input still round-trips for compatibility.

- [ ] **Step 2: Run the focused creation tests and verify they fail.**

Run:

~~~bash
npx vitest run tests/unit/demo-signup.test.ts convex/integration/hosted-demo.test.ts convex/integration/auth-ownership.test.ts
~~~

Expected: FAIL on the new Warm Studio assertions while existing account-creation behavior remains visible.

- [ ] **Step 3: Centralize the new-profile default.**

Use `DEFAULT_WARM_STUDIO_CUSTOMIZATION` in every new-profile path. In `convex/customers.ts`, keep the optional `theme` argument for older callers: when it is provided, create the legacy theme shape; when it is absent, add Warm Studio customization. Keep `emptyProfile` free of user-specific content beyond the new default.

Update the equivalent local demo creation path in `src/lib/demo/store.ts`. Keep the `themes` map and `getDemoTheme` only as a legacy fallback until all public callers use projected customization.

- [ ] **Step 4: Update seeded and hosted-demo fixtures.**

Add Warm Studio customization to the Mara draft/published seed in `convex/demo.ts`, the configured bootstrap profile in `convex/bootstrap.ts`, and the primary profile in `src/lib/demo/fixtures.ts`. Leave the existing `theme` value available as a legacy fallback so old persisted demo data can still hydrate.

- [ ] **Step 5: Remove the obsolete admin initial-theme control.**

In `src/components/admin/CustomersManager.tsx`, remove the two `theme` state variables, both Initial theme `<select>` controls, and the `theme` argument sent to `customers.createCustomer`. New admin-created profiles will receive the backend Warm Studio default. Do not remove the backend's optional legacy argument until existing compatibility tests no longer exercise it.

- [ ] **Step 6: Run creation and hosted-demo tests, then commit.**

Run:

~~~bash
npx vitest run tests/unit/demo-signup.test.ts convex/integration/hosted-demo.test.ts convex/integration/auth-ownership.test.ts
npm run typecheck
~~~

Expected: PASS with new profiles on Warm Studio, legacy profiles unchanged, and no admin creation type errors.

Commit:

~~~bash
git add convex/customers.ts convex/demo.ts convex/bootstrap.ts src/lib/demo/fixtures.ts src/lib/demo/store.ts src/components/admin/CustomersManager.tsx tests/unit/demo-signup.test.ts convex/integration/hosted-demo.test.ts convex/integration/auth-ownership.test.ts
git commit -m "feat: default new profiles to Warm Studio"
~~~

### Task 4: Build the shared public presentation pieces

**Files:**
- Create: `src/components/profile/ProfileContactStrip.tsx`
- Create: `src/components/profile/ProfileSectionDisclosure.tsx`
- Modify: `src/components/profile/PublicProfile.tsx`
- Modify: `src/components/profile/PublicProfileScreen.tsx`
- Modify: `src/components/profile/CardResolverClient.tsx`
- Modify: `src/components/workspace/WorkspacePreview.tsx`
- Modify: `src/components/forms/LinksEditor.tsx`
- Modify: `src/components/forms/LinksWorkspace.tsx`
- Modify: `tests/unit/public-profile-component.test.tsx`
- Modify: `tests/unit/public-hydration.test.ts`
- Modify: `tests/unit/links-workspace.test.tsx`

- [ ] **Step 1: Write failing component tests for public rendering.**

Extend `tests/unit/public-profile-component.test.tsx` with a projection containing Warm Studio customization, email, phone, website, a featured link, and a collapsed About section. Assert:

~~~ts
expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute("href", "mailto:mara@example.test");
expect(screen.getByRole("link", { name: "Phone" })).toHaveAttribute("href", "tel:+639175550184");
expect(screen.getByRole("link", { name: "Book a call" })).toHaveAttribute("data-featured", "true");
expect(screen.getByRole("button", { name: "About" })).toHaveAttribute("aria-expanded", "false");
~~~

Add tests for opening the disclosure, omitting an empty contact strip, and falling back to the legacy theme when customization is absent. Update hydration and links-workspace fixtures to include the optional projection field without changing their existing analytics assertions.

- [ ] **Step 2: Run the focused component tests and verify they fail.**

Run:

~~~bash
npx vitest run tests/unit/public-profile-component.test.tsx tests/unit/public-hydration.test.ts tests/unit/links-workspace.test.tsx
~~~

Expected: FAIL because the new contact/disclosure elements and customization-aware renderer do not exist.

- [ ] **Step 3: Implement `ProfileContactStrip`.**

Give the component a narrow contract:

~~~ts
type ProfileContactStripProps = {
  actions: readonly ContactAction[];
  preview?: boolean;
};
~~~

Render only actions supplied by `getAutomaticContactActions`, with visible labels, Phosphor icons, explicit accessible names, and `mailto:`, `tel:`, or HTTPS behavior. Use the Warm Studio token classes and omit the component when `actions.length === 0`.

- [ ] **Step 4: Implement `ProfileSectionDisclosure`.**

Use a button plus controlled region, or native `<details>/<summary>`, with `aria-expanded`, a stable region id, keyboard support, visible focus, and reduced-motion-safe styling. Render the fixed About or Services label, body text, and service labels. Do not accept arbitrary markup or arbitrary blocks.

- [ ] **Step 5: Make `PublicProfile` resolve customization and render the v1 order.**

Move theme selection into the shared resolver: customization takes precedence; otherwise use the projection's legacy `theme`. Render identity, automatic contact strip, featured link, links, optional disclosure, and Save contact in the order defined by `contentOrder`. Keep analytics callbacks on external links only; contact actions remain ordinary visitor actions and must not record link analytics unless they are existing profile links.

Remove the separate `theme` prop from `PublicProfile` and `WorkspacePreview` after updating all callers. `PublicProfileScreen` and `CardResolverClient` must pass only the public projection, proving direct and active-card paths use the same presentation.

- [ ] **Step 6: Update link-editor previews to pass complete content.**

In `LinksEditor.tsx` and `LinksWorkspace.tsx`, build preview projections from the full draft, including customization and legacy fallback, rather than selecting a theme through `getDemoTheme`. Preserve link ordering, redirect editing, draft save, and publish behavior.

- [ ] **Step 7: Run focused tests and commit the renderer.**

Run:

~~~bash
npx vitest run tests/unit/public-profile-component.test.tsx tests/unit/public-hydration.test.ts tests/unit/links-workspace.test.tsx
npm run typecheck
~~~

Expected: PASS with direct, preview, and card-rendering call sites using one projection-driven public renderer.

Commit:

~~~bash
git add src/components/profile/ProfileContactStrip.tsx src/components/profile/ProfileSectionDisclosure.tsx src/components/profile/PublicProfile.tsx src/components/profile/PublicProfileScreen.tsx src/components/profile/CardResolverClient.tsx src/components/workspace/WorkspacePreview.tsx src/components/forms/LinksEditor.tsx src/components/forms/LinksWorkspace.tsx tests/unit/public-profile-component.test.tsx tests/unit/public-hydration.test.ts tests/unit/links-workspace.test.tsx
git commit -m "feat: render customized public profiles"
~~~

### Task 5: Add the guided customization editor

**Files:**
- Create: `src/components/forms/ProfileCustomizationEditor.tsx`
- Modify: `src/components/forms/ProfileEditor.tsx`
- Create: `tests/unit/profile-customization-editor.test.tsx`

- [ ] **Step 1: Write failing editor tests for controlled updates.**

Render the new editor with a draft customization and links. Assert that each control calls the single `onChange` callback with a complete next object:

~~~ts
const onChange = vi.fn();
render(<ProfileCustomizationEditor customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION} links={links} onChange={onChange} />);

await user.click(screen.getByRole("radio", { name: "Editorial" }));
expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ typeScale: "editorial" }));

await user.selectOptions(screen.getByRole("combobox", { name: "Featured link" }), "booking");
expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ featuredLinkId: "booking" }));
~~~

Also test choosing About versus Services, the three-item limit, the section-first/links-first control, and the guided section buttons' `aria-expanded` state.

- [ ] **Step 2: Run the focused editor tests and verify they fail.**

Run:

~~~bash
npx vitest run tests/unit/profile-customization-editor.test.tsx
~~~

Expected: FAIL because the editor component and controls do not exist.

- [ ] **Step 3: Implement `ProfileCustomizationEditor` with a complete controlled API.**

Use this boundary so demo and live profile editors share the same controls:

~~~ts
export type ProfileCustomizationEditorProps = {
  customization?: ProfileCustomization;
  links: readonly ProfileLink[];
  onChange: (next: ProfileCustomization | undefined) => void;
  errors?: readonly string[];
};
~~~

Render guided, freely navigable sections for Contact and links, About/Services, Style, and Review. Use labels for every swatch, scale, treatment, content-order choice, featured-link select, section kind, body field, and service item. Initialize a missing customization with `DEFAULT_WARM_STUDIO_CUSTOMIZATION` only for newly created profiles or after the owner explicitly selects “Use Warm Studio”; do not silently rewrite legacy profiles on load.

- [ ] **Step 4: Integrate the shared editor into both demo and live profile flows.**

In `ProfileEditor.tsx`:

- Replace the existing three-theme panel for new profiles with `ProfileCustomizationEditor`.
- Keep a legacy appearance message and an explicit opt-in action for profiles that have no customization.
- Store customization changes inside the existing `draft` state so `isDirty`, Save draft, publish retry logic, and navigation-save registration continue to work.
- Keep existing profile identity, image upload/remove, slug locking, publication validation, and fixed action bar behavior.
- Use the complete draft projection for the preview so contact strip, featured CTA, and disclosure update before save.
- Extract repeated live/demo presentational fields only where necessary; keep persistence and authentication branches intact.

Update the preview call to the projection-only `WorkspacePreview` API from Task 4. Do not add background-image or slideshow controls.

- [ ] **Step 5: Run editor, existing form, and type tests.**

Run:

~~~bash
npx vitest run tests/unit/profile-customization-editor.test.tsx tests/unit/links-workspace.test.tsx tests/unit/demo-signup.test.ts
npm run typecheck
~~~

Expected: PASS with the editor controls updating draft state and existing links/signup tests retaining their behavior.

- [ ] **Step 6: Commit the guided editor.**

~~~bash
git add src/components/forms/ProfileCustomizationEditor.tsx src/components/forms/ProfileEditor.tsx tests/unit/profile-customization-editor.test.tsx
git commit -m "feat: add guided profile customization editor"
~~~

### Task 6: Exercise the complete owner and visitor flow in E2E tests

**Files:**
- Modify: `e2e/customer.spec.ts`
- Modify: `e2e/public-profile.spec.ts`
- Modify: `e2e/accessibility.spec.ts`

- [ ] **Step 1: Add the private-draft/publication E2E scenario.**

Extend the existing demo customer flow with a test that:

~~~ts
await page.goto("/app/profile");
await page.getByRole("button", { name: "Style" }).click();
await page.getByRole("radio", { name: "Warm Studio" }).check();
await page.getByRole("radio", { name: "Editorial" }).check();
await page.getByRole("combobox", { name: "Featured link" }).selectOption("booking");
await page.getByRole("button", { name: "About or Services" }).click();
await page.getByRole("radio", { name: "About" }).check();
await page.getByLabel("About copy").fill("A private draft introduction.");
await page.getByRole("button", { name: "Save draft" }).click();

await page.goto("/mara-velasquez");
await expect(page.getByText("A private draft introduction.")).toHaveCount(0);

await page.goto("/app/profile");
await page.getByRole("button", { name: "Publish changes" }).click();
await page.goto("/mara-velasquez");
await expect(page.getByRole("button", { name: "About" })).toBeVisible();
await expect(page.getByRole("link", { name: "Email" })).toBeVisible();
~~~

Use the exact accessible names implemented by the editor. The test must verify the public profile remains unchanged after Save draft and changes only after Publish.

- [ ] **Step 2: Verify direct and active-card parity.**

In `e2e/public-profile.spec.ts`, after publishing a customized demo profile, visit both `/<slug>` and `/c/mara-card-7f2q`. Assert both expose the same contact action, featured link, Warm Studio presentation marker, and collapsed section. Keep existing vCard, analytics, and no-draft-leak assertions.

- [ ] **Step 3: Add accessibility assertions.**

In `e2e/accessibility.spec.ts`, assert the disclosure is keyboard reachable, has the expected expanded state, exposes its content after activation, and retains visible focus. Keep the existing axe scan at the 390px profile viewport and add checks at 768px and 1440px for horizontal overflow.

- [ ] **Step 4: Run demo E2E tests and fix failures before continuing.**

Run:

~~~bash
npm run test:e2e:demo -- --workers=1 e2e/customer.spec.ts e2e/public-profile.spec.ts e2e/accessibility.spec.ts
~~~

Expected: PASS with no public draft leakage, no active-card divergence, and no accessibility violations. Do not weaken assertions to accommodate implementation details.

- [ ] **Step 5: Commit the end-to-end coverage.**

~~~bash
git add e2e/customer.spec.ts e2e/public-profile.spec.ts e2e/accessibility.spec.ts
git commit -m "test: cover profile customization flow"
~~~

### Task 7: Final compatibility, visual QA, and handoff

**Files:**
- Modify: `docs/CHANGELOG.md`
- Review: all files changed by Tasks 1–6

- [ ] **Step 1: Add a concise changelog entry.**

Record that public profiles now support the Warm Studio preset, controlled styling, automatic contact actions, and one collapsed About/Services section. State that physical card and QR artwork remain separate.

- [ ] **Step 2: Run the complete repository verification suite.**

Run:

~~~bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e:demo -- --workers=1
npx convex codegen --typecheck enable
git diff --check
~~~

Expected: every command exits `0`; generated Convex bindings are current; no formatting, lint, type, unit, build, E2E, or whitespace failures remain.

- [ ] **Step 3: Perform manual responsive and interaction review.**

Inspect `/app/profile`, `/<slug>`, and `/c/<active-token>` at approximately 390px, 768px, and 1440px. Verify:

- split editor becomes a readable stacked layout;
- guided sections can be opened in any order;
- preview changes follow draft controls;
- contact strip omits empty fields and uses labeled actions;
- featured link fallback works after disabling its link;
- About/Services disclosure works with mouse, keyboard, and reduced motion;
- Save draft does not change the public profile;
- Publish updates direct and card paths together;
- legacy profiles remain unchanged until opting into Warm Studio;
- no background-image, slideshow, physical-card, or QR controls appear.

- [ ] **Step 4: Review the final diff for scope and privacy.**

Confirm that no unrelated pricing changes are staged, no generated Convex file was hand-edited, no draft-only customization reaches public projections, no customer authorization check changed, and no physical card/QR route behavior changed.

- [ ] **Step 5: Commit the verified handoff.**

~~~bash
git add docs/CHANGELOG.md
git commit -m "docs: record profile customization release"
git status --short --branch
~~~

Expected: the feature branch is clean except for any pre-existing user-owned untracked files, which must remain untouched and unstaged.
