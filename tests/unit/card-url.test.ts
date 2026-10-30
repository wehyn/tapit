import { describe, expect, it } from "vitest";

import {
  CANONICAL_CARD_ORIGIN,
  cardTokenFromUrl,
  cardUrlFromToken,
  normalizeCardUrl,
} from "@/lib/card-url";

describe("canonical card URLs", () => {
  it("resolves a relative card path to the production origin and keeps its query", () => {
    expect(normalizeCardUrl(" /c/card-29y887jo?claim=1&source=print ")).toBe(
      `${CANONICAL_CARD_ORIGIN}/c/card-29y887jo?claim=1&source=print`,
    );
  });

  it("preserves an absolute canonical URL exactly", () => {
    const url = `${CANONICAL_CARD_ORIGIN}/c/card-29y887jo?claim=1&source=a%2Fb`;
    expect(normalizeCardUrl(url)).toBe(url);
    expect(cardTokenFromUrl(url)).toBe("card-29y887jo");
  });

  it.each(["/c/card-29y887jo", "https://tapit-eosin.vercel.app/c/other/../card-29y887jo"])(
    "does not treat a relative or normalized path as a saved permanent URL (%s)",
    (url) => {
      expect(cardTokenFromUrl(url)).toBeNull();
    },
  );

  it.each([
    "http://tapit-eosin.vercel.app/c/card-29y887jo",
    "https://tapit-eosin.vercel.app.evil.example/c/card-29y887jo",
    "https://user:pass@tapit-eosin.vercel.app/c/card-29y887jo",
    "https://@tapit-eosin.vercel.app/c/card-29y887jo",
    "https://tapit-eosin.vercel.app/c/card-29y887jo#fragment",
    "https://tapit-eosin.vercel.app/c/other/../card-29y887jo",
    "/c/other/../card-29y887jo",
    "//tapit-eosin.vercel.app/c/card-29y887jo",
  ])("rejects noncanonical or non-exact URL %s", (url) => {
    expect(normalizeCardUrl(url)).toBeNull();
  });

  it("generates permanent URLs from the validated token", () => {
    expect(cardUrlFromToken("card-29y887jo")).toBe(`${CANONICAL_CARD_ORIGIN}/c/card-29y887jo`);
  });
});
