import { describe, expect, it } from "vitest";

import { matchesOwnedProfileQuery } from "../../src/lib/profile-ownership";

describe("matchesOwnedProfileQuery", () => {
  it("fails closed until a successful result matches the published profile", () => {
    expect(matchesOwnedProfileQuery({ status: "pending" }, "profile-1")).toBe(false);
    expect(
      matchesOwnedProfileQuery({ status: "error", error: new Error("lookup failed") }, "profile-1"),
    ).toBe(false);
    expect(matchesOwnedProfileQuery({ status: "success", data: null }, "profile-1")).toBe(false);
    expect(
      matchesOwnedProfileQuery({ status: "success", data: { _id: "profile-2" } }, "profile-1"),
    ).toBe(false);
    expect(
      matchesOwnedProfileQuery({ status: "success", data: { _id: "profile-1" } }, "profile-1"),
    ).toBe(true);
  });
});
