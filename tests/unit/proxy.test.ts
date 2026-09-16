import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@convex-dev/auth/nextjs/server", () => ({
  convexAuthNextjsMiddleware: vi.fn(() => vi.fn(() => "auth-proxy")),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    next: vi.fn(({ request }) => ({ kind: "demo-proxy", request })),
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("proxy mode selection", () => {
  it("routes hosted demo through the Convex auth proxy", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "convex");

    const { proxy } = await import("../../proxy");
    const request = {} as Parameters<typeof proxy>[0];

    expect(proxy(request, {} as Parameters<typeof proxy>[1])).toBe("auth-proxy");
  });

  it("keeps local demo on the pass-through proxy", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");

    const { proxy } = await import("../../proxy");
    const request = {} as Parameters<typeof proxy>[0];

    expect(proxy(request, {} as Parameters<typeof proxy>[1])).toEqual({
      kind: "demo-proxy",
      request,
    });
  });
});
