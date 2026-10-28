import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CopyButton } from "@/components/admin/prepared/CopyButton";
import { filterPreparedRows, actionsForRow } from "@/components/admin/prepared/selectors";
import { PreparedWorkspace } from "@/components/admin/prepared/PreparedCustomers";
import type { PreparedAccounts } from "@/components/admin/prepared/use-prepared-accounts";
import type { PreparedRow } from "@/components/admin/prepared/types";
import { createPrepared, listCustomers, setupPreview, updateDemoState } from "@/lib/demo/store";
import { createDefaultDemoState } from "@/lib/demo/fixtures";
import { LegacyCustomersManager } from "@/components/admin/prepared/legacy/LegacyCustomersManager";

const records = [
  {
    id: "w",
    email: "",
    profileName: "Waiting User",
    profileSlug: "waiting-user",
    setupState: "waiting",
    kind: "prepared",
    linkExpiresAt: Date.now() + 86_400_000,
    invitationId: "i",
  },
  {
    id: "d",
    email: "",
    profileName: "Draft User",
    profileSlug: "draft-user",
    setupState: "draft",
    kind: "prepared",
    linkExpiresAt: null,
  },
  {
    id: "a",
    email: "active@example.com",
    profileName: "Active User",
    profileSlug: "active-user",
    setupState: "active",
    kind: "active",
    linkExpiresAt: null,
    role: "customer",
    status: "active",
    deletionStatus: "active",
    profileStatus: "published",
    cardCount: 2,
    hasDeletionRequest: true,
    legacyInvitationActive: true,
  },
  {
    id: "legacy",
    email: "deleted@example.com",
    profileName: "Deleted Customer",
    profileSlug: "deleted-customer",
    setupState: null,
    kind: "legacy",
    linkExpiresAt: null,
    role: "customer",
    status: "deleted",
    deletionStatus: "deleted",
    profileStatus: null,
    cardCount: 0,
  },
] satisfies [PreparedRow, PreparedRow, PreparedRow, PreparedRow];

function createPreparedAccounts(overrides: Partial<PreparedAccounts> = {}): PreparedAccounts {
  return {
    rows: records,
    loading: false,
    create: createPrepared,
    update: vi.fn(),
    generate: vi.fn(),
    revoke: vi.fn(),
    remove: vi.fn(),
    valuesFor: vi.fn(() => null),
    revokeLegacy: vi.fn(),
    replaceLegacy: vi.fn(async () => "replacement-token"),
    changeRole: vi.fn(),
    approveDeletion: vi.fn(),
    ...overrides,
  };
}

describe("prepared admin interactions", () => {
  it("offers lifecycle actions for prepared rows and legacy actions for active rows", () => {
    expect(actionsForRow(records[0])).toEqual(["Edit", "Regenerate link", "Revoke"]);
    expect(actionsForRow(records[1])).toEqual(["Edit", "Generate link", "Delete draft"]);
    expect(actionsForRow(records[2])).toContain("Promote to administrator");
  });

  it("filters by setup state and searches name, email, and slug", () => {
    expect(filterPreparedRows(records, "drafts", "").map((row) => row.id)).toEqual(["d"]);
    expect(filterPreparedRows(records, "active", "").map((row) => row.id)).toEqual(["a"]);
    expect(filterPreparedRows(records, "all", "").map((row) => row.id)).toContain("legacy");
    expect(filterPreparedRows(records, "drafts", "").map((row) => row.id)).not.toContain("legacy");
    expect(filterPreparedRows(records, "all", "ACTIVE@EXAMPLE").map((row) => row.id)).toEqual([
      "a",
    ]);
    expect(filterPreparedRows(records, "all", "waiting-user").map((row) => row.id)).toEqual(["w"]);
  });

  it("renders one searchable list containing active customers and their legacy actions", async () => {
    render(<PreparedWorkspace data={createPreparedAccounts()} />);
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(screen.getAllByText("Active User")).toHaveLength(1);
    expect(screen.getByText("Deleted Customer")).toBeInTheDocument();
    expect(screen.queryByText("Setup: Complete")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View profile" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View cards" })).toBeInTheDocument();
    await userEvent.click(screen.getByText("More actions"));
    expect(screen.getByRole("button", { name: "Promote to administrator" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve deletion" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Active$/ }));
    expect(screen.getByText("Active User")).toBeInTheDocument();
    expect(screen.queryByText("Waiting User")).not.toBeInTheDocument();
  });

  it("applies waiting, draft, all, and search to the shared list", async () => {
    render(<PreparedWorkspace data={createPreparedAccounts()} />);
    await userEvent.click(screen.getByRole("button", { name: "Waiting" }));
    expect(screen.getByText("Waiting User")).toBeInTheDocument();
    expect(screen.queryByText("Draft User")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Drafts" }));
    expect(screen.getByText("Draft User")).toBeInTheDocument();
    expect(screen.queryByText("Active User")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^All$/ }));
    await userEvent.type(screen.getByRole("searchbox"), "ACTIVE@EXAMPLE");
    expect(screen.getByText("Active User")).toBeInTheDocument();
    expect(screen.queryByText("Waiting User")).not.toBeInTheDocument();
  });

  it("marks each current wizard step and focuses its heading after navigation", async () => {
    render(<PreparedWorkspace data={createPreparedAccounts({ rows: [] })} />);
    await userEvent.click(screen.getByRole("button", { name: /Set up for someone/ }));

    const profileStep = screen.getByRole("button", { name: "1 Profile" });
    expect(profileStep).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("heading", { name: "Who is this profile for?" })).toHaveFocus();
    await userEvent.type(screen.getByLabelText("Display name"), "Demo Person");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    const contactStep = screen.getByRole("button", { name: "2 Contact" });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "How can people reach them?" })).toHaveFocus(),
    );
    expect(contactStep).toHaveAttribute("aria-current", "step");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    const linksStep = screen.getByRole("button", { name: "3 Links" });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Add links (optional)" })).toHaveFocus(),
    );
    expect(linksStep).toHaveAttribute("aria-current", "step");
    await userEvent.click(screen.getByRole("button", { name: "Continue to preview" }));
    const linksSummary = screen.getByRole("heading", { name: "Links" }).closest("section");
    await userEvent.click(within(linksSummary!).getByRole("button", { name: "Edit" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Add links (optional)" })).toHaveFocus(),
    );
    expect(screen.getByRole("button", { name: "3 Links" })).toHaveAttribute("aria-current", "step");
  });

  it("keeps the email invite form as a working secondary flow", async () => {
    updateDemoState(() => createDefaultDemoState());
    render(<LegacyCustomersManager />);
    await userEvent.click(screen.getByText("Invite an account by email"));
    await userEvent.type(screen.getByLabelText("Customer email"), "newperson@example.test");
    await userEvent.click(screen.getByRole("button", { name: "Create and invite" }));
    await waitFor(() =>
      expect(
        screen.getByText(/Customer account created for newperson@example.test/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /\/setup\/demo-/ })).toBeInTheDocument();
    expect(listCustomers().some((customer) => customer.email === "newperson@example.test")).toBe(
      true,
    );
  });

  it("shows confirmation copy and invokes the chosen confirm action", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete this draft?"
        description="This can't be undone."
        confirmLabel="Delete draft"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("This can't be undone.");
    await userEvent.click(screen.getByRole("button", { name: "Delete draft" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("copies the supplied link and reports completion", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<CopyButton text="https://tapit.com/setup/demo" label="Copy link" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied ✓" })).toBeInTheDocument(),
    );
    expect(writeText).toHaveBeenCalledWith("https://tapit.com/setup/demo");
  });

  it("creates through the deterministic demo store and reaches the handoff screen", async () => {
    updateDemoState(() => createDefaultDemoState());
    const data: PreparedAccounts = {
      rows: [],
      loading: false,
      create: createPrepared,
      update: vi.fn(),
      generate: vi.fn(),
      revoke: vi.fn(),
      remove: vi.fn(),
      valuesFor: vi.fn(() => null),
      revokeLegacy: vi.fn(),
      replaceLegacy: vi.fn(),
      changeRole: vi.fn(),
      approveDeletion: vi.fn(),
    };
    render(<PreparedWorkspace data={data} />);
    await userEvent.click(screen.getByRole("button", { name: /Set up for someone/ }));
    await userEvent.type(screen.getByLabelText("Display name"), "Demo Person");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue to preview" }));
    expect(screen.getByRole("heading", { name: "Preview before you create" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Account prepared" })).toBeInTheDocument(),
    );
    expect(screen.getAllByText(/\/setup\/demo-setup-1/)).toHaveLength(2);
    expect(listCustomers().find((row) => row.profileName === "Demo Person")).toMatchObject({
      setupState: "waiting",
      profileSlug: "demo-person",
    });
    await expect(setupPreview("demo-setup-1")).resolves.toMatchObject({
      name: "Demo Person",
      slug: "demo-person",
    });
  });
});
