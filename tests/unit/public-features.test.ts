import { describe, expect, it } from "vitest";

import { buildVCard, resolveProfileUrl } from "../../src/lib/vcard";
import { generateQrSvg } from "../../src/lib/qr";

describe("public contact and QR features", () => {
  it("includes a selected phone number in the approved public vCard fields", () => {
    const vCard = buildVCard({
      name: "Mara Velasquez",
      email: "mara@example.test",
      phone: "+63 917 555 0184",
      website: "https://mara-velasquez.example",
      profileUrl: "https://tapit.example/mara-velasquez",
    });
    expect(vCard).toContain("FN:Mara Velasquez");
    expect(vCard).toContain("EMAIL;TYPE=INTERNET:mara@example.test");
    expect(vCard).toContain("TEL;TYPE=VOICE:+63 917 555 0184");
    expect(vCard).toContain("item1.URL:https://mara-velasquez.example");
    expect(vCard).toContain("URL:https://tapit.example/mara-velasquez");
  });

  it("embeds the profile photo and labels each distinct published link", () => {
    const vCard = buildVCard({
      name: "Mara Velasquez",
      website: "https://mara-velasquez.example",
      profileUrl: "https://tapit.example/mara-velasquez",
      photo: { type: "PNG", base64: "a".repeat(100) },
      links: [
        { label: "Portfolio", destination: "https://mara-velasquez.example" },
        { label: "LinkedIn", destination: "https://www.linkedin.com/in/mara-velasquez" },
      ],
    });
    const unfolded = vCard.replace(/\r\n[ \t]/g, "");

    expect(unfolded).toContain(`PHOTO;ENCODING=b;TYPE=PNG:${"a".repeat(100)}`);
    expect(unfolded).toContain("item1.URL:https://mara-velasquez.example");
    expect(unfolded).toContain("item1.X-ABLabel:Portfolio");
    expect(unfolded).toContain("item2.URL:https://www.linkedin.com/in/mara-velasquez");
    expect(unfolded).toContain("item2.X-ABLabel:LinkedIn");
    expect(unfolded.match(/https:\/\/mara-velasquez\.example/g)).toHaveLength(1);
    expect(
      vCard
        .split("\r\n")
        .filter((line) => line.length > 0)
        .every((line) => new TextEncoder().encode(line).length <= 75),
    ).toBe(true);
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
