import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const convexHooks = vi.hoisted(() => ({
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

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  convexHooks.usePaginatedQuery.mockReturnValue({
    results: [],
    status: "CanLoadMore",
    loadMore: vi.fn(),
  });
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
    convexHooks.useQuery.mockReturnValueOnce([profile]).mockReturnValueOnce([]);

    render(<AdminAnalytics />);

    expect(
      screen.getByText("Analytics totals are partial while the complete range loads."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No aggregate activity in this range.")).not.toBeInTheDocument();
  });
});
