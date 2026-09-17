import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/AppShell";
import {
  DraftSaveProvider,
  useDraftSave,
  useDraftSaveRegistration,
  type DraftSaveHandler,
} from "@/components/layout/DraftSaveContext";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/profile",
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
    const first = vi.fn<DraftSaveHandler>(async () => true);
    const second = vi.fn<DraftSaveHandler>(async () => true);

    function Harness() {
      const [showFirst, setShowFirst] = useState(true);
      return (
        <DraftSaveProvider>
          {showFirst ? <SaveButton handler={first} /> : null}
          <SaveButton handler={second} />
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

describe("AppShell draft navigation", () => {
  it("waits for a successful save before routing", async () => {
    let resolveSave!: (value: boolean) => void;
    const save = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve;
        }),
    );

    render(
      <DraftSaveProvider>
        <SaveButton handler={save} />
        <AppShell
          beforeNavigate={async () => useSave(save)}
          eyebrow="Customer workspace"
          navItems={[{ href: "/app/links", label: "Links" }]}
          title="Workspace"
        >
          Content
        </AppShell>
      </DraftSaveProvider>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Links" }));
    expect(push).not.toHaveBeenCalled();
    resolveSave(true);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/links"));
  });

  it("cancels routing when saving fails", async () => {
    const save = vi.fn<DraftSaveHandler>(async () => false);

    render(
      <DraftSaveProvider>
        <AppShell
          beforeNavigate={async () => save()}
          eyebrow="Customer workspace"
          navItems={[{ href: "/app/links", label: "Links" }]}
          title="Workspace"
        >
          Content
        </AppShell>
      </DraftSaveProvider>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Links" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(push).not.toHaveBeenCalled();
  });

  it.each([
    ["modified click", { metaKey: true }],
    ["middle click", { button: 1 }],
  ])("does not flush drafts for a %s", async (_label, eventInit) => {
    const save = vi.fn<DraftSaveHandler>(async () => true);

    render(
      <AppShell
        beforeNavigate={async () => save()}
        eyebrow="Customer workspace"
        navItems={[{ href: "/app/links", label: "Links" }]}
        title="Workspace"
      >
        Content
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Links" }), eventInit);
    expect(save).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not flush drafts for external destinations", () => {
    const save = vi.fn<DraftSaveHandler>(async () => true);

    render(
      <AppShell
        beforeNavigate={async () => save()}
        eyebrow="Customer workspace"
        navItems={[{ href: "https://example.com", label: "External" }]}
        title="Workspace"
      >
        Content
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("link", { name: "External" }));
    expect(save).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not flush drafts when another handler already prevented the click", () => {
    const save = vi.fn<DraftSaveHandler>(async () => true);

    render(
      <div onClick={(event) => event.preventDefault()}>
        <AppShell
          beforeNavigate={async () => save()}
          eyebrow="Customer workspace"
          navItems={[{ href: "/app/links", label: "Links" }]}
          title="Workspace"
        >
          Content
        </AppShell>
      </div>,
    );

    const link = screen.getByRole("link", { name: "Links" });
    const event = createEvent.click(link);
    event.preventDefault();
    fireEvent(link, event);
    expect(save).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

function useSave(save: DraftSaveHandler): Promise<boolean> {
  return save();
}
