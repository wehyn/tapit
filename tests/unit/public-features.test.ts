import { describe, expect, it } from "vitest";

import { buildVCard, resolveProfileUrl } from "../../src/lib/vcard";
import { generateQrSvg } from "../../src/lib/qr";

describe("public contact and QR features", () => {
  it("keeps vCards limited to the approved public fields", () => {
    const vCard = buildVCard({
      name: "Mara Velasquez",
      email: "mara@example.test",
      website: "https://mara-velasquez.example",
      profileUrl: "https://tapit.example/mara-velasquez",
    });
    expect(vCard).toContain("FN:Mara Velasquez");
    expect(vCard).toContain("EMAIL;TYPE=INTERNET:mara@example.test");
    expect(vCard).toContain("item1.URL:https://mara-velasquez.example");
    expect(vCard).toContain("URL:https://tapit.example/mara-velasquez");
    expect(vCard).not.toContain("TEL");
  });

  it("includes phone-only and email-plus-phone contact data", () => {
    expect(
      buildVCard({
        name: "Mara Velasquez",
        phone: "+63 917 555 0184",
        profileUrl: "https://tapit.example/mara-velasquez",
      }),
    ).toContain("TEL:+63 917 555 0184");
    expect(
      buildVCard({
        name: "Mara Velasquez",
        email: "mara@example.test",
        phone: "+63 917 555 0184",
        profileUrl: "https://tapit.example/mara-velasquez",
      }),
    ).toMatch(/EMAIL;TYPE=INTERNET:mara@example\.test\r\nTEL:\+63 917 555 0184/);
  });

  it("resolves a relative public profile URL before creating a vCard", () => {
    expect(resolveProfileUrl("/mara-velasquez", "https://tapit.example")).toBe(
      "https://tapit.example/mara-velasquez",
    );
  });

  it("generates SVG QR output for a card URL", async () => {
    const svg = await generateQrSvg("https://tapit.example/c/mara-card-7f2q");
    expect(svg).toContain("<svg");
    expect(svg).toContain("viewBox");
  });
});
