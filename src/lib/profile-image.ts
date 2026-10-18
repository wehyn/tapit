const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PROFILE_AVATAR_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_IMAGE_EDGE = 12_000;
const MAX_SOURCE_IMAGE_PIXELS = 24_000_000;
const MAX_CROP_PIXELS = 16_000_000;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type Crop = { x: number; y: number; size: number };

export type PreparedCrop = {
  blob: Blob;
  width: 384;
  contentType: "image/jpeg" | "image/png";
};

export function validateProfileImageFile(file: File): string | null {
  return validateImageFile(file, MAX_PROFILE_IMAGE_BYTES, "Images must be 5 MB or smaller.");
}

export function validateProfileAvatarFile(file: File): string | null {
  return validateImageFile(file, MAX_PROFILE_AVATAR_BYTES, "Images must be 20 MB or smaller.");
}

function validateImageFile(file: File, maxBytes: number, sizeError: string): string | null {
  if (!IMAGE_TYPES.has(file.type)) return "Use a JPG, PNG, or WebP image.";
  if (file.size > maxBytes) return sizeError;
  return null;
}

export async function prepareProfileImageCrop(file: File, crop: Crop): Promise<PreparedCrop> {
  const validationError = validateProfileAvatarFile(file);
  if (validationError) throw new Error(validationError);
  const supportsObjectUrl =
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function" &&
    typeof URL.revokeObjectURL === "function";
  const supportsFileReader = typeof FileReader !== "undefined";
  if (typeof Image === "undefined" || (!supportsObjectUrl && !supportsFileReader)) {
    throw new Error("This browser cannot prepare profile images.");
  }
  if (typeof document === "undefined") {
    throw new Error("Profile images can only be prepared in a browser.");
  }

  let objectUrl: string | null = null;
  try {
    const imageSource = supportsObjectUrl
      ? (objectUrl = URL.createObjectURL(file))
      : await readAsDataUrl(file);
    const image = await decodeImage(imageSource);
    if (
      !Number.isSafeInteger(image.naturalWidth) ||
      image.naturalWidth <= 0 ||
      image.naturalWidth > MAX_SOURCE_IMAGE_EDGE ||
      !Number.isSafeInteger(image.naturalHeight) ||
      image.naturalHeight <= 0 ||
      image.naturalHeight > MAX_SOURCE_IMAGE_EDGE ||
      image.naturalWidth * image.naturalHeight > MAX_SOURCE_IMAGE_PIXELS
    ) {
      throw new Error("This image has too many pixels to crop. Choose a lower-resolution image.");
    }

    const pixelCount = crop.size * crop.size;
    if (!Number.isFinite(pixelCount) || pixelCount <= 0) {
      throw new Error("The selected crop must have a positive pixel count.");
    }
    if (pixelCount > MAX_CROP_PIXELS) {
      throw new Error("The selected crop is too large to process.");
    }
    if (
      !Number.isFinite(crop.x) ||
      !Number.isFinite(crop.y) ||
      !Number.isFinite(crop.size) ||
      crop.x < 0 ||
      crop.y < 0 ||
      crop.x + crop.size > image.naturalWidth ||
      crop.y + crop.size > image.naturalHeight
    ) {
      throw new Error("The selected crop is outside the image.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 384;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("This browser cannot prepare profile images because canvas is unavailable.");
    if (typeof canvas.toBlob !== "function")
      throw new Error(
        "This browser cannot prepare profile images because canvas export is unavailable.",
      );

    context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, 384, 384);
    const pixels = context.getImageData(0, 0, 384, 384).data;
    let hasTransparency = false;
    for (let index = 3; index < pixels.length; index += 4) {
      if ((pixels[index] ?? 255) < 255) {
        hasTransparency = true;
        break;
      }
    }
    const contentType = hasTransparency ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (nextBlob) =>
          nextBlob ? resolve(nextBlob) : reject(new Error("That image could not be converted.")),
        contentType,
        contentType === "image/jpeg" ? 0.82 : undefined,
      );
    });

    return { blob, width: 384, contentType };
  } finally {
    if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That image could not be read. Choose another file."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("That image could not be converted. Choose another file."));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function decodeImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () =>
      reject(new Error("That image could not be decoded. Choose another file."));
    image.onload = () => resolve(image);
    image.src = dataUrl;
  });
}
