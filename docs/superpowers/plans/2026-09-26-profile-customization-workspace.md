# Profile Customization Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Move visual profile controls from the mixed /app/profile editor into a dedicated /app/customize workspace with focused Overview, Identity, Media, and Layout tabs while preserving shared draft, preview, save, and publish behavior.

**Architecture:** Keep one demo/live profile controller and add a view prop so /app/profile and /app/customize render different control compositions over the same draft state. Extract profile-content controls, visual customization controls, and the shared preview/action frame into focused components. Use a small pure error-classification module so both routes can show category-specific validation guidance without changing domain validation or persistence.

**Tech Stack:** Next App Router, React, TypeScript, Convex, Tailwind CSS, Phosphor Icons, Vitest, and Testing Library.

---

## File map

### Create

- src/app/app/customize/page.tsx — authenticated route entry point.
- src/app/app/customize/loading.tsx — route loading state.
- src/app/app/customize/error.tsx — route error boundary.
- src/components/forms/ProfileDetailsEditor.tsx — identity, contact, Featured link, and About/Services controls kept on Profile.
- src/components/forms/ProfilePublicationPanel.tsx — status, publication errors, and Profile-to-Customize action.
- src/components/forms/ProfileWorkspaceFrame.tsx — shared heading, control/preview layout, and save/publish bar.
- src/lib/profile-workspace.ts — pure customization category and validation-error classification helpers.
- tests/unit/profile-details-editor.test.tsx — content-control tests.
- tests/unit/profile-workspace.test.ts — error-classification tests.

### Modify

- src/components/layout/CustomerShell.tsx — add customer-only Customize navigation.
- src/components/forms/ProfileCustomizationEditor.tsx — replace the mixed accordion with four visual categories.
- src/components/forms/ProfileEditor.tsx — accept a profile/customize view and reuse the extracted components.
- tests/unit/profile-customization-editor.test.tsx — test tabs, category errors, legacy state, media, and identity colors.
- tests/unit/profile-editor.test.tsx — test both views, saving, and preview updates.
- tests/unit/auth-flow.test.tsx — verify active customer navigation.
- tests/unit/sidebar-nav.test.tsx — verify Customize active state.
- tests/unit/draft-save-context.test.tsx — verify guarded navigation to Customize.

### Leave unchanged

- convex/* and the schema — the existing draft and mutations remain the persistence contract.
- src/lib/domain/index.ts — publication validation remains authoritative.
- src/lib/profile-customization.ts and src/lib/profile-media.ts — existing data and validation contracts remain intact.
- src/components/workspace/WorkspacePreview.tsx and public-profile components — both routes use the same preview.
- src/components/layout/AdminShell.tsx — Customize is customer-only.

## Task 1: Establish the implementation baseline

**Files:** AGENTS.md, node_modules/next/dist/docs/01-app/*, and the focused test files listed below.

- [ ] Step 1: Read repository and Next App Router instructions.

Run:

~~~bash
sed -n '1,240p' AGENTS.md
find node_modules/next/dist/docs/01-app -maxdepth 3 -type f | sort | rg 'routing|layouts|error|loading|index'
~~~

Read the route/layout documents selected by the second command before editing route files.

- [ ] Step 2: Run the focused baseline suite.

~~~bash
npm run test -- tests/unit/profile-editor.test.tsx tests/unit/profile-customization-editor.test.tsx tests/unit/sidebar-nav.test.tsx tests/unit/draft-save-context.test.tsx
~~~

Expected: the existing focused tests pass before the split begins.

## Task 2: Add pure validation-category classification

**Files:**

- Create: src/lib/profile-workspace.ts
- Test: tests/unit/profile-workspace.test.ts

- [ ] Step 1: Write the failing tests.

Cover these mappings:

~~~ts
expect(classifyProfileWorkspaceError("The profile customization accent is invalid.")).toBe("overview");
expect(classifyProfileWorkspaceError("The profile name custom color does not meet contrast requirements.")).toBe("identity");
expect(classifyProfileWorkspaceError("Hero height must be between 220 and 520.")).toBe("media");
expect(classifyProfileWorkspaceError("The profile customization content order is invalid.")).toBe("layout");
expect(classifyProfileWorkspaceError("A nonblank profile name is required.")).toBeUndefined();

expect(splitProfileWorkspaceErrors([
  "A nonblank profile name is required.",
  "The profile customization accent is invalid.",
  "Hero height must be between 220 and 520.",
])).toEqual({
  profile: ["A nonblank profile name is required."],
  customization: [
    "The profile customization accent is invalid.",
    "Hero height must be between 220 and 520.",
  ],
});
~~~

- [ ] Step 2: Run the new test and confirm it fails.

~~~bash
npm run test -- tests/unit/profile-workspace.test.ts
~~~

Expected: FAIL because src/lib/profile-workspace.ts and its exports do not exist.

- [ ] Step 3: Implement the helper.

Use these types and marker groups:

~~~ts
export const PROFILE_CUSTOMIZATION_CATEGORIES = [
  "overview",
  "identity",
  "media",
  "layout",
] as const;

export type ProfileCustomizationCategory = (typeof PROFILE_CUSTOMIZATION_CATEGORIES)[number];

const MARKERS: Record<ProfileCustomizationCategory, readonly string[]> = {
  overview: [
    "profile customization preset",
    "profile customization accent",
    "profile customization type scale",
    "profile customization link treatment",
  ],
  identity: ["profile name color", "profile bio color"],
  media: [
    "profile media",
    "media autoplay",
    "hero height",
    "slideshow",
    "background image",
    "background horizontal position",
    "background vertical position",
  ],
  layout: ["profile customization content order"],
};

function includesMarker(error: string, markers: readonly string[]): boolean {
  const normalized = error.toLowerCase();
  return markers.some((marker) => normalized.includes(marker));
}

export function classifyProfileWorkspaceError(
  error: string,
): ProfileCustomizationCategory | undefined {
  return PROFILE_CUSTOMIZATION_CATEGORIES.find((category) =>
    includesMarker(error, MARKERS[category]),
  );
}

export function splitProfileWorkspaceErrors(errors: readonly string[]): {
  profile: string[];
  customization: string[];
} {
  return errors.reduce(
    (result, error) => {
      if (classifyProfileWorkspaceError(error) === undefined) result.profile.push(error);
      else result.customization.push(error);
      return result;
    },
    { profile: [], customization: [] } as { profile: string[]; customization: string[] },
  );
}
~~~

- [ ] Step 4: Run and commit the isolated contract.

~~~bash
npm run test -- tests/unit/profile-workspace.test.ts
git add src/lib/profile-workspace.ts tests/unit/profile-workspace.test.ts
git commit -m "test: classify profile workspace validation errors"
~~~

Expected: all classification tests pass.

## Task 3: Extract Profile-only content controls

**Files:**

- Create: src/components/forms/ProfileDetailsEditor.tsx
- Test: tests/unit/profile-details-editor.test.tsx

- [ ] Step 1: Write failing details-only tests.

Render a controlled details editor with Warm Studio customization. Assert that Name, Email, Featured link, and About/Services are present; select Services and add a service; assert that Accent, Identity color, Media, and Content order controls are absent. Also assert Featured link and About/Services changes preserve unrelated customization fields.

Use this public prop contract:

~~~ts
export type ProfileFieldChange = <K extends keyof ProfileContent>(
  field: K,
  value: ProfileContent[K],
) => void;

export type ProfileDetailsEditorProps = {
  draft: ProfileContent;
  customization?: ProfileCustomization;
  links: readonly ProfileLink[];
  copyMessage: string;
  slugLocked: boolean;
  imageContent?: ReactNode;
  message?: ReactNode;
  onboarding?: ReactNode;
  onChange: ProfileFieldChange;
  onCustomizationChange: (next: ProfileCustomization | undefined) => void;
  onCopyUrl: () => void;
};
~~~

- [ ] Step 2: Run the details test and confirm it fails.

~~~bash
npm run test -- tests/unit/profile-details-editor.test.tsx
~~~

Expected: FAIL because the component does not exist.

- [ ] Step 3: Move the current identity markup and content controls into the new component.

Move ProfileIdentityForm from ProfileEditor.tsx into ProfileDetailsEditor.tsx, preserving every field ID, label, placeholder, max length, slug-lock message, Public URL copy action, and imageContent slot. Move the existing Featured link and About/Services logic from ProfileCustomizationEditor.tsx into the same component.

Keep Featured link and About/Services nested under customization. Deep-copy section.items when changing a Services section:

~~~ts
function copyCustomization(customization: ProfileCustomization): ProfileCustomization {
  return {
    ...customization,
    ...(customization.section
      ? {
          section: {
            ...customization.section,
            ...(customization.section.kind === "services"
              ? { items: [...(customization.section.items ?? [])] }
              : {}),
          },
        }
      : {}),
  };
}
~~~

When customization is absent, keep the identity fields and render a Notice explaining that Featured link and About/Services become available after choosing Warm Studio in Customize. Do not render visual controls here.

- [ ] Step 4: Run and commit the details surface.

~~~bash
npm run test -- tests/unit/profile-details-editor.test.tsx
git add src/components/forms/ProfileDetailsEditor.tsx tests/unit/profile-details-editor.test.tsx
git commit -m "refactor: extract profile details controls"
~~~

Expected: the details tests pass.

## Task 4: Convert ProfileCustomizationEditor into four focused categories

**Files:**

- Modify: src/components/forms/ProfileCustomizationEditor.tsx
- Modify: tests/unit/profile-customization-editor.test.tsx

- [ ] Step 1: Replace mixed-accordion tests with failing tab tests.

Test this order and behavior:

~~~tsx
expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
await user.click(screen.getByRole("tab", { name: "Identity" }));
expect(screen.getByRole("button", { name: "Default name color" })).toBeInTheDocument();
await user.click(screen.getByRole("tab", { name: "Layout" }));
await user.click(screen.getByRole("radio", { name: "About/Services first" }));
expect(lastChange(onChange).contentOrder).toBe("section-first");
await user.click(screen.getByRole("tab", { name: "Media" }));
expect(screen.getByRole("button", { name: "Upload background image" })).toBeInTheDocument();
~~~

Also test tab error indicators, values surviving tab switches, white custom identity color with a background, and legacy profiles showing theme cards with disabled non-Overview tabs until Use Warm Studio is selected.

- [ ] Step 2: Run the component tests and confirm the old implementation fails.

~~~bash
npm run test -- tests/unit/profile-customization-editor.test.tsx
~~~

Expected: FAIL because the current component exposes Identity/Contact/Style/Review accordions instead of the new visual tabs.

- [ ] Step 3: Implement the visual-only props and tab semantics.

Use this prop shape:

~~~ts
export type ProfileCustomizationEditorProps = {
  customization?: ProfileCustomization;
  errors?: readonly string[];
  media?: ProfileMediaPresentation;
  mediaBusy?: boolean;
  mediaError?: string;
  onChange: (next: ProfileCustomization | undefined) => void;
  onMediaChange?: (next: ProfileMediaPresentation | undefined) => void;
  onMediaUpload?: (file: File, target: "background" | "slideshow") => Promise<ProfileMediaImage>;
  onThemeChange?: (theme: ProfileTheme) => void;
  theme?: ProfileTheme;
};
~~~

Use role tablist, role tab, aria-selected, aria-controls, and role tabpanel. Start on Overview. Render these categories in order:

- Overview: Warm Studio preset, Accent, Type scale, Link/button treatment.
- Identity: existing independent name/bio color controls, with allowWhite equal to whether media.background exists.
- Media: existing ProfileMediaEditor.
- Layout: Content order only.

Use a vertical desktop rail and horizontal mobile scroller:

~~~tsx
<div className="grid gap-5 lg:grid-cols-[9rem_minmax(0,1fr)]">
  <nav aria-label="Customization categories" className="flex gap-2 overflow-x-auto lg:grid lg:content-start">
    {/* tab buttons */}
  </nav>
  <section aria-label={categoryLabels[activeCategory] + " settings"} role="tabpanel">
    {/* active category */}
  </section>
</div>
~~~

Use classifyProfileWorkspaceError for visible, non-color-only ! indicators. For a legacy profile, keep Overview selected, show the existing paper/moss/night theme cards and Use Warm Studio, and disable Identity, Media, and Layout.

- [ ] Step 4: Run and commit the focused customization workspace.

~~~bash
npm run test -- tests/unit/profile-customization-editor.test.tsx
git add src/components/forms/ProfileCustomizationEditor.tsx tests/unit/profile-customization-editor.test.tsx
git commit -m "feat: organize customization into focused categories"
~~~

Expected: all tab, error, legacy, media, identity-color, and value-preservation tests pass.

## Task 5: Extract the shared workspace frame and publication panel

**Files:**

- Create: src/components/forms/ProfileWorkspaceFrame.tsx
- Create: src/components/forms/ProfilePublicationPanel.tsx

- [ ] Step 1: Create ProfileWorkspaceFrame.

Use this prop contract:

~~~ts
export type ProfileWorkspaceFrameProps = {
  title: string;
  description: string;
  controls: ReactNode;
  preview: PublicProfileProjection | null;
  profileUrl: string;
  previewMode: "phone" | "desktop";
  onPreviewModeChange: (mode: "phone" | "desktop") => void;
  saveDisabled: boolean;
  saveLoading?: boolean;
  onSave: () => void;
  publishDisabled: boolean;
  publishLoading?: boolean;
  onPublish: () => void;
  publishLabel: string;
  cropDialog?: ReactNode;
};
~~~

Move the existing two-column markup, heading, WorkspacePreview, fixed action bar, icons, and responsive classes into this component. Keep controls before the preview in document order so mobile users see controls first. Preserve existing save/publish disabled and loading behavior.

- [ ] Step 2: Create ProfilePublicationPanel.

Use:

~~~ts
export type ProfilePublicationPanelProps = {
  status: ProfileStatus;
  publicationState: string;
  errors: readonly string[];
  customizationErrors: readonly string[];
  hasChangesSincePublish: boolean;
  onOpenCustomize: ReactNode;
  onUnpublish?: () => void;
};
~~~

Move the current status badge, success copy, profile-content error list, and unpublish action into this panel. When customizationErrors is nonempty, show a Notice with the provided Open Customize action. Do not hide ordinary name, slug, link, website, redirect, Featured link, or About/Services errors.

## Task 6: Make the demo/live controller render Profile or Customize

**Files:**

- Modify: src/components/forms/ProfileEditor.tsx
- Modify: tests/unit/profile-editor.test.tsx

- [ ] Step 1: Add failing view-boundary tests.

Add demo/live tests for:

~~~tsx
render(<ProfileEditor view="customize" />);
expect(screen.getByRole("heading", { name: "Customize your profile" })).toBeVisible();
expect(screen.getByRole("tab", { name: "Overview" })).toBeVisible();
expect(screen.queryByRole("heading", { name: "Profile identity" })).not.toBeInTheDocument();

render(<ProfileEditor view="profile" />);
expect(screen.getByRole("heading", { name: "Profile identity" })).toBeVisible();
expect(screen.getByRole("heading", { name: "Publication" })).toBeVisible();
expect(screen.queryByRole("tab", { name: "Overview" })).not.toBeInTheDocument();
~~~

Cover customization changes updating the preview and enabling Save draft in both demo and live branches. Keep existing photo/media upload and legacy-profile cases.

- [ ] Step 2: Add the view type and pass it through both branches.

Use:

~~~ts
export type ProfileEditorView = "profile" | "customize";

export function ProfileEditor({ view = "profile" }: { view?: ProfileEditorView } = {}) {
  return !isLocalDemoMode() ? <LiveProfileEditor view={view} /> : <DemoProfileEditor view={view} />;
}
~~~

Update DemoProfileEditor, LiveProfileEditor, and LiveProfileEditorContent to accept the view. Keep all draft state, validation, upload handlers, useDraftSaveRegistration, preview projection, save, publish, and unpublish logic in these shared controllers.

- [ ] Step 3: Partition errors and compose route-specific controls.

After validatePublication, derive:

~~~ts
const { profile: profileErrors, customization: customizationErrors } =
  splitProfileWorkspaceErrors(errors);
~~~

Profile renders ProfileDetailsEditor plus ProfilePublicationPanel. It passes customizationErrors to the publication panel, which renders a guarded DraftSaveButtonLink to /app/customize.

Customize renders ProfileCustomizationEditor with customizationErrors, media handlers, the current theme, and the current draft preview. If profileErrors is nonempty, show a Notice with a guarded DraftSaveButtonLink to /app/profile; do not render profile name, contact, link, About/Services, or publication-detail controls there.

Move legacy theme cards into Customize. Demo theme changes use the existing getDemoTheme/updateDemoTheme path; live changes use updateField("theme", theme). Profile continues to preview legacy themes but does not render theme cards.

- [ ] Step 4: Replace duplicated outer markup with ProfileWorkspaceFrame.

Use these route titles:

~~~ts
const workspaceCopy =
  view === "customize"
    ? { title: "Customize your profile", description: "Tune the look and feel of your public profile." }
    : { title: "Your profile", description: "Edit your details and see how your profile looks to others." };
~~~

Both routes pass the same profileForPreview result and publish the same complete draft.

- [ ] Step 5: Run and commit the route-aware controller.

~~~bash
npm run test -- tests/unit/profile-editor.test.tsx
git add src/components/forms/ProfileEditor.tsx src/components/forms/ProfileWorkspaceFrame.tsx src/components/forms/ProfilePublicationPanel.tsx tests/unit/profile-editor.test.tsx
git commit -m "feat: share profile and customization workspaces"
~~~

Expected: Profile and Customize tests pass for demo/live, including save calls and preview updates.

## Task 7: Add the customer route and navigation

**Files:**

- Create: src/app/app/customize/page.tsx
- Create: src/app/app/customize/loading.tsx
- Create: src/app/app/customize/error.tsx
- Modify: src/components/layout/CustomerShell.tsx
- Modify: tests/unit/auth-flow.test.tsx
- Modify: tests/unit/sidebar-nav.test.tsx

- [ ] Step 1: Add the route entry and states.

Use:

~~~tsx
import { ProfileEditor } from "@/components/forms/ProfileEditor";

export default function CustomerCustomizePage() {
  return <ProfileEditor view="customize" />;
}
~~~

The loading state uses role status and the text Loading customization.... The error file is a client component returning the existing ServiceErrorPage.

- [ ] Step 2: Add Customize only to customer navigation.

Insert after Profile in customerNavGroups:

~~~ts
{ href: "/app/customize", label: "Customize", icon: "fingerprint" },
~~~

Do not add the item to adminNavGroups.

- [ ] Step 3: Test and commit the navigation.

Update the sidebar fixture so /app/customize marks only Customize with aria-current=page. Render an active customer shell at /app/customize in auth-flow.test.tsx and assert the link is present; keep admin and inactive-account redirect tests unchanged.

~~~bash
npm run test -- tests/unit/auth-flow.test.tsx tests/unit/sidebar-nav.test.tsx
git add src/app/app/customize/page.tsx src/app/app/customize/loading.tsx src/app/app/customize/error.tsx src/components/layout/CustomerShell.tsx tests/unit/auth-flow.test.tsx tests/unit/sidebar-nav.test.tsx
git commit -m "feat: add customer customization workspace route"
~~~

Expected: active customers see Customize; admins do not.

## Task 8: Verify guarded Profile/Customize navigation

**Files:** tests/unit/draft-save-context.test.tsx and only, if a test proves it necessary, src/components/layout/AppShell.tsx or src/components/layout/DraftSaveContext.tsx.

- [ ] Step 1: Add the deferred-save navigation test.

Add /app/customize to testNavGroups and assert navigation waits for the registered save:

~~~tsx
it("saves before navigating from Profile to Customize", async () => {
  let resolveSave!: (value: boolean) => void;
  const save = vi.fn(() => new Promise<boolean>((resolve) => { resolveSave = resolve; }));

  render(
    <DraftSaveProvider>
      <AppShell
        beforeNavigate={async () => save()}
        eyebrow="Customer workspace"
        navGroups={testNavGroups}
        title="Workspace"
      >
        Content
      </AppShell>
    </DraftSaveProvider>,
  );

  fireEvent.click(screen.getByRole("link", { name: "Customize" }));
  expect(push).not.toHaveBeenCalled();
  resolveSave(true);
  await waitFor(() => expect(push).toHaveBeenCalledWith("/app/customize"));
});
~~~

- [ ] Step 2: Run the draft-save tests.

~~~bash
npm run test -- tests/unit/draft-save-context.test.tsx
~~~

Expected: the new navigation test and existing failure/modified-click/external-link tests pass.

- [ ] Step 3: Commit only if this task changed files.

If the existing guard passes unchanged, keep the test with the route commit. If a guard change is needed:

~~~bash
git add src/components/layout/AppShell.tsx src/components/layout/DraftSaveContext.tsx tests/unit/draft-save-context.test.tsx
git commit -m "test: guard navigation between profile workspaces"
~~~

## Task 9: Run complete verification and manually inspect the UI

**Files:** no planned source changes; fix only issues discovered by the checks.

- [ ] Step 1: Run formatting and lint.

~~~bash
npm run format:check
npm run lint
~~~

Expected: Prettier is clean and ESLint has no new issues beyond the known _links warning in src/lib/profile-customization.ts.

- [ ] Step 2: Run typecheck, tests, and the verified Next build.

~~~bash
npm run typecheck
npm run test
npx next build --webpack
~~~

Expected: TypeScript, the full Vitest suite, and the App Router build all pass, including /app/customize.

- [ ] Step 3: Manually verify both routes in demo mode.

Check:

1. /app/profile contains identity/contact/content/publication controls and no accent, identity-color, media, or content-order controls.
2. /app/customize opens on Overview, keeps the preview visible, and exposes Identity, Media, and Layout.
3. Tab changes preserve values and update the preview immediately.
4. Background media allows white identity text; removing the background restores the contrast error.
5. Sidebar navigation saves a dirty draft before switching routes.
6. Profile offers Open Customize for visual errors; Customize offers Open Profile for profile-content errors.
7. On narrow viewports, tabs scroll horizontally and the preview follows the controls.

- [ ] Step 4: Inspect the final diff without staging user-owned files.

~~~bash
git diff --check
git status --short
git diff --stat HEAD~5..HEAD
~~~

Do not stage PRODUCT.md, docs/pricing-check-2026-09-25.md, docs/pricing-strategy-philippines.md, sample_data/, or work/.

## Self-review checklist

- Spec coverage: route, Profile/Customize boundaries, four categories, responsive layout, shared draft/preview/publish, error indicators, cross-workspace actions, legacy migration, white identity-color exception, accessibility, tests, and verification are all assigned to tasks.
- Placeholder scan: implementation steps contain no unfinished placeholder instructions.
- Type consistency: ProfileEditorView, ProfileCustomizationCategory, ProfileDetailsEditorProps, ProfileCustomizationEditorProps, and ProfileWorkspaceFrameProps are defined before consumers.
- Scope check: no Convex schema, public projection, admin navigation, or new customization capability is included.
