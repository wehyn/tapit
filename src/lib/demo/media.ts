const MAX_DEMO_MEDIA_DIMENSION = 1280;
const DEMO_MEDIA_JPEG_QUALITY = 0.78;

export async function prepareDemoMediaDataUrl(file: File): Promise<string> {
  if (
    typeof document === "undefined" ||
    typeof FileReader === "undefined" ||
    typeof Image === "undefined"
  ) {
    throw new Error("Demo media can only be prepared in a browser.");
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onerror = () => reject(new Error("That image could not be decoded. Try again."));
      element.onload = () => resolve(element);
      element.src = sourceUrl;
    });
    const scale = Math.min(
      1,
      MAX_DEMO_MEDIA_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context || typeof canvas.toBlob !== "function")
      throw new Error("This browser cannot prepare demo media.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (nextBlob) =>
          nextBlob
            ? resolve(nextBlob)
            : reject(new Error("That image could not be converted. Try again.")),
        "image/jpeg",
        DEMO_MEDIA_JPEG_QUALITY,
      );
    });
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("That image could not be stored. Try again."));
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("That image could not be stored. Try again."));
      reader.readAsDataURL(blob);
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
