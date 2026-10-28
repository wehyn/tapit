import { describe, expect, it } from "vitest";
import { validatePrepared, validateStep } from "@/components/admin/prepared/validation";
import { emptyPreparedValues } from "@/components/admin/prepared/types";

describe("prepared profile validation", () => {
  it("requires a name and valid lowercase slug without requiring links", () => {
    expect(validatePrepared(emptyPreparedValues())).toMatchObject({
      name: "Enter a display name.",
      slug: "Enter a profile URL.",
    });
    expect(validatePrepared({ ...emptyPreparedValues(), name: "A", slug: "profile-1" })).toEqual(
      {},
    );
  });
  it("validates optional contact values and HTTPS destinations", () => {
    const values = {
      ...emptyPreparedValues(),
      name: "A",
      slug: "a",
      contactEmail: "bad",
      website: "http://site.test",
    };
    expect(validateStep(values, 2)).toEqual({
      contactEmail: "Enter a valid email address.",
      website: "Enter a valid https:// address.",
    });
  });
  it("requires both fields for partially completed links", () => {
    const values = {
      ...emptyPreparedValues(),
      name: "A",
      slug: "a",
      links: [
        { label: "", url: "https://site.test" },
        { label: "Site", url: "" },
      ],
    };
    expect(validateStep(values, 3)).toEqual({
      "links.0.label": "Add a label.",
      "links.1.url": "Enter a valid https:// address.",
    });
  });
});
