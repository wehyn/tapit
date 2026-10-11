import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "tapit:demo-state:v1";
const futureVersionState = JSON.stringify({
  profile: { id: "future-profile" },
  cards: [],
  customers: [],
  __tapitMediaDataUrls: [],
  __tapitMediaCodecVersion: 3,
});

describe("demo storage store", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("preserves a future-version state when loading it", async () => {
    localStorage.setItem(STORAGE_KEY, futureVersionState);
    const { getDemoState } = await import("../../src/lib/demo/store");

    expect(getDemoState().profile.id).toBeDefined();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(futureVersionState);
  });

  it("rejects updates that would overwrite a future-version state", async () => {
    localStorage.setItem(STORAGE_KEY, futureVersionState);
    const { updateDemoState } = await import("../../src/lib/demo/store");

    let updateError: unknown;
    try {
      updateDemoState((current) => ({ ...current, supportUrl: "/stale-write" }));
    } catch (error) {
      updateError = error;
    }

    expect(updateError).toBeInstanceOf(Error);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(futureVersionState);
  });

  it("does not reset a future-version state before checking its format", async () => {
    localStorage.setItem(STORAGE_KEY, futureVersionState);
    const { resetDemoState } = await import("../../src/lib/demo/store");

    expect(() => resetDemoState()).toThrow(/unsupported format/i);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(futureVersionState);
  });

  it("does not overwrite storage changed by another tab", async () => {
    const initialState = JSON.stringify({
      profile: { id: "current-profile", draft: {} },
      cards: [],
      customers: [],
    });
    localStorage.setItem(STORAGE_KEY, initialState);
    const { getDemoState, updateDemoState } = await import("../../src/lib/demo/store");
    getDemoState();
    localStorage.setItem(STORAGE_KEY, futureVersionState);

    expect(() =>
      updateDemoState((current) => ({ ...current, supportUrl: "/stale-write" })),
    ).toThrow(/changed in another tab/i);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(futureVersionState);
  });
});
