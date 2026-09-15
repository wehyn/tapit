import { describe, expect, it } from "vitest";

import { validateProfileImageFile } from "@/lib/profile-image";

describe("validateProfileImageFile", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])(
    "accepts %s files up to and including 5 MB",
    (type) => {
      expect(
        validateProfileImageFile(new File([new Uint8Array(5 * 1024 * 1024)], "image", { type })),
      ).toBeNull();
    },
  );

  it("rejects unsupported MIME types with a user-facing message", () => {
    expect(validateProfileImageFile(new File(["image"], "image.gif", { type: "image/gif" }))).toBe(
      "Use a JPG, PNG, or WebP image.",
    );
    expect(validateProfileImageFile(new File(["text"], "notes.txt", { type: "text/plain" }))).toBe(
      "Use a JPG, PNG, or WebP image.",
    );
  });

  it("rejects files larger than 5 MB with a user-facing message", () => {
    expect(
      validateProfileImageFile(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" }),
      ),
    ).toBe("Images must be 5 MB or smaller.");
  });
});
