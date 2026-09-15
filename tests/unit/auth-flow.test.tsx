import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const signIn = vi.fn();
const signOut = vi.fn();
const createAccount = vi.fn();
const useQuery = vi.fn();
const useConvexAuth = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn, signOut }),
  useConvexAuth: () => useConvexAuth(),
}));

vi.mock("convex/react", () => ({
  useMutation: () => createAccount,
  useQuery: (...args: unknown[]) => useQuery(...args),
}));

async function loadLiveLogin() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  return (await import("../../src/components/auth/LoginForm")).LoginForm;
}

async function loadLiveSetup() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  return (await import("../../src/components/auth/SetupForm")).SetupForm;
}

function configureLiveHooks() {
  useConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
  useQuery.mockImplementation((reference: unknown, args?: unknown) => {
    if (args === "skip") return undefined;
    return reference ? { authenticated: false } : undefined;
  });
  createAccount.mockResolvedValue(undefined);
}

beforeEach(() => {
  replace.mockReset();
  signIn.mockReset();
  signOut.mockReset();
  createAccount.mockReset();
  useQuery.mockReset();
  useConvexAuth.mockReset();
  configureLiveHooks();
});

describe("live authentication state machine", () => {
  it("uses identical generic reset copy for known and unknown emails and disables pending submit", async () => {
    const LoginForm = await loadLiveLogin();
    let resolveKnown!: (value: { signingIn: false }) => void;
    const pending = new Promise<{ signingIn: false }>((resolve) => {
      resolveKnown = resolve;
    });
    signIn.mockReturnValue(pending);

    const user = userEvent.setup();
    const { unmount } = render(<LoginForm />);
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Email"), "known@example.test");
    await user.click(screen.getByRole("button", { name: "Send reset instructions" }));
    expect(screen.getByRole("button", { name: "Sending reset instructions" })).toBeDisabled();

    resolveKnown({ signingIn: false });
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    const knownCopy = screen.getByRole("status").textContent;
    unmount();

    signIn.mockResolvedValue({ signingIn: false });
    render(<LoginForm />);
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Email"), "unknown@example.test");
    await user.click(screen.getByRole("button", { name: "Send reset instructions" }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

    const unknownCopy = screen.getByRole("status").textContent;
    expect(unknownCopy).toBe(
      "If an account matches that email, reset instructions are on the way.",
    );
    expect(unknownCopy).toBe(knownCopy);
    expect(screen.queryByText(/does not exist|not found|registered/i)).not.toBeInTheDocument();
  }, 15_000);

  it("keeps the reset request reachable from an authenticated account", async () => {
    const LoginForm = await loadLiveLogin();
    useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQuery.mockImplementation((reference: unknown, args?: unknown) => {
      if (args === "skip") return undefined;
      return reference ? { authenticated: true, role: "customer" } : undefined;
    });

    render(<LoginForm resetEmail="ada@example.test" />);

    expect(await screen.findByRole("button", { name: "Send reset instructions" })).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows a verification-code form after signup needs email verification and clears password", async () => {
    const LoginForm = await loadLiveLogin();
    signIn.mockResolvedValue({ signingIn: false });
    const user = userEvent.setup();
    render(<LoginForm initialMode="signup" />);

    await user.type(screen.getByLabelText("Display name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Profile link"), "ada-lovelace");
    await user.type(screen.getByLabelText("Email"), " Ada@Example.com ");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.type(screen.getByLabelText("Confirm password"), "password");
    await user.click(screen.getByRole("button", { name: "Create your profile" }));

    expect(await screen.findByLabelText("Verification code")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify email" })).toBeEnabled();
  });

  it("shows a verification-code form when password sign-in starts email verification", async () => {
    const LoginForm = await loadLiveLogin();
    signIn.mockResolvedValue({ signingIn: false });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "ada@example.test");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByLabelText("Verification code")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.getByText(/check your email/i)).toBeInTheDocument();
  });

  it("completes reset, clears reset fields, and routes back to sign-in", async () => {
    const LoginForm = await loadLiveLogin();
    signIn.mockResolvedValueOnce({ signingIn: false }).mockResolvedValueOnce({ signingIn: true });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Email"), "ada@example.test");
    await user.click(screen.getByRole("button", { name: "Send reset instructions" }));
    await screen.findByLabelText("Verification code");
    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.type(screen.getByLabelText("New password"), "new-password");
    await user.type(screen.getByLabelText("Confirm new password"), "new-password");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(signOut).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("new-password")).not.toBeInTheDocument();
  });

  it("abandons a pending verification when switching auth modes", async () => {
    const LoginForm = await loadLiveLogin();
    signIn.mockResolvedValue({ signingIn: false });
    const user = userEvent.setup();
    render(<LoginForm initialMode="signup" />);

    await user.type(screen.getByLabelText("Display name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Profile link"), "ada-lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.test");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.type(screen.getByLabelText("Confirm password"), "password");
    await user.click(screen.getByRole("button", { name: "Create your profile" }));
    await screen.findByLabelText("Verification code");

    await user.click(screen.getByRole("button", { name: "Already have an account? Sign in" }));

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument();
  });

  it("offers a retry when verified signup profile provisioning fails", async () => {
    const LoginForm = await loadLiveLogin();
    const authState = { isAuthenticated: false, isLoading: false };
    useConvexAuth.mockImplementation(() => authState);
    signIn.mockResolvedValueOnce({ signingIn: false }).mockImplementationOnce(async () => {
      authState.isAuthenticated = true;
      return { signingIn: true };
    });
    createAccount
      .mockRejectedValueOnce(new Error("That profile link is already in use."))
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<LoginForm initialMode="signup" />);

    await user.type(screen.getByLabelText("Display name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Profile link"), "ada-lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.test");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.type(screen.getByLabelText("Confirm password"), "password");
    await user.click(screen.getByRole("button", { name: "Create your profile" }));
    await user.type(await screen.findByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify email" }));

    await screen.findByText("That profile link is already in use.");
    await user.click(screen.getByRole("button", { name: "Retry profile creation" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/profile"));
    expect(createAccount).toHaveBeenCalledTimes(2);
  });
});

describe("live invitation setup state machine", () => {
  function configureInvitation() {
    useQuery.mockImplementation((_reference: unknown, args?: unknown) => {
      if (args === "skip") return undefined;
      return { valid: true, email: "invite@example.test" };
    });
  }

  it("enables verification and resend after the signup request starts", async () => {
    const SetupForm = await loadLiveSetup();
    configureInvitation();
    signIn.mockResolvedValue({ signingIn: false });
    const user = userEvent.setup();
    render(<SetupForm token="setup-token" />);

    await screen.findByText("invite@example.test");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.type(screen.getByLabelText("Confirm password"), "password");
    await user.click(screen.getByRole("button", { name: "Set password" }));

    await screen.findByLabelText("Verification code");
    expect(screen.getByRole("button", { name: "Verify email" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Resend code" })).toBeEnabled();
  });

  it("offers a retry when completing an already-verified invitation fails", async () => {
    const SetupForm = await loadLiveSetup();
    configureInvitation();
    const authState = { isAuthenticated: false, isLoading: false };
    useConvexAuth.mockImplementation(() => authState);
    signIn.mockResolvedValueOnce({ signingIn: false }).mockImplementationOnce(async () => {
      authState.isAuthenticated = true;
      return { signingIn: true };
    });
    createAccount
      .mockRejectedValueOnce(new Error("The invitation could not be completed."))
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<SetupForm token="setup-token" />);

    await screen.findByText("invite@example.test");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.type(screen.getByLabelText("Confirm password"), "password");
    await user.click(screen.getByRole("button", { name: "Set password" }));
    await user.type(await screen.findByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify email" }));

    await screen.findByRole("button", { name: "Retry setup" });
    await user.click(screen.getByRole("button", { name: "Retry setup" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/profile"));
    expect(createAccount).toHaveBeenCalledTimes(2);
  });
});
