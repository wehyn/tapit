import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "tapit:demo-state:v1";
const SESSION_KEY = "tapit:demo-session:v1";
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

  afterEach(() => vi.restoreAllMocks());

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

  it("does not reset over future-version data written after hydration", async () => {
    const { getDemoState, resetDemoState } = await import("../../src/lib/demo/store");
    getDemoState();
    localStorage.setItem(STORAGE_KEY, futureVersionState);

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

  it("keeps the in-memory session unchanged when session storage writes fail", async () => {
    const { clearDemoSession, getDemoSession, setDemoSession } =
      await import("../../src/lib/demo/store");
    const originalSetItem = Storage.prototype.setItem;
    const blockedSetItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === SESSION_KEY) throw new DOMException("Storage is full", "QuotaExceededError");
      return originalSetItem.call(this, key, value);
    });

    let sessionWriteError: unknown;
    try {
      setDemoSession({ email: "mara@example.test", role: "customer" });
    } catch (error) {
      sessionWriteError = error;
    }
    expect(getDemoSession()).toBeNull();
    expect(sessionWriteError).toBeInstanceOf(Error);
    expect(sessionWriteError).toMatchObject({
      message: expect.stringMatching(/could not save tapit data locally/i),
    });

    blockedSetItem.mockRestore();
    setDemoSession({ email: "mara@example.test", role: "customer" });
    const originalRemoveItem = Storage.prototype.removeItem;
    const blockedRemoveItem = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(function (this: Storage, key: string) {
        if (key === SESSION_KEY) throw new DOMException("Storage is blocked", "SecurityError");
        return originalRemoveItem.call(this, key);
      });

    const clearResult = clearDemoSession();
    expect(getDemoSession()).toEqual({ email: "mara@example.test", role: "customer" });
    expect(clearResult).toBe(false);
    blockedRemoveItem.mockRestore();
  });

  it("does not crash or change memory when localStorage reads are blocked", async () => {
    const originalGetItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === STORAGE_KEY || key === SESSION_KEY)
        throw new DOMException("Storage is blocked", "SecurityError");
      return originalGetItem.call(this, key);
    });
    const { getDemoSession, getDemoState, subscribeDemoState, updateDemoState } =
      await import("../../src/lib/demo/store");

    expect(() => getDemoState()).not.toThrow();
    expect(() => getDemoSession()).not.toThrow();
    expect(() => subscribeDemoState(() => undefined)).not.toThrow();
    const before = getDemoState();

    expect(() =>
      updateDemoState((current) => ({ ...current, supportUrl: "/unsaved-support-url" })),
    ).toThrow(/could not save tapit data locally/i);
    expect(getDemoState()).toBe(before);
  });
});
