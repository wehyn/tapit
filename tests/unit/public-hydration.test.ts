import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDemoState, recordProfileView, updateDemoState } from "../../src/lib/demo/store";

describe("demo state persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("rolls back the in-memory update and reports storage failures", () => {
    updateDemoState((current) => ({ ...current, supportUrl: "/support" }));
    const persisted = localStorage.getItem("tapit:demo-state:v1");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(() =>
      updateDemoState((current) => ({ ...current, supportUrl: "/should-not-save" })),
    ).toThrow("Could not save Tapit data locally. Your changes were not saved.");
    expect(getDemoState().supportUrl).toBe("/support");
    expect(localStorage.getItem("tapit:demo-state:v1")).toBe(persisted);

    expect(() => recordProfileView()).not.toThrow();

    setItem.mockRestore();
  });
});
