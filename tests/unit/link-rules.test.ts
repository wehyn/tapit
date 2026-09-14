import { describe, expect, it } from "vitest";

import {
  publishProfile,
  validatePublication,
  type ProfileContent,
  type ProfileRecord,
} from "../../src/lib/domain";

const base: ProfileContent = {
  name: "Ada Lovelace",
  slug: "ada-lovelace",
  links: [
    { id: "enabled", label: "Site", destination: "https://example.com", enabled: true },
    { id: "disabled", label: "", destination: "not-a-url", enabled: false },
  ],
};

function profile(): ProfileRecord {
  return { id: "profile-1", ownerId: "customer-1", status: "draft", draft: base, published: null };
}

describe("reusable disabled links", () => {
  it("ignores blank, invalid, and duplicate disabled destinations", () => {
    const draft = {
      ...base,
      links: [
        ...base.links,
        { id: "disabled-duplicate", label: "", destination: "HTTPS://EXAMPLE.COM", enabled: false },
      ],
    };
    expect(validatePublication(draft, null)).toEqual([]);
    expect(publishProfile({ ...profile(), draft }, "now").published?.links).toHaveLength(3);
  });

  it("still requires enabled links to be valid", () => {
    const invalid = {
      ...base,
      links: [{ id: "enabled-invalid", label: "Other", destination: "not-a-url", enabled: true }],
    };
    expect(validatePublication(invalid, null)).toContain(
      "At least one valid enabled link is required.",
    );
  });

  it("rejects duplicate enabled destinations", () => {
    const duplicate = {
      ...base,
      links: [
        ...base.links,
        {
          id: "enabled-duplicate",
          label: "Mirror",
          destination: "HTTPS://EXAMPLE.COM",
          enabled: true,
        },
      ],
    };
    expect(validatePublication(duplicate, null)).toContain(
      "Duplicate enabled link destinations are not allowed.",
    );
  });

  it("rejects an invalid enabled link even when another enabled link is valid", () => {
    const mixed = {
      ...base,
      links: [
        ...base.links,
        {
          id: "enabled-invalid",
          label: "Unsafe",
          destination: "javascript:alert(1)",
          enabled: true,
        },
      ],
    };
    expect(validatePublication(mixed, null)).toContain(
      "Every enabled link needs a label and safe destination.",
    );
  });
});
