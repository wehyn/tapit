const MAX_DEMO_MEDIA_DIMENSION = 1280;
const MIN_DEMO_MEDIA_DIMENSION = 96;
const MAX_DEMO_MEDIA_DATA_URL_LENGTH = 100_000;
const DEMO_MEDIA_JPEG_QUALITIES = [0.78, 0.64, 0.5, 0.36, 0.24, 0.16];

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That image could not be stored. Try again."));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("That image could not be stored. Try again."));
    reader.readAsDataURL(blob);
  });
}

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
    let maxDimension = MAX_DEMO_MEDIA_DIMENSION;
    while (true) {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context || typeof canvas.toBlob !== "function")
        throw new Error("This browser cannot prepare demo media.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of DEMO_MEDIA_JPEG_QUALITIES) {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (nextBlob) =>
              nextBlob
                ? resolve(nextBlob)
                : reject(new Error("That image could not be converted. Try again.")),
            "image/jpeg",
            quality,
          );
        });
        const dataUrl = await readBlobAsDataUrl(blob);
        if (dataUrl.length < MAX_DEMO_MEDIA_DATA_URL_LENGTH) return dataUrl;
      }

      if (maxDimension === MIN_DEMO_MEDIA_DIMENSION) {
        throw new Error(
          "That image is too complex to store in demo mode. Choose a smaller image or try again.",
        );
      }
      maxDimension = Math.max(MIN_DEMO_MEDIA_DIMENSION, Math.floor(maxDimension * 0.8));
    }
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
