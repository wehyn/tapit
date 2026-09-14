import { describe, expect, it } from "vitest";

import { sanitizeReturnPath } from "../../src/components/auth/LoginForm";
import { validatePublicationAccess } from "../../src/lib/domain";

describe("login return paths", () => {
  it.each(["/app/profile", "/app/profile?tab=links", "/app/profile#links"])(
    "accepts internal path %s",
    (path) => expect(sanitizeReturnPath(path)).toBe(path),
  );

  it.each([
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example",
    "/%",
    "javascript:alert(1)",
  ])("rejects unsafe path %s", (path) => expect(sanitizeReturnPath(path)).toBeUndefined());

  it("returns undefined for missing input so callers can use a safe fallback", () => {
    expect(sanitizeReturnPath(undefined)).toBeUndefined();
    expect(sanitizeReturnPath(["/app/profile", "/admin/customers"])).toBeUndefined();
  });
});

describe("publication lifecycle guards", () => {
  it("allows an active customer with an unsuspended profile", () => {
    expect(validatePublicationAccess("published", "active", "active")).toEqual([]);
  });

  it.each([
    ["active", "requested"],
    ["deleted", "deleted"],
  ] as const)("blocks account lifecycle state %s/%s", (accountStatus, deletionStatus) => {
    expect(validatePublicationAccess("published", accountStatus, deletionStatus)).toEqual(
      expect.arrayContaining([expect.stringContaining("inactive or pending deletion")]),
    );
  });

  it("blocks suspended profiles even for active customers", () => {
    expect(validatePublicationAccess("suspended", "active", "active")).toEqual(
      expect.arrayContaining([expect.stringContaining("profile is suspended")]),
    );
  });
});
