import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE_MEDIA,
  MAX_PROFILE_SLIDESHOW_IMAGES,
  normalizeProfileMedia,
  removeProfileMediaSlide,
  reorderProfileMediaSlides,
  stripProfileMediaUrls,
  validateProfileMedia,
  type ProfileMediaPresentation,
} from "../../src/lib/profile-media";

describe("profile media contract", () => {
  it("defaults autoplay on with no media regions", () => {
    expect(DEFAULT_PROFILE_MEDIA).toEqual({
      heroHeight: 320,
      autoplay: true,
      slideshow: [],
    });
  });

  it("does not expose a mutable shared default slideshow", () => {
    expect(Object.isFrozen(DEFAULT_PROFILE_MEDIA)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PROFILE_MEDIA.slideshow)).toBe(true);
    expect(() =>
      (DEFAULT_PROFILE_MEDIA.slideshow as unknown as ProfileMediaPresentation["slideshow"]).push({
        assetId: "mutated",
        altText: "Mutated",
      }),
    ).toThrow();
  });

  it("accepts bounded crop and hero values", () => {
    expect(
      validateProfileMedia({
        heroHeight: 360,
        autoplay: false,
        background: {
          assetId: "asset-background",
          altText: "Warm studio wall",
          positionX: 25,
          positionY: 70,
          url: "https://cdn.test/background.jpg",
        },
        slideshow: [
          { assetId: "asset-one", altText: "Desk detail", url: "https://cdn.test/one.jpg" },
        ],
      }),
    ).toEqual([]);
  });

  it("rejects more than ten frames, duplicate assets, and invalid accessibility text", () => {
    const frames = Array.from({ length: MAX_PROFILE_SLIDESHOW_IMAGES + 1 }, (_, index) => ({
      assetId: "asset-" + index,
      altText: "Frame",
    }));
    expect(
      validateProfileMedia({
        heroHeight: 320,
        autoplay: true,
        slideshow: frames,
      }),
    ).toContain("A slideshow can contain at most ten images.");
    expect(
      validateProfileMedia({
        heroHeight: 320,
        autoplay: true,
        slideshow: [frames[0]!, frames[0]!],
      }),
    ).toContain("Slideshow images must be unique.");
    expect(
      validateProfileMedia({
        heroHeight: 320,
        autoplay: true,
        background: {
          assetId: "asset-background",
          altText: "",
          positionX: 0,
          positionY: 0,
        },
        slideshow: [],
      }),
    ).toContain("A background image needs an accessible description.");
  });

  it("normalizes bounded values and filters malformed optional media", () => {
    expect(
      normalizeProfileMedia({
        heroHeight: 999,
        autoplay: false,
        background: {
          assetId: "background",
          altText: "  Backdrop  ",
          positionX: -10,
          positionY: 140,
        },
        slideshow: [
          { assetId: "one", altText: "  First frame  " },
          { assetId: "one", altText: "Duplicate" },
          { assetId: "", altText: "Missing asset" },
          { assetId: "two", altText: "" },
        ],
      }),
    ).toEqual({
      heroHeight: 520,
      autoplay: false,
      background: {
        assetId: "background",
        altText: "Backdrop",
        positionX: 0,
        positionY: 100,
      },
      slideshow: [{ assetId: "one", altText: "First frame" }],
    });
  });

  it("defaults malformed autoplay values to enabled", () => {
    const normalized = normalizeProfileMedia({
      autoplay: "false",
      background: {
        assetId: "background",
        altText: "Backdrop",
        positionX: 50,
        positionY: 50,
      },
      slideshow: [],
    });

    expect(normalized?.autoplay).toBe(true);
    expect(
      validateProfileMedia({
        heroHeight: 320,
        autoplay: "false",
        slideshow: [],
      } as unknown),
    ).toContain("Media autoplay must be a boolean.");
  });

  it("handles malformed optional media without throwing", () => {
    expect(validateProfileMedia(null)).toEqual([]);
    expect(() => validateProfileMedia([null, { slideshow: "nope" }] as unknown)).not.toThrow();
    expect(() => normalizeProfileMedia({ slideshow: [null, 42, { assetId: null }] })).not.toThrow();
    expect(stripProfileMediaUrls(null)).toBeUndefined();
    expect(stripProfileMediaUrls({ heroHeight: 320, autoplay: true })).toBeUndefined();
  });

  it("strips owner-only URLs before persistence", () => {
    expect(
      stripProfileMediaUrls({
        heroHeight: 320,
        autoplay: true,
        background: {
          assetId: "asset-background",
          altText: "Backdrop",
          positionX: 50,
          positionY: 50,
          url: "https://cdn.test/background.jpg",
        },
        slideshow: [
          {
            assetId: "asset-one",
            altText: "Frame",
            url: "https://cdn.test/one.jpg",
          },
        ],
      }),
    ).toEqual({
      heroHeight: 320,
      autoplay: true,
      background: {
        assetId: "asset-background",
        altText: "Backdrop",
        positionX: 50,
        positionY: 50,
      },
      slideshow: [{ assetId: "asset-one", altText: "Frame" }],
    });
  });

  it("reorders and removes slides without mutating the source", () => {
    const media: ProfileMediaPresentation = {
      ...DEFAULT_PROFILE_MEDIA,
      slideshow: [
        { assetId: "one", altText: "One" },
        { assetId: "two", altText: "Two" },
        { assetId: "three", altText: "Three" },
      ],
    };

    const reordered = reorderProfileMediaSlides(media, 0, 2);
    const removed = removeProfileMediaSlide(reordered, 1);

    expect(reordered.slideshow.map((slide) => slide.assetId)).toEqual(["two", "three", "one"]);
    expect(removed.slideshow.map((slide) => slide.assetId)).toEqual(["two", "one"]);
    expect(media.slideshow.map((slide) => slide.assetId)).toEqual(["one", "two", "three"]);
  });
});
