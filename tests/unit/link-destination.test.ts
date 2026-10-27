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

  it.each([
    ["example.com:8080/path", "https://example.com:8080/path"],
    ["localhost:3000", "https://localhost:3000"],
    ["localhost:3000/admin?tab=links", "https://localhost:3000/admin?tab=links"],
  ])("treats host:port %s as a host, not a scheme", (typed, expected) => {
    const destination = formatDestination("link", typed);

    expect(destination).toBe(expected);
    expect(validateLinkDestination(destination)).toBeNull();
  });

  it.each(["ftp://example.com", "http://example.com", "javascript://%0aalert(1)"])(
    "keeps the explicit scheme of %s so strict validation rejects it",
    (typed) => {
      const destination = formatDestination("link", typed);

      expect(destination).toBe(typed);
      expect(validateLinkDestination(destination)).not.toBeNull();
    },
  );

  it("prefixes partially typed hosts and keeps partial schemes until they are complete", () => {
    expect(formatDestination("link", "h")).toBe("https://h");
    expect(formatDestination("link", "https:")).toBe("https:");
    expect(formatDestination("link", "https://")).toBe("https://");
    expect(displayDestination("https://new.example.com")).toBe("new.example.com");
    expect(displayDestination("http://example.com")).toBe("http://example.com");
  });
});
