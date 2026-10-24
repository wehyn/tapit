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
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const png =
    file.type === "image/png" &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte);
  const jpeg =
    file.type === "image/jpeg" &&
    signature[0] === 0xff &&
    signature[1] === 0xd8 &&
    signature[2] === 0xff;
  if (!png && !jpeg) throw new Error("The selected file is not a valid PNG or JPG image.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("The selected image could not be decoded.");
  }
  try {
    if (
      bitmap.width > CARD_ORDER_DESIGN_MAX_EDGE ||
      bitmap.height > CARD_ORDER_DESIGN_MAX_EDGE ||
      bitmap.width * bitmap.height > CARD_ORDER_DESIGN_MAX_PIXELS
    ) {
      throw new Error("Use an image no larger than 12,000 pixels per side or 6 million pixels.");
    }
  } finally {
    bitmap.close();
  }
}
