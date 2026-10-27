import { describe, expect, it } from "vitest";

import { validateLinkDestination } from "@/lib/domain";
import { displayDestination, formatDestination } from "@/components/forms/LinkDestination";

describe("link destination editing", () => {
  it("preserves explicitly schemed values so unsupported schemes are rejected", () => {
    const destination = formatDestination("link", "http://example.com");

    expect(destination).toBe("http://example.com");
    expect(destination).not.toContain("https://http://");
    expect(validateLinkDestination(destination)).toBe(
      "Link destination must be a valid HTTPS, mailto, or tel address.",
    );
    expect(formatDestination("link", "javascript:alert(1)")).toBe("javascript:alert(1)");
  });

  it("does not duplicate mailto or tel prefixes while editing", () => {
    expect(formatDestination("email", "mailto:mailto:person@example.com")).toBe(
      "mailto:person@example.com",
    );
    expect(formatDestination("phone", "tel:tel:+15551234567")).toBe("tel:+15551234567");
    expect(displayDestination("mailto:mailto:person@example.com")).toBe("person@example.com");
    expect(displayDestination("tel:tel:+15551234567")).toBe("+15551234567");
    expect(formatDestination("link", "example.com")).toBe("https://example.com");
  });
});
