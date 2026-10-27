import { describe, expect, it } from "vitest";

import { validateCardOrderDesignFile } from "@/lib/card-design";

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function imageFile(bytes: Uint8Array, name: string) {
  const file = new File([new Uint8Array(bytes).buffer as ArrayBuffer], name, { type: "image/png" });
  return Object.assign(file, { arrayBuffer: async () => bytes.slice().buffer }) as File;
}

describe("payment QR image validation", () => {
  it("rejects incorrect content, over-limit bytes, and excessive dimensions before attachment", async () => {
    await expect(
      validateCardOrderDesignFile(imageFile(new TextEncoder().encode("not an image"), "qr.png")),
    ).rejects.toThrow("malformed or unsupported");
    await expect(
      validateCardOrderDesignFile(imageFile(new Uint8Array(5 * 1024 * 1024), "large.png")),
    ).rejects.toThrow("under 5 MiB");
    await expect(
      validateCardOrderDesignFile(imageFile(pngHeader(12_001, 1), "wide.png")),
    ).rejects.toThrow("12,000 pixels per side");
    await expect(
      validateCardOrderDesignFile(imageFile(pngHeader(3_000, 2_001), "many-pixels.png")),
    ).rejects.toThrow("6 million pixels");
  });
});
