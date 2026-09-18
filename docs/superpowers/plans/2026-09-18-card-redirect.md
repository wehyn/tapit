# Card Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Let customers configure a profile-wide HTTPS destination in /app/links so published active card taps and QR scans are counted by Tapit and then redirected, while preserving the existing profile and fallback behavior.

**Architecture:** Store an optional redirect object in the profile draft and published snapshot. The existing links workspace edits and publishes that object alongside links. The active card query exposes only a validated published destination, and the existing client resolver records the NFC/QR view once before navigating; all unavailable card states continue through their current screens.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Convex 1.45, Vitest, Testing Library, Playwright, Tailwind CSS 4, Phosphor icons.

---

## File map

- Modify src/lib/domain/index.ts for the redirect type, validation, and publication behavior.
- Modify convex/schema.ts and convex/validators.ts for optional persisted redirect data and server validation.
- Modify convex/profiles.ts and convex/links.ts to save and publish redirect draft state through existing mutations.
- Modify convex/cards.ts to return only a safe redirect destination for active published cards.
- Modify src/components/forms/LinksWorkspace.tsx and src/components/forms/LinksEditor.tsx for the approved live/demo UI and draft state.
- Modify src/components/profile/CardResolverClient.tsx for one-shot analytics followed by browser navigation.
- Modify src/lib/demo/fixtures.ts or src/lib/demo/store.ts only when the demo shape or migration needs the optional field.
- Extend focused unit and Convex integration tests.

## Task 1: Add the shared redirect contract and domain tests

**Files:**

- Modify: src/lib/domain/index.ts
- Test: tests/unit/domain.test.ts

- [ ] **Step 1: Write failing redirect tests.**

Add these imports and tests to tests/unit/domain.test.ts:

```ts
import { validateProfileRedirect, validateRedirectDestination } from "../../src/lib/domain";

describe("card redirect rules", () => {
  it.each(["https://example.com", "https://example.com/path?source=tapit"])(
    "accepts a valid HTTPS destination: %s",
    (destination) => {
      expect(validateRedirectDestination(destination)).toBeNull();
    },
  );

  it.each([
    "",
    "   ",
    "http://example.com",
    "javascript:alert(1)",
    "data:text/html,evil",
    "https://",
    "https://user:password@example.com",
  ])("rejects an unsafe destination: %s", (destination) => {
    expect(validateRedirectDestination(destination)).toBe(
      "Redirect destination must be a valid HTTPS URL without credentials.",
    );
  });

  it("allows a disabled redirect without a destination", () => {
    expect(validateProfileRedirect({ enabled: false, destination: "" })).toBeNull();
  });

  it("requires a safe destination when enabled", () => {
    expect(validateProfileRedirect({ enabled: true, destination: "" })).toBe(
      "Redirect destination must be a valid HTTPS URL without credentials.",
    );
  });
});
```

Add a publication assertion showing the optional redirect is copied into the published snapshot and changed draft state is detected:

```ts
const redirect = { enabled: true, destination: "https://redirect.example" };
const published = publishProfile({ ...profile(), draft: { ...draft, redirect } }, "first");

expect(published.published?.redirect).toEqual(redirect);
expect(
  hasUnpublishedChanges(
    { ...published.draft, redirect: { enabled: false, destination: "" } },
    published.published,
  ),
).toBe(true);
```

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run:

```bash
npx vitest run tests/unit/domain.test.ts
```

Expected: FAIL because the redirect type and validators do not exist.

- [ ] **Step 3: Implement the shared type and validation.**

In src/lib/domain/index.ts, add:

```ts
export interface ProfileRedirect {
  enabled: boolean;
  destination: string;
}

const REDIRECT_ERROR = "Redirect destination must be a valid HTTPS URL without credentials.";

export function validateRedirectDestination(destination: string): string | null {
  try {
    const parsed = new URL(destination.trim());
    if (parsed.protocol !== "https:" || parsed.hostname.length === 0) return REDIRECT_ERROR;
    if (parsed.username || parsed.password) return REDIRECT_ERROR;
    return null;
  } catch {
    return REDIRECT_ERROR;
  }
}

export function validateProfileRedirect(redirect: ProfileRedirect | undefined): string | null {
  if (redirect === undefined || !redirect.enabled) return null;
  return validateRedirectDestination(redirect.destination);
}
```

Add redirect?: ProfileRedirect to ProfileContent and PublishedProfileSnapshot. In validatePublication, append the non-null result from validateProfileRedirect(draft.redirect). In publishProfile, copy the optional redirect with the rest of the draft.

- [ ] **Step 4: Run the focused test and confirm it passes.**

Run:

```bash
npx vitest run tests/unit/domain.test.ts
```

Expected: PASS, including the existing profile, link, card, and deletion tests.

- [ ] **Step 5: Commit the domain contract.**

```bash
git add src/lib/domain/index.ts tests/unit/domain.test.ts
git commit -m "feat: add profile redirect domain rules"
```

## Task 2: Persist redirect drafts and published snapshots in Convex

**Files:**

- Modify: convex/schema.ts
- Modify: convex/validators.ts
- Modify: convex/profiles.ts
- Modify: convex/links.ts
- Test: convex/integration/content-hardening.test.ts

- [ ] **Step 1: Write failing Convex persistence tests.**

Extend the content-hardening seed’s valid draft with an optional redirect and add:

```ts
const redirect = { enabled: true, destination: "https://redirect.example" };

await owner.mutation(api.profiles.saveDraft, {
  profileId: data.profileId,
  draft: { ...validDraft(), redirect },
});
await expect(owner.query(api.profiles.mine, {})).resolves.toMatchObject({
  draft: { redirect },
  published: undefined,
});

await expect(
  owner.mutation(api.profiles.saveDraft, {
    profileId: data.profileId,
    draft: {
      ...validDraft(),
      redirect: { enabled: true, destination: "http://unsafe.example" },
    },
  }),
).rejects.toThrow("valid HTTPS URL");
```

Also call api.links.replaceDraft with an enabled redirect and assert profiles.mine returns it. Keep the new mutation argument optional so existing callers remain valid.

- [ ] **Step 2: Run the Convex integration test and confirm it fails.**

Run:

```bash
npx vitest run convex/integration/content-hardening.test.ts
```

Expected: FAIL because the Convex validators reject the new field or mutations do not persist it.

- [ ] **Step 3: Add schema and validator definitions.**

In convex/schema.ts, define:

```ts
const profileRedirect = v.object({
  enabled: v.boolean(),
  destination: v.string(),
});
```

Add redirect: v.optional(profileRedirect) to both profileContent and publishedProfile.

In convex/validators.ts, define matching profileRedirectValidator, add it as optional to profileContentValidator, and add redirect input fields to the structural types accepted by validateDraftSafety and validateProfileContent. Add these exact server rules:

```ts
const REDIRECT_ERROR = "Redirect destination must be a valid HTTPS URL without credentials.";

export function validateRedirectDestination(destination: string): string | null {
  try {
    const parsed = new URL(destination.trim());
    if (parsed.protocol !== "https:" || parsed.hostname.length === 0) return REDIRECT_ERROR;
    if (parsed.username || parsed.password) return REDIRECT_ERROR;
    return null;
  } catch {
    return REDIRECT_ERROR;
  }
}

export function validateProfileRedirect(
  redirect: { enabled: boolean; destination: string } | undefined,
): string | null {
  if (redirect === undefined || !redirect.enabled) return null;
  return validateRedirectDestination(redirect.destination);
}
```

Make validateDraftSafety and validateProfileContent append a redirect validation error. Missing redirect fields remain valid for legacy documents.

- [ ] **Step 4: Thread redirect through existing save and publish mutations.**

In convex/links.ts, import profileRedirectValidator and use:

```ts
args: {
  profileId: v.id("profiles"),
  links: v.array(linkValidator),
  redirect: v.optional(profileRedirectValidator),
}
```

Validate { ...profile.draft, links: args.links, redirect: args.redirect ?? profile.draft.redirect }, then patch the draft with the supplied redirect when present:

```ts
const nextDraft = {
  ...profile.draft,
  links: args.links,
  ...(args.redirect === undefined ? {} : { redirect: args.redirect }),
};
await ctx.db.patch(profile._id, { draft: nextDraft, updatedAt: now });
```

In convex/profiles.ts, add redirect: v.optional(profileRedirectValidator) to the explicit publish return object. The existing saveDraft and publish paths then persist and copy the field after validation.

- [ ] **Step 5: Run focused Convex and type checks.**

Run:

```bash
npx vitest run convex/integration/content-hardening.test.ts
npm run typecheck
```

Expected: PASS for the integration test and TypeScript with no schema or generated-API errors.

- [ ] **Step 6: Commit persistence changes.**

```bash
git add convex/schema.ts convex/validators.ts convex/profiles.ts convex/links.ts convex/integration/content-hardening.test.ts
git commit -m "feat: persist card redirect settings"
```

## Task 3: Add the approved redirect panel to /app/links

**Files:**

- Modify: src/components/forms/LinksWorkspace.tsx
- Modify: src/components/forms/LinksEditor.tsx
- Test: tests/unit/links-editor.test.ts
- Test: tests/unit/links-workspace.test.tsx

- [ ] **Step 1: Write failing controller and workspace tests.**

In tests/unit/links-editor.test.ts, test the helpers shared by both controllers:

```ts
import type { ProfileRedirect } from "@/lib/domain";
import { areProfileRedirectsEqual, normalizeProfileRedirect } from "@/components/forms/LinksEditor";

it("treats a missing persisted redirect as the disabled default", () => {
  const disabled: ProfileRedirect = { enabled: false, destination: "" };
  expect(normalizeProfileRedirect(undefined)).toEqual(disabled);
  expect(areProfileRedirectsEqual(disabled, undefined)).toBe(true);
});

it("detects redirect changes", () => {
  expect(
    areProfileRedirectsEqual(
      { enabled: true, destination: "https://new.example" },
      { enabled: false, destination: "" },
    ),
  ).toBe(false);
});
```

In tests/unit/links-workspace.test.tsx, pass the new redirect props and assert the approved heading, supporting copy, switch, URL textbox, and valid feedback. Add an interaction assertion that the switch and URL input call onUpdateRedirect.

- [ ] **Step 2: Run focused UI tests and confirm they fail.**

Run:

```bash
npx vitest run tests/unit/links-editor.test.ts tests/unit/links-workspace.test.tsx
```

Expected: FAIL because the props, helpers, and redirect panel do not exist.

- [ ] **Step 3: Add shared redirect props and markup.**

In LinksWorkspace.tsx, import CheckCircleIcon and ProfileRedirect. Extend props with:

```ts
redirect: ProfileRedirect;
redirectError: string | null;
onUpdateRedirect: (patch: Partial<ProfileRedirect>) => void;
```

Render the panel after the heading/action row and before the profile-links heading. Use the existing white surface, Tapit border/radius/shadows, Field focus classes, and peer switch pattern. The panel’s essential semantic markup is:

```tsx
<section
  aria-labelledby="card-redirect-title"
  className="mt-7 rounded-tapit border border-tapit-line bg-white p-5 shadow-[0_18px_50px_rgba(21,25,24,0.05)] sm:p-6"
>
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0">
      <h2 id="card-redirect-title" className="text-lg font-semibold text-tapit-ink">
        Redirect card taps and scans
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-tapit-muted">
        When enabled and published, active NFC and QR card visits are counted, then sent to your
        destination.
      </p>
    </div>
    <label className="flex shrink-0 items-center gap-2 text-sm font-medium text-tapit-ink">
      <span className="sr-only">Enable card redirect</span>
      <input
        aria-label="Enable card redirect"
        checked={redirect.enabled}
        className="peer sr-only"
        onChange={(event) => onUpdateRedirect({ enabled: event.target.checked })}
        type="checkbox"
      />
      <span
        aria-hidden="true"
        className="relative inline-flex h-6 w-11 rounded-full bg-tapit-soft-surface transition-colors after:absolute after:left-1 after:top-1 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-tapit-accent peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-tapit-focus"
      />
      <span>Enabled</span>
    </label>
  </div>
  <div className="mt-5">
    <label
      className="block text-sm font-semibold text-tapit-ink"
      htmlFor="card-redirect-destination"
    >
      HTTPS destination URL
    </label>
    <p className="mt-1.5 text-xs leading-5 text-tapit-muted" id="card-redirect-help">
      Use the full address, including https://.
    </p>
    <input
      aria-describedby="card-redirect-help card-redirect-error"
      aria-invalid={Boolean(redirectError)}
      className="mt-2 min-h-12 w-full rounded-tapit border border-tapit-line bg-tapit-surface px-3.5 py-3 text-sm text-tapit-ink shadow-sm outline-none transition-colors focus:border-tapit-accent focus:ring-2 focus:ring-tapit-accent/20"
      id="card-redirect-destination"
      onChange={(event) => onUpdateRedirect({ destination: event.target.value })}
      placeholder="https://www.harleystudio.com"
      type="url"
      value={redirect.destination}
    />
    {redirectError ? (
      <p id="card-redirect-error" role="alert">
        {redirectError}
      </p>
    ) : null}
    {!redirectError && redirect.destination.trim() ? (
      <p role="status">
        <CheckCircleIcon aria-hidden="true" size={15} weight="fill" />
        Valid HTTPS destination
      </p>
    ) : null}
  </div>
</section>
```

The valid message must be shown only when validateProfileRedirect(redirect) returns null and the destination is nonblank. Preserve all existing link table and preview markup.

- [ ] **Step 4: Thread redirect draft state through both editor controllers.**

In LinksEditor.tsx, add:

```ts
export function normalizeProfileRedirect(
  redirect: Partial<ProfileRedirect> | undefined,
): ProfileRedirect {
  return {
    enabled: redirect?.enabled ?? false,
    destination: redirect?.destination ?? "",
  };
}

export function areProfileRedirectsEqual(
  current: ProfileRedirect,
  persisted: ProfileRedirect | undefined,
): boolean {
  const normalized = normalizeProfileRedirect(persisted);
  return current.enabled === normalized.enabled && current.destination === normalized.destination;
}
```

In DemoLinksEditor, initialize redirect from profile.draft.redirect, include it in draft, validate with validateProfileRedirect, update it from onUpdateRedirect, save it in updateDemoProfile, and publish it through publishProfile. In LiveLinksEditorContent, keep redirect in local state with null meaning “use the server draft,” include it in currentDraft, use areProfileRedirectsEqual for dirty detection, pass it to saveLinks, and reject save/publish while validateProfileRedirect(currentDraft.redirect) returns an error. Pass the three new props to LinksWorkspace in both modes.

- [ ] **Step 5: Run focused UI tests and formatting.**

Run:

```bash
npx vitest run tests/unit/links-editor.test.ts tests/unit/links-workspace.test.tsx
npx prettier --check src/components/forms/LinksEditor.tsx src/components/forms/LinksWorkspace.tsx tests/unit/links-editor.test.ts tests/unit/links-workspace.test.tsx
```

Expected: PASS with no formatting differences.

- [ ] **Step 6: Commit the /app/links UI.**

```bash
git add src/components/forms/LinksEditor.tsx src/components/forms/LinksWorkspace.tsx tests/unit/links-editor.test.ts tests/unit/links-workspace.test.tsx
git commit -m "feat: add card redirect controls to links workspace"
```

## Task 4: Expose safe published destinations from card resolution

**Files:**

- Modify: convex/cards.ts
- Test: convex/integration/card-claiming.test.ts
- Test: convex/integration/remaining-operations.test.ts

- [ ] **Step 1: Add failing active-card resolution tests.**

Seed an active published profile with redirect: { enabled: true, destination: "https://redirect.example/path" } and assert:

```ts
{
  status: "active",
  profile: { slug: "owner" },
  redirectDestination: "https://redirect.example/path",
}
```

Add disabled, empty, non-HTTPS, credential-bearing, inactive, claimable, and unpublished cases. Every case except an enabled valid active profile must omit redirectDestination or return the existing non-active status. Assert direct profile queries still return the public projection without a redirect field.

- [ ] **Step 2: Run the card integration tests and confirm the new enabled case fails.**

Run:

```bash
npx vitest run convex/integration/card-claiming.test.ts convex/integration/remaining-operations.test.ts
```

Expected: FAIL because cards.resolve does not return a redirect destination.

- [ ] **Step 3: Extend the resolver result contract and return validated data.**

In convex/cards.ts, extend the active result validator:

```ts
v.object({
  status: v.literal("active"),
  profile: publicProfileValidator,
  redirectDestination: v.optional(v.string()),
});
```

After the existing active profile checks and projection, compute:

```ts
const redirect = profile.published?.redirect;
const redirectDestination =
  redirect?.enabled === true && validateRedirectDestination(redirect.destination) === null
    ? redirect.destination.trim()
    : undefined;

return {
  status: "active" as const,
  profile: projection,
  ...(redirectDestination === undefined ? {} : { redirectDestination }),
};
```

Keep token, card status, claimable, profile, account, and published projection checks before considering redirect. Never expose redirect data on non-active states.

- [ ] **Step 4: Run integration tests and typecheck.**

Run:

```bash
npx vitest run convex/integration/card-claiming.test.ts convex/integration/remaining-operations.test.ts
npm run typecheck
```

Expected: PASS with unchanged inactive, onboarding, and unavailable results.

- [ ] **Step 5: Commit card resolution.**

```bash
git add convex/cards.ts convex/integration/card-claiming.test.ts convex/integration/remaining-operations.test.ts
git commit -m "feat: resolve published card destinations safely"
```

## Task 5: Redirect after one NFC/QR analytics view

**Files:**

- Modify: src/components/profile/CardResolverClient.tsx
- Modify: src/lib/demo/fixtures.ts only if the fixture needs an explicit redirect
- Modify: src/lib/demo/store.ts only if a demo helper is needed
- Test: tests/unit/public-hydration.test.ts
- Test: tests/unit/public-features.test.ts

- [ ] **Step 1: Add failing resolver behavior tests.**

Mock an active live resolution with a valid redirectDestination and analytics mutation. Assert the redirect branch renders a status/loading state, calls analytics once with the profile ID and nfc or qr source, and calls window.location.replace only after the analytics promise settles. Assert a rejected analytics promise still navigates. Assert a normal active result renders PublicProfile and retains the existing view callback.

For demo mode, use an enabled valid published redirect in the test state and assert one demo recordProfileView update before navigation. Keep the default fixture disabled or empty so ordinary demo visits remain on Tapit.

- [ ] **Step 2: Run focused resolver tests and confirm they fail.**

Run:

```bash
npx vitest run tests/unit/public-hydration.test.ts tests/unit/public-features.test.ts
```

Expected: FAIL because the resolver currently always renders the Tapit profile for an active card.

- [ ] **Step 3: Implement a shared one-shot analytics redirect branch.**

In CardResolverClient.tsx, factor the existing session-key construction and recordView call into an async callback:

```ts
const recordCardView = useCallback(
  async (profileId: string) => {
    let sessionKey: string | undefined;
    try {
      const key = "tapit:analytics-session";
      sessionKey = window.sessionStorage.getItem(key) ?? crypto.randomUUID();
      window.sessionStorage.setItem(key, sessionKey);
    } catch {
      // Tracking remains best-effort when storage is unavailable.
    }
    await recordView({
      profileId: profileId as Id<"profiles">,
      sessionKey,
      source: sourceValue(source),
    });
  },
  [recordView, source],
);
```

Render a CardRedirect component instead of PublicProfile when the active result has redirectDestination:

```tsx
function CardRedirect({
  destination,
  profileId,
  recordView,
}: {
  destination: string;
  profileId: string;
  recordView: (profileId: string) => Promise<void>;
}) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void recordView(profileId)
      .catch(() => undefined)
      .finally(() => {
        window.location.replace(destination);
      });
  }, [destination, profileId, recordView]);
  return <RedirectLoading />;
}
```

Use an existing Tapit paper loading pattern for RedirectLoading, with role=status and “Redirecting…”. It must not render PublicProfile, invoke its view tracker, or create a second analytics call. Use window.location.replace so the card route does not remain in browser history.

Implement the same branch in DemoCardResolver with demo recordProfileView and the normalized published profile redirect. Keep claimable, inactive, and unavailable branches before redirect evaluation. Do not change direct /<slug> behavior.

- [ ] **Step 4: Run resolver tests, formatting, and typecheck.**

Run:

```bash
npx vitest run tests/unit/public-hydration.test.ts tests/unit/public-features.test.ts
npx prettier --check src/components/profile/CardResolverClient.tsx
npm run typecheck
```

Expected: PASS with no duplicate-view or browser API type errors.

- [ ] **Step 5: Commit resolver behavior.**

```bash
git add src/components/profile/CardResolverClient.tsx src/lib/demo/fixtures.ts src/lib/demo/store.ts tests/unit/public-hydration.test.ts tests/unit/public-features.test.ts
git commit -m "feat: redirect active cards after analytics"
```

## Task 6: Full verification and independent review

**Files:**

- Modify: implementation/test files only when a verification command identifies a concrete defect
- Review: all commits on feature/card-redirect compared with main

- [ ] **Step 1: Run repository checks.**

Run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: all commands exit 0. The browser-extension Cannot redefine property: ethereum console error is external to application code; do not modify dependencies or app behavior to suppress it.

- [ ] **Step 2: Run browser verification in demo mode.**

Run:

```bash
npm run test:e2e:demo
```

Verify /app/links at desktop, tablet, and narrow mobile widths. Confirm no horizontal overflow, visible keyboard focus, exact approved copy, valid feedback only for valid nonblank input, invalid enabled input blocks save/publish, and disabled empty settings remain usable. Configure a valid redirect in demo mode, publish it, visit the active demo card, and confirm analytics increments once before navigation. Confirm claimable and inactive demo cards never navigate externally.

- [ ] **Step 3: Dispatch independent review.**

Compare the implementation against docs/superpowers/specs/2026-09-18-card-redirect-design.md and this plan. Report findings for exact UI copy/placement, profile-wide scope, draft/publish isolation, HTTPS and credential rejection, every fallback state, one NFC/QR analytics event, direct profile preservation, accessibility, keyboard focus, responsive overflow, existing Tapit styling, and absence of pricing, checkout, payment, quote, dependency, or asset changes.

- [ ] **Step 4: Resolve concrete findings and rerun affected checks.**

Apply only changes tied to a reviewer finding or failing command, then rerun the focused test and npm run verify.

- [ ] **Step 5: Confirm a clean branch.**

Run:

```bash
git status --short --branch
git log --oneline --decorate -8
```

Expected: clean feature/card-redirect with the redirect implementation and tests, ready for user merge.
