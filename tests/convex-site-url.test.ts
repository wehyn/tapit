import { describe, expect, it } from "vitest";

import { requirePairedConvexSiteUrl } from "../src/lib/convex-site-url";

describe("profile upload endpoint configuration", () => {
  it("accepts a site URL paired with the live Convex cloud deployment", () => {
    expect(
      requirePairedConvexSiteUrl(
        "https://preview-123.convex.cloud",
        "https://preview-123.convex.site/",
      ),
    ).toBe("https://preview-123.convex.site");
  });

  it("rejects a site URL from another deployment", () => {
    expect(() =>
      requirePairedConvexSiteUrl(
        "https://preview-123.convex.cloud",
        "https://production-456.convex.site",
      ),
    ).toThrow("Convex site URL does not match the configured deployment");
  });

  it("rejects a nonstandard site port", () => {
    expect(() =>
      requirePairedConvexSiteUrl(
        "https://preview-123.convex.cloud",
        "https://preview-123.convex.site:8443",
      ),
    ).toThrow("Convex site URL does not match the configured deployment");
  });
});
