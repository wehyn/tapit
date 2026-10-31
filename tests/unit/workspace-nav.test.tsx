import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DraftSaveProvider,
  useDraftStatusReport,
  type DraftStatus,
} from "@/components/layout/DraftSaveContext";
import { WorkspaceChrome, type WorkspaceChromeProps } from "@/components/layout/WorkspaceNav";

const usePathname = vi.fn();
const push = vi.fn();
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
      href={href}
      onClick={(event) => {
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

beforeEach(() => {
  push.mockClear();
  usePathname.mockReturnValue("/app/profile");
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => vi.unstubAllGlobals());

function renderChrome(props: Partial<WorkspaceChromeProps> = {}, status?: DraftStatus) {
  function StatusReporter() {
    useDraftStatusReport(status ?? "saved");
    return null;
  }
  return render(
    <DraftSaveProvider>
      <StatusReporter />
      <WorkspaceChrome
        audience="customer"
        email="mara@example.test"
        live={{ slug: "mara-velasquez", published: true }}
        onSignOut={vi.fn(async () => undefined)}
        showAudienceSwitch={false}
        {...props}
      >
        <p>Page content</p>
      </WorkspaceChrome>
    </DraftSaveProvider>,
  );
}

describe("WorkspaceChrome sidebar", () => {
  it("shows customer groups and account menu links at desktop width", () => {
    renderChrome();

    const sidebar = screen.getByTestId("workspace-sidebar");
    const navigation = within(sidebar).getByRole("navigation", { name: "Customer navigation" });
    expect(within(navigation).getByRole("heading", { name: "Your profile" })).toBeInTheDocument();
    expect(within(navigation).getByRole("heading", { name: "Share & grow" })).toBeInTheDocument();
    expect(within(navigation).getByRole("heading", { name: "Account & help" })).toBeInTheDocument();
    for (const name of ["Profile", "Links", "Customize", "Cards", "Analytics"]) {
      expect(within(navigation).getByRole("link", { name })).toBeInTheDocument();
    }
    for (const name of ["Account", "Help"]) {
      expect(within(navigation).getByRole("link", { name })).toBeInTheDocument();
    }
    const accountMenu = within(sidebar).getByRole("button", {
      name: "Account menu for mara@example.test",
    });
    fireEvent.click(accountMenu);
    const accountOptions = within(sidebar).getByRole("group", { name: "Account options" });
    expect(within(accountOptions).getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/app/account",
    );
    expect(within(accountOptions).getByRole("link", { name: "Help" })).toBeInTheDocument();
  });

  it("keeps order access and account links visible for cardless customers", () => {
    renderChrome({ hasCardOwnerFeatures: false });

    const sidebar = screen.getByTestId("workspace-sidebar");
    const navigation = within(sidebar).getByRole("navigation", { name: "Customer navigation" });
    expect(within(navigation).getByRole("heading", { name: "Share & grow" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Cards" })).toHaveAttribute(
      "href",
      "/app/card",
    );
    expect(within(navigation).queryByRole("link", { name: "Analytics" })).not.toBeInTheDocument();
    for (const name of ["Account", "Help"]) {
      expect(within(navigation).getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("lets keyboard users tab from the account menu button into Account and Help", async () => {
    const user = userEvent.setup();
    renderChrome();

    const sidebar = screen.getByTestId("workspace-sidebar");
    const trigger = within(sidebar).getByRole("button", {
      name: "Account menu for mara@example.test",
    });
    trigger.focus();
    await user.keyboard("{Enter}");
    await user.tab();

    const accountOptions = within(sidebar).getByRole("group", { name: "Account options" });
    expect(within(accountOptions).getByRole("link", { name: "Account" })).toHaveFocus();
  });

  it("does not show a live status card in the sidebar", () => {
    renderChrome();

    const sidebar = screen.getByTestId("workspace-sidebar");
    expect(within(sidebar).queryByText("Live")).not.toBeInTheDocument();
    expect(
      within(sidebar).queryByRole("link", { name: "/mara-velasquez" }),
    ).not.toBeInTheDocument();
  });

  it("marks the current destination and shows it in the breadcrumb", () => {
    usePathname.mockReturnValue("/app/card");
    renderChrome();

    const sidebar = screen.getByTestId("workspace-sidebar");
    expect(within(sidebar).getByRole("link", { name: "Cards" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumb).getByRole("link", { name: "Workspace" })).toBeInTheDocument();
    expect(within(breadcrumb).getByText("Cards")).toHaveAttribute("aria-current", "page");
  });

  it("shows the audience switch only when the viewer is an admin", () => {
    const { unmount } = renderChrome({ showAudienceSwitch: true });
    const group = screen.getByRole("group", { name: "Workspace" });
    expect(within(group).getByRole("link", { name: "Customer" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(group).getByRole("link", { name: "Admin" })).toHaveAttribute(
      "href",
      "/admin/customers",
    );
    unmount();

    renderChrome({ showAudienceSwitch: false });
    expect(screen.queryByRole("group", { name: "Workspace" })).not.toBeInTheDocument();
  });

  it("renders the admin audience with its own groups and tabs", () => {
    usePathname.mockReturnValue("/admin/profiles");
    renderChrome({ audience: "admin", live: null, showAudienceSwitch: true });

    const navigation = screen.getByRole("navigation", { name: "Admin navigation" });
    expect(within(navigation).getByRole("heading", { name: "Operations" })).toBeInTheDocument();
    expect(within(navigation).getByRole("heading", { name: "Governance" })).toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Profiles" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(navigation).queryByRole("link", { name: "Links" })).not.toBeInTheDocument();

    const tabs = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(within(tabs).getByRole("link", { name: "Customers" })).toBeInTheDocument();
    expect(within(tabs).getByRole("button", { name: "More" })).toBeInTheDocument();
  });
});

describe("WorkspaceChrome mobile navigation", () => {
  it("shows four tabs with Stats for analytics and a More button", () => {
    renderChrome();

    const tabs = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(within(tabs).getByRole("link", { name: "Profile" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(tabs).getByRole("link", { name: "Links" })).toBeInTheDocument();
    expect(within(tabs).getByRole("link", { name: "Stats" })).toBeInTheDocument();
    expect(within(tabs).getByRole("button", { name: "More" })).toHaveAttribute(
      "aria-haspopup",
      "dialog",
    );
  });

  it("opens More as a dialog and closes it with Escape, returning focus to More", async () => {
    renderChrome();
    const more = screen.getByRole("button", { name: "More" });

    fireEvent.click(more);
    const dialog = screen.getByRole("dialog", { name: "More" });
    for (const name of ["Customize", "Cards", "Account", "Help"]) {
      expect(within(dialog).getByRole("link", { name })).toBeInTheDocument();
    }
    expect(within(dialog).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    await waitFor(() => expect(dialog).toHaveFocus());

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "More" })).not.toBeInTheDocument();
    await waitFor(() => expect(more).toHaveFocus());
  });

  it("signs out from the More sheet", async () => {
    const onSignOut = vi.fn(async () => undefined);
    renderChrome({ onSignOut });

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "More" })).getByRole("button", {
        name: "Sign out",
      }),
    );

    await waitFor(() => expect(onSignOut).toHaveBeenCalledOnce());
  });

  it("keeps the More sheet open and reports a failed sign-out", async () => {
    renderChrome({
      onSignOut: vi.fn(async () => {
        throw new Error("Your draft could not be saved. You are still signed in.");
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "More" })).getByRole("button", {
        name: "Sign out",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your draft could not be saved. You are still signed in.",
    );
    expect(screen.getByRole("dialog", { name: "More" })).toBeInTheDocument();
  });
});

describe("WorkspaceChrome save status", () => {
  it.each([
    ["saved", "All changes saved"],
    ["unsaved", "Unsaved changes"],
    ["saving", "Saving…"],
  ] as const)("shows the %s draft state in the top bar", (status, label) => {
    renderChrome({}, status);

    expect(screen.getByRole("status")).toHaveTextContent(label);
  });
});
