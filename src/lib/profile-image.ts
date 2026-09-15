const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1200;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateProfileImageFile(file: File): string | null {
  if (!IMAGE_TYPES.has(file.type)) return "Use a JPG, PNG, or WebP image.";
  if (file.size > MAX_IMAGE_BYTES) return "Images must be 5 MB or smaller.";
  return null;
}

export async function prepareProfileImage(file: File): Promise<Blob> {
  const validationError = validateProfileImageFile(file);
  if (validationError) throw new Error(validationError);
  if (typeof FileReader === "undefined" || typeof Image === "undefined") {
    throw new Error("This browser cannot prepare profile images.");
  }
  if (typeof document === "undefined") {
    throw new Error("Profile images can only be prepared in a browser.");
  }

  const dataUrl = await readAsDataUrl(file);
  const image = await decodeImage(dataUrl);
  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("This browser cannot prepare profile images because canvas is unavailable.");
  if (typeof canvas.toBlob !== "function")
    throw new Error(
      "This browser cannot prepare profile images because canvas export is unavailable.",
    );
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("That image could not be converted."))),
      "image/jpeg",
      0.8,
    );
  });
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
