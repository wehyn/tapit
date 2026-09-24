import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const signIn = vi.fn();
const signOut = vi.fn();
const useQuery = vi.fn();
const useConvexAuth = vi.fn();
let currentPath = "/login";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn, signOut }),
  useConvexAuth: () => useConvexAuth(),
}));

vi.mock("@convex-dev/auth/nextjs", () => ({
  ConvexAuthNextjsProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useMutation: () => vi.fn(),
    useQuery: (...args: unknown[]) => useQuery(...args),
  };
});

async function loadLogin() {
  vi.resetModules();
  return (await import("../../src/components/auth/LoginForm")).LoginForm;
}

async function loadProviders() {
  vi.resetModules();
  return (await import("../../src/components/providers/LiveProviders")).LiveProviders;
}

async function loadShells() {
  vi.resetModules();
  const [{ AdminShell }, { CustomerShell }] = await Promise.all([
    import("../../src/components/layout/AdminShell"),
    import("../../src/components/layout/CustomerShell"),
  ]);
  return { AdminShell, CustomerShell };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  replace.mockReset();
  signIn.mockReset();
  signOut.mockReset();
  useQuery.mockReset();
  currentPath = "/login";
  useConvexAuth.mockReset();
  useConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
  useQuery.mockReturnValue(undefined);
});

describe("Google OAuth login", () => {
  it("renders one Google action and no password or email controls in live mode", async () => {
    const LoginForm = await loadLogin();
    render(<LoginForm />);

    expect(screen.getAllByRole("button", { name: "Continue with Google" })).toHaveLength(1);
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByText(/verification|resend|reset|sign up/i)).not.toBeInTheDocument();
  });

  it.each([
    [undefined, "/app/profile"],
    ["/setup/token-value", "/setup/token-value"],
    ["https://evil.example/setup", "/app/profile"],
    ["//evil.example/setup", "/app/profile"],
    ["/\\\\evil.example/setup", "/app/profile"],
    ["/%zz", "/app/profile"],
  ])("passes a safe OAuth return path (%s)", async (nextPath, redirectTo) => {
    const LoginForm = await loadLogin();
    signIn.mockResolvedValue({ signingIn: false });
    const user = userEvent.setup();

    render(<LoginForm nextPath={nextPath} />);
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(signIn).toHaveBeenCalledWith("google", { redirectTo });
  });

  it("shows generic OAuth rejection copy and restores a retry action", async () => {
    const LoginForm = await loadLogin();
    signIn.mockRejectedValue(new Error("provider_secret=do-not-render"));
    const user = userEvent.setup();

    render(<LoginForm />);
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be completed/i);
    expect(screen.getByRole("alert")).not.toHaveTextContent("provider_secret");
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled());
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it.each([
    ["invitation-required", /use your invitation link/i],
    ["account-inactive", /account is inactive/i],
  ])("explains the %s login reason without creating a redirect loop", async (reason, copy) => {
    const LoginForm = await loadLogin();

    render(<LoginForm reason={reason} />);

    expect(screen.getByRole("alert")).toHaveTextContent(copy);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });
});

describe("demo auth isolation", () => {
  it("keeps the local deterministic email and password form", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    const LoginForm = await loadLogin();

    render(<LoginForm />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
  });

  it("keeps hosted demo on its isolated password form", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "convex");
    useQuery.mockReturnValue({ authenticated: false, accountStatus: "unauthenticated", role: null });
    const LoginForm = await loadLogin();

    render(<LoginForm />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
  });
});

describe("state-aware live redirects", () => {
  it.each([
    [{ authenticated: false, accountStatus: "pending", role: null }, "/onboarding"],
    [{ authenticated: false, accountStatus: "invited", role: null }, "/login?reason=invitation-required"],
    [{ authenticated: false, accountStatus: "deleted", role: null }, "/login?reason=account-inactive"],
    [{ authenticated: true, accountStatus: "active", role: "admin" }, "/admin"],
    [{ authenticated: true, accountStatus: "active", role: "customer" }, "/app/profile"],
  ])("routes %j to %s", async (access, destination) => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
    if (access.accountStatus === "invited" || access.accountStatus === "deleted") {
      currentPath = "/app/profile";
    }
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockReturnValue(access);
    const LiveProviders = await loadProviders();

    render(<LiveProviders><div>content</div></LiveProviders>);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(destination));
  });
});

describe("non-active workspace shells", () => {
  it.each([
    ["pending", "/onboarding"],
    ["invited", "/login?reason=invitation-required"],
    ["deleted", "/login?reason=account-inactive"],
  ])("routes an admin %s account before rendering workspace content", async (accountStatus, destination) => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockReturnValue({ authenticated: false, accountStatus, role: null });
    const { AdminShell } = await loadShells();

    render(<AdminShell><div>admin content</div></AdminShell>);

    expect(screen.queryByText("admin content")).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(destination));
  });

  it.each([
    ["pending", "/onboarding"],
    ["invited", "/login?reason=invitation-required"],
    ["deleted", "/login?reason=account-inactive"],
  ])("routes a customer %s account before rendering workspace content", async (accountStatus, destination) => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockReturnValue({ authenticated: false, accountStatus, role: null });
    const { CustomerShell } = await loadShells();

    render(<CustomerShell><div>customer content</div></CustomerShell>);

    expect(screen.queryByText("customer content")).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(destination));
  });
});
