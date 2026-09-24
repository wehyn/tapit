export const CARD_DESIGN_ACCEPT = "image/png,image/jpeg";
export const CARD_DESIGN_MAX_BYTES_EXCLUSIVE = 50 * 1024 * 1024;

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
