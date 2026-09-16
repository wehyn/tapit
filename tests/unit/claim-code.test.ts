import { describe, expect, it } from "vitest";

import {
  CLAIM_CODE_ALPHABET,
  generateClaimCode,
  normalizeClaimCode,
} from "../../src/lib/auth/claim-code";

describe("claim codes", () => {
  it("normalizes surrounding whitespace and case", () => {
    expect(normalizeClaimCode("  abcd2345 ")).toBe("ABCD2345");
  });

  it("rejects malformed codes", () => {
    expect(normalizeClaimCode("ABC123")).toBeNull();
    expect(normalizeClaimCode("ABC12345!")).toBeNull();
    expect(normalizeClaimCode("ABCDEFG0")).toBeNull();
  });

  it("generates deterministic eight-character codes from an injectable source", () => {
    const code = generateClaimCode(() => 0);
    expect(code).toBe(CLAIM_CODE_ALPHABET[0]!.repeat(8));
    expect(code).toHaveLength(8);
  });
});
