import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  pathname: "/",
  auth: { isAuthenticated: false, isLoading: true },
  replace: vi.fn(),
}));
const convexHooks = vi.hoisted(() => ({
  useQuery: vi.fn((...args: unknown[]) => {
    void args;
    return undefined;
  }),
}));

vi.mock("@convex-dev/auth/nextjs", () => ({
  ConvexAuthNextjsProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@convex-dev/auth/react", () => ({
  ConvexAuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useConvexAuth: () => authState.auth,
}));
vi.mock("convex/react", () => ({
  ConvexReactClient: class {
    constructor(...args: unknown[]) {
      void args;
    }
  },
  useQuery: convexHooks.useQuery,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => authState.pathname,
  useRouter: () => ({ replace: authState.replace }),
}));

let LiveProviders: typeof import("@/components/providers/LiveProviders").LiveProviders;

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
  ({ LiveProviders } = await import("@/components/providers/LiveProviders"));
});

beforeEach(() => {
  authState.pathname = "/";
  authState.auth = { isAuthenticated: false, isLoading: true };
  authState.replace.mockReset();
  convexHooks.useQuery.mockReset();
  convexHooks.useQuery.mockReturnValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("live route authentication boundary", () => {
  it("shows public page content while session restoration is pending", () => {
    render(
      <LiveProviders>
        <main>Tapit home content</main>
      </LiveProviders>,
    );

    expect(screen.getByText("Tapit home content")).toBeInTheDocument();
  });

  it("skips the access lookup on authenticated public pages", () => {
    authState.auth = { isAuthenticated: true, isLoading: false };

    render(
      <LiveProviders>
        <main>Tapit home content</main>
      </LiveProviders>,
    );

    expect(screen.getByText("Tapit home content")).toBeInTheDocument();
    expect(convexHooks.useQuery.mock.calls.map((call) => call[1])).toContain("skip");
  });

  it("keeps protected content hidden while session restoration is pending", () => {
    authState.pathname = "/app/profile";

    render(
      <LiveProviders>
        <main>Private profile content</main>
      </LiveProviders>,
    );

    expect(screen.queryByText("Private profile content")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading your Tapit workspace...");
  });

  it("keeps the access lookup enabled on authenticated protected pages", () => {
    authState.pathname = "/app/profile";
    authState.auth = { isAuthenticated: true, isLoading: false };

    render(
      <LiveProviders>
        <main>Private profile content</main>
      </LiveProviders>,
    );

    expect(convexHooks.useQuery.mock.calls.map((call) => call[1])).toContainEqual({});
    expect(screen.queryByText("Private profile content")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading your Tapit workspace...");
  });
});
