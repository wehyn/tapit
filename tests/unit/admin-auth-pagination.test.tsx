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
  setupState: "active" as const,
  linkExpiresAt: null,
  profileName: "First Example",
  profileSlug: "first-example",
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
  it("includes active customer accounts in the one searchable customer list", async () => {
    convexHooks.useQuery_experimental.mockImplementation(
      (options: { query: unknown; args: { setupState?: string } }) => {
        if (queryName(options.query) === "customers:list") {
          return {
            status: "success",
            data: {
              page:
                options.args.setupState === "active" ? [{ ...customer, setupState: "active" }] : [],
            },
          };
        }
        return { status: "success", data: { page: [] } };
      },
    );

    render(<CustomersManager />);

    expect(screen.getByText("first@example.test")).toBeInTheDocument();
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(screen.getByText("First Example")).toBeInTheDocument();
    expect(screen.getByText("Active", { selector: "span" })).toBeInTheDocument();
  });

  it("shows the server-provided profile name and slug in its single legacy invite row", () => {
    convexHooks.useQuery_experimental.mockImplementation(
      (options: { query: unknown; args: { setupState?: string } }) => {
        if (queryName(options.query) === "customers:list") {
          return {
            status: "success",
            data: {
              page:
                options.args.setupState === "draft"
                  ? [{ ...customer, status: "invited", setupState: "draft" }]
                  : [],
            },
          };
        }
        if (queryName(options.query) === "invitations:listForAdmin")
          return {
            status: "success",
            data: {
              page: [
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
            },
          };
        return { status: "success", data: { page: [] } };
      },
    );

    render(<CustomersManager />);

    expect(screen.getByText("First Example")).toBeInTheDocument();
    expect(screen.getAllByText("first@example.test")).toHaveLength(1);
    expect(screen.queryByText("Profile: First Example · /first-example-2")).not.toBeInTheDocument();
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
