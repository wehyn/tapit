import { describe, expect, it } from "vitest";

import { validateDraftSafety } from "../../convex/validators";
import { DEFAULT_WARM_STUDIO_CUSTOMIZATION } from "../../src/lib/profile-customization";

describe("server draft safety", () => {
  it("allows the custom white identity color with the night theme", () => {
    const customization = {
      ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
      identityColors: { name: { kind: "custom" as const, hex: "#ffffff" } },
    };
    const draft = {
      name: "Night profile",
      slug: "night-profile",
      theme: "night" as const,
      customization,
      links: [{ id: "site", label: "Site", destination: "https://example.com", enabled: true }],
    };

    expect(validateDraftSafety(draft)).not.toContain(
      "The profile name custom color does not meet contrast requirements.",
    );
    expect(validateDraftSafety({ ...draft, theme: "paper" })).toContain(
      "The profile name custom color does not meet contrast requirements.",
    );
  });
});
