import { describe, expect, it } from "vitest";

import {
  CARD_DESIGN_MAX_BYTES,
  validateCardDesignFile,
  type CardDesignFileLike,
} from "../../src/lib/card-design";

function file(type: string, size = CARD_DESIGN_MAX_BYTES): CardDesignFileLike {
  return { type, size };
}

describe("card design file validation", () => {
  it.each(["image/png", "image/jpeg"])("accepts %s at the size limit", (type) => {
    expect(validateCardDesignFile(file(type))).toBeNull();
  });

  it("requires a file", () => {
    expect(validateCardDesignFile(null)).toBe("Choose a PNG or JPG image.");
  });

  it.each(["application/pdf", "image/webp"])("rejects unsupported type %s", (type) => {
    expect(validateCardDesignFile(file(type))).toBe("Upload a PNG or JPG image.");
  });

  it("rejects a supported image over the size limit", () => {
    expect(validateCardDesignFile(file("image/png", CARD_DESIGN_MAX_BYTES + 1))).toBe(
      "Choose an image smaller than 10 MB.",
    );
  });
});
