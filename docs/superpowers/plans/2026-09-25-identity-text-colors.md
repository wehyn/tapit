# Identity-Only Profile Text Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add independent, readable name and bio/role colors to Warm Studio profiles with compact curated swatches, an accessible custom picker, draft-safe persistence, and published direct/card parity.

**Architecture:** Extend the existing ProfileCustomization contract with an optional nested identityColors object. Resolve each choice to a finite CSS color in the shared profile-customization module, validate custom hex values against the two normal Warm Studio surfaces, and render only the name and bio with inline colors. Reuse the existing draft/save/publish and public projection paths; no new table or migration is needed.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Convex validators and mutations, Vitest, Testing Library, Playwright, and convex-test.

---

## Scope and invariants

- name and bio are independent identity-color fields. The editor labels the second row “Bio / role” because the current bio field is the secondary identity line.
- Curated choices are Default, Coral, Jade, and Ink. Their names are hidden until hover or keyboard focus and remain available through accessible labels.
- The custom trigger is a multicolor circle with a centered plus. Its picker contains a saturation/value field, a hue rail, a current-color pill, and a plain six-digit hex input with no format dropdown.
- Omitted color fields preserve current Warm Studio rendering: name #2c2420, bio #74665d.
- Custom colors must be six-digit RGB hex and meet a 4.5:1 contrast ratio against both #fbf6ef and #fffdf9.
- Colors apply only to the name heading and bio paragraph on normal Warm Studio surfaces. Links, buttons, contact actions, sections, avatar styling, and the existing accent remain unchanged.
- Warm Studio profiles with a background image continue to use white identity text and existing shadows. Saved identity choices remain stored for later normal-surface rendering.
- Legacy profiles do not opt into identity colors.
- Draft colors remain private until publication. Direct slug and active-card projections consume the same published snapshot.
- Do not hand-edit convex/_generated/*.
- Preserve the user-owned untracked paths docs/pricing-check-2026-09-25.md, docs/pricing-strategy-philippines.md, sample_data/, and work/.

## File map and ownership

Create these focused units:

- src/components/forms/IdentityColorPicker.tsx — swatch rows, custom trigger, popover, keyboard behavior, and field-level validation presentation.
- tests/unit/identity-color-picker.test.tsx — picker interaction, accessibility, independent field updates, valid/invalid hex behavior, and focus return.

Modify these existing boundaries:

- src/lib/profile-customization.ts — identity-color types, palette constants, hex/contrast validation, normalization, and resolved appearance values.
- convex/validators.ts — nested Convex validators for the persisted identity-color shape.
- src/components/forms/ProfileCustomizationEditor.tsx — place the compact Identity colors controls inside the existing Warm Studio Style section and deep-copy nested identity data.
- src/components/profile/PublicProfile.tsx — apply resolved colors only to the name and bio, with the background-image white override.
- tests/unit/profile-customization.test.ts — shared color contract, defaults, normalization, and validation.
- tests/unit/profile-customization-editor.test.tsx — Style-section integration and independent row updates.
- tests/unit/public-profile-component.test.tsx — normal-surface rendering, unchanged non-identity colors, and background-image override.
- tests/unit/profile-editor.test.tsx — draft preview and save payload coverage.
- tests/unit/domain.test.ts — unpublished-change and published-snapshot coverage for nested identity colors.
- convex/integration/profile-customization.test.ts — Convex draft privacy, publication, invalid-value rejection, and projection parity.
- e2e/customer.spec.ts — owner-facing color selection and publication flow if the existing fixture exposes the profile editor.
- e2e/accessibility.spec.ts — keyboard and accessible-name coverage for the swatches and picker if the existing accessibility fixture exposes the profile editor.

No changes are expected in convex/schema.ts, convex/profiles.ts, src/lib/domain/index.ts, src/lib/demo/fixtures.ts, or src/lib/demo/projection.ts beyond any generated type adjustments required by the existing nested customization value. The existing validators, shared publication rules, and generic content comparison already cover the customization boundary; verify that assumption with tests before adding code.

## Task 0: Preflight and baseline

Files:

- Read: AGENTS.md
- Read: convex/_generated/ai/guidelines.md
- Read: node_modules/next/dist/docs/01-app/index.md
- Read: docs/superpowers/specs/2026-09-25-identity-text-colors-design.md

- [ ] Step 1: Confirm the branch, merge, and preserved user files.

Run:

    git status --short --branch
    git log --oneline --decorate --graph -4
    git show --summary --oneline HEAD

Expected: branch feature/profile-customization, HEAD is merge commit 818d913 with origin/main as a parent, and only the four known user-owned untracked paths remain.

- [ ] Step 2: Read the framework and Convex instructions before changing code.

Read the complete files listed above. Record the relevant Next.js and Convex conventions in the implementation notes used by the worker. Do not run a deployment-affecting command.

- [ ] Step 3: Establish a focused baseline.

Run:

    npm run typecheck
    npx vitest run tests/unit/profile-customization.test.ts tests/unit/profile-customization-editor.test.tsx tests/unit/public-profile-component.test.tsx tests/unit/profile-editor.test.tsx convex/integration/profile-customization.test.ts

Expected: typecheck succeeds and all existing profile-customization tests pass before the new identity-color assertions are added.

- [ ] Step 4: Confirm the baseline is safe to extend.

Run:

    git status --short
    git diff --check

Do not add the preserved user-owned paths to implementation commits.

## Task 1: Add the shared identity-color contract

Files:

- Modify: src/lib/profile-customization.ts
- Test: tests/unit/profile-customization.test.ts
- Test: tests/unit/domain.test.ts

- [ ] Step 1: Add failing contract assertions.

Append tests that establish the exact public API:

    it("resolves omitted identity colors to the current Warm Studio defaults", () => {
      expect(resolveProfileAppearance(DEFAULT_WARM_STUDIO_CUSTOMIZATION)).toMatchObject({
        nameColor: "#2c2420",
        bioColor: "#74665d",
      });
    });

    it("resolves the two identity fields independently", () => {
      const appearance = resolveProfileAppearance({
        ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        identityColors: {
          name: { kind: "preset", value: "jade" },
          bio: { kind: "preset", value: "ink" },
        },
      });

      expect(appearance.nameColor).toBe("#3e806d");
      expect(appearance.bioColor).toBe("#2c2420");
    });

    it("accepts a readable custom hex color and canonicalizes its case", () => {
      expect(
        validateProfileCustomization({
          ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
          identityColors: { name: { kind: "custom", hex: "#3E806D" } },
        }),
      ).toEqual([]);
      expect(
        normalizeProfileCustomization({
          ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
          identityColors: { name: { kind: "custom", hex: "#3E806D" } },
        }),
      ).toMatchObject({ identityColors: { name: { kind: "custom", hex: "#3e806d" } } });
    });

    it.each(["#fff", "#ffffff", "white", "rgb(0,0,0)", "#12345678"])(
      "rejects unsafe or unreadable custom hex %s",
      (hex) => {
        expect(
          validateProfileCustomization({
            ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
            identityColors: { name: { kind: "custom", hex } },
          } as never),
        ).toEqual(expect.arrayContaining([expect.stringContaining("name color")]));
      },
    );

    it("counts identity-color changes as unpublished changes", () => {
      const published = { ...profileContent, publishedAt: "2026-09-25T00:00:00.000Z" };
      expect(
        hasUnpublishedChanges(
          {
            ...profileContent,
            customization: {
              ...customization,
              identityColors: { name: { kind: "preset", value: "jade" } },
            },
          },
          published,
        ),
      ).toBe(true);
    });

Use the existing test fixtures and imports in the files; do not duplicate the whole profile domain fixture merely to exercise one nested field.

- [ ] Step 2: Run the focused contract tests and verify the new assertions fail.

Run:

    npx vitest run tests/unit/profile-customization.test.ts tests/unit/domain.test.ts

Expected: the new tests fail because identityColors, nameColor, and bioColor are not yet defined.

- [ ] Step 3: Implement the finite palette and value types.

Add these definitions to src/lib/profile-customization.ts without changing the existing default object:

    export type ProfileIdentityColorPreset = "default" | "coral" | "jade" | "ink";
    export type ProfileIdentityColor =
      | { kind: "preset"; value: ProfileIdentityColorPreset }
      | { kind: "custom"; hex: string };

    export interface ProfileIdentityColors {
      name?: ProfileIdentityColor;
      bio?: ProfileIdentityColor;
    }

    const WARM_STUDIO_IDENTITY_PALETTE = {
      default: { name: "#2c2420", bio: "#74665d" },
      coral: { name: "#a84431", bio: "#a84431" },
      jade: { name: "#3e806d", bio: "#3e806d" },
      ink: { name: "#2c2420", bio: "#2c2420" },
    } as const;

    const WARM_STUDIO_TEXT_SURFACES = ["#fbf6ef", "#fffdf9"] as const;
    const CUSTOM_HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
    const MIN_IDENTITY_TEXT_CONTRAST = 4.5;

Add identityColors?: ProfileIdentityColors to ProfileCustomization and nameColor / bioColor to ResolvedProfileAppearance. Keep the legacy branch of resolveProfileAppearance returning the existing appearance values plus the current Warm Studio defaults; the renderer will only use the new values when mode is warm-studio.

- [ ] Step 4: Implement strict validation and contrast calculation.

Add pure helpers that accept only the two explicit color variants. The custom branch must:

1. match CUSTOM_HEX_PATTERN;
2. convert each RGB channel to linear-light values using the WCAG relative-luminance formula;
3. calculate (max(luminance) + 0.05) / (min(luminance) + 0.05) for each surface; and
4. return a field-specific error when any ratio is below MIN_IDENTITY_TEXT_CONTRAST.

Use these exact validation messages so editor error matching and integration tests remain stable:

    "The profile name color is invalid."
    "The profile bio color is invalid."
    "The profile name custom color does not meet contrast requirements."
    "The profile bio custom color does not meet contrast requirements."

Reject malformed kind, unsupported preset values, non-string hex values, shorthand hex, alpha hex, named colors, CSS functions, whitespace, and extra shape fields. The server validator will enforce the object shape; the shared rule must enforce the value semantics.

- [ ] Step 5: Normalize and resolve without breaking older profiles.

Implement these behaviors in normalizeProfileCustomization and resolveProfileAppearance:

- Omitted identityColors, omitted name, and omitted bio resolve to the field-aware default palette.
- Valid non-default presets are copied into a new nested object.
- Valid custom hex is copied in canonical lower-case form.
- An explicit default choice is normalized away so choosing Default returns to the old serialized shape.
- Malformed optional identity data is omitted from runtime normalization while the valid Warm Studio base remains renderable; validateProfileCustomization still reports it as a publication error.
- The returned nested objects and section arrays are copied so the editor cannot mutate the source profile through a shared reference.

Run:

    npx vitest run tests/unit/profile-customization.test.ts tests/unit/domain.test.ts

Expected: all new contract assertions pass, including the default compatibility and unpublished-change cases.

- [ ] Step 6: Commit the shared contract.

    git add src/lib/profile-customization.ts tests/unit/profile-customization.test.ts tests/unit/domain.test.ts
    git commit -m "feat: define identity color contract"

## Task 2: Extend the Convex boundary and publication tests

Files:

- Modify: convex/validators.ts
- Test: convex/integration/profile-customization.test.ts
- Verify: convex/profiles.ts
- Verify: src/lib/domain/index.ts

- [ ] Step 1: Add failing Convex integration coverage.

Add a customization fixture with both fields:

    const identityColors = {
      name: { kind: "preset", value: "jade" },
      bio: { kind: "custom", hex: "#2c2420" },
    } as const;

Cover these exact cases:

- saveDraft accepts valid identityColors and the owner query returns them.
- A public query and active-card query do not expose draft-only identity colors before publish.
- publish copies the nested choices into the published snapshot.
- The public profile and active-card profile expose the same published choices.
- Save or publish rejects #ffffff with the contrast error and rejects #fff, rgb(0,0,0), and an unsupported preset with a validation error.
- A non-owner cannot save a color change to another profile.

Run the new test cases before changing validators. Expected: the new tests fail at the validator boundary or because the published fixture lacks the nested fields.

- [ ] Step 2: Add the exact nested Convex validators.

Place these validators beside the existing profile customization validator:

    const profileIdentityColorPresetValidator = v.union(
      v.literal("default"),
      v.literal("coral"),
      v.literal("jade"),
      v.literal("ink"),
    );

    const profileIdentityColorValidator = v.union(
      v.object({ kind: v.literal("preset"), value: profileIdentityColorPresetValidator }),
      v.object({ kind: v.literal("custom"), hex: v.string() }),
    );

    const profileIdentityColorsValidator = v.object({
      name: v.optional(profileIdentityColorValidator),
      bio: v.optional(profileIdentityColorValidator),
    });

Add identityColors: v.optional(profileIdentityColorsValidator) to profileCustomizationValidator. Keep semantic checks in validateProfileCustomization, because Convex value validators do not encode the contrast formula. Do not add a table or migration.

- [ ] Step 3: Verify existing save/publish paths call the shared rules.

Trace convex/profiles.ts from saveDraft and publish through validateProfileContent, and trace src/lib/domain/index.ts through publishProfile, hasUnpublishedChanges, and projectPublicProfile. Only add code if a test proves the nested customization is dropped. The required behavior is:

    draft customization -> saveDraft -> private owner projection
    draft customization -> publish -> published customization
    published customization -> direct profile projection
    published customization -> active card projection

If no path drops the value, leave these files unchanged and record that the existing generic customization copy/projection is sufficient.

- [ ] Step 4: Regenerate bindings only if the typecheck requires it.

Run:

    npx convex codegen
    npm run typecheck
    npx vitest run convex/integration/profile-customization.test.ts

Expected: no hand-edited generated files, the integration suite passes, and the nested color choices survive save and publish with draft privacy intact.

- [ ] Step 5: Commit the Convex boundary.

    git add convex/validators.ts convex/integration/profile-customization.test.ts convex/_generated
    git commit -m "feat: validate identity colors at profile boundary"

If codegen changes no generated files, omit convex/_generated from git add and record that result in the handoff.

## Task 3: Build the compact picker and integrate the editor

Files:

- Create: src/components/forms/IdentityColorPicker.tsx
- Modify: src/components/forms/ProfileCustomizationEditor.tsx
- Test: tests/unit/identity-color-picker.test.tsx
- Test: tests/unit/profile-customization-editor.test.tsx

- [ ] Step 1: Add failing component tests for the closed controls.

Create a controlled test harness that owns ProfileIdentityColors and passes an onChange spy. Assert:

    expect(screen.getByRole("button", { name: "Default name color" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose custom name color" })).toHaveAttribute(
      "aria-haspopup",
      "dialog",
    );
    expect(screen.queryByText("Coral")).not.toBeInTheDocument();

Clicking Jade in the Name row must emit only { name: { kind: "preset", value: "jade" } }; clicking Coral in the Bio / role row afterward must preserve the name choice and emit { bio: { kind: "preset", value: "coral" } } as the second independent field.

- [ ] Step 2: Add failing tests for the custom picker interaction.

The tests must cover the exact accessible structure:

    await user.click(screen.getByRole("button", { name: "Choose custom name color" }));
    expect(screen.getByRole("dialog", { name: "Custom name color" })).toBeVisible();
    expect(screen.getByLabelText("Current name color")).toBeVisible();
    expect(screen.getByLabelText("Custom name color hex value")).toHaveValue("#2c2420");

Verify that the current-color pill precedes the hex input in document order, that no format combobox exists, and that entering readable #3E806D emits { kind: "custom", hex: "#3e806d" }. Entering #ffffff keeps the error visible, emits no new value, and exposes the contrast message through an alert relationship. Pressing Escape closes the dialog and returns focus to the custom trigger.

- [ ] Step 3: Implement the picker boundary and fixed palette styling.

Export this prop contract from IdentityColorPicker.tsx:

    export type IdentityColorField = "name" | "bio";

    export interface IdentityColorPickerProps {
      field: IdentityColorField;
      value?: ProfileIdentityColor;
      onChange: (value?: ProfileIdentityColor) => void;
      error?: string;
      disabled?: boolean;
    }

Implement the component in four small parts:

1. IdentityColorSwatch renders a real button with a fixed palette background, a field-specific accessible name, a selected ring, and a hover/focus tooltip. Do not render the color name as ordinary visible text.
2. CustomColorTrigger renders a fixed multicolor circle with a centered plus, aria-haspopup="dialog", and aria-expanded.
3. IdentityColorPopover renders the saturation/value area, hue rail, current-color pill, six-digit hex input, and field-specific role="alert" error. Use keyboard-operable range semantics for the visual picker controls; do not make pointer dragging the only input method.
4. Focus management opens the dialog on the first picker control, closes on Escape or outside click, and returns focus to the trigger. Keep the popover inside the row so it does not change page layout when closed.

Use the fixed palette values from src/lib/profile-customization.ts for swatch and picker backgrounds. The only dynamic visual value may be the already validated current hex color. Store local picker state until a valid color is committed.

- [ ] Step 4: Integrate both rows in the existing Style section.

In ProfileCustomizationEditor.tsx:

- Add identityColors to copyCustomization with separate copies for name and bio.
- Add a fieldset titled Identity colors after the existing accent/type-scale/link-treatment/content-order controls.
- Render the Name and Bio / role picker rows with value={customization.identityColors?.name} and value={customization.identityColors?.bio}.
- When a user selects Default, remove only that field and remove the empty identityColors object.
- Keep the existing Style section disclosure, error summary, and keyboard behavior.
- Match existing tapit-* borders, focus rings, surfaces, and reduced-motion classes; do not introduce a second visual language.

- [ ] Step 5: Run the picker and editor tests.

    npx vitest run tests/unit/identity-color-picker.test.tsx tests/unit/profile-customization-editor.test.tsx

Expected: all swatch, picker, validation, focus, and independent-field tests pass, including the pre-existing Style and collapsed-section tests.

- [ ] Step 6: Commit the editor controls.

    git add src/components/forms/IdentityColorPicker.tsx src/components/forms/ProfileCustomizationEditor.tsx tests/unit/identity-color-picker.test.tsx tests/unit/profile-customization-editor.test.tsx
    git commit -m "feat: add identity color picker controls"

## Task 4: Apply identity colors to the Warm Studio renderer

Files:

- Modify: src/components/profile/PublicProfile.tsx
- Test: tests/unit/public-profile-component.test.tsx

- [ ] Step 1: Add failing renderer assertions.

Add a public-profile fixture with:

    customization: {
      ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
      identityColors: {
        name: { kind: "custom", hex: "#3e806d" },
        bio: { kind: "preset", value: "ink" },
      },
    },

Assert:

    expect(screen.getByRole("heading", { name: projection.name })).toHaveStyle({ color: "#3e806d" });
    expect(screen.getByText(projection.bio!)).toHaveStyle({ color: "#2c2420" });
    expect(screen.getByRole("link", { name: "Portfolio" })).toHaveClass("bg-[#b24f38]");
    expect(screen.getByRole("navigation", { name: "Contact actions" })).toHaveClass("text-[#74665d]");

Add a background-image fixture with the same custom choices and assert that the heading remains white, the bio remains the existing white/85 treatment, and the link/contact classes remain unchanged. Add a legacy-theme fixture and assert that no identity-color inline style is applied.

- [ ] Step 2: Apply resolved colors without changing other surfaces.

In PublicProfile.tsx, keep the existing normalizeProfileCustomization and resolveProfileAppearance calls. Add appearance.nameColor only to the Warm Studio name heading when hasIntegratedBackground is false. Add appearance.bioColor only to the Warm Studio bio paragraph under the same condition. Preserve the existing background-image classes and text shadows when hasIntegratedBackground is true.

The intended render logic is:

    const identityStyle =
      warmStudio && !hasIntegratedBackground ? { color: appearance.nameColor } : undefined;
    const bioStyle =
      warmStudio && !hasIntegratedBackground ? { color: appearance.bioColor } : undefined;

    <h1 style={identityStyle}>{profile.name}</h1>
    <p className={existingBioClasses} style={bioStyle}>{profile.bio}</p>

Use the same identityStyle for the preview heading branch. Keep the existing text-white and text-white/85 branches intact for integrated background media.

- [ ] Step 3: Run renderer and regression tests.

    npx vitest run tests/unit/public-profile-component.test.tsx tests/unit/profile-editor.test.tsx

Expected: the new style assertions pass; existing Warm Studio, legacy, media, link treatment, contact strip, and preview tests remain green.

- [ ] Step 4: Commit the renderer.

    git add src/components/profile/PublicProfile.tsx tests/unit/public-profile-component.test.tsx tests/unit/profile-editor.test.tsx
    git commit -m "feat: render identity-only profile colors"

## Task 5: Verify draft, publish, direct, and card parity

Files:

- Test: tests/unit/profile-editor.test.tsx
- Test: tests/unit/domain.test.ts
- Test: convex/integration/profile-customization.test.ts
- Test: e2e/customer.spec.ts

- [ ] Step 1: Cover the editor draft payload.

In the existing live ProfileEditor test harness, select Jade for Name and Ink for Bio / role, then click Save draft. Assert the mutation receives:

    expect(mocks.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          customization: expect.objectContaining({
            identityColors: {
              name: { kind: "preset", value: "jade" },
              bio: { kind: "preset", value: "ink" },
            },
          }),
        }),
      }),
    );

Also assert the live draft preview uses the selected colors before save, while the prior published projection remains unchanged until publish completes.

- [ ] Step 2: Cover publication and projection parity.

Extend the Convex integration test to publish the draft, then query both the public profile path and active-card path. Assert both return the exact same nested identityColors choices and that both render the same resolved name and bio colors through the shared PublicProfile component.

- [ ] Step 3: Cover old data and change detection.

Use a profile customization object without identityColors and assert it:

- passes the existing validator;
- normalizes to the current default appearance;
- does not acquire persisted identity fields during an unrelated save; and
- still renders with the pre-feature name and bio colors.

Use a published snapshot with no identity colors and a draft with one non-default identity color; assert hasUnpublishedChanges returns true.

- [ ] Step 4: Add the narrow owner-facing browser flow when the existing fixture supports it.

In e2e/customer.spec.ts, use the existing authenticated profile-editor fixture to:

1. open Style and focus the Name color controls;
2. choose Jade and a custom readable hex in the Bio / role picker;
3. verify the preview heading and bio use independent colors;
4. save the draft and verify the public visitor view still shows the prior published colors;
5. publish and verify the public profile reflects both choices.

Do not add a new authentication fixture for this feature; reuse the established customer fixture and selectors.

- [ ] Step 5: Run the parity tests.

    npx vitest run tests/unit/profile-editor.test.tsx tests/unit/domain.test.ts convex/integration/profile-customization.test.ts
    npx playwright test e2e/customer.spec.ts --grep "identity color|profile color|Warm Studio"

Expected: draft privacy, publication, direct/card parity, and old-data compatibility are proven. If the existing browser suite has no matching fixture, retain the unit/integration coverage and record the exact unavailable fixture rather than creating unrelated test infrastructure.

## Task 6: Accessibility, visual QA, and final verification

Files:

- Test: e2e/accessibility.spec.ts
- Modify: docs/superpowers/specs/2026-09-25-identity-text-colors-design.md only if an implementation constraint discovered during testing changes an approved requirement.

- [ ] Step 1: Verify keyboard and accessible-name behavior.

Run:

    npx playwright test e2e/accessibility.spec.ts --grep "color|Style|profile"

Verify that swatches have accessible names despite no visible labels, the custom trigger exposes expanded state, the popover has a dialog name, the hex field and both visual picker controls are keyboard reachable, invalid values announce an error, and Escape restores focus to the trigger.

- [ ] Step 2: Inspect the approved visual direction in the running editor.

Start the existing local app using the repository’s normal development command. Inspect both desktop and narrow layouts against .superpowers/brainstorm/42328-1790331599/content/identity-colors-v3.html:

- rows remain compact and show circles rather than permanent color names;
- the custom control is a multicolor circle with a centered plus;
- the picker has the saturation/value field and hue rail;
- the current-color pill is immediately left of the hex input;
- no format dropdown appears;
- the popover stays inside the editor row and does not clip at the narrow breakpoint;
- the normal preview applies only the two identity colors; and
- an image-background preview returns both identity fields to white.

- [ ] Step 3: Run the complete verification set.

    npm run typecheck
    npm run lint
    npx vitest run
    npx next build --webpack
    git diff --check
    git status --short --branch

Expected: typecheck, lint, all Vitest tests, and the Webpack production build pass; git diff --check reports no whitespace errors; only the intentionally preserved user-owned untracked paths remain.

- [ ] Step 4: Review the final diff and do not push.

    git diff HEAD~4..HEAD --stat
    git log --oneline --decorate -6

Confirm that changes are limited to the shared identity-color contract, Convex validation, editor picker, renderer, tests, and approved docs. Do not push the branch.

## Self-review checklist

- [ ] Every requirement in docs/superpowers/specs/2026-09-25-identity-text-colors-design.md maps to a task: independent fields, curated swatches, hidden names with hover/focus labels, custom picker, current-color pill, plain hex, contrast, background-image override, unchanged non-identity colors, draft privacy, publication parity, and future extension boundary.
- [ ] Every file named in a task has a concrete responsibility and no two workers are assigned the same implementation file.
- [ ] The type names are consistent: ProfileIdentityColorPreset, ProfileIdentityColor, ProfileIdentityColors, identityColors, nameColor, and bioColor.
- [ ] Test commands use the repository’s existing Vitest, Playwright, Convex, lint, typecheck, and Webpack build commands.
- [ ] No schema migration, arbitrary CSS, public draft exposure, or physical-card behavior was added to the scope.

## Execution handoff

Plan complete and saved to docs/superpowers/plans/2026-09-25-identity-text-colors.md. Two execution options:

1. Subagent-Driven (recommended) — dispatch a fresh subagent per task and review between tasks.
2. Inline Execution — execute the tasks in this session with checkpoints.

The current request is planning only; do not begin either execution path until the user explicitly chooses one.
