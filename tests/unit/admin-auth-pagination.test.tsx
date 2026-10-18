import { fireEvent, render, screen } from "@testing-library/react";
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

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "convex");
  convexHooks.useMutation.mockReset().mockReturnValue(vi.fn());
  convexHooks.useQuery.mockReset();
  convexHooks.useQuery_experimental.mockReset().mockReturnValue({ status: "success", data: false });
  convexHooks.usePaginatedQuery.mockReset();
});

describe("paginated administrator account lists", () => {
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
