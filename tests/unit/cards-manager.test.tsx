import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const convexHooks = vi.hoisted(() => ({
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return { ...actual, ...convexHooks };
});

import { CardsManager } from "@/components/admin/CardsManager";

const mutationHandlers = {
  register: vi.fn(),
  replace: vi.fn(),
  other: vi.fn(),
};

function functionName(reference: unknown): string {
  if (reference === null || (typeof reference !== "object" && typeof reference !== "function"))
    return "";
  const name = Reflect.get(reference, Symbol.for("functionName"));
  return typeof name === "string" ? name : "";
}

function configureCardQueries(cards: unknown[] = []) {
  convexHooks.usePaginatedQuery.mockImplementation((query: unknown) => {
    switch (functionName(query)) {
      case "cards:adminListPaginated":
        return { results: cards, status: "Exhausted", loadMore: vi.fn() };
      case "profiles:adminListPaginated":
      case "customers:list":
        return { results: [], status: "Exhausted", loadMore: vi.fn() };
      default:
        throw new Error(`Unexpected paginated query: ${functionName(query)}`);
    }
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "convex");
  mutationHandlers.register.mockReset().mockResolvedValue("cards:new-card");
  mutationHandlers.replace.mockReset().mockResolvedValue("cards:replacement-card");
  mutationHandlers.other.mockReset().mockResolvedValue(undefined);
  convexHooks.useMutation.mockImplementation((mutation: unknown) => {
    switch (functionName(mutation)) {
      case "cards:register":
        return mutationHandlers.register;
      case "cards:replace":
        return mutationHandlers.replace;
      default:
        return mutationHandlers.other;
    }
  });
  convexHooks.usePaginatedQuery.mockReset();
  convexHooks.useQuery.mockReset();
  configureCardQueries();
});

describe("live card URL mutations", () => {
  it.each(["registered", "claimable", "active", "inactive", "replaced"] as const)(
    "copies the current-origin URL for a %s card",
    async (status) => {
      const token = `card-${status}`;
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });
      configureCardQueries([
        {
          _id: `cards:${token}`,
          _creationTime: 1,
          cardUrl: `https://stored-origin.test/c/${token}`,
          token,
          status,
          createdAt: 1,
          updatedAt: 1,
        },
      ]);

      render(<CardsManager />);
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(
          new URL(`/c/${token}?claim=1`, window.location.origin).toString(),
        ),
      );
      expect(await screen.findByRole("status")).toHaveTextContent("Card link copied.");
    },
  );

  it.each(["denied", "unavailable"] as const)(
    "shows a manual-copy URL when clipboard access is %s",
    async (condition) => {
      const token = "existing-card";
      const url = new URL(`/c/${token}?claim=1`, window.location.origin).toString();
      const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: condition === "denied" ? { writeText } : undefined,
      });
      configureCardQueries([
        {
          _id: `cards:${token}`,
          _creationTime: 1,
          cardUrl: `https://stored-origin.test/c/${token}`,
          token,
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        },
      ]);

      render(<CardsManager />);
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(`Clipboard access failed. Copy this URL manually: ${url}`);
      expect(alert.querySelector("span")).toHaveClass("break-all");
    },
  );

  it("resolves a relative registration URL against the current origin", async () => {
    render(<CardsManager />);

    fireEvent.change(screen.getByLabelText("Pre-encoded card URL"), {
      target: { value: " /c/card-88 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register card" }));

    await waitFor(() =>
      expect(mutationHandlers.register).toHaveBeenCalledWith({
        cardUrl: new URL("/c/card-88", window.location.origin).toString(),
        token: "card-88",
      }),
    );
  });

  it("resolves a relative replacement URL against the current origin", async () => {
    configureCardQueries([
      {
        _id: "cards:existing-card",
        _creationTime: 1,
        cardUrl: "https://tapit.test/c/existing-card",
        token: "existing-card",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    render(<CardsManager />);

    fireEvent.click(screen.getByText("/c/existing-card"));
    fireEvent.change(screen.getByLabelText("Replacement URL for existing-card"), {
      target: { value: " /c/replacement-88 " },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Replace$/ }));

    await waitFor(() =>
      expect(mutationHandlers.replace).toHaveBeenCalledWith({
        oldCardId: "cards:existing-card",
        newCardUrl: new URL("/c/replacement-88", window.location.origin).toString(),
        newToken: "replacement-88",
      }),
    );
  });
});

describe("local-demo card links", () => {
  it("copies the current-origin URL from card details", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<CardsManager />);
    fireEvent.click(screen.getByText("/c/mara-card-7f2q"));
    await screen.findByRole("heading", { name: "Card mara-card-7f2q" });
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        new URL("/c/mara-card-7f2q?claim=1", window.location.origin).toString(),
      ),
    );
  });
});
