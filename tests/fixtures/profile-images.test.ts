import { readFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

const fixtureDirectory = path.join(process.cwd(), "tests/fixtures/profile-images");

describe("profile image contract fixtures", () => {
  it("contains an opaque landscape PNG-sized source fixture", async () => {
    const bytes = await readFixture("opaque-landscape.png");

    expect(readPngHeader(bytes)).toMatchObject({ width: 640, height: 360, colorType: 2 });
    expect(bytes.byteLength).toBeLessThan(5 * 1024 * 1024);
  });

  it("contains a transparent PNG with a known alpha pixel", async () => {
    const bytes = await readFixture("transparent-logo.png");

    expect(readPngHeader(bytes)).toMatchObject({ width: 128, height: 128, colorType: 6 });
    expect(readPngAlphaSamples(bytes)).toEqual({ transparent: 0, opaque: 255 });
    expect(bytes.byteLength).toBeLessThan(5 * 1024 * 1024);
  });

  it("contains a transparent WebP with a known alpha channel", async () => {
    const bytes = await readFixture("transparent-logo.webp");

    expect(readWebpHeader(bytes)).toMatchObject({ width: 128, height: 128, hasAlpha: true });
    expect(bytes.byteLength).toBeLessThan(5 * 1024 * 1024);
  });

  it("contains malformed bytes that are not accepted as an image format", async () => {
    const bytes = await readFixture("malformed-image.bin");

    expect(isPng(bytes)).toBe(false);
    expect(isWebp(bytes)).toBe(false);
  });
});

async function readFixture(name: string): Promise<Buffer> {
  return readFile(path.join(fixtureDirectory, name));
}

function isPng(bytes: Uint8Array): boolean {
  return bytes
    .subarray(0, 8)
    .every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index]);
}

function readPngHeader(bytes: Uint8Array) {
  if (!isPng(bytes) || bytes.length < 29) throw new Error("Not a PNG");
  return {
    width: new DataView(bytes.buffer, bytes.byteOffset).getUint32(16),
    height: new DataView(bytes.buffer, bytes.byteOffset).getUint32(20),
    colorType: bytes[25],
  };
}

function readPngAlphaSamples(bytes: Uint8Array) {
  const idatChunks: Uint8Array[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const chunkLength = new DataView(bytes.buffer, bytes.byteOffset + offset).getUint32(0);
    const chunkType = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    if (chunkType === "IDAT") {
      idatChunks.push(bytes.subarray(offset + 8, offset + 8 + chunkLength));
    }
    offset += 12 + chunkLength;
  }
  const scanlines = inflateSync(Buffer.concat(idatChunks.map((chunk) => Buffer.from(chunk))));
  const bytesPerRow = 1 + 128 * 4;
  return {
    transparent: scanlines[4],
    opaque: scanlines[64 * bytesPerRow + 1 + 64 * 4 + 3],
  };
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
  );
}

function readWebpHeader(bytes: Uint8Array) {
  if (!isWebp(bytes) || bytes.length < 30) throw new Error("Not a WebP");
  const chunk = new TextDecoder().decode(bytes.subarray(12, 16));
  if (chunk !== "VP8X") throw new Error("Expected an extended WebP fixture");
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  return {
    width: 1 + readLittleEndian24(view, 24),
    height: 1 + readLittleEndian24(view, 27),
    hasAlpha: (view.getUint8(20) & 0x10) !== 0,
  };
}

function readLittleEndian24(view: DataView, offset: number): number {
  return (
    view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16)
  );
}
