import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const demo = vi.hoisted(() => ({
  getMyDemoCards: vi.fn(),
  disableMyDemoCard: vi.fn(),
  markMyDemoCardLost: vi.fn(),
  setMyLostDemoCardResolution: vi.fn(),
  startMyDemoCardReactivation: vi.fn(),
  useDemoSession: vi.fn(),
}));
const convex = vi.hoisted(() => ({
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
}));
const auth = vi.hoisted(() => ({ useConvexAuth: vi.fn() }));
const isLocalDemoMode = vi.hoisted(() => vi.fn());

vi.mock("@/lib/demo/mode", () => ({ isLocalDemoMode }));
vi.mock("@convex-dev/auth/react", () => auth);
vi.mock("@/lib/demo/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/demo/store")>();
  return {
    ...actual,
    ...demo,
    useDemoState: () => ({
      cards: demo.getMyDemoCards().map((row: { id: string; status: string }) => ({
        ...row,
        token: row.id,
        claimedAt: row.status === "lost" ? undefined : 1,
        ...(row.status === "inactive" ? { ownerDisabledAt: 1 } : {}),
      })),
      cardCorrectionRequests: [],
    }),
  };
});
vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return { ...actual, ...convex };
});

import { CustomerCardsExperience } from "@/components/card-management/CustomerCardsExperience";

const card = {
  id: "cards:one",
  cardUrl: "https://tapit.test/forever-one",
  status: "active",
  archivedAt: undefined,
  lostCardResolution: "return",
  canDisable: true,
  canMarkLost: true,
  canSetLostResolution: false,
  canReactivate: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  isLocalDemoMode.mockReturnValue(true);
  demo.useDemoSession.mockReturnValue({ role: "customer" });
  auth.useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
  convex.useQuery.mockReturnValue({ accountStatus: "active", role: "customer" });
  demo.getMyDemoCards.mockReturnValue([card]);
});

describe("customer cards", () => {
  it("gives local demo admins an order entry without loading customer cards", () => {
    demo.useDemoSession.mockReturnValue({ role: "admin" });

    render(<CustomerCardsExperience />);

    expect(screen.getByRole("link", { name: "Order cards" })).toHaveAttribute(
      "href",
      "/app/card/order",
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(demo.getMyDemoCards).not.toHaveBeenCalled();
  });

  it("gives Convex admins an order entry without loading customer cards", () => {
    isLocalDemoMode.mockReturnValue(false);
    convex.useQuery.mockReturnValue({ accountStatus: "active", role: "admin" });

    render(<CustomerCardsExperience />);

    expect(screen.getByRole("link", { name: "Order cards" })).toHaveAttribute(
      "href",
      "/app/card/order",
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(convex.usePaginatedQuery).not.toHaveBeenCalled();
    expect(convex.useMutation).not.toHaveBeenCalled();
  });

  it("shows an empty state and keeps ordering available", () => {
    demo.getMyDemoCards.mockReturnValue([]);

    render(<CustomerCardsExperience />);

    expect(screen.getByText("You don't have any cards yet.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Order more cards" })).toHaveAttribute(
      "href",
      "/app/card/order",
    );
  });

  it("shows assigned cards and only offers actions allowed by the server", () => {
    render(<CustomerCardsExperience />);

    const row = screen.getByRole("article", { name: /forever-one/i });
    expect(within(row).getByRole("link", { name: "Open permanent card URL" })).toHaveAttribute(
      "href",
      card.cardUrl,
    );
    expect(within(row).getByRole("button", { name: "Disable card" })).toBeVisible();
    expect(within(row).getByRole("button", { name: "Mark card lost" })).toBeVisible();
    expect(within(row).queryByRole("button", { name: "Reactivate card" })).not.toBeInTheDocument();
  });

  it("confirms disabling and marks exactly the selected card lost with a chosen page", async () => {
    const user = userEvent.setup();
    render(<CustomerCardsExperience />);
    const row = screen.getByRole("article", { name: /forever-one/i });

    await user.click(within(row).getByRole("button", { name: "Disable card" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("profile will become unavailable");
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Disable card" }),
    );
    await waitFor(() => expect(demo.disableMyDemoCard).toHaveBeenCalledExactlyOnceWith(card.id));

    await user.click(within(row).getByRole("button", { name: "Mark card lost" }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Lost card page"), "inactive");
    await user.click(within(dialog).getByRole("button", { name: "Mark lost" }));
    await waitFor(() => {
      expect(demo.markMyDemoCardLost).toHaveBeenCalledExactlyOnceWith(card.id, "inactive");
      expect(demo.setMyLostDemoCardResolution).not.toHaveBeenCalled();
    });
  });

  it("shows the current lost-page choice and allows selection changes when authorized", () => {
    demo.getMyDemoCards.mockReturnValue([
      {
        ...card,
        status: "lost",
        canDisable: false,
        canMarkLost: false,
        canSetLostResolution: true,
      },
    ]);

    render(<CustomerCardsExperience />);

    expect(screen.getByText(/shared return instructions/i)).toBeVisible();
    expect(screen.getByLabelText("Lost card page")).toHaveValue("return");
  });
});
