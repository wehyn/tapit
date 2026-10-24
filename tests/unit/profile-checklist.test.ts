import { describe, expect, it } from "vitest";

import type { ProfileContent } from "@/lib/domain";
import { profileChecklistSteps } from "@/lib/profile-checklist";

const emptyDraft: ProfileContent = { name: "", slug: "mara", links: [] };

function doneFor(steps: ReturnType<typeof profileChecklistSteps>) {
  return steps.map((step) => [step.id, step.done]);
}

describe("profileChecklistSteps", () => {
  it("leaves every step open for a new profile", () => {
    expect(doneFor(profileChecklistSteps(emptyDraft, false))).toEqual([
      ["photo", false],
      ["name", false],
      ["links", false],
      ["look", false],
      ["publish", false],
    ]);
  });

  it("derives each step from profile data", () => {
    const draft: ProfileContent = {
      name: "Mara Velasquez",
      bio: "Brand systems for independent teams.",
      slug: "mara",
      imageStorageId: "storage-1" as ProfileContent["imageStorageId"],
      customization: { preset: "paper" } as ProfileContent["customization"],
      links: [
        { id: "a", label: "A", destination: "https://a.example", enabled: true },
        { id: "b", label: "B", destination: "https://b.example", enabled: true },
        { id: "c", label: "C", destination: "https://c.example", enabled: false },
      ],
    };

    expect(doneFor(profileChecklistSteps(draft, true))).toEqual([
      ["photo", true],
      ["name", true],
      ["links", false],
      ["look", true],
      ["publish", true],
    ]);
  });

  it("links the link and look steps to their pages until they are done", () => {
    const steps = profileChecklistSteps(emptyDraft, false);
    expect(steps.find((step) => step.id === "links")?.href).toBe("/app/links");
    expect(steps.find((step) => step.id === "look")?.href).toBe("/app/customize");
    expect(steps.find((step) => step.id === "photo")?.href).toBeUndefined();
  });

  it("does not count a whitespace-only headline as done", () => {
    const steps = profileChecklistSteps({ ...emptyDraft, name: "Mara", bio: "   " }, false);
    expect(steps.find((step) => step.id === "name")?.done).toBe(false);
  });
});
