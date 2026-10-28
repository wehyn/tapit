import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  used: false,
  legacy: false,
  session: null as null | { email: string; role: "customer" | "admin" },
  claimSetup: vi.fn(),
  setDemoSession: vi.fn(),
  signIn: vi.fn(),
  mutation: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/demo/mode", () => ({ isLocalDemoMode: () => true }));
vi.mock("@/lib/auth/setup-token", () => ({ hashSetupToken: vi.fn(async () => "hashed-token") }));
vi.mock("@/lib/demo/store", () => ({
  useDemoState: () => ({ customers: mocks.legacy ? [{ setupToken: "legacy-token" }] : [] }),
  setupPreview: () => mocks.preview(),
  claimSetup: mocks.claimSetup,
  getDemoSession: () => mocks.session,
  setDemoSession: (session: typeof mocks.session) => {
    mocks.session = session;
    mocks.setDemoSession(session);
  },
}));
vi.mock("@/components/auth/SetupForm", () => ({ SetupForm: () => <p>Legacy setup</p> }));
vi.mock("@/components/auth/GoogleSignInButton", () => ({
  GoogleSignInButton: ({ onClick, pending }: { onClick: () => void; pending: boolean }) => (
    <button disabled={pending} onClick={onClick} type="button">
      Continue with Google
    </button>
  ),
}));
vi.mock("@/components/layout/Brand", () => ({ Brand: () => <span>tapit</span> }));
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: mocks.signIn }),
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("convex/react", () => ({ useMutation: () => mocks.mutation }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));

import { SetupRoute } from "@/components/auth/SetupRoute";
import {
  initialClaimState,
  transitionClaimState,
  type SetupPreview,
} from "@/components/auth/setup-claim-state";

const preview: SetupPreview = {
  name: "Mara Velasquez",
  slug: "mara-velasquez",
  bio: "Brand systems",
  links: [{ label: "Portfolio", url: "https://example.test" }],
};

beforeEach(() => {
  mocks.preview.mockReset();
  mocks.preview.mockImplementation(async () => (mocks.used ? null : null));
  mocks.used = false;
  mocks.legacy = false;
  mocks.session = null;
  mocks.claimSetup.mockReset();
  mocks.claimSetup.mockImplementation(async () => {
    mocks.used = true;
    return true;
  });
  mocks.setDemoSession.mockReset();
  mocks.signIn.mockReset();
  mocks.mutation.mockReset();
  mocks.replace.mockReset();
});

describe("prepared setup claim state", () => {
  it("allows only the legal loading, valid, signing-in, claiming, and claimed transitions", () => {
    expect(initialClaimState).toEqual({ status: "loading" });
    const valid = transitionClaimState(initialClaimState, { type: "PREVIEW_VALID", preview });
    expect(valid).toEqual({ status: "valid", preview });
    const signingIn = transitionClaimState(valid, { type: "SIGN_IN" });
    expect(signingIn).toEqual({ status: "signing-in", preview });
    const claiming = transitionClaimState(signingIn, { type: "SIGN_IN_RETURNED" });
    expect(claiming).toEqual({ status: "claiming", preview });
    expect(transitionClaimState(claiming, { type: "CLAIM_SUCCEEDED" })).toEqual({
      status: "claimed",
      preview,
    });
    expect(transitionClaimState(initialClaimState, { type: "PREVIEW_INVALID" })).toEqual({
      status: "invalid",
    });
    expect(transitionClaimState(initialClaimState, { type: "SIGN_IN" })).toEqual(initialClaimState);
  });

  it("claims a valid demo link after Continue with Google", async () => {
    mocks.preview.mockImplementation(async () => (mocks.used ? null : preview));
    const view = render(<SetupRoute token="prepared-token" />);

    expect(
      await screen.findByRole("heading", { name: "Finish setting up your profile" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Portfolio").className).toContain("rounded-full");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(
      await screen.findByRole("heading", { name: "You're all set, Mara" }),
    ).toBeInTheDocument();
    expect(mocks.setDemoSession).toHaveBeenCalledWith({
      email: "google-user-mara-velasquez@tapit.local",
      role: "customer",
    });
    expect(mocks.claimSetup).toHaveBeenCalledWith("prepared-token");

    view.unmount();
    render(<SetupRoute token="prepared-token" />);
    expect(
      await screen.findByRole("heading", { name: "This link is no longer valid" }),
    ).toBeInTheDocument();
  });

  it("uses the identical uniform invalid page for all prepared-link invalid causes", async () => {
    const causes = ["missing", "expired", "revoked", "regenerated", "used"];
    const snapshots: string[] = [];
    for (let index = 0; index < causes.length; index += 1) {
      mocks.preview.mockResolvedValueOnce(null);
      const view = render(<SetupRoute token="unavailable-token" />);
      await within(view.container).findByRole("heading", { name: "This link is no longer valid" });
      expect(
        within(view.container).getByRole("heading", { name: "This link is no longer valid" }),
      ).toBeInTheDocument();
      expect(view.container.textContent).toContain("Ask the person who sent it for a new one.");
      for (const cause of causes) expect(view.container.textContent).not.toContain(cause);
      snapshots.push(view.container.textContent ?? "");
      view.unmount();
    }
    expect(new Set(snapshots).size).toBe(1);
  });

  it("renders replay as invalid rather than a claim error", async () => {
    mocks.preview.mockResolvedValue(null);
    render(<SetupRoute token="used-token" />);
    expect(
      await screen.findByRole("heading", { name: "This link is no longer valid" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toHaveTextContent(/used|replay|error/i);
  });

  it("retries the claim after a reload with the saved customer session", async () => {
    mocks.preview.mockResolvedValue(preview);
    mocks.session = { email: "google-user-mara-velasquez@tapit.local", role: "customer" };
    render(<SetupRoute token="prepared-token" />);

    expect(
      await screen.findByRole("heading", { name: "You're all set, Mara" }),
    ).toBeInTheDocument();
    expect(mocks.claimSetup).toHaveBeenCalledWith("prepared-token");
  });

  it("keeps the invalid message hidden while the preview is loading", async () => {
    let resolvePreview!: (value: null) => void;
    mocks.preview.mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );
    render(<SetupRoute token="pending-token" />);
    expect(screen.getByRole("status", { name: "Loading setup link" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "This link is no longer valid" }),
    ).not.toBeInTheDocument();
    await act(async () => resolvePreview(null));
    expect(
      await screen.findByRole("heading", { name: "This link is no longer valid" }),
    ).toBeInTheDocument();
  });

  it("keeps identifiable legacy demo invitations on the existing setup form", async () => {
    mocks.legacy = true;
    mocks.preview.mockResolvedValue(null);
    render(<SetupRoute token="legacy-token" />);
    await waitFor(() => expect(screen.getByText("Legacy setup")).toBeInTheDocument());
  });
});
