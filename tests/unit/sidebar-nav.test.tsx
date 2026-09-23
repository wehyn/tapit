import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { SidebarNav } from "@/components/layout/SidebarNav";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

const groups = [
  {
    label: "Workspace",
    items: [
      { href: "/app/profile", label: "Profile", icon: "user" as const },
      { href: "/app/links", label: "Links", icon: "link" as const },
    ],
  },
  {
    label: "Personal",
    items: [{ href: "/app/account", label: "Account", icon: "gear" as const }],
  },
];

function renderSidebar() {
  return render(
    <SidebarNav
      activeHref="/app/profile"
      eyebrow="Customer workspace"
      groups={groups}
      onNavigate={vi.fn()}
      sidebarFooter={<p>Signed in as test@example.com</p>}
      title="Workspace"
    />,
  );
}

describe("SidebarNav", () => {
  it("renders grouped navigation with one active destination and its footer", () => {
    renderSidebar();

    expect(screen.getAllByRole("navigation", { name: "Workspace navigation" })).toHaveLength(1);
    expect(screen.getByText("Workspace")).toBeVisible();
    expect(screen.getByText("Personal")).toBeVisible();
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Links" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Account" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Signed in as test@example.com")).toBeVisible();
  });

  it("opens and closes the mobile drawer", () => {
    renderSidebar();

    const toggle = screen.getByRole("button", { name: "Open navigation" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("navigation", { name: "Workspace navigation" })).toHaveLength(2);
    const closeButtons = screen.getAllByRole("button", { name: "Close navigation" });
    fireEvent.click(closeButtons[1]!);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape and returns focus to the opener", () => {
    renderSidebar();

    const toggle = screen.getByRole("button", { name: "Open navigation" });
    toggle.focus();
    fireEvent.click(toggle);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("moves focus into the drawer and contains keyboard navigation", async () => {
    renderSidebar();

    const toggle = screen.getByRole("button", { name: "Open navigation" });
    toggle.focus();
    fireEvent.click(toggle);
    const drawer = document.getElementById("authenticated-navigation-drawer");
    expect(drawer).not.toBeNull();
    const drawerElement = drawer as HTMLElement;
    const closeButtons = within(drawerElement).getAllByRole("button", {
      name: "Close navigation",
    });
    const closeButton = closeButtons[1]!;
    const firstFocusable = within(drawerElement).getByRole("link", { name: "Tapit home" });
    const drawerLinks = within(drawerElement).getAllByRole("link");
    const lastFocusable = drawerLinks[drawerLinks.length - 1]!;

    await waitFor(() => expect(closeButton).toHaveFocus());
    firstFocusable.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(lastFocusable).toHaveFocus();
    lastFocusable.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(firstFocusable).toHaveFocus();
  });

  it("keeps the drawer open for backdrop, modified, and external navigation rules", () => {
    const onNavigate = vi.fn();
    render(
      <SidebarNav
        activeHref="/app/profile"
        eyebrow="Customer workspace"
        groups={[
          ...groups,
          {
            label: "External",
            items: [{ href: "https://example.com", label: "External", icon: "link" as const }],
          },
        ]}
        onNavigate={onNavigate}
        title="Workspace"
      />,
    );

    const toggle = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(toggle);
    const drawer = document.getElementById("authenticated-navigation-drawer") as HTMLElement;
    fireEvent.click(within(drawer).getByRole("link", { name: "Links" }), { metaKey: true });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(within(drawer).getByRole("link", { name: "External" }));
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getAllByRole("button", { name: "Close navigation" })[0]!);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("passes the original event and destination to onNavigate", () => {
    const onNavigate = vi.fn();
    render(
      <SidebarNav
        activeHref="/app/profile"
        eyebrow="Customer workspace"
        groups={groups}
        onNavigate={onNavigate}
        title="Workspace"
      />,
    );

    const link = screen.getByRole("link", { name: "Links" });
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith(expect.anything(), "/app/links");
  });

  it("closes after a guarded internal navigation click", () => {
    const onNavigate = vi.fn((event: ReactMouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
    });

    render(
      <SidebarNav
        activeHref="/app/profile"
        eyebrow="Customer workspace"
        groups={groups}
        onNavigate={onNavigate}
        title="Workspace"
      />,
    );

    const toggle = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(toggle);
    const drawer = document.getElementById("authenticated-navigation-drawer");
    expect(drawer).not.toBeNull();
    fireEvent.click(within(drawer as HTMLElement).getByRole("link", { name: "Links" }));

    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
