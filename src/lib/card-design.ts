export const CARD_DESIGN_ACCEPT = "image/png,image/jpeg";
export const CARD_DESIGN_MAX_BYTES_EXCLUSIVE = 50 * 1024 * 1024;
export const CARD_ORDER_DESIGN_MAX_BYTES_EXCLUSIVE = 5 * 1024 * 1024;
export const CARD_ORDER_DESIGN_MAX_EDGE = 12_000;
export const CARD_ORDER_DESIGN_MAX_PIXELS = 6_000_000;

export type CardDesignFileLike = {
  size: number;
  type: string;
};

export type CardDesignPreview = {
  name: string;
  size: number;
  url: string;
};

const CARD_DESIGN_TYPES = new Set(["image/png", "image/jpeg"]);

type ImageDimensions = { width: number; height: number };

function readImageDimensions(file: File, bytes: Uint8Array): ImageDimensions {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const invalidHeader = () =>
    new Error("The selected file has a malformed or unsupported PNG/JPG header.");

  if (file.type === "image/png") {
    if (
      bytes.length < 24 ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) ||
      view.getUint32(8) !== 13 ||
      bytes[12] !== 73 ||
      bytes[13] !== 72 ||
      bytes[14] !== 68 ||
      bytes[15] !== 82
    ) {
      throw invalidHeader();
    }
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (width === 0 || height === 0) throw invalidHeader();
    return { width, height };
  }

  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw invalidHeader();
  }
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw invalidHeader();
    while (bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === undefined) throw invalidHeader();
    if (marker === 0x00) throw invalidHeader();
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) throw invalidHeader();
    const segmentLength = view.getUint16(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) throw invalidHeader();
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      if (segmentLength < 8) throw invalidHeader();
      const height = view.getUint16(offset + 3);
      const width = view.getUint16(offset + 5);
      const componentCount = bytes[offset + 7];
      if (
        width === 0 ||
        height === 0 ||
        componentCount === undefined ||
        componentCount === 0 ||
        segmentLength < 8 + componentCount * 3
      ) {
        throw invalidHeader();
      }
      return { width, height };
    }
    offset += segmentLength;
  }
  throw invalidHeader();
}

function assertCardOrderDesignDimensions({ width, height }: ImageDimensions): void {
  if (
    width > CARD_ORDER_DESIGN_MAX_EDGE ||
    height > CARD_ORDER_DESIGN_MAX_EDGE ||
    width * height > CARD_ORDER_DESIGN_MAX_PIXELS
  ) {
    throw new Error("Use an image no larger than 12,000 pixels per side or 6 million pixels.");
  }
}

export function validateCardDesignFile(file: CardDesignFileLike | null): string | null {
  if (file === null) return "Choose a PNG or JPG image.";
  if (!CARD_DESIGN_TYPES.has(file.type)) return "Upload a PNG or JPG image.";
  if (file.size >= CARD_DESIGN_MAX_BYTES_EXCLUSIVE) return "Choose an image under 50 MB.";
  return null;
}

export async function validateCardOrderDesignFile(file: File): Promise<void> {
  if (!CARD_DESIGN_TYPES.has(file.type)) throw new Error("Upload a PNG or JPG image.");
  if (file.size >= CARD_ORDER_DESIGN_MAX_BYTES_EXCLUSIVE) {
    throw new Error("Choose an image under 5 MiB.");
  }
  const dimensions = readImageDimensions(file, new Uint8Array(await file.arrayBuffer()));
  assertCardOrderDesignDimensions(dimensions);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("The selected image could not be decoded.");
  }
  try {
    assertCardOrderDesignDimensions(bitmap);
  } finally {
    bitmap.close();
  }
}
