import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const convexHooks = vi.hoisted(() => ({
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
}));

const qrGenerators = vi.hoisted(() => ({
  generateQrPng: vi.fn(),
  generateQrSvg: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return { ...actual, ...convexHooks };
});
vi.mock("@/lib/qr", () => qrGenerators);

import { CardsManager } from "@/components/admin/CardsManager";
import { generateQrSvg } from "@/lib/qr";

const mutationHandlers = {
  register: vi.fn(),
  replace: vi.fn(),
  generateToken: vi.fn(),
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
  mutationHandlers.generateToken.mockReset().mockResolvedValue("card-generated");
  mutationHandlers.other.mockReset().mockResolvedValue(undefined);
  qrGenerators.generateQrPng.mockReset().mockResolvedValue("data:image/png;base64,preview");
  qrGenerators.generateQrSvg.mockReset().mockResolvedValue("<svg />");
  convexHooks.useMutation.mockImplementation((mutation: unknown) => {
    switch (functionName(mutation)) {
      case "cards:register":
        return mutationHandlers.register;
      case "cards:replace":
        return mutationHandlers.replace;
      case "cards:generateCardToken":
        return mutationHandlers.generateToken;
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
    "copies the exact stored canonical URL for a %s card",
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
          cardUrl: `https://tapit-eosin.vercel.app/c/${token}?source=admin`,
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
          `https://tapit-eosin.vercel.app/c/${token}?source=admin`,
        ),
      );
      expect(await screen.findByRole("status")).toHaveTextContent("Card link copied.");
    },
  );

  it.each(["denied", "unavailable"] as const)(
    "shows a manual-copy URL when clipboard access is %s",
    async (condition) => {
      const token = "existing-card";
      const url = `https://tapit-eosin.vercel.app/c/${token}?source=admin`;
      const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: condition === "denied" ? { writeText } : undefined,
      });
      configureCardQueries([
        {
          _id: `cards:${token}`,
          _creationTime: 1,
          cardUrl: `https://tapit-eosin.vercel.app/c/${token}?source=admin`,
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

  it("resolves a relative registration URL against the canonical origin", async () => {
    render(<CardsManager />);

    fireEvent.change(screen.getByLabelText("Pre-encoded card URL"), {
      target: { value: " /c/card-88 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register card" }));

    await waitFor(() =>
      expect(mutationHandlers.register).toHaveBeenCalledWith({
        cardUrl: "https://tapit-eosin.vercel.app/c/card-88",
        token: "card-88",
      }),
    );
  });

  it("generates canonical URLs", async () => {
    render(<CardsManager />);
    fireEvent.click(screen.getByRole("button", { name: "Generate secure URL" }));
    expect(await screen.findByLabelText("Pre-encoded card URL")).toHaveValue(
      "https://tapit-eosin.vercel.app/c/card-generated",
    );
  });

  it("preserves the exact query on an absolute canonical registration URL", async () => {
    render(<CardsManager />);
    const cardUrl = "https://tapit-eosin.vercel.app/c/card-query?utm_source=print&claim=1";
    fireEvent.change(screen.getByLabelText("Pre-encoded card URL"), { target: { value: cardUrl } });
    fireEvent.click(screen.getByRole("button", { name: "Register card" }));
    await waitFor(() =>
      expect(mutationHandlers.register).toHaveBeenCalledWith({ cardUrl, token: "card-query" }),
    );
  });

  it("rejects a noncanonical absolute registration URL", async () => {
    render(<CardsManager />);
    fireEvent.change(screen.getByLabelText("Pre-encoded card URL"), {
      target: { value: "https://other.example/c/card-88" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register card" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("canonical card URL");
    expect(mutationHandlers.register).not.toHaveBeenCalled();
  });

  it("preserves the exact query on an absolute canonical replacement URL", async () => {
    configureCardQueries([
      {
        _id: "cards:existing-card",
        _creationTime: 1,
        cardUrl: "https://tapit-eosin.vercel.app/c/existing-card",
        token: "existing-card",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    render(<CardsManager />);
    fireEvent.click(screen.getByText("/c/existing-card"));
    const cardUrl = "https://tapit-eosin.vercel.app/c/replacement-query?batch=42&claim=1";
    fireEvent.change(screen.getByLabelText("Replacement URL for existing-card"), {
      target: { value: cardUrl },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() =>
      expect(mutationHandlers.replace).toHaveBeenCalledWith({
        oldCardId: "cards:existing-card",
        newCardUrl: cardUrl,
        newToken: "replacement-query",
      }),
    );
  });

  it("rejects a noncanonical absolute replacement URL", async () => {
    configureCardQueries([
      {
        _id: "cards:existing-card",
        _creationTime: 1,
        cardUrl: "https://tapit-eosin.vercel.app/c/existing-card",
        token: "existing-card",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    render(<CardsManager />);
    fireEvent.change(screen.getByLabelText("Replacement URL for existing-card"), {
      target: { value: "https://other.example/c/replacement-card" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("valid replacement card URL");
    expect(mutationHandlers.replace).not.toHaveBeenCalled();
  });

  it("resolves a relative replacement URL against the canonical origin", async () => {
    configureCardQueries([
      {
        _id: "cards:existing-card",
        _creationTime: 1,
        cardUrl: "https://tapit-eosin.vercel.app/c/existing-card",
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
        newCardUrl: "https://tapit-eosin.vercel.app/c/replacement-88",
        newToken: "replacement-88",
      }),
    );
  });
});

describe("local-demo card links", () => {
  it("copies the exact canonical saved URL from card details", async () => {
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
      expect(writeText).toHaveBeenCalledWith("https://tapit-eosin.vercel.app/c/mara-card-7f2q"),
    );
  });
});

describe("admin card QR controls", () => {
  it.each(["registered", "claimable", "active", "inactive", "replaced", "lost"] as const)(
    "generates the exact saved QR URL for a %s live card",
    async (status) => {
      const token = `card-${status}`;
      const cardUrl = `https://tapit-eosin.vercel.app/c/${token}?claim=1`;
      configureCardQueries([
        {
          _id: `cards:${token}`,
          _creationTime: 1,
          cardUrl,
          token,
          status,
          createdAt: 1,
          updatedAt: 1,
        },
      ]);

      render(<CardsManager />);

      const row = screen.getByText(`/c/${token}`).closest("article");
      expect(row).not.toBeNull();
      fireEvent.click(row!.querySelector("summary")!);
      fireEvent.click(within(row!).getByText("QR fallback"));

      await waitFor(() => expect(generateQrSvg).toHaveBeenCalledWith(cardUrl));
      expect(qrGenerators.generateQrPng).toHaveBeenCalledWith(cardUrl);
      expect(mutationHandlers.register).not.toHaveBeenCalled();
      expect(mutationHandlers.replace).not.toHaveBeenCalled();
      expect(mutationHandlers.other).not.toHaveBeenCalled();
      expect(within(row!).getByText(`Encodes ${cardUrl}`)).toBeInTheDocument();
    },
  );

  it.each([
    ["active", "mara-card-7f2q"],
    ["claimable", "claimable-card-demo"],
    ["inactive", "mara-card-retired"],
  ])("generates QR for a %s local-demo card at the canonical URL", async (_status, token) => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    window.localStorage.clear();
    render(<CardsManager />);
    await screen.findByRole("heading", { name: "Card registry" });
    const stateBeforeQr = JSON.stringify(window.localStorage);

    const row = screen.getByText(`/c/${token}`).closest("article");
    expect(row).not.toBeNull();
    fireEvent.click(row!.querySelector("summary")!);
    fireEvent.click(within(row!).getByText("QR fallback"));

    const cardUrl = `https://tapit-eosin.vercel.app/c/${token}`;
    await waitFor(() => expect(generateQrSvg).toHaveBeenCalledWith(cardUrl));
    expect(qrGenerators.generateQrPng).toHaveBeenCalledWith(cardUrl);
    expect(within(row!).getByText(`Encodes ${cardUrl}`)).toBeInTheDocument();
    expect(JSON.stringify(window.localStorage)).toBe(stateBeforeQr);
  });
});
