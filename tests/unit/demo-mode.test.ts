import { afterEach, describe, expect, it, vi } from "vitest";

import { isDemoMode, isHostedDemoMode, isLiveMode, isLocalDemoMode } from "@/lib/demo/mode";

const originalDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE;
const originalDemoStorage = process.env.NEXT_PUBLIC_DEMO_STORAGE;

afterEach(() => {
  if (originalDemoMode === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE;
  else process.env.NEXT_PUBLIC_DEMO_MODE = originalDemoMode;
  if (originalDemoStorage === undefined) delete process.env.NEXT_PUBLIC_DEMO_STORAGE;
  else process.env.NEXT_PUBLIC_DEMO_STORAGE = originalDemoStorage;
});

describe("demo mode", () => {
  it("selects live mode when demo mode is false", () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    delete process.env.NEXT_PUBLIC_DEMO_STORAGE;

    expect(isDemoMode()).toBe(false);
    expect(isLiveMode()).toBe(true);
    expect(isLocalDemoMode()).toBe(false);
    expect(isHostedDemoMode()).toBe(false);
  });

  it("defaults to local demo mode when storage is absent", () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    delete process.env.NEXT_PUBLIC_DEMO_STORAGE;

    expect(isDemoMode()).toBe(true);
    expect(isLocalDemoMode()).toBe(true);
    expect(isHostedDemoMode()).toBe(false);
    expect(isLiveMode()).toBe(false);
  });

  it("selects hosted demo mode when Convex storage is configured", () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    process.env.NEXT_PUBLIC_DEMO_STORAGE = "convex";

    expect(isDemoMode()).toBe(true);
    expect(isHostedDemoMode()).toBe(true);
    expect(isLocalDemoMode()).toBe(false);
    expect(isLiveMode()).toBe(false);
  });

  it("exposes the mode variables as build-time Next configuration", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    process.env.NEXT_PUBLIC_DEMO_STORAGE = "convex";
    vi.resetModules();

    const { default: nextConfig } = await import("../../next.config");

    expect(nextConfig.env).toMatchObject({
      NEXT_PUBLIC_DEMO_MODE: "true",
      NEXT_PUBLIC_DEMO_STORAGE: "convex",
    });
  });
});
