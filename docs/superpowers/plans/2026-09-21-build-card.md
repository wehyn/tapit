# Build card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public `/build-card` route where visitors can open Tapit’s Canva template or upload a local PNG/JPG, review it in a centered popup, and begin an auth-gated card-ordering handoff.

**Architecture:** Keep `src/app/build-card/page.tsx` as a small public App Router page and put browser-only file selection, object-URL cleanup, popup state, and auth-aware actions in a client component. Split the popup into its own focused component and keep file validation in a pure helper so the visual behavior and validation rules can be tested without Convex providers. Do not add server storage, Convex functions, checkout, or order persistence.

**Tech Stack:** Next.js 16.3 App Router, React, TypeScript, Tailwind CSS 4, existing Tapit UI components, Phosphor icons, Convex Auth/demo-mode adapters, Vitest, and Testing Library.

---

## Context and implementation constraints

- Work on branch `feature/build-card`.
- The approved design is in `docs/superpowers/specs/2026-09-21-build-card-design.md`.
- Before editing application code, re-read the Next.js 16.3 App Router guides at:
  - `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`
- No Convex files are changed. If auth integration needs a Convex API change, stop and revise the plan; the current design only reads the existing `api.admin.currentAccess` query from the client.
- Keep `.superpowers/` out of commits. It contains local visual-companion screens and is currently untracked.

## File map

Create:

- `src/app/build-card/page.tsx` — public route entry that renders the interactive experience.
- `src/lib/card-design.ts` — accepted MIME types, 10 MiB limit, preview type, and pure file validation.
- `src/components/card-builder/BuildCardExperience.tsx` — demo/live auth adapters, chooser layout, file state, object URL lifecycle, Canva action, and order action.
- `src/components/card-builder/CardPreviewDialog.tsx` — centered popup, card image preview, focus management, and modal actions.
- `tests/unit/card-design.test.ts` — validation contract tests.
- `tests/unit/card-preview-dialog.test.tsx` — modal semantics and keyboard behavior.
- `tests/unit/build-card.test.tsx` — chooser, upload, cleanup, Canva, and order-flow tests.

Modify:

- `src/components/layout/CustomerShell.tsx` — add the authenticated customer navigation entry for `Build card`.

Do not modify:

- `convex/schema.ts`, `convex/*.ts`, `src/app/page.tsx`, pricing destinations, global CSS, package dependencies, or image assets.

### Task 1: Define and test local design-file validation

**Files:**

- Create: `src/lib/card-design.ts`
- Test: `tests/unit/card-design.test.ts`

- [ ] **Step 1: Write the failing validation tests**

Create `tests/unit/card-design.test.ts` with the exact accepted and rejected cases:

~~~typescript
import { describe, expect, it } from "vitest";

import {
  CARD_DESIGN_MAX_BYTES,
  validateCardDesignFile,
  type CardDesignFileLike,
} from "@/lib/card-design";

const png = (overrides: Partial<CardDesignFileLike> = {}): CardDesignFileLike => ({
  type: "image/png",
  size: 1024,
  ...overrides,
});

describe("validateCardDesignFile", () => {
  it("accepts PNG and JPG files at the size limit", () => {
    expect(validateCardDesignFile(png())).toBeNull();
    expect(validateCardDesignFile({ type: "image/jpeg", size: CARD_DESIGN_MAX_BYTES })).toBeNull();
  });

  it("rejects a missing file", () => {
    expect(validateCardDesignFile(null)).toBe("Choose a PNG or JPG image.");
  });

  it("rejects non-image and unsupported image MIME types", () => {
    expect(validateCardDesignFile({ type: "application/pdf", size: 1024 })).toBe(
      "Upload a PNG or JPG image.",
    );
    expect(validateCardDesignFile({ type: "image/webp", size: 1024 })).toBe(
      "Upload a PNG or JPG image.",
    );
  });

  it("rejects files larger than 10 MiB", () => {
    expect(validateCardDesignFile(png({ size: CARD_DESIGN_MAX_BYTES + 1 }))).toBe(
      "Choose an image that is 10 MB or smaller.",
    );
  });
});
~~~

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

~~~bash
npx vitest run tests/unit/card-design.test.ts
~~~

Expected: FAIL because `@/lib/card-design` does not exist.

- [ ] **Step 3: Implement the validation helper**

Create `src/lib/card-design.ts`:

~~~typescript
export const CARD_DESIGN_ACCEPT = "image/png,image/jpeg";
export const CARD_DESIGN_MAX_BYTES = 10 * 1024 * 1024;

export type CardDesignFileLike = {
  size: number;
  type: string;
};

export type CardDesignPreview = {
  name: string;
  size: number;
  url: string;
};

export function validateCardDesignFile(file: CardDesignFileLike | null): string | null {
  if (file === null) return "Choose a PNG or JPG image.";

  if (file.type !== "image/png" && file.type !== "image/jpeg") {
    return "Upload a PNG or JPG image.";
  }

  if (file.size > CARD_DESIGN_MAX_BYTES) {
    return "Choose an image that is 10 MB or smaller.";
  }

  return null;
}
~~~

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

~~~bash
npx vitest run tests/unit/card-design.test.ts
~~~

Expected: 4 tests pass in the `unit` project.

- [ ] **Step 5: Commit the validation contract**

~~~bash
git add src/lib/card-design.ts tests/unit/card-design.test.ts
git commit -m "test: define build card file validation"
~~~

### Task 2: Build the centered preview dialog

**Files:**

- Create: `src/components/card-builder/CardPreviewDialog.tsx`
- Test: `tests/unit/card-preview-dialog.test.tsx`

- [ ] **Step 1: Write the failing dialog tests**

Create `tests/unit/card-preview-dialog.test.tsx`:

~~~tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CardPreviewDialog } from "@/components/card-builder/CardPreviewDialog";

const file = {
  name: "taylor-card-front.jpg",
  size: 2_400_000,
  url: "blob:card-preview",
};

function renderDialog() {
  return render(
    <CardPreviewDialog
      file={file}
      onChooseAnother={vi.fn()}
      onClose={vi.fn()}
      onOrder={vi.fn()}
      orderingComingSoon={false}
    />,
  );
}

describe("CardPreviewDialog", () => {
  it("renders the approved popup order and accessible image", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "Card design preview" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Looks good?" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Preview of taylor-card-front.jpg" })).toHaveAttribute(
      "src",
      "blob:card-preview",
    );
    expect(screen.getByRole("button", { name: "Order a card now" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose another design" })).toBeVisible();
  });

  it("calls the close callback for the close control and Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <CardPreviewDialog
        file={file}
        onChooseAnother={vi.fn()}
        onClose={onClose}
        onOrder={vi.fn()}
        orderingComingSoon={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Close card preview" }));
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("reports the ordering-coming-soon state without changing the popup actions", () => {
    render(
      <CardPreviewDialog
        file={file}
        onChooseAnother={vi.fn()}
        onClose={vi.fn()}
        onOrder={vi.fn()}
        orderingComingSoon
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Ordering is coming soon");
    expect(screen.getByRole("button", { name: "Choose another design" })).toBeVisible();
  });
});
~~~

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

~~~bash
npx vitest run tests/unit/card-preview-dialog.test.tsx
~~~

Expected: FAIL because `CardPreviewDialog` does not exist.

- [ ] **Step 3: Implement the dialog with the existing modal accessibility pattern**

Create `src/components/card-builder/CardPreviewDialog.tsx` with these props and behaviors:

~~~tsx
"use client";

import { useEffect, useRef } from "react";

import type { CardDesignPreview } from "@/lib/card-design";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export function CardPreviewDialog({
  file,
  onChooseAnother,
  onClose,
  onOrder,
  orderingComingSoon,
}: {
  file: CardDesignPreview;
  onChooseAnother: () => void;
  onClose: () => void;
  onOrder: () => void;
  orderingComingSoon: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || dialog === null) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-tapit-ink/70 px-5 py-8">
      <div
        aria-labelledby="card-preview-title"
        aria-modal="true"
        className="w-full max-w-md rounded-tapit border border-tapit-line bg-tapit-surface p-6 shadow-[0_24px_80px_rgba(21,25,24,0.24)]"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex justify-end">
          <Button aria-label="Close card preview" onClick={onClose} type="button" variant="quiet">
            ×
          </Button>
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-tapit-ink" id="card-preview-title">
            Looks good?
          </h2>
          <div className="mt-5 rounded-tapit bg-tapit-paper p-5">
            <img
              alt={"Preview of " + file.name}
              className="mx-auto max-h-56 w-auto max-w-full rounded-[10px] object-contain shadow-[0_16px_28px_rgba(21,25,24,0.2)]"
              src={file.url}
            />
          </div>
          <p className="mt-3 text-xs text-tapit-muted">{file.name} · local preview only</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button onClick={onOrder} type="button">
              Order a card now <span aria-hidden="true">→</span>
            </Button>
            <Button onClick={onChooseAnother} type="button" variant="secondary">
              Choose another design
            </Button>
          </div>
          {orderingComingSoon ? (
            <div className="mt-4">
              <Notice tone="neutral">Ordering is coming soon.</Notice>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
~~~

Keep the popup open on the order-coming-soon state. The close control and choosing another design remain available. Do not close on backdrop clicks; this prevents an accidental click from discarding the local preview.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

~~~bash
npx vitest run tests/unit/card-preview-dialog.test.tsx
~~~

Expected: 3 tests pass in the `unit` project.

- [ ] **Step 5: Commit the dialog**

~~~bash
git add src/components/card-builder/CardPreviewDialog.tsx tests/unit/card-preview-dialog.test.tsx
git commit -m "feat: add build card preview dialog"
~~~

### Task 3: Add the public chooser, local preview state, and auth-aware actions

**Files:**

- Create: `src/components/card-builder/BuildCardExperience.tsx`
- Create: `src/app/build-card/page.tsx`
- Test: `tests/unit/build-card.test.tsx`

- [ ] **Step 1: Write the failing chooser-flow tests**

Create `tests/unit/build-card.test.tsx`. Test the props-driven workspace so the behavior is isolated from live Convex and local-demo providers:

~~~tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BUILD_CARD_CANVA_URL,
  BuildCardWorkspace,
} from "@/components/card-builder/BuildCardExperience";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("BuildCardWorkspace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    push.mockReset();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:card-preview"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("renders both approved entry actions and the Canva template link", () => {
    render(<BuildCardWorkspace authLoading={false} isAuthenticated={false} />);

    expect(screen.getByRole("heading", { name: "Bring your card to life" })).toBeVisible();
    expect(screen.getByText("Coming soon")).toBeVisible();
    expect(screen.getByRole("link", { name: /Build your own with Canva/i })).toHaveAttribute(
      "href",
      BUILD_CARD_CANVA_URL,
    );
    expect(screen.getByRole("link", { name: /Build your own with Canva/i })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: /Build your own with Canva/i })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.getByText("Upload your design")).toBeVisible();
    expect(screen.getByLabelText("Upload your design")).toHaveAttribute("type", "file");
  });

  it("rejects unsupported files without opening the preview", async () => {
    const user = userEvent.setup();
    render(<BuildCardWorkspace authLoading={false} isAuthenticated={false} />);

    await user.upload(
      screen.getByLabelText("Upload your design"),
      new File(["pdf"], "design.pdf", { type: "application/pdf" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Upload a PNG or JPG image.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the centered preview for a valid file", async () => {
    const user = userEvent.setup();
    render(<BuildCardWorkspace authLoading={false} isAuthenticated={false} />);

    await user.upload(
      screen.getByLabelText("Upload your design"),
      new File(["jpg"], "design.jpg", { type: "image/jpeg" }),
    );

    expect(screen.getByRole("dialog", { name: "Card design preview" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Preview of design.jpg" })).toHaveAttribute(
      "src",
      "blob:card-preview",
    );
  });

  it("clears the preview and object URL when another design is chosen", async () => {
    const user = userEvent.setup();
    render(<BuildCardWorkspace authLoading={false} isAuthenticated={false} />);

    await user.upload(
      screen.getByLabelText("Upload your design"),
      new File(["png"], "design.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: "Choose another design" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:card-preview");
  });

  it("redirects logged-out visitors to auth with the build-card return path", async () => {
    const user = userEvent.setup();
    render(<BuildCardWorkspace authLoading={false} isAuthenticated={false} />);

    await user.upload(
      screen.getByLabelText("Upload your design"),
      new File(["png"], "design.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: "Order a card now" }));

    expect(push).toHaveBeenCalledWith("/login?next=%2Fbuild-card");
  });

  it("shows the in-place coming-soon state for authenticated visitors", async () => {
    const user = userEvent.setup();
    render(<BuildCardWorkspace authLoading={false} isAuthenticated />);

    await user.upload(
      screen.getByLabelText("Upload your design"),
      new File(["png"], "design.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: "Order a card now" }));

    expect(screen.getByRole("status")).toHaveTextContent("Ordering is coming soon");
    expect(push).not.toHaveBeenCalled();
  });

  it("does not order while authentication is still loading", async () => {
    const user = userEvent.setup();
    render(<BuildCardWorkspace authLoading isAuthenticated={false} />);

    await user.upload(
      screen.getByLabelText("Upload your design"),
      new File(["png"], "design.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: "Order a card now" }));

    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText("Ordering is coming soon")).not.toBeInTheDocument();
  });
});
~~~

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

~~~bash
npx vitest run tests/unit/build-card.test.tsx
~~~

Expected: FAIL because the route experience and `BuildCardWorkspace` do not exist.

- [ ] **Step 3: Implement the public route entry**

Create `src/app/build-card/page.tsx` as a Server Component that only exposes the route:

~~~tsx
import { BuildCardExperience } from "@/components/card-builder/BuildCardExperience";

export default function BuildCardPage() {
  return <BuildCardExperience />;
}
~~~

- [ ] **Step 4: Implement the demo/live auth adapters and workspace state**

Create `src/components/card-builder/BuildCardExperience.tsx` with these exported constants and boundaries:

~~~tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ArrowUpRightIcon, UploadSimpleIcon } from "@phosphor-icons/react";

import { api } from "../../../convex/_generated/api";
import { CardPreviewDialog } from "@/components/card-builder/CardPreviewDialog";
import { Brand } from "@/components/layout/Brand";
import { Notice } from "@/components/ui/Notice";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { useDemoSession } from "@/lib/demo/store";
import {
  CARD_DESIGN_ACCEPT,
  validateCardDesignFile,
  type CardDesignPreview,
} from "@/lib/card-design";

export const BUILD_CARD_CANVA_URL = "https://canva.link/tapit-templates";

export function BuildCardExperience() {
  return isLocalDemoMode() ? <DemoBuildCardExperience /> : <LiveBuildCardExperience />;
}

function DemoBuildCardExperience() {
  const session = useDemoSession();
  return (
    <BuildCardWorkspace
      authLoading={false}
      isAuthenticated={session?.role === "customer"}
    />
  );
}

function LiveBuildCardExperience() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess, isAuthenticated ? {} : "skip");
  return (
    <BuildCardWorkspace
      authLoading={authLoading || (isAuthenticated && access === undefined)}
      isAuthenticated={access?.authenticated === true && access.role === "customer"}
    />
  );
}

export function BuildCardWorkspace({
  authLoading,
  isAuthenticated,
}: {
  authLoading: boolean;
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderingComingSoon, setOrderingComingSoon] = useState(false);
  const [preview, setPreview] = useState<CardDesignPreview | null>(null);

  useEffect(() => {
    return () => {
      if (preview !== null) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const clearPreview = useCallback(() => {
    setPreview(null);
    setOrderingComingSoon(false);
    setError(null);
    if (inputRef.current !== null) inputRef.current.value = "";
  }, []);

  function selectFile(event: import("react").ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    setError(null);
    if (file === null) return;
    const validationError = validateCardDesignFile(file);
    if (validationError !== null) {
      event.currentTarget.value = "";
      setError(validationError);
      return;
    }
    setPreview({
      name: file.name,
      size: file.size,
      url: URL.createObjectURL(file),
    });
    setOrderingComingSoon(false);
  }

  function orderCard() {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/login?next=" + encodeURIComponent("/build-card"));
      return;
    }
    setOrderingComingSoon(true);
  }

  return (
    <div className="min-h-[100dvh] bg-tapit-paper">
      <header className="border-b border-tapit-line/80 bg-tapit-surface/95">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between px-5 py-3 sm:px-8">
          <Brand showMark={false} />
          <Link className="text-sm font-semibold text-tapit-muted hover:text-tapit-ink" href="/login">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-5 pb-24 pt-12 sm:px-10 sm:pt-16">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
            Build card
          </p>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-medium tracking-[-0.055em] text-tapit-ink sm:text-6xl">
                Bring your card to life
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-tapit-muted">
                Choose how you would like to prepare your design. You can come back to this anytime.
              </p>
            </div>
            <span className="rounded-full border border-[#e5b4b1] bg-[#fff1f0] px-3 py-1.5 text-xs font-semibold tracking-[0.08em] text-tapit-danger uppercase">
              Coming soon
            </span>
          </div>
        </div>

        {error !== null ? (
          <div className="mt-7 max-w-2xl">
            <Notice tone="error">{error}</Notice>
          </div>
        ) : null}

        <div className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
          <a
            className="rounded-tapit border border-tapit-accent/40 bg-tapit-surface p-6 shadow-[0_18px_50px_rgba(21,25,24,0.05)] transition hover:-translate-y-px hover:border-tapit-accent"
            href={BUILD_CARD_CANVA_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="text-2xl text-tapit-accent" aria-hidden="true">✦</span>
            <span className="mt-5 block text-lg font-semibold text-tapit-ink">
              Build your own with Canva <ArrowUpRightIcon aria-hidden="true" className="ml-1 inline" size={18} />
            </span>
            <span className="mt-2 block text-sm leading-6 text-tapit-muted">
              Use the Tapit template and make it yours.
            </span>
          </a>
          <div className="rounded-tapit border border-tapit-line bg-tapit-surface p-6 shadow-[0_18px_50px_rgba(21,25,24,0.05)]">
            <UploadSimpleIcon aria-hidden="true" className="text-tapit-accent" size={28} weight="bold" />
            <p className="mt-5 text-lg font-semibold text-tapit-ink">Already got your design?</p>
            <p className="mt-2 text-sm leading-6 text-tapit-muted">
              Upload a PNG or JPG for a quick preview.
            </p>
            <label className="mt-5 inline-flex cursor-pointer">
              <span className="inline-flex min-h-12 items-center justify-center rounded-tapit border border-tapit-line bg-tapit-surface px-4 py-2.5 text-sm font-semibold text-tapit-ink hover:border-tapit-accent hover:bg-tapit-paper">
                Upload your design
              </span>
              <input
                accept={CARD_DESIGN_ACCEPT}
                aria-describedby="card-design-help"
                aria-label="Upload your design"
                className="sr-only"
                onChange={selectFile}
                ref={inputRef}
                type="file"
              />
            </label>
            <p className="mt-3 text-xs text-tapit-muted" id="card-design-help">
              PNG or JPG, up to 10 MB. Preview stays in this browser only.
            </p>
          </div>
        </div>
      </main>
      {preview !== null ? (
        <CardPreviewDialog
          file={preview}
          onChooseAnother={clearPreview}
          onClose={clearPreview}
          onOrder={orderCard}
          orderingComingSoon={orderingComingSoon}
        />
      ) : null}
    </div>
  );
}
~~~

Keep `BuildCardExperience` split into demo/live wrappers because local demo mode does not mount a Convex provider. The props-driven `BuildCardWorkspace` must remain independently renderable in unit tests. The object-URL cleanup effect must revoke the previous URL when the preview changes or unmounts; `clearPreview` resets the input so selecting the same file again fires `onChange`.

- [ ] **Step 5: Run the focused chooser tests and verify they pass**

Run:

~~~bash
npx vitest run tests/unit/build-card.test.tsx
~~~

Expected: 7 tests pass in the `unit` project.

- [ ] **Step 6: Commit the public build-card flow**

~~~bash
git add src/app/build-card/page.tsx src/components/card-builder/BuildCardExperience.tsx tests/unit/build-card.test.tsx
git commit -m "feat: add public build card flow"
~~~

### Task 4: Add the customer-workspace navigation entry

**Files:**

- Modify: `src/components/layout/CustomerShell.tsx`

- [ ] **Step 1: Add Build card to the existing customer navigation**

Update the existing `customerNav` array by inserting the new item between Links and Analytics:

~~~tsx
const customerNav: ShellNavItem[] = [
  { href: "/app/profile", label: "Profile" },
  { href: "/app/links", label: "Links" },
  { href: "/build-card", label: "Build card" },
  { href: "/app/analytics", label: "Analytics" },
  { href: "/app/account", label: "Account" },
];
~~~

Do not put `/build-card` under `/app`; the route must remain public so logged-out visitors can try it before auth.

- [ ] **Step 2: Run the existing layout and build-card tests**

Run:

~~~bash
npx vitest run tests/unit/draft-save-context.test.tsx tests/unit/build-card.test.tsx
~~~

Expected: all selected tests pass, with no navigation regressions.

- [ ] **Step 3: Commit the navigation entry**

~~~bash
git add src/components/layout/CustomerShell.tsx
git commit -m "feat: add build card workspace navigation"
~~~

### Task 5: Run formatting, static checks, and production verification

**Files:**

- Verify: all files created or modified in Tasks 1–4.

- [ ] **Step 1: Run the formatter check**

Run:

~~~bash
npm run format:check
~~~

Expected: Prettier reports no changed files. If formatting fails, run `npm run format`, inspect the diff, and commit the formatting correction separately.

- [ ] **Step 2: Run lint and TypeScript checks**

Run:

~~~bash
npm run lint
npm run typecheck
~~~

Expected: both commands exit with code 0 and report no new diagnostics.

- [ ] **Step 3: Run targeted and full tests**

Run:

~~~bash
npx vitest run tests/unit/card-design.test.ts tests/unit/card-preview-dialog.test.tsx tests/unit/build-card.test.tsx
npm run test
~~~

Expected: the three targeted files and the full Vitest projects pass.

- [ ] **Step 4: Run the production build**

Run:

~~~bash
npm run build
~~~

Expected: Next.js produces a successful production build with `/build-card` included as a public route.

- [ ] **Step 5: Perform the browser verification**

Start the app with the repository’s development command and inspect `http://localhost:3000/build-card` at a desktop width and a narrow mobile width. Verify all of the following manually:

- Canva opens `https://canva.link/tapit-templates` in a new tab.
- The upload card opens the native file picker.
- A PNG and JPG display the centered popup with the exact order `Looks good?`, preview, `Order a card now →`, `Choose another design`.
- The popup stays within the viewport and the page behind it is dimmed.
- An unsupported file produces an alert without opening the popup.
- Close, Escape, and Choose another design remove the popup and allow the same file to be selected again.
- Logged-out Order routes to `/login?next=%2Fbuild-card`.
- An authenticated demo session shows `Ordering is coming soon` in place.
- Keyboard focus is visible and there is no horizontal overflow on mobile.

- [ ] **Step 6: Commit the verified implementation**

~~~bash
git status --short
git log --oneline --decorate -6
git commit --allow-empty -m "test: verify build card flow"
~~~

Expected: the branch contains the design commit, the focused implementation commits, and a final verification commit; `.superpowers/` remains untracked and is not included.

## Self-review checklist

- Spec coverage: Tasks 1–3 cover the public route, Canva URL, local PNG/JPG preview, 10 MiB validation, centered popup order, object-URL cleanup, auth redirect, and authenticated coming-soon state. Task 4 covers customer navigation. Task 5 covers accessibility, responsive behavior, and verification.
- Type consistency: `CardDesignPreview` is defined in `src/lib/card-design.ts` and is consumed by both `BuildCardExperience.tsx` and `CardPreviewDialog.tsx`. `BuildCardWorkspace` receives only `authLoading` and `isAuthenticated`, matching every test render.
- Scope: No task changes Convex schema/storage, checkout, pricing links, global CSS, dependencies, or assets.
- Next.js compatibility: the route uses a server `page.tsx` and keeps browser APIs inside a `"use client"` component.
