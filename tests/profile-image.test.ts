import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareProfileImageCrop, validateProfileImageFile } from "@/lib/profile-image";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("prepareProfileImageCrop", () => {
  it("exports a landscape source crop at 384 square pixels", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "landscape.jpg", {
      type: "image/jpeg",
    });
    class FakeImage {
      naturalWidth = 1200;
      naturalHeight = 800;
      onload: (() => void) | undefined;
      onerror: (() => void) | undefined;
      set src(_value: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal(
      "FileReader",
      class {
        result = "data:image/jpeg;base64,source";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL() {
          this.onload?.();
        }
      },
    );
    const context = {
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([10, 20, 30, 255]) }),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (callback: BlobCallback, type?: string) => callback(new Blob(["cropped"], { type })),
    };
    vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLElement);

    const result = await prepareProfileImageCrop(file, { x: 200, y: 0, size: 800 });

    expect(result.width).toBe(384);
    expect(result.contentType).toBe("image/jpeg");
    expect(result.blob.type).toBe("image/jpeg");
    expect(canvas.width).toBe(384);
    expect(canvas.height).toBe(384);
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.any(FakeImage),
      200,
      0,
      800,
      800,
      0,
      0,
      384,
      384,
    );
  });

  it("rejects a crop outside the decoded source bounds", async () => {
    const file = new File(["image"], "portrait.jpg", { type: "image/jpeg" });
    class FakeImage {
      naturalWidth = 1;
      naturalHeight = 1;
      onload: (() => void) | undefined;
      onerror: (() => void) | undefined;
      set src(_value: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal(
      "FileReader",
      class {
        result = "data:image/jpeg;base64,source";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL() {
          this.onload?.();
        }
      },
    );

    await expect(prepareProfileImageCrop(file, { x: 0, y: 0, size: 2 })).rejects.toThrow(
      "The selected crop is outside the image.",
    );
  });

  it("rejects unsupported source MIME types before browser processing", async () => {
    const file = new File(["image"], "profile.gif", { type: "image/gif" });

    await expect(prepareProfileImageCrop(file, { x: 0, y: 0, size: 1 })).rejects.toThrow(
      "Use a JPG, PNG, or WebP image.",
    );
  });

  it("uses JPEG for an opaque PNG crop and the planned quality", async () => {
    const file = new File(["image"], "profile.png", { type: "image/png" });
    class FakeImage {
      naturalWidth = 600;
      naturalHeight = 600;
      onload: (() => void) | undefined;
      onerror: (() => void) | undefined;
      set src(_value: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal(
      "FileReader",
      class {
        result = "data:image/png;base64,source";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL() {
          this.onload?.();
        }
      },
    );
    let requestedType = "";
    let requestedQuality: number | undefined;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray([10, 20, 30, 255]) }),
      }),
      toBlob: (callback: BlobCallback, type?: string, quality?: number) => {
        requestedType = type ?? "";
        requestedQuality = quality;
        callback(new Blob(["cropped"], { type }));
      },
    };
    vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLElement);

    const result = await prepareProfileImageCrop(file, { x: 0, y: 0, size: 600 });

    expect(result.contentType).toBe("image/jpeg");
    expect(result.blob.type).toBe("image/jpeg");
    expect(requestedType).toBe("image/jpeg");
    expect(requestedQuality).toBe(0.82);
  });

  it("uses PNG for transparent rendered pixels even when the source is WebP", async () => {
    const file = new File(["image"], "profile.webp", { type: "image/webp" });
    class FakeImage {
      naturalWidth = 600;
      naturalHeight = 600;
      onload: (() => void) | undefined;
      onerror: (() => void) | undefined;
      set src(_value: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal(
      "FileReader",
      class {
        result = "data:image/webp;base64,source";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL() {
          this.onload?.();
        }
      },
    );
    let requestedType = "";
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray([10, 20, 30, 127]) }),
      }),
      toBlob: (callback: BlobCallback, type?: string) => {
        requestedType = type ?? "";
        callback(new Blob(["cropped"], { type }));
      },
    };
    vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLElement);

    const result = await prepareProfileImageCrop(file, { x: 0, y: 0, size: 600 });

    expect(result.contentType).toBe("image/png");
    expect(result.blob.type).toBe("image/png");
    expect(requestedType).toBe("image/png");
  });

  it.each([
    [0, "The selected crop must have a positive pixel count."],
    [5000, "The selected crop is too large to process."],
  ])("rejects crop size %s before canvas work", async (size, message) => {
    const file = new File(["image"], "profile.jpg", { type: "image/jpeg" });
    class FakeImage {
      naturalWidth = 6000;
      naturalHeight = 6000;
      onload: (() => void) | undefined;
      onerror: (() => void) | undefined;
      set src(_value: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal(
      "FileReader",
      class {
        result = "data:image/jpeg;base64,source";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL() {
          this.onload?.();
        }
      },
    );

    await expect(prepareProfileImageCrop(file, { x: 0, y: 0, size })).rejects.toThrow(message);
  });
});

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
