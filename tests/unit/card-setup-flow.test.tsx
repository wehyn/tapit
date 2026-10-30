import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerMocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: routerMocks.replace }) }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("convex/react", () => ({ useMutation: () => vi.fn(), useQuery: () => undefined }));
vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: false }),
}));
vi.mock("@/lib/demo/mode", () => ({ isHostedDemoMode: () => false, isLocalDemoMode: () => true }));

import { createDefaultDemoState } from "../../src/lib/demo/fixtures";
import { serializeDemoState } from "../../src/lib/demo/storage-codec";

const STORAGE_KEY = "tapit:demo-state:v1";

describe("card setup flow", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    localStorage.setItem(STORAGE_KEY, serializeDemoState(createDefaultDemoState()));
    routerMocks.replace.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves the exact browser query when sending a card visitor through login", async () => {
    const { CardSetupFlow } = await import("../../src/components/profile/CardSetupFlow");
    const cardPath = "/c/unassigned-card-demo?a=%20&b=1&a=2&claim=1";
    window.history.replaceState({}, "", cardPath);
    render(
      <CardSetupFlow
        cardToken="unassigned-card-demo"
        returnHref="/c/unassigned-card-demo?a=+&a=2&b=1&claim=1"
      />,
    );

    await waitFor(() => {
      const link = screen.getByRole("link", { name: "I already have an account" });
      expect(
        new URL(link.getAttribute("href") ?? "", window.location.origin).searchParams.get("next"),
      ).toBe(cardPath);
    });
  });

  it("lets the buyer verify again after their confirmation challenge expires", async () => {
    const { setDemoSession } = await import("../../src/lib/demo/store");
    const { CardSetupFlow } = await import("../../src/components/profile/CardSetupFlow");
    setDemoSession({ email: "buyer@example.test", role: "customer" });
    render(<CardSetupFlow cardToken="unassigned-card-demo" />);

    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
    await waitFor(() => expect(screen.getByText(/Code verified/)).toBeVisible());
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 11 * 60 * 1000);

    fireEvent.click(screen.getByRole("button", { name: "Confirm and attach card" }));
    await waitFor(() => expect(screen.getByLabelText("Card code")).toBeVisible());
    expect(screen.getByText("The card claim is not available for this account.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
    await waitFor(() => expect(screen.getByText(/Code verified/)).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Confirm and attach card" }));
    await waitFor(() => expect(routerMocks.replace).toHaveBeenCalledWith("/app/profile"));
  });
});
