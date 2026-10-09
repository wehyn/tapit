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
});
