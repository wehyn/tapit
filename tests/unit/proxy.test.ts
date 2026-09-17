import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authMiddleware: vi.fn(() => vi.fn(() => "auth-proxy")),
  next: vi.fn(({ request }) => ({ kind: "demo-proxy", request })),
  redirect: vi.fn((url: URL) => ({ kind: "redirect", url: url.toString() })),
}));

vi.mock("@convex-dev/auth/nextjs/server", () => ({
  convexAuthNextjsMiddleware: mocks.authMiddleware,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    next: mocks.next,
    redirect: mocks.redirect,
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("proxy mode selection", () => {
  it("keeps hosted demo on the client-authenticated pass-through proxy", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "convex");

    const { proxy } = await import("../../proxy");
    const request = {} as Parameters<typeof proxy>[0];

    expect(proxy(request, {} as Parameters<typeof proxy>[1])).toEqual({
      kind: "demo-proxy",
      request,
    });
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

  it("routes live mode through the Convex auth proxy", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "convex");

    const { proxy } = await import("../../proxy");
    const request = {} as Parameters<typeof proxy>[0];

    expect(proxy(request, {} as Parameters<typeof proxy>[1])).toBe("auth-proxy");
  });

  it("redirects unauthenticated protected requests in the auth callback", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    const { proxy } = await import("../../proxy");
    const { convexAuthNextjsMiddleware } = await import("@convex-dev/auth/nextjs/server");
    const callback = vi.mocked(convexAuthNextjsMiddleware).mock.calls[0]?.[0] as (
      request: Parameters<typeof proxy>[0],
      context: { convexAuth: { isAuthenticated: () => Promise<boolean> } },
    ) => Promise<unknown>;
    const request = {
      url: "https://tapit.test/admin/customers?from=proxy",
      nextUrl: { pathname: "/admin/customers", search: "?from=proxy" },
    } as Parameters<typeof proxy>[0];

    const result = await callback(request, {
      convexAuth: { isAuthenticated: async () => false },
    });

    expect(result).toEqual({
      kind: "redirect",
      url: "https://tapit.test/login?next=%2Fadmin%2Fcustomers%3Ffrom%3Dproxy",
    });
  });
});
