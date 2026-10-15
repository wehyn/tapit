import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const convexHooks = vi.hoisted(() => ({
  loadMore: vi.fn(),
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return { ...actual, ...convexHooks };
});

import { AdminAnalytics } from "@/components/admin/AdminAnalytics";
import { CustomerAnalytics } from "@/components/analytics/CustomerAnalytics";

const profile = {
  _id: "profiles:owner",
  _creationTime: 1,
  ownerId: "customers:owner",
  slug: "owner",
  status: "published" as const,
  draft: { name: "Owner", slug: "owner", links: [] },
};
const analyticsRow = {
  _id: "analytics:row",
  _creationTime: 1,
  profileId: "profiles:owner",
  eventType: "profile_view",
  bucketStart: 1,
  total: 1,
  uniqueCount: 1,
  source: "direct",
};

function analyticsPage(count: number) {
  return {
    results: Array.from({ length: count }, () => analyticsRow),
    status: "CanLoadMore",
    loadMore: convexHooks.loadMore,
  };
}

function queryName(query: unknown): string {
  return (query as { [key: symbol]: string | undefined })[Symbol.for("functionName")] ?? "";
}

function mockAdminPages(analyticsResultCounts: number[]) {
  let analyticsPageIndex = 0;
  convexHooks.usePaginatedQuery.mockImplementation((query: unknown) => {
    switch (queryName(query)) {
      case "analytics:allPage": {
        const pageIndex = Math.min(analyticsPageIndex, analyticsResultCounts.length - 1);
        analyticsPageIndex += 1;
        return analyticsPage(analyticsResultCounts[pageIndex] ?? 0);
      }
      case "profiles:adminListPaginated":
        return { results: [profile], status: "Exhausted", loadMore: vi.fn() };
      case "cards:adminListPaginated":
        return { results: [], status: "Exhausted", loadMore: vi.fn() };
      default:
        throw new Error(`Unexpected paginated query: ${queryName(query)}`);
    }
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  convexHooks.usePaginatedQuery.mockReturnValue({
    results: [],
    status: "CanLoadMore",
    loadMore: convexHooks.loadMore,
  });
  convexHooks.loadMore.mockReset();
  convexHooks.useQuery.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("live analytics pagination", () => {
  it("labels customer figures partial until the complete range is loaded", () => {
    convexHooks.useQuery.mockReturnValue(profile);

    render(<CustomerAnalytics />);

    expect(
      screen.getByText("Analytics totals are partial while the complete range loads."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No activity in this range yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Share your profile to start a trend.")).not.toBeInTheDocument();
  });

  it("labels administrator figures partial until the complete range is loaded", () => {
    mockAdminPages([50]);

    render(<AdminAnalytics />);

    expect(
      screen.getByText("Analytics totals are partial while the complete range loads."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No aggregate activity in this range.")).not.toBeInTheDocument();
  });

  it("loads a 1,000-row analytics window, then continues in 500-row pages", () => {
    convexHooks.useQuery.mockReturnValue(profile);
    convexHooks.usePaginatedQuery
      .mockReturnValueOnce(analyticsPage(50))
      .mockReturnValueOnce(analyticsPage(1_000));

    const { rerender } = render(<CustomerAnalytics />);
    expect(convexHooks.loadMore.mock.calls.map(([numItems]) => numItems)).toEqual([950]);

    rerender(<CustomerAnalytics />);
    expect(convexHooks.loadMore.mock.calls.map(([numItems]) => numItems)).toEqual([950, 500]);
  });

  it("uses the same fast-start pagination window in administrator analytics", () => {
    mockAdminPages([50, 1_000]);

    const { rerender } = render(<AdminAnalytics />);
    expect(convexHooks.loadMore.mock.calls.map(([numItems]) => numItems)).toEqual([950]);

    rerender(<AdminAnalytics />);
    expect(convexHooks.loadMore.mock.calls.map(([numItems]) => numItems)).toEqual([950, 500]);
  });
});
