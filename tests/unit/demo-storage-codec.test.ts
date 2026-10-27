import { describe, expect, it } from "vitest";

import { deserializeDemoState, serializeDemoState } from "../../src/lib/demo/storage-codec";

describe("demo storage codec", () => {
  it("stores each image once across legacy, draft, and published profile copies", () => {
    const slides = Array.from(
      { length: 10 },
      (_, index) => `data:image/jpeg;base64,${String(index).repeat(120_000)}`,
    );
    const media = { slideshow: slides.map((url) => ({ url })) };
    const state = {
      profile: { draft: { media }, published: { media } },
      profiles: [{ draft: { media }, published: { media } }],
    };

    const serialized = serializeDemoState(state);
    expect(serialized.length).toBeLessThan(1_500_000);
    expect(deserializeDemoState(serialized)).toEqual(state);
  });

  it("continues to read demo state saved before media compaction", () => {
    const state = { profile: { draft: { imageUrl: "data:image/png;base64,abc" } } };
    expect(deserializeDemoState(JSON.stringify(state))).toEqual(state);
  });

  it("round-trips marker-prefixed profile text alongside an image", () => {
    const state = {
      profile: {
        draft: {
          bio: "\u0001tapit-media:0",
          media: { slideshow: [{ url: "data:image/png;base64,abc" }] },
        },
      },
    };

    expect(deserializeDemoState(serializeDemoState(state))).toEqual(state);
  });

  it("round-trips marker-prefixed text when there are no images", () => {
    const state = { profile: { draft: { bio: "\u0001tapit-media:0" } } };

    expect(deserializeDemoState(serializeDemoState(state))).toEqual(state);
  });

  it("restores data URLs in profile text from an older compacted state", () => {
    const raw = JSON.stringify({
      profile: { draft: { bio: "\u0001tapit-media:0" } },
      __tapitMediaDataUrls: ["data:image/png;base64,abc"],
    });

    expect(deserializeDemoState(raw)).toEqual({
      profile: { draft: { bio: "data:image/png;base64,abc" } },
    });
  });

  it("restores escaped v2 text when its media sidecar is missing", () => {
    const raw = JSON.stringify({
      profile: { draft: { bio: "\u0001tapit-media:\u0001tapit-media:0" } },
      __tapitMediaCodecVersion: 2,
    });

    expect(deserializeDemoState(raw)).toEqual({
      profile: { draft: { bio: "\u0001tapit-media:0" } },
    });
  });

  it.each([
    ["non-numeric suffix", "\u0001tapit-media:notes"],
    ["whitespace suffix", "\u0001tapit-media: 0"],
    ["trailing newline", "\u0001tapit-media:0\n"],
  ])("preserves invalid legacy marker text (%s)", (_case, marker) => {
    const raw = JSON.stringify({
      profile: { id: "legacy", draft: { bio: marker } },
      cards: [],
      customers: [],
      __tapitMediaDataUrls: ["data:image/png;base64,abc"],
    });

    expect(deserializeDemoState(raw)).toEqual({
      profile: { id: "legacy", draft: { bio: marker } },
      cards: [],
      customers: [],
    });
  });

  it("rejects an out-of-range legacy media reference", () => {
    const raw = JSON.stringify({
      profile: { id: "legacy", draft: { bio: "\u0001tapit-media:9" } },
      cards: [],
      customers: [],
      __tapitMediaDataUrls: ["data:image/png;base64,abc"],
    });
    expect(() => deserializeDemoState(raw)).toThrow(/media data is malformed/i);
  });

  it("rejects a malformed media sidecar", () => {
    const raw = JSON.stringify({
      profile: { id: "legacy", draft: { bio: "\u0001tapit-media:0" } },
      cards: [],
      customers: [],
      __tapitMediaDataUrls: [null],
    });

    expect(() => deserializeDemoState(raw)).toThrow(/media data is malformed/i);
  });

  it("rejects a nested media reference that has no matching sidecar value", () => {
    const raw = JSON.stringify({
      profile: { id: "legacy", draft: { imageUrl: "\u0001tapit-media:2" } },
      cards: [],
      customers: [],
      __tapitMediaDataUrls: ["data:image/png;base64,abc"],
    });
    expect(() => deserializeDemoState(raw)).toThrow(/media data is malformed/i);
  });
});
