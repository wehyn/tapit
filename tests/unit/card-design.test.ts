import { describe, expect, it } from "vitest";

import {
  CARD_DESIGN_MAX_BYTES_EXCLUSIVE,
  validateCardDesignFile,
  type CardDesignFileLike,
} from "../../src/lib/card-design";
import { getUploadPolicy } from "../../convex/uploadPolicies";

function file(type: string, size = CARD_DESIGN_MAX_BYTES_EXCLUSIVE - 1): CardDesignFileLike {
  return { type, size };
}

describe("card design file validation", () => {
  it.each(["image/png", "image/jpeg"])("accepts %s below the size limit", (type) => {
    expect(validateCardDesignFile(file(type))).toBeNull();
  });

  it("rejects exactly 50 MiB with the under-50-MB message", () => {
    expect(validateCardDesignFile(file("image/png", CARD_DESIGN_MAX_BYTES_EXCLUSIVE))).toBe(
      "Choose an image under 50 MB.",
    );
  });

  it("requires a file", () => {
    expect(validateCardDesignFile(null)).toBe("Choose a PNG or JPG image.");
  });

  it.each(["application/pdf", "image/webp"])("rejects unsupported type %s", (type) => {
    expect(validateCardDesignFile(file(type))).toBe("Upload a PNG or JPG image.");
  });

  it("exposes the card-design policy boundary", () => {
    expect(getUploadPolicy("card-design")).toMatchObject({
      version: "card-design-v1",
      maxBytesExclusive: 50 * 1024 * 1024,
      acceptedContentTypes: ["image/jpeg", "image/png"],
      maxWidth: 12_000,
      maxHeight: 12_000,
      maxPixels: 50_000_000,
      sourceVisibility: "private",
      allowedDomainTypes: ["card-design"],
      variants: [
        { purpose: "preview", maxEdge: 2_048 },
        { purpose: "thumbnail", maxEdge: 512 },
      ],
    });
  });
});
