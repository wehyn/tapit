import { describe, expect, it } from "vitest";

import { aggregateAnalytics } from "../../src/lib/demo/store";

describe("demo aggregate analytics", () => {
  it("filters by profile and preserves link-level totals", () => {
    const now = Date.now();
    const result = aggregateAnalytics(
      [
        {
          profileId: "profile-a",
          bucketStart: now,
          views: 4,
          uniqueViews: 3,
          clicks: 2,
          linkClicks: { one: 2 },
        },
        {
          profileId: "profile-b",
          bucketStart: now,
          views: 9,
          uniqueViews: 7,
          clicks: 5,
          linkClicks: { one: 5 },
        },
      ],
      "lifetime",
      "profile-a",
    );
    expect(result).toEqual({ views: 4, uniqueViews: 3, clicks: 2, linkClicks: { one: 2 } });
  });

  it("supports a recent range without retaining visitor records", () => {
    const now = Date.now();
    const result = aggregateAnalytics(
      [
        {
          profileId: "profile-a",
          bucketStart: now - 2 * 24 * 60 * 60 * 1000,
          views: 2,
          uniqueViews: 2,
          clicks: 1,
          linkClicks: {},
        },
        {
          profileId: "profile-a",
          bucketStart: now - 20 * 24 * 60 * 60 * 1000,
          views: 8,
          uniqueViews: 5,
          clicks: 4,
          linkClicks: {},
        },
      ],
      "7d",
      "profile-a",
    );
    expect(result.views).toBe(2);
    expect(result.uniqueViews).toBe(2);
  });
});
