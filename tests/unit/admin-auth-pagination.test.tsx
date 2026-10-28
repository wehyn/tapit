import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const convexHooks = vi.hoisted(() => ({
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
  useQuery_experimental: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return { ...actual, ...convexHooks };
});

import { CustomersManager } from "@/components/admin/CustomersManager";
import { CardsManager } from "@/components/admin/CardsManager";
import { getDemoState, resetDemoState } from "@/lib/demo/store";

const customer = {
  _id: "customers:1",
  _creationTime: 1,
  email: "first@example.test",
  role: "customer" as const,
  status: "active" as const,
  deletionStatus: "active" as const,
  createdAt: 1,
  updatedAt: 1,
};

function queryName(query: unknown): string {
  return (query as { [key: symbol]: string | undefined })[Symbol.for("functionName")] ?? "";
}

function mockOwnerOverride(updateOverride: ReturnType<typeof vi.fn>) {
  convexHooks.useMutation.mockImplementation((mutation: unknown) =>
    queryName(mutation) === "customers:setCardOwnerAccessOverride" ? updateOverride : vi.fn(),
  );
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "convex");
  convexHooks.useMutation.mockReset().mockReturnValue(vi.fn());
  convexHooks.useQuery.mockReset();
  convexHooks.useQuery_experimental.mockReset().mockReturnValue({ status: "success", data: false });
  convexHooks.usePaginatedQuery.mockReset();
});

describe("paginated administrator account lists", () => {
  it("grants the owner access override with the selected customer ID", () => {
    const updateOverride = vi.fn();
    mockOwnerOverride(updateOverride);
    convexHooks.usePaginatedQuery
      .mockReturnValueOnce({
        results: [{ ...customer, cardOwnerAccessOverride: false }],
        status: "Exhausted",
        loadMore: vi.fn(),
      })
      .mockReturnValueOnce({ results: [], status: "Exhausted", loadMore: vi.fn() })
      .mockReturnValueOnce({ results: [], status: "Exhausted", loadMore: vi.fn() })
      .mockReturnValue({ results: [], status: "Exhausted", loadMore: vi.fn() });

    render(<CustomersManager />);
    fireEvent.click(screen.getByRole("button", { name: "Grant owner access" }));
    const dialog = screen.getByRole("dialog", { name: "Grant owner access?" });
    expect(dialog).toHaveTextContent("first@example.test");
    expect(dialog).toHaveTextContent("does not record a card claim");
    fireEvent.click(within(dialog).getByRole("button", { name: "Grant access" }));
    expect(updateOverride).toHaveBeenCalledWith({ customerId: "customers:1", enabled: true });
  });

  it("revokes the owner access override with the selected customer ID", () => {
    const updateOverride = vi.fn();
    mockOwnerOverride(updateOverride);
    convexHooks.usePaginatedQuery
      .mockReturnValueOnce({
        results: [{ ...customer, cardOwnerAccessOverride: true }],
        status: "Exhausted",
        loadMore: vi.fn(),
      })
      .mockReturnValueOnce({ results: [], status: "Exhausted", loadMore: vi.fn() })
      .mockReturnValueOnce({ results: [], status: "Exhausted", loadMore: vi.fn() })
      .mockReturnValue({ results: [], status: "Exhausted", loadMore: vi.fn() });

    render(<CustomersManager />);
    fireEvent.click(screen.getByRole("button", { name: "Revoke owner access" }));
    const dialog = screen.getByRole("dialog", { name: "Revoke owner access?" });
    expect(dialog).toHaveTextContent("first@example.test");
    expect(dialog).toHaveTextContent("successfully claimed card remains");
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke access" }));
    expect(updateOverride).toHaveBeenCalledWith({ customerId: "customers:1", enabled: false });
  });

  it("does not call the owner access mutation when confirmation is cancelled", () => {
    const updateOverride = vi.fn();
    mockOwnerOverride(updateOverride);
    convexHooks.usePaginatedQuery
      .mockReturnValueOnce({
        results: [{ ...customer, cardOwnerAccessOverride: false }],
        status: "Exhausted",
        loadMore: vi.fn(),
      })
      .mockReturnValueOnce({ results: [], status: "Exhausted", loadMore: vi.fn() })
      .mockReturnValueOnce({ results: [], status: "Exhausted", loadMore: vi.fn() })
      .mockReturnValue({ results: [], status: "Exhausted", loadMore: vi.fn() });

    render(<CustomersManager />);
    fireEvent.click(screen.getByRole("button", { name: "Grant owner access" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Grant owner access?" })).getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(updateOverride).not.toHaveBeenCalled();
  });

  it("shows an error when the owner access mutation is rejected", async () => {
    const updateOverride = vi.fn().mockRejectedValue(new Error("Override failed"));
    mockOwnerOverride(updateOverride);
    convexHooks.usePaginatedQuery
      .mockReturnValueOnce({
        results: [{ ...customer, cardOwnerAccessOverride: false }],
        status: "Exhausted",
        loadMore: vi.fn(),
      })
      .mockReturnValueOnce({ results: [], status: "Exhausted", loadMore: vi.fn() })
      .mockReturnValueOnce({ results: [], status: "Exhausted", loadMore: vi.fn() })
      .mockReturnValue({ results: [], status: "Exhausted", loadMore: vi.fn() });

    render(<CustomersManager />);
    fireEvent.click(screen.getByRole("button", { name: "Grant owner access" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Grant owner access?" })).getByRole("button", {
        name: "Grant access",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Override failed");
    expect(updateOverride).toHaveBeenCalledWith({ customerId: "customers:1", enabled: true });
  });

  it("shows a local storage error without changing the override or audit log", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    resetDemoState();
    const before = getDemoState();
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === "tapit:demo-state:v1")
        throw new DOMException("Storage is blocked", "QuotaExceededError");
      return originalSetItem.call(this, key, value);
    });

    render(<CustomersManager />);
    fireEvent.click(screen.getByRole("button", { name: "Grant owner access" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Grant owner access?" })).getByRole("button", {
        name: "Grant access",
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Could not save Tapit data locally");
    const after = getDemoState();
    expect(
      after.customers.find((account) => account.id === "customer-mara")?.cardOwnerAccessOverride,
    ).toBe(
      before.customers.find((account) => account.id === "customer-mara")?.cardOwnerAccessOverride,
    );
    expect(after.audits).toEqual(before.audits);
  });

  it("lets administrators load the next customer-account page", async () => {
    const loadMore = vi.fn();
    convexHooks.usePaginatedQuery
      .mockReturnValueOnce({ results: [customer], status: "CanLoadMore", loadMore })
      .mockReturnValueOnce({ results: [], status: "Exhausted", loadMore: vi.fn() })
      .mockReturnValueOnce({ results: [], status: "Exhausted", loadMore: vi.fn() });

    render(<CustomersManager />);

    expect(screen.getByText("first@example.test")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more accounts" }));
    expect(loadMore).toHaveBeenCalledWith(50);
  });

  it("requires staged customer to Demo to administrator promotion", async () => {
    const promoteToDemo = vi.fn().mockResolvedValue(null);
    const setRole = vi.fn().mockResolvedValue(null);
    convexHooks.useMutation.mockImplementation((mutation: unknown) => {
      if (queryName(mutation) === "customers:promoteToDemo") return promoteToDemo;
      if (queryName(mutation) === "customers:setRole") return setRole;
      return vi.fn();
    });
    convexHooks.usePaginatedQuery.mockImplementation((query: unknown) =>
      queryName(query) === "customers:list"
        ? { results: [customer], status: "Exhausted", loadMore: vi.fn() }
        : { results: [], status: "Exhausted", loadMore: vi.fn() },
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    const { unmount } = render(<CustomersManager />);
    expect(screen.getByRole("button", { name: "Promote to Demo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Promote to Administrator" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Promote to Demo" }));
    expect(await screen.findByText("Customer promoted to Demo.")).toBeInTheDocument();
    expect(promoteToDemo).toHaveBeenCalledWith({ customerId: "customers:1" });
    expect(setRole).not.toHaveBeenCalled();
    unmount();

    convexHooks.usePaginatedQuery.mockImplementation((query: unknown) =>
      queryName(query) === "customers:list"
        ? {
            results: [{ ...customer, isDemo: true }],
            status: "Exhausted",
            loadMore: vi.fn(),
          }
        : { results: [], status: "Exhausted", loadMore: vi.fn() },
    );
    render(<CustomersManager />);
    expect(screen.getByRole("button", { name: "Promote to Administrator" })).toBeInTheDocument();
    expect(screen.getByText(/customer · demo/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Promote to Demo" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Promote to Administrator" }));
    expect(await screen.findByText("Role updated to administrator.")).toBeInTheDocument();
    expect(setRole).toHaveBeenCalledWith({ customerId: "customers:1", role: "admin" });
    confirm.mockRestore();
  });

  it("shows the invitation's server-generated profile name and slug", () => {
    convexHooks.usePaginatedQuery
      .mockReturnValueOnce({
        results: [{ ...customer, status: "invited" }],
        status: "Exhausted",
        loadMore: vi.fn(),
      })
      .mockReturnValueOnce({ results: [], status: "Exhausted", loadMore: vi.fn() })
      .mockReturnValueOnce({
        results: [
          {
            invitationId: "invitations:1",
            customerId: "customers:1",
            email: "first@example.test",
            profileName: "First Example",
            slug: "first-example-2",
            expiresAt: null,
            acceptedAt: null,
            invalidatedAt: null,
          },
        ],
        status: "Exhausted",
        loadMore: vi.fn(),
      });

    render(<CustomersManager />);

    expect(screen.getByText("Profile: First Example · /first-example-2")).toBeInTheDocument();
  });

  it("lets card assignment search through customers beyond the first page", async () => {
    const loadMoreCustomers = vi.fn();
    convexHooks.usePaginatedQuery.mockImplementation((query: unknown) => {
      switch (queryName(query)) {
        case "cards:adminListPaginated":
        case "profiles:adminListPaginated":
          return { results: [], status: "Exhausted", loadMore: vi.fn() };
        case "customers:list":
          return { results: [customer], status: "CanLoadMore", loadMore: loadMoreCustomers };
        default:
          throw new Error(`Unexpected paginated query: ${queryName(query)}`);
      }
    });

    render(<CardsManager />);

    fireEvent.click(screen.getByRole("button", { name: "Load more customers" }));
    expect(loadMoreCustomers).toHaveBeenCalledWith(50);
  });
});
