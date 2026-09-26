import { describe, expect, it } from "vitest";
import {
  classifyProfileWorkspaceError,
  PROFILE_CUSTOMIZATION_CATEGORIES,
  splitProfileWorkspaceErrors,
} from "../../src/lib/profile-workspace";

// Test intent and failure modes:
// - the public category list must stay ordered and finite;
// - every approved overview, identity, media, and layout marker must classify;
// - matching must remain case-insensitive;
// - profile-content validation errors must stay outside customization;
// - splitting must preserve the original order within both result buckets.

describe("profile workspace validation errors", () => {
  it("defines the customization categories in workspace order", () => {
    expect(PROFILE_CUSTOMIZATION_CATEGORIES).toEqual(["overview", "identity", "media", "layout"]);
  });

  it.each([
    ["profile customization preset", "overview"],
    ["profile customization accent", "overview"],
    ["profile customization type scale", "overview"],
    ["profile customization link treatment", "overview"],
    ["profile name color", "identity"],
    ["profile bio color", "identity"],
    ["profile media", "media"],
    ["media autoplay", "media"],
    ["hero height", "media"],
    ["slideshow", "media"],
    ["background image", "media"],
    ["background horizontal position", "media"],
    ["background vertical position", "media"],
    ["profile customization content order", "layout"],
  ] as const)("classifies the %s marker as %s", (marker, category) => {
    expect(classifyProfileWorkspaceError(`THE ${marker.toUpperCase()} IS INVALID.`)).toBe(category);
  });

  it("classifies identity contrast validation errors", () => {
    expect(
      classifyProfileWorkspaceError(
        "The profile name custom color does not meet contrast requirements.",
      ),
    ).toBe("identity");
    expect(
      classifyProfileWorkspaceError(
        "The profile bio custom color does not meet contrast requirements.",
      ),
    ).toBe("identity");
  });

  it("returns undefined for profile-content validation errors", () => {
    expect(classifyProfileWorkspaceError("A nonblank profile name is required.")).toBeUndefined();
    expect(classifyProfileWorkspaceError("The profile email is invalid.")).toBeUndefined();
  });

  it("splits errors into profile and customization buckets without reordering them", () => {
    const errors = [
      "A nonblank profile name is required.",
      "The profile customization accent is invalid.",
      "Hero height must be between 220 and 520.",
      "The profile email is invalid.",
      "The profile customization content order is invalid.",
    ];

    expect(splitProfileWorkspaceErrors(errors)).toEqual({
      profile: ["A nonblank profile name is required.", "The profile email is invalid."],
      customization: [
        "The profile customization accent is invalid.",
        "Hero height must be between 220 and 520.",
        "The profile customization content order is invalid.",
      ],
    });
  });
});
