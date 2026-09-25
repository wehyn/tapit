import { describe, expect, it } from "vitest";
import {
  DEFAULT_WARM_STUDIO_CUSTOMIZATION,
  getAutomaticContactActions,
  getFeaturedProfileLink,
  normalizeProfileCustomization,
  resolveProfileAppearance,
  validateProfileCustomization,
} from "../../src/lib/profile-customization";

const links = [
  { id: "booking", label: "Book a call", destination: "https://cal.example", enabled: true },
  { id: "hidden", label: "Hidden", destination: "https://hidden.example", enabled: false },
];

describe("profile customization contract", () => {
  it("provides the Warm Studio default and legacy fallback", () => {
    expect(DEFAULT_WARM_STUDIO_CUSTOMIZATION).toMatchObject({
      preset: "warm-studio",
      accent: "coral",
      typeScale: "comfortable",
      linkTreatment: "filled",
      contentOrder: "links-first",
    });
    expect(resolveProfileAppearance(undefined).mode).toBe("legacy");
    expect(resolveProfileAppearance(DEFAULT_WARM_STUDIO_CUSTOMIZATION).mode).toBe("warm-studio");
  });

  it("falls back to finite appearance tokens for invalid runtime values", () => {
    expect(
      resolveProfileAppearance({
        ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        accent: "not-an-accent",
        typeScale: "not-a-scale",
        linkTreatment: "not-a-treatment",
      } as never),
    ).toEqual({
      mode: "warm-studio",
      accent: "coral",
      typeScale: "comfortable",
      linkTreatment: "filled",
    });
    expect(resolveProfileAppearance(null as never)).toEqual({
      mode: "warm-studio",
      accent: "coral",
      typeScale: "comfortable",
      linkTreatment: "filled",
    });
  });

  it("normalizes malformed base customization to absence", () => {
    expect(
      normalizeProfileCustomization({ ...DEFAULT_WARM_STUDIO_CUSTOMIZATION, preset: "future" }),
    ).toBeUndefined();
  });

  it("keeps the base customization when an optional section is incomplete", () => {
    expect(
      normalizeProfileCustomization({
        ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        section: { kind: "about", body: "   " },
      }),
    ).toEqual(DEFAULT_WARM_STUDIO_CUSTOMIZATION);
    expect(
      normalizeProfileCustomization({
        ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        section: { kind: "services", body: "Services", items: ["ok", 42] },
      }),
    ).toEqual(DEFAULT_WARM_STUDIO_CUSTOMIZATION);
  });

  it("preserves a valid Warm Studio customization while copying nested data safely", () => {
    expect(
      normalizeProfileCustomization({
        ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        section: { kind: "services", body: "Services", items: ["Brand strategy"] },
      }),
    ).toEqual({
      ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
      section: { kind: "services", body: "Services", items: ["Brand strategy"] },
    });
  });

  it.each([
    ["preset", "not-a-preset", "The profile customization preset is invalid."],
    ["accent", "not-an-accent", "The profile customization accent is invalid."],
    ["typeScale", "not-a-scale", "The profile customization type scale is invalid."],
    ["linkTreatment", "not-a-treatment", "The profile customization link treatment is invalid."],
    ["contentOrder", "not-an-order", "The profile customization content order is invalid."],
  ])("rejects an invalid %s enum value", (field, value, message) => {
    expect(
      validateProfileCustomization({
        ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        [field]: value,
      } as never),
    ).toContain(message);
  });

  it("returns validation errors for malformed runtime input while allowing absence", () => {
    expect(validateProfileCustomization(undefined)).toEqual([]);
    expect(validateProfileCustomization(null as never)).toEqual([
      "The profile customization preset is invalid.",
      "The profile customization accent is invalid.",
      "The profile customization type scale is invalid.",
      "The profile customization link treatment is invalid.",
      "The profile customization content order is invalid.",
    ]);
  });

  it("derives safe populated contact fields in fixed email-phone-website order", () => {
    expect(
      getAutomaticContactActions({
        email: "mara@example.test",
        phone: " +1 (555) 121-2121 ",
        website: "https://mara.test",
      }),
    ).toEqual([
      { kind: "email", href: "mailto:mara@example.test", label: "Email" },
      { kind: "phone", href: "tel:+1 (555) 121-2121", label: "Phone" },
      { kind: "website", href: "https://mara.test", label: "Website" },
    ]);
  });

  it.each([
    "a?b@example.com",
    "a#b@example.com",
    "a%0d%0ab@example.com",
    "mara@example.test?subject=hello",
    "mara@example.test#section",
    "mara@example.test%0d%0aBcc:attacker@example.test",
    "mara@example.test\r\nBcc:attacker@example.test",
    "mara@@example.test",
    "mara example@example.test",
    "mara@example",
  ])("omits unsafe email contact input: %s", (email) => {
    expect(getAutomaticContactActions({ email })).toEqual([]);
  });

  it("retains ordinary mailbox addresses with supported local-part characters", () => {
    expect(getAutomaticContactActions({ email: "mara+studio@example.test" })).toEqual([
      { kind: "email", href: "mailto:mara+studio@example.test", label: "Email" },
    ]);
  });

  it("omits unsafe website and phone contact inputs", () => {
    expect(
      getAutomaticContactActions({
        phone: "javascript:alert(1)",
        website: "javascript:alert(1)",
      }),
    ).toEqual([]);
    expect(getAutomaticContactActions({ phone: "tel:+15551212" })).toEqual([]);
  });

  it.each(["https://user@example.test", "https://:password@example.test"])(
    "omits credential-bearing website contact input: %s",
    (website) => {
      expect(getAutomaticContactActions({ website })).toEqual([]);
    },
  );

  it("does not feature a disabled or missing link", () => {
    expect(getFeaturedProfileLink(links, "booking")).toEqual(links[0]);
    expect(getFeaturedProfileLink(links, "hidden")).toBeUndefined();
    expect(getFeaturedProfileLink(links, "missing")).toBeUndefined();
  });

  it("validates About body limits and rejects About items", () => {
    expect(
      validateProfileCustomization({
        ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        section: { kind: "about", body: "a".repeat(280) },
      }),
    ).toEqual([]);
    expect(
      validateProfileCustomization({
        ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        section: { kind: "about", body: "a".repeat(281) },
      }),
    ).toContain("An About section body can contain at most 280 characters.");
    expect(
      validateProfileCustomization({
        ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        section: { kind: "about", body: "   " },
      }),
    ).toContain("A profile section body must be nonblank.");
    expect(
      validateProfileCustomization({
        ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        section: { kind: "about", body: "About", items: [] } as never,
      }),
    ).toContain("An About section cannot contain service items.");
  });

  it("validates Services body and item limits", () => {
    expect(
      validateProfileCustomization(
        {
          ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
          section: { kind: "services", body: "a".repeat(160), items: ["a".repeat(60)] },
        },
        links,
      ),
    ).toEqual([]);
    expect(
      validateProfileCustomization({
        ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        section: { kind: "services", body: "a".repeat(161) },
      }),
    ).toContain("A Services section body can contain at most 160 characters.");
    expect(
      validateProfileCustomization({
        ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        section: { kind: "services", body: "   " },
      }),
    ).toContain("A profile section body must be nonblank.");
    expect(
      validateProfileCustomization(
        {
          ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
          section: {
            kind: "services",
            body: "a".repeat(161),
            items: ["One", "Two", "Three", "Four"],
          },
        },
        links,
      ),
    ).toContain("A Services section can contain at most three items.");
    expect(
      validateProfileCustomization({
        ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        section: { kind: "services", body: "Services", items: ["a".repeat(61)] },
      }),
    ).toContain("A service item can contain at most 60 characters.");
    expect(
      validateProfileCustomization({
        ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        section: { kind: "services", body: "Services", items: [" "] },
      }),
    ).toContain("Every service item must be nonblank.");
  });
});
