import { describe, expect, it } from "vitest";

import { normalizeClaimCode } from "../../src/lib/auth/claim-code";

describe("claim codes", () => {
  it("normalizes surrounding whitespace and case", () => {
    expect(normalizeClaimCode("  abcd2345 ")).toBe("ABCD2345");
  });

  it("rejects malformed codes", () => {
    expect(normalizeClaimCode("ABC123")).toBeNull();
    expect(normalizeClaimCode("ABC12345!")).toBeNull();
    expect(normalizeClaimCode("ABCDEFG0")).toBeNull();
  });
});
