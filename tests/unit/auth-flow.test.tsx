import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const signIn = vi.fn();
const signOut = vi.fn();
const useQuery = vi.fn();
const mutation = vi.fn();
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
    useMutation: () => mutation,
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

async function loadDemoCustomerShell() {
  vi.resetModules();
  const [{ CustomerShell }, { resetDemoState, setDemoSession }] = await Promise.all([
    import("../../src/components/layout/CustomerShell"),
    import("../../src/lib/demo/store"),
  ]);
  return { CustomerShell, resetDemoState, setDemoSession };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  replace.mockReset();
  signIn.mockReset();
  signOut.mockReset();
  mutation.mockReset();
  useQuery.mockReset();
  currentPath = "/login";
  useConvexAuth.mockReset();
  useConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
  useQuery.mockReturnValue(undefined);
});

async function loadOnboarding() {
  vi.resetModules();
  return (await import("../../src/components/auth/OnboardingForm")).OnboardingForm;
}

async function loadSetup() {
  vi.resetModules();
  return (await import("../../src/components/auth/SetupForm")).SetupForm;
}

describe("Google OAuth login", () => {
  it("renders one Google action and no password or email controls in live mode", async () => {
    const LoginForm = await loadLogin();
    render(<LoginForm />);

    expect(screen.getAllByRole("button", { name: "Continue with Google" })).toHaveLength(1);
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByText(/verification|resend|reset|sign up/i)).not.toBeInTheDocument();
  }, 15_000);

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
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it.each([
    ["invitation-required", /use your invitation link/i],
    ["account-inactive", /account is inactive/i],
  ])("explains the %s login reason without creating a redirect loop", async (reason, copy) => {
    const LoginForm = await loadLogin();

    render(<LoginForm reason={reason as "invitation-required" | "account-inactive"} />);

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
    useQuery.mockReturnValue({
      authenticated: false,
      accountStatus: "unauthenticated",
      role: null,
    });
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
    [
      { authenticated: false, accountStatus: "invited", role: null },
      "/login?reason=invitation-required",
    ],
    [
      { authenticated: false, accountStatus: "deleted", role: null },
      "/login?reason=account-inactive",
    ],
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

    render(
      <LiveProviders>
        <div>content</div>
      </LiveProviders>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith(destination));
  });
});

describe("non-active workspace shells", () => {
  it.each([
    ["pending", "/onboarding"],
    ["invited", "/login?reason=invitation-required"],
    ["deleted", "/login?reason=account-inactive"],
  ])(
    "routes an admin %s account before rendering workspace content",
    async (accountStatus, destination) => {
      vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
      useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
      useQuery.mockReturnValue({ authenticated: false, accountStatus, role: null });
      const { AdminShell } = await loadShells();

      render(
        <AdminShell>
          <div>admin content</div>
        </AdminShell>,
      );

      expect(screen.queryByText("admin content")).not.toBeInTheDocument();
      await waitFor(() => expect(replace).toHaveBeenCalledWith(destination));
    },
  );

  it.each([
    ["pending", "/onboarding"],
    ["invited", "/login?reason=invitation-required"],
    ["deleted", "/login?reason=account-inactive"],
  ])(
    "routes a customer %s account before rendering workspace content",
    async (accountStatus, destination) => {
      vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
      useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
      useQuery.mockReturnValue({ authenticated: false, accountStatus, role: null });
      const { CustomerShell } = await loadShells();

      render(
        <CustomerShell>
          <div>customer content</div>
        </CustomerShell>,
      );

      expect(screen.queryByText("customer content")).not.toBeInTheDocument();
      await waitFor(() => expect(replace).toHaveBeenCalledWith(destination));
    },
  );

  it("keeps an active customer workspace visible while the access response is on the legacy shape", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockReturnValue({
      authenticated: true,
      role: "customer",
      accountId: "customer_1",
      profileId: "profile_1",
    });
    const { CustomerShell } = await loadShells();

    render(
      <CustomerShell>
        <div>customer content</div>
      </CustomerShell>,
    );

    expect(screen.getByText("customer content")).toBeInTheDocument();
  });

  it("marks Customize active for an active customer at /app/customize", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
    currentPath = "/app/customize";
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockReturnValue({
      authenticated: true,
      accountStatus: "active",
      role: "customer",
      accountId: "customer_1",
      profileId: "profile_1",
    });
    const { CustomerShell } = await loadShells();

    render(
      <CustomerShell>
        <div>customization content</div>
      </CustomerShell>,
    );

    expect(screen.getByText("customization content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Customize" })).toHaveAttribute(
      "href",
      "/app/customize",
    );
    expect(screen.getByRole("link", { name: "Customize" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Profile" })).not.toHaveAttribute("aria-current");
  });

  it("hides Customize from an active admin while keeping Profile in CustomerShell", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
    currentPath = "/app/profile";
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockReturnValue({
      authenticated: true,
      accountStatus: "active",
      role: "admin",
      accountId: "admin_1",
      profileId: "profile_1",
    });
    const { CustomerShell } = await loadShells();

    render(
      <CustomerShell>
        <div>admin profile content</div>
      </CustomerShell>,
    );

    expect(screen.getByText("admin profile content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Customize" })).not.toBeInTheDocument();
  });

  it("hides Customize from an admin session in demo CustomerShell while keeping Profile", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    currentPath = "/app/profile";
    localStorage.clear();
    const { CustomerShell, resetDemoState, setDemoSession } = await loadDemoCustomerShell();
    resetDemoState();
    setDemoSession({ email: "admin@tapit.local", role: "admin" });

    render(
      <CustomerShell>
        <div>demo admin profile content</div>
      </CustomerShell>,
    );

    expect(screen.getByText("demo admin profile content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Customize" })).not.toBeInTheDocument();
  });

  it("keeps an active admin workspace visible while the access response is on the legacy shape", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockReturnValue({
      authenticated: true,
      role: "admin",
      accountId: "customer_1",
      profileId: "profile_1",
    });
    const { AdminShell } = await loadShells();

    render(
      <AdminShell>
        <div>admin content</div>
      </AdminShell>,
    );

    expect(screen.getByText("admin content")).toBeInTheDocument();
  });
});

describe("pending Google onboarding", () => {
  it("explains that invited accounts must use their setup link", async () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockReturnValue({
      authenticated: false,
      accountStatus: "invited",
      role: null,
      accountId: "customer_1",
      profileId: null,
      onboardingName: null,
    });
    const OnboardingForm = await loadOnboarding();

    render(<OnboardingForm />);

    expect(screen.getByRole("alert")).toHaveTextContent(/use your invitation link/i);
  });

  it("routes an already active account back to its profile", async () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockReturnValue({
      authenticated: true,
      accountStatus: "active",
      role: "customer",
      accountId: "customer_1",
      profileId: "profile_1",
      onboardingName: "Existing Name",
    });
    const OnboardingForm = await loadOnboarding();

    render(<OnboardingForm />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/profile"));
  });

  it("prefills the server-provided name and completes private profile onboarding", async () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockReturnValue({
      authenticated: false,
      accountStatus: "pending",
      role: null,
      accountId: "customer_1",
      profileId: null,
      onboardingName: "Google Display Name",
    });
    mutation.mockResolvedValue({ slug: "google-display-name" });
    const OnboardingForm = await loadOnboarding();
    const user = userEvent.setup();

    render(<OnboardingForm />);

    const name = screen.getByLabelText("Display name");
    expect(name).toHaveValue("Google Display Name");
    expect(screen.getByText(/private draft/i)).toBeInTheDocument();
    await user.clear(name);
    await user.type(name, "Updated Name");
    await user.click(screen.getByRole("button", { name: /complete onboarding/i }));

    expect(mutation).toHaveBeenCalledWith({ name: "Updated Name" });
    expect(screen.getByText(/google-display-name/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to your profile" }));
    expect(replace).toHaveBeenCalledWith("/app/profile");
  });

  it("requires confirmation before deleting a pending account and signs out", async () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockReturnValue({
      authenticated: false,
      accountStatus: "pending",
      role: null,
      accountId: "customer_1",
      profileId: null,
      onboardingName: "Google Display Name",
    });
    mutation.mockResolvedValue(null);
    const OnboardingForm = await loadOnboarding();
    const user = userEvent.setup();

    render(<OnboardingForm />);
    await user.click(screen.getByRole("button", { name: /delete pending account/i }));
    expect(screen.getByRole("button", { name: /confirm delete account/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirm delete account/i }));

    expect(mutation).toHaveBeenCalledWith({});
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith("/login");
  });
});

describe("reusable Google invitation setup", () => {
  it("hashes the route token and queries invitation status without sending the raw token", async () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    useQuery.mockReturnValue({
      state: "valid",
      email: "invite@example.test",
      profileName: "Invited Profile",
      acceptedAt: null,
    });
    const SetupForm = await loadSetup();

    render(<SetupForm token="raw-secret-token" />);

    expect(await screen.findByText("invite@example.test")).toBeInTheDocument();
    await waitFor(() => {
      const statusCall = useQuery.mock.calls.find(([, args]) => args !== "skip");
      expect(statusCall?.[1]).toEqual({
        tokenHash: expect.any(String),
      });
      expect(statusCall?.[1]).not.toEqual({ tokenHash: "raw-secret-token" });
    });
    expect(mutation).not.toHaveBeenCalledWith(
      expect.objectContaining({ token: expect.anything() }),
    );
    expect(mutation).not.toHaveBeenCalledWith(
      expect.objectContaining({ email: expect.anything() }),
    );
  });

  it("offers Google OAuth on a valid unauthenticated invitation and returns to the same setup path", async () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    useQuery.mockReturnValue({
      state: "valid",
      email: "invite@example.test",
      profileName: "Invited Profile",
      acceptedAt: null,
    });
    signIn.mockResolvedValue({ signingIn: false });
    const SetupForm = await loadSetup();
    const user = userEvent.setup();

    render(<SetupForm token="raw-secret-token" />);
    await user.click(await screen.findByRole("button", { name: "Continue with Google" }));

    expect(signIn).toHaveBeenCalledWith("google", { redirectTo: "/setup/raw-secret-token" });
  });

  it("accepts a valid invitation with only the token hash and routes to the profile", async () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockReturnValue({
      state: "valid",
      email: "invite@example.test",
      profileName: "Invited Profile",
      acceptedAt: null,
    });
    mutation.mockResolvedValue({ profileId: "profile_1" });
    const SetupForm = await loadSetup();

    render(<SetupForm token="raw-secret-token" />);

    await waitFor(() => expect(mutation).toHaveBeenCalledWith({ tokenHash: expect.any(String) }));
    expect(mutation.mock.calls[0]?.[0]).not.toEqual({ tokenHash: "raw-secret-token" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/profile"));
  });

  it.each([
    ["missing", /could not be found/i],
    ["revoked", /revoked/i],
    ["expired", /expired/i],
  ])("renders the distinct %s invitation state", async (state, copy) => {
    useConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    useQuery.mockReturnValue({ state, email: null, profileName: null, acceptedAt: null });
    const SetupForm = await loadSetup();

    render(<SetupForm token="raw-secret-token" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(copy);
  });
});

describe("hosted-demo invitation setup", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "convex");
  });

  it("uses the invitation email and completes setup with the hashed token", async () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    useQuery.mockReturnValue({
      state: "valid",
      email: "invite@example.test",
      profileName: "Invited Profile",
      acceptedAt: null,
    });
    signIn.mockResolvedValue({ signingIn: false });
    mutation.mockResolvedValue({ profileId: "profile_1" });
    const SetupForm = await loadSetup();
    const user = userEvent.setup();

    render(<SetupForm token="hosted-demo-raw-token" />);

    expect(await screen.findByText("invite@example.test")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Password"), "safe-password");
    await user.type(screen.getByLabelText("Confirm password"), "safe-password");
    await user.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("password", {
        flow: "signUp",
        email: "invite@example.test",
        password: "safe-password",
      }),
    );
    await waitFor(() => expect(mutation).toHaveBeenCalledWith({ tokenHash: expect.any(String) }));
    expect(mutation.mock.calls[0]?.[0]).not.toEqual({ tokenHash: "hosted-demo-raw-token" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/profile"));
  });

  it("does not allow password signup for an invalid invitation", async () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    useQuery.mockReturnValue({ state: "revoked", email: "invite@example.test" });
    const SetupForm = await loadSetup();

    render(<SetupForm token="revoked-hosted-demo-token" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/revoked/i);
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("retries setup with password sign-in when invitation linking fails after signup", async () => {
    useConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    useQuery.mockReturnValue({
      state: "valid",
      email: "invite@example.test",
      profileName: "Invited Profile",
      acceptedAt: null,
    });
    signIn.mockResolvedValue({ signingIn: false });
    mutation
      .mockRejectedValueOnce(new Error("temporary setup failure"))
      .mockResolvedValueOnce({ profileId: "profile_1" });
    const SetupForm = await loadSetup();
    const user = userEvent.setup();

    render(<SetupForm token="hosted-demo-raw-token" />);
    await user.type(await screen.findByLabelText("Password"), "safe-password");
    await user.type(screen.getByLabelText("Confirm password"), "safe-password");
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/setup could not be completed/i);

    await user.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(signIn).toHaveBeenNthCalledWith(1, "password", {
        flow: "signUp",
        email: "invite@example.test",
        password: "safe-password",
      });
      expect(signIn).toHaveBeenNthCalledWith(2, "password", {
        flow: "signIn",
        email: "invite@example.test",
        password: "safe-password",
      });
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/profile"));
  });
});
