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

  it.each([
    [
      "malformed nested profile data",
      JSON.stringify({
        profile: { id: "legacy", draft: null },
        cards: [],
        customers: [],
      }),
    ],
    [
      "an unresolved media sidecar reference",
      JSON.stringify({
        profile: { id: "legacy", draft: { imageUrl: "\u0001tapit-media:4" } },
        cards: [],
        customers: [],
        __tapitMediaDataUrls: ["data:image/png;base64,abc"],
      }),
    ],
    [
      "a malformed customer entry",
      JSON.stringify({
        profile: { id: "legacy", draft: {} },
        cards: [],
        customers: [null],
      }),
    ],
    [
      "a malformed card entry",
      JSON.stringify({
        profile: { id: "legacy", draft: {} },
        cards: [null],
        customers: [],
      }),
    ],
    [
      "a malformed analytics collection",
      JSON.stringify({
        profile: { id: "legacy", draft: {} },
        cards: [],
        customers: [],
        analytics: {},
      }),
    ],
  ])("preserves raw data and blocks destructive writes for %s", async (_case, raw) => {
    localStorage.setItem(STORAGE_KEY, raw);
    const { refreshDemoAccessSnapshot, resetDemoState, updateDemoState } =
      await import("../../src/lib/demo/store");

    expect(refreshDemoAccessSnapshot()).toEqual({
      kind: "unavailable",
      reason: "saved-demo-data-unreadable",
    });
    expect(() => updateDemoState((current) => ({ ...current, supportUrl: "/stale" }))).toThrow();
    expect(() => resetDemoState()).toThrow();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
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

  it("adopts supported changes from another tab before allowing a save", async () => {
    const { getDemoState, subscribeDemoState, updateDemoState } =
      await import("../../src/lib/demo/store");
    const unsubscribe = subscribeDemoState(() => {});
    const externalState = { ...getDemoState(), supportUrl: "https://other-tab.example" };
    const raw = JSON.stringify(externalState);
    localStorage.setItem(STORAGE_KEY, raw);
    window.dispatchEvent(
      new StorageEvent("storage", { key: STORAGE_KEY, newValue: raw, storageArea: localStorage }),
    );

    expect(getDemoState().supportUrl).toBe("https://other-tab.example");
    expect(() =>
      updateDemoState((current) => ({ ...current, supportUrl: "https://this-tab.example" })),
    ).not.toThrow();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").supportUrl).toBe(
      "https://this-tab.example",
    );

    unsubscribe();
  });

  it("clears a malformed session from the snapshot without deleting its bytes", async () => {
    const { getDemoSession, subscribeDemoState } = await import("../../src/lib/demo/store");
    const unsubscribe = subscribeDemoState(() => {});
    localStorage.setItem(SESSION_KEY, "not-json");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SESSION_KEY,
        newValue: "not-json",
        storageArea: localStorage,
      }),
    );

    expect(getDemoSession()).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBe("not-json");

    unsubscribe();
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
