import { describe, expect, it } from "vitest";

import { isCardOrderOfferExpired, manilaStartOfDayTimestamp } from "../../src/lib/card-ordering";

describe("card order offer expiry", () => {
  it("keeps offers without an expiry time-unlimited", () => {
    expect(isCardOrderOfferExpired(undefined, 0)).toBe(false);
  });

  it("expires at the start of the selected Manila date", () => {
    const cutoff = manilaStartOfDayTimestamp("2026-10-28");
    expect(cutoff).not.toBeNull();
    expect(isCardOrderOfferExpired("2026-10-28", cutoff! - 1)).toBe(false);
    expect(isCardOrderOfferExpired("2026-10-28", cutoff!)).toBe(true);
    expect(isCardOrderOfferExpired("2026-10-28", cutoff! + 1)).toBe(true);
  });

  it("treats an invalid supplied date as expired", () => {
    expect(isCardOrderOfferExpired("2099-02-30", 0)).toBe(true);
  });
});
