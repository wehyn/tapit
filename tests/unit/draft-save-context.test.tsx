import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceChrome } from "@/components/layout/WorkspaceNav";
import {
  DraftSaveProvider,
  useDraftSave,
  useDraftSaveRegistration,
  type DraftSaveHandler,
  type DraftSaveOutcome,
} from "@/components/layout/DraftSaveContext";

const push = vi.fn();
const usePathname = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
  useRouter: () => ({ push }),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      {...props}
      href={typeof href === "string" && href.startsWith("http") ? "#" : href}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

beforeEach(() => {
  push.mockClear();
  usePathname.mockReturnValue("/app/profile");
});

function SaveButton({ handler }: { handler: DraftSaveHandler | null }) {
  useDraftSaveRegistration(handler);
  const save = useDraftSave();
  return (
    <button onClick={() => void save()} type="button">
      Save
    </button>
  );
}

describe("DraftSaveProvider", () => {
  it("does not let a stale unregister clear the latest handler", async () => {
    const first = vi.fn<DraftSaveHandler>(async () => ({ kind: "saved" }));
    const second = vi.fn<DraftSaveHandler>(async () => ({ kind: "saved" }));

    function Harness() {
      const [showFirst, setShowFirst] = useState(true);
      return (
        <DraftSaveProvider>
          {showFirst ? <SaveButton handler={first} key="first" /> : null}
          <SaveButton handler={second} key="second" />
          <button onClick={() => setShowFirst(false)} type="button">
            Remove first
          </button>
        </DraftSaveProvider>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Remove first" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(second).toHaveBeenCalledOnce());
    expect(first).not.toHaveBeenCalled();
  });
});

function sidebarLink(name: string) {
  return within(screen.getByTestId("workspace-sidebar")).getByRole("link", { name });
}

function TestShell({
  beforeNavigate,
  children,
}: {
  beforeNavigate?: (href: string) => Promise<boolean>;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceChrome
      audience="customer"
      beforeNavigate={beforeNavigate}
      email="mara@example.test"
      live={null}
      onSignOut={async () => undefined}
      showAudienceSwitch={false}
    >
      {children}
    </WorkspaceChrome>
  );
}

describe("workspace navigation draft handling", () => {
  it("marks the matching destination as the current page", () => {
    usePathname.mockReturnValue("/app/card");

    render(<TestShell>Content</TestShell>);

    expect(screen.getByRole("link", { name: "Cards" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Analytics" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("waits for a successful save before routing", async () => {
    let resolveSave!: (value: DraftSaveOutcome) => void;
    const save = vi.fn(
      () =>
        new Promise<DraftSaveOutcome>((resolve) => {
          resolveSave = resolve;
        }),
    );

    render(
      <DraftSaveProvider>
        <SaveButton handler={save} />
        <TestShell beforeNavigate={async () => saveAndAllowNavigation(save)}>Content</TestShell>
      </DraftSaveProvider>,
    );

    fireEvent.click(sidebarLink("Links"));
    expect(push).not.toHaveBeenCalled();
    resolveSave({ kind: "saved" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/links"));
  });

  it("waits for a successful save before routing from Profile to Customize", async () => {
    let resolveSave!: (value: DraftSaveOutcome) => void;
    const save = vi.fn(
      () =>
        new Promise<DraftSaveOutcome>((resolve) => {
          resolveSave = resolve;
        }),
    );
    function GuardedShell() {
      const saveDraft = useDraftSave();
      return (
        <TestShell beforeNavigate={async (href) => (await saveDraft(href)).kind === "saved"}>
          Content
        </TestShell>
      );
    }

    render(
      <DraftSaveProvider>
        <SaveButton handler={save} />
        <GuardedShell />
      </DraftSaveProvider>,
    );

    fireEvent.click(sidebarLink("Customize"));
    expect(push).not.toHaveBeenCalled();
    resolveSave({ kind: "saved" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/customize"));
  });

  it("cancels routing when saving fails", async () => {
    const save = vi.fn(async (): Promise<DraftSaveOutcome> => ({
      kind: "failed",
      message: "Nope",
    }));

    render(
      <DraftSaveProvider>
        <SaveButton handler={save} />
        <TestShell beforeNavigate={async () => saveAndAllowNavigation(save)}>Content</TestShell>
      </DraftSaveProvider>,
    );

    fireEvent.click(sidebarLink("Links"));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(push).not.toHaveBeenCalled();
  });

  it("lets the browser handle modified clicks without flushing drafts", () => {
    const beforeNavigate = vi.fn(async () => true);

    render(<TestShell beforeNavigate={beforeNavigate}>Content</TestShell>);

    fireEvent.click(sidebarLink("Links"), { metaKey: true });
    expect(beforeNavigate).not.toHaveBeenCalled();
  });

  it("does not flush drafts for external destinations", () => {
    const beforeNavigate = vi.fn(async () => true);

    render(<TestShell beforeNavigate={beforeNavigate}>Content</TestShell>);

    fireEvent.click(
      within(screen.getByTestId("workspace-sidebar")).getByRole("button", {
        name: /^Account menu for /,
      }),
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: "Account options" })).getByRole("link", {
        name: "Help",
      }),
    );
    expect(beforeNavigate).not.toHaveBeenCalled();
  });

  it("does not flush drafts when another handler already prevented the click", () => {
    const beforeNavigate = vi.fn(async () => true);

    render(
      <div onClickCapture={(event) => event.preventDefault()}>
        <TestShell beforeNavigate={beforeNavigate}>Content</TestShell>
      </div>,
    );

    fireEvent.click(sidebarLink("Links"));
    expect(beforeNavigate).not.toHaveBeenCalled();
  });
});

function saveAndAllowNavigation(save: DraftSaveHandler): Promise<boolean> {
  return save().then((outcome) => outcome.kind === "saved");
}
