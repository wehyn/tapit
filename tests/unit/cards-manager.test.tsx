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
import { createDefaultDemoState } from "@/lib/demo/fixtures";
import { getDemoState, resetDemoState, updateDemoState } from "@/lib/demo/store";
import { generateQrSvg } from "@/lib/qr";

const mutationHandlers = {
  register: vi.fn(),
  replace: vi.fn(),
  reassign: vi.fn(),
  other: vi.fn(),
  generateToken: vi.fn(),
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

function addPendingCorrectionWithoutEvent(token: string) {
  const state = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
  state.cardCorrectionRequests = [
    {
      id: "request-race",
      token,
      challenge: "challenge",
      profileId: "profile-admin-demo",
      requestedBy: "buyer@example.test",
      requestedAt: Date.now(),
      status: "pending",
    },
  ];
  localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
}

function notifyDemoStorage() {
  fireEvent(
    window,
    new StorageEvent("storage", { key: "tapit:demo-state:v1", storageArea: localStorage }),
  );
}

function updateStoredDemoStateWithoutEvent(
  update: (state: ReturnType<typeof createDefaultDemoState>) => void,
) {
  const state = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
  update(state);
  localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
}

function createRaceDemoState() {
  const state = createDefaultDemoState();
  state.cards = state.cards.map((card) =>
    card.token === "active-unclaimed-card-demo" || card.status === "registered"
      ? card
      : { ...card, status: "inactive" },
  );
  return state;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "convex");
  mutationHandlers.register.mockReset().mockResolvedValue("cards:new-card");
  mutationHandlers.replace.mockReset().mockResolvedValue("cards:replacement-card");
  mutationHandlers.reassign.mockReset().mockResolvedValue(null);
  mutationHandlers.other.mockReset().mockResolvedValue(undefined);
  mutationHandlers.generateToken.mockReset().mockResolvedValue("card-generated");
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
      case "cards:reassign":
        return mutationHandlers.reassign;
      default:
        return mutationHandlers.other;
    }
  });
  convexHooks.usePaginatedQuery.mockReset();
  convexHooks.useQuery.mockReset();
  configureCardQueries();
});

describe("live card URL mutations", () => {
  it("keeps a correction request pending and explains a live-card conflict", () => {
    convexHooks.useQuery.mockImplementation((query: unknown) =>
      functionName(query) === "cardCorrectionRequests:adminList"
        ? [
            {
              requestId: "request-1",
              token: "card-correction",
              cardUrl: "https://tapit-eosin.vercel.app/c/card-correction?source=qr",
              requesterProfileName: "Buyer",
              requesterProfileSlug: "buyer",
              currentProfileName: "Other",
              currentProfileSlug: "other",
              hasLiveCardConflict: true,
            },
          ]
        : undefined,
    );

    render(<CardsManager />);

    expect(screen.getByText("Assignment corrections")).toBeInTheDocument();
    expect(screen.getByText(/already has an active or claimable card/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Correct assignment" })).toBeDisabled();
  });

  it.each(["active", "claimable"] as const)(
    "confirms and reassigns an assigned %s card, including to an already-carded profile",
    async (status) => {
      configureCardQueries([
        {
          _id: "cards:source-card",
          _creationTime: 1,
          cardUrl: "https://tapit.test/c/source-card",
          token: "source-card",
          status,
          profileId: "profiles:source",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          _id: "cards:destination-card",
          _creationTime: 2,
          cardUrl: "https://tapit.test/c/destination-card",
          token: "destination-card",
          status: "active",
          profileId: "profiles:destination",
          createdAt: 2,
          updatedAt: 2,
        },
      ]);
      convexHooks.usePaginatedQuery.mockImplementation((query: unknown) => {
        switch (functionName(query)) {
          case "cards:adminListPaginated":
            return {
              results: [
                {
                  _id: "cards:source-card",
                  _creationTime: 1,
                  cardUrl: "https://tapit.test/c/source-card",
                  token: "source-card",
                  status,
                  profileId: "profiles:source",
                  createdAt: 1,
                  updatedAt: 1,
                },
                {
                  _id: "cards:destination-card",
                  _creationTime: 2,
                  cardUrl: "https://tapit.test/c/destination-card",
                  token: "destination-card",
                  status: "active",
                  profileId: "profiles:destination",
                  createdAt: 2,
                  updatedAt: 2,
                },
              ],
              status: "Exhausted",
              loadMore: vi.fn(),
            };
          case "profiles:adminListPaginated":
            return {
              results: [
                {
                  _id: "profiles:source",
                  slug: "source-profile",
                  status: "published",
                  ownerId: "users:source",
                  draft: { name: "Source Owner" },
                },
                {
                  _id: "profiles:destination",
                  slug: "destination-profile",
                  status: "published",
                  ownerId: "users:destination",
                  draft: { name: "Destination Owner" },
                },
              ],
              status: "Exhausted",
              loadMore: vi.fn(),
            };
          case "customers:list":
            return { results: [], status: "Exhausted", loadMore: vi.fn() };
          default:
            throw new Error(`Unexpected paginated query: ${functionName(query)}`);
        }
      });

      render(<CardsManager />);
      fireEvent.click(screen.getByText("/c/source-card"));
      fireEvent.click(screen.getByRole("button", { name: "Reassign" }));
      const confirmation = screen.getByRole("dialog");
      expect(confirmation).toHaveTextContent("Source Owner");
      expect(confirmation).toHaveTextContent("Destination Owner");
      expect(confirmation).toHaveTextContent("same card URL and token will be retained");
      expect(confirmation).toHaveTextContent("prior claim state will be cleared");
      expect(confirmation).toHaveTextContent("new owner needs a fresh claim code");
      fireEvent.click(screen.getByRole("button", { name: "Confirm reassignment" }));

      await waitFor(() =>
        expect(mutationHandlers.reassign).toHaveBeenCalledWith({
          cardId: "cards:source-card",
          expectedProfileId: "profiles:source",
          expectedStatus: status,
          profileId: "profiles:destination",
        }),
      );
      expect(await screen.findByRole("status")).toHaveTextContent(
        "was reassigned. The new owner needs a fresh claim code.",
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );

  it("keeps the live reassignment confirmation open and reports mutation errors", async () => {
    mutationHandlers.reassign.mockRejectedValueOnce(new Error("Assignment changed."));
    configureCardQueries([
      {
        _id: "cards:source-card",
        _creationTime: 1,
        cardUrl: "https://tapit.test/c/source-card",
        token: "source-card",
        status: "active",
        profileId: "profiles:source",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    convexHooks.usePaginatedQuery.mockImplementation((query: unknown) => {
      switch (functionName(query)) {
        case "cards:adminListPaginated":
          return {
            results: [
              {
                _id: "cards:source-card",
                _creationTime: 1,
                cardUrl: "https://tapit.test/c/source-card",
                token: "source-card",
                status: "active",
                profileId: "profiles:source",
                createdAt: 1,
                updatedAt: 1,
              },
            ],
            status: "Exhausted",
            loadMore: vi.fn(),
          };
        case "profiles:adminListPaginated":
          return {
            results: [
              {
                _id: "profiles:source",
                slug: "source",
                status: "published",
                draft: { name: "Source" },
              },
              {
                _id: "profiles:destination",
                slug: "destination",
                status: "draft",
                draft: { name: "Destination" },
              },
            ],
            status: "Exhausted",
            loadMore: vi.fn(),
          };
        case "customers:list":
          return { results: [], status: "Exhausted", loadMore: vi.fn() };
        default:
          throw new Error(`Unexpected paginated query: ${functionName(query)}`);
      }
    });

    render(<CardsManager />);
    fireEvent.click(screen.getByText("/c/source-card"));
    fireEvent.click(screen.getByRole("button", { name: "Reassign" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reassignment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Assignment changed.");
    expect(screen.getByRole("dialog")).toHaveTextContent("Source");
    expect(screen.getByRole("dialog")).toHaveTextContent("Destination");
    expect(screen.getByLabelText("Reassign source-card")).toHaveValue("profiles:destination");
    expect(mutationHandlers.reassign).toHaveBeenCalledTimes(1);
  });

  it.each(["registered", "inactive", "replaced"] as const)(
    "does not offer reassignment for a %s card",
    (status) => {
      configureCardQueries([
        {
          _id: "cards:ineligible-card",
          _creationTime: 1,
          cardUrl: "https://tapit.test/c/ineligible-card",
          token: "ineligible-card",
          status,
          profileId: "profiles:source",
          createdAt: 1,
          updatedAt: 1,
        },
      ]);
      render(<CardsManager />);
      fireEvent.click(screen.getByText("/c/ineligible-card"));
      expect(screen.queryByRole("button", { name: "Reassign" })).not.toBeInTheDocument();
      expect(mutationHandlers.reassign).not.toHaveBeenCalled();
    },
  );

  it.each(["registered", "claimable", "active", "inactive", "replaced"] as const)(
    "copies the stored URL for a %s card",
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
          cardUrl: `https://tapit-eosin.vercel.app/c/${token}`,
          token,
          status,
          createdAt: 1,
          updatedAt: 1,
        },
      ]);

      render(<CardsManager />);
      fireEvent.click(screen.getByRole("button", { name: `Copy card URL for ${token}` }));

      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(`https://tapit-eosin.vercel.app/c/${token}`),
      );
      expect(await screen.findByRole("status")).toHaveTextContent("Card link copied.");
    },
  );

  it.each(["denied", "unavailable"] as const)(
    "shows a manual-copy URL when clipboard access is %s",
    async (condition) => {
      const token = "existing-card";
      const url = `https://tapit-eosin.vercel.app/c/${token}`;
      const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: condition === "denied" ? { writeText } : undefined,
      });
      configureCardQueries([
        {
          _id: `cards:${token}`,
          _creationTime: 1,
          cardUrl: url,
          token,
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        },
      ]);

      render(<CardsManager />);
      fireEvent.click(screen.getByRole("button", { name: `Copy card URL for ${token}` }));

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

  it("preserves the full query in a canonical registration URL", async () => {
    render(<CardsManager />);
    const cardUrl = "https://tapit-eosin.vercel.app/c/card-query?utm_source=print&claim=1";
    fireEvent.change(screen.getByLabelText("Pre-encoded card URL"), { target: { value: cardUrl } });
    fireEvent.click(screen.getByRole("button", { name: "Register card" }));
    await waitFor(() =>
      expect(mutationHandlers.register).toHaveBeenCalledWith({ cardUrl, token: "card-query" }),
    );
  });

  it("rejects an absolute URL on a noncanonical host", async () => {
    render(<CardsManager />);
    fireEvent.change(screen.getByLabelText("Pre-encoded card URL"), {
      target: { value: "https://other.example/c/card-88" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register card" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/canonical card url/i);
    expect(mutationHandlers.register).not.toHaveBeenCalled();
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

  it("preserves the full query in a canonical replacement URL", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: /^Replace$/ }));
    await waitFor(() =>
      expect(mutationHandlers.replace).toHaveBeenCalledWith({
        oldCardId: "cards:existing-card",
        newCardUrl: cardUrl,
        newToken: "replacement-query",
      }),
    );
  });
});

describe("local-demo card links", () => {
  it("does not assign a card after its latest stored state is retired", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(createRaceDemoState()));
    notifyDemoStorage();
    render(<CardsManager />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search cards" }), {
      target: { value: "unassigned-card-demo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign to profile" }));
    updateStoredDemoStateWithoutEvent((state) => {
      const card = state.cards.find((candidate) => candidate.token === "unassigned-card-demo")!;
      card.status = "inactive";
      card.claimCode = "LATEST-CODE";
    });
    const before = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    fireEvent.click(screen.getByRole("dialog").querySelector("button:last-child")!);

    const saved = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    const savedCard = saved.cards.find(
      (card: { token: string }) => card.token === "unassigned-card-demo",
    );
    expect(savedCard).toMatchObject({
      status: "inactive",
      claimCode: "LATEST-CODE",
    });
    expect(savedCard.profileId).toBeUndefined();
    expect(saved.audits).toEqual(before.audits);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText(/is active for|is claimable and assigned/i)).not.toBeInTheDocument();
  });

  it("rejects a registration if another tab registers the token before submit", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(createRaceDemoState()));
    notifyDemoStorage();
    render(<CardsManager />);
    fireEvent.change(screen.getByLabelText("Pre-encoded card URL"), {
      target: { value: "/c/race-registration" },
    });
    updateStoredDemoStateWithoutEvent((state) => {
      state.cards.push({
        id: "card-race-registration",
        token: "race-registration",
        cardUrl: "https://tapit-eosin.vercel.app/c/race-registration",
        status: "registered",
        createdAt: 999,
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Register card" }));

    const saved = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    expect(
      saved.cards.filter((card: { token: string }) => card.token === "race-registration"),
    ).toHaveLength(1);
    expect(
      saved.audits.some(
        (audit: { action: string; target?: string }) =>
          audit.action === "card.registered" && audit.target === "race-registration",
      ),
    ).toBe(false);
    expect(screen.getByLabelText("Pre-encoded card URL")).toHaveValue("/c/race-registration");
    expect(screen.getByText(/already registered/i)).toBeInTheDocument();
  });

  it("rejects registration when a different card already owns the generated ID", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(createRaceDemoState()));
    notifyDemoStorage();
    render(<CardsManager />);
    fireEvent.change(screen.getByLabelText("Pre-encoded card URL"), {
      target: { value: "/c/id-collision-replacement" },
    });
    updateStoredDemoStateWithoutEvent((state) => {
      state.cards.push({
        id: "card-id-collision-replacement",
        token: "different-token",
        cardUrl: "https://tapit-eosin.vercel.app/c/different-token",
        status: "registered",
        createdAt: 999,
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Register card" }));

    const saved = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    expect(
      saved.cards.filter((card: { id: string }) => card.id === "card-id-collision-replacement"),
    ).toHaveLength(1);
    expect(
      saved.cards.some((card: { token: string }) => card.token === "id-collision-replacement"),
    ).toBe(false);
    expect(
      saved.audits.some(
        (audit: { action: string; target?: string }) =>
          audit.action === "card.registered" && audit.target === "id-collision-replacement",
      ),
    ).toBe(false);
    expect(screen.getByLabelText("Pre-encoded card URL")).toHaveValue(
      "/c/id-collision-replacement",
    );
    expect(screen.getByText(/card id is already registered/i)).toBeInTheDocument();
  });

  it("rejects replacement when another card already owns the generated replacement ID", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(createRaceDemoState()));
    notifyDemoStorage();
    render(<CardsManager />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search cards" }), {
      target: { value: "active-unclaimed-card-demo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace card" }));
    fireEvent.change(screen.getByLabelText("New pre-encoded card URL"), {
      target: { value: "/c/replacement-id-collision" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review replacement" }));
    updateStoredDemoStateWithoutEvent((state) => {
      state.cards.push({
        id: "card-replacement-id-collision-replacement",
        token: "different-replacement-token",
        cardUrl: "https://tapit-eosin.vercel.app/c/different-replacement-token",
        status: "registered",
        createdAt: 999,
      });
    });
    const before = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    fireEvent.click(screen.getByRole("dialog").querySelector("button:last-child")!);

    const saved = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    expect(
      saved.cards.find((card: { token: string }) => card.token === "active-unclaimed-card-demo")
        .status,
    ).toBe("active");
    expect(
      saved.cards.filter(
        (card: { id: string }) => card.id === "card-replacement-id-collision-replacement",
      ),
    ).toHaveLength(1);
    expect(saved.audits).toEqual(before.audits);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/replacement card id is already registered/i)).toBeInTheDocument();
  });

  it("deactivates the latest card snapshot and preserves newer profile and claim fields", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(createRaceDemoState()));
    notifyDemoStorage();
    render(<CardsManager />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search cards" }), {
      target: { value: "active-unclaimed-card-demo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    updateStoredDemoStateWithoutEvent((state) => {
      const card = state.cards.find(
        (candidate) => candidate.token === "active-unclaimed-card-demo",
      )!;
      card.profileId = "profile-admin-demo";
      card.claimCode = "LATEST-CODE";
      card.claimCodeGeneration = 9;
      card.claimCodeExpiresAt = 12345;
    });
    fireEvent.click(screen.getByRole("dialog").querySelector("button:last-child")!);

    const saved = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    expect(
      saved.cards.find((card: { token: string }) => card.token === "active-unclaimed-card-demo"),
    ).toMatchObject({
      status: "inactive",
      profileId: "profile-admin-demo",
      claimCode: "LATEST-CODE",
      claimCodeGeneration: 9,
      claimCodeExpiresAt: 12345,
    });
  });

  it("replaces the latest card snapshot and copies its current assignment and claim metadata", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(createRaceDemoState()));
    notifyDemoStorage();
    render(<CardsManager />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search cards" }), {
      target: { value: "active-unclaimed-card-demo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace card" }));
    fireEvent.change(screen.getByLabelText("New pre-encoded card URL"), {
      target: { value: "/c/replacement-latest" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review replacement" }));
    updateStoredDemoStateWithoutEvent((state) => {
      const card = state.cards.find(
        (candidate) => candidate.token === "active-unclaimed-card-demo",
      )!;
      card.profileId = "profile-admin-demo";
      card.claimCode = "LATEST-CODE";
      card.claimCodeGeneration = 9;
      card.claimCodeExpiresAt = 12345;
    });
    fireEvent.click(screen.getByRole("dialog").querySelector("button:last-child")!);

    const saved = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    expect(
      saved.cards.find((card: { token: string }) => card.token === "active-unclaimed-card-demo")
        .status,
    ).toBe("replaced");
    expect(
      saved.cards.find((card: { token: string }) => card.token === "replacement-latest"),
    ).toMatchObject({
      status: "active",
      profileId: "profile-admin-demo",
      claimCode: "LATEST-CODE",
      claimCodeGeneration: 9,
      claimCodeExpiresAt: 12345,
    });
  });

  it("blocks a replacement when a pending correction appears in storage without a rerender", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(createRaceDemoState()));
    notifyDemoStorage();
    render(<CardsManager />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search cards" }), {
      target: { value: "active-unclaimed-card-demo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace card" }));
    fireEvent.change(screen.getByLabelText("New pre-encoded card URL"), {
      target: { value: "/c/replacement-race" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review replacement" }));
    addPendingCorrectionWithoutEvent("active-unclaimed-card-demo");
    fireEvent.click(screen.getByRole("dialog").querySelector("button:last-child")!);

    const saved = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    expect(saved.cardCorrectionRequests[0].status).toBe("pending");
    expect(
      saved.cards.find((card: { token: string }) => card.token === "active-unclaimed-card-demo")
        .status,
    ).toBe("active");
    expect(saved.cards.some((card: { token: string }) => card.token === "replacement-race")).toBe(
      false,
    );
    expect(saved.audits[0].action).not.toBe("card.replaced");
  });

  it("blocks claim-code generation when a pending correction appears in storage without a rerender", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(createRaceDemoState()));
    notifyDemoStorage();
    render(<CardsManager />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search cards" }), {
      target: { value: "active-unclaimed-card-demo" },
    });
    const before = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    const cardBefore = before.cards.find(
      (card: { token: string }) => card.token === "active-unclaimed-card-demo",
    );
    addPendingCorrectionWithoutEvent("active-unclaimed-card-demo");
    fireEvent.click(screen.getByRole("button", { name: "Generate code" }));

    const saved = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    expect(saved.cardCorrectionRequests[0].status).toBe("pending");
    const savedCard = saved.cards.find(
      (card: { token: string }) => card.token === "active-unclaimed-card-demo",
    );
    expect(savedCard.claimCode).toBe(cardBefore.claimCode);
    expect(savedCard.claimCodeGeneration).toBe(cardBefore.claimCodeGeneration);
    expect(saved.audits).toEqual(before.audits);
    expect(
      screen.queryByLabelText("Claim code for active-unclaimed-card-demo"),
    ).not.toBeInTheDocument();
  });

  it("keeps the displayed claim code when invalidation races with a pending correction", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(createRaceDemoState()));
    notifyDemoStorage();
    render(<CardsManager />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search cards" }), {
      target: { value: "active-unclaimed-card-demo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate code" }));
    const generatedState = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    const generatedCard = generatedState.cards.find(
      (card: { token: string }) => card.token === "active-unclaimed-card-demo",
    );
    addPendingCorrectionWithoutEvent("active-unclaimed-card-demo");
    fireEvent.click(screen.getByRole("button", { name: "Invalidate" }));

    const saved = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    expect(saved.cardCorrectionRequests[0].status).toBe("pending");
    expect(
      saved.cards.find((card: { token: string }) => card.token === "active-unclaimed-card-demo")
        .claimCode,
    ).toBe(generatedCard.claimCode);
    expect(screen.getByLabelText("Claim code for active-unclaimed-card-demo")).toHaveTextContent(
      generatedCard.claimCode,
    );
    expect(screen.queryByText(/claim code .* invalidated/i)).not.toBeInTheDocument();
  });

  it("blocks a deactivation confirmation if a correction becomes pending", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    const state = createDefaultDemoState();
    state.cards.find((card) => card.token === "active-unclaimed-card-demo")!.status = "inactive";
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
    render(<CardsManager />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    const updated = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    updated.cardCorrectionRequests = [
      {
        id: "request-late",
        token: "mara-card-7f2q",
        challenge: "challenge",
        profileId: "profile-admin-demo",
        requestedBy: "buyer@example.test",
        requestedAt: Date.now(),
        status: "pending",
      },
    ];
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(updated));
    fireEvent(
      window,
      new StorageEvent("storage", { key: "tapit:demo-state:v1", storageArea: localStorage }),
    );

    const confirm = screen.getByRole("dialog").querySelector("button:last-child");
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm!);
    expect(
      JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}").cards.find(
        (card: { token: string }) => card.token === "mara-card-7f2q",
      ).status,
    ).toBe("active");
  });

  it("does not show deactivation success when a correction appears in storage without a rerender", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(createRaceDemoState()));
    notifyDemoStorage();
    render(<CardsManager />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search cards" }), {
      target: { value: "active-unclaimed-card-demo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    addPendingCorrectionWithoutEvent("active-unclaimed-card-demo");
    fireEvent.click(screen.getByRole("dialog").querySelector("button:last-child")!);

    const saved = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    expect(saved.cardCorrectionRequests[0].status).toBe("pending");
    expect(
      saved.cards.find((card: { token: string }) => card.token === "active-unclaimed-card-demo")
        .status,
    ).toBe("active");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText(/is inactive/i)).not.toBeInTheDocument();
  });

  it("does not show correction success when the latest stored card is inactive", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(createRaceDemoState()));
    addPendingCorrectionWithoutEvent("active-unclaimed-card-demo");
    notifyDemoStorage();
    render(<CardsManager />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search cards" }), {
      target: { value: "active-unclaimed-card-demo" },
    });

    const saved = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    saved.cards.find(
      (card: { token: string }) => card.token === "active-unclaimed-card-demo",
    ).status = "inactive";
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(saved));
    fireEvent.click(screen.getByRole("button", { name: "Correct assignment" }));

    const after = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    expect(after.cardCorrectionRequests[0].status).toBe("pending");
    expect(
      after.cards.find((card: { token: string }) => card.token === "active-unclaimed-card-demo")
        .status,
    ).toBe("inactive");
    expect(screen.queryByText(/assignment for .* corrected/i)).not.toBeInTheDocument();
  });

  it("rechecks correction request ownership from storage without a rerender", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    const state = createRaceDemoState();
    state.cardCorrectionRequests = [
      {
        id: "request-ownership-race",
        token: "active-unclaimed-card-demo",
        challenge: "challenge",
        profileId: "profile-buyer-setup",
        requestedBy: "buyer@example.test",
        requestedAt: Date.now(),
        status: "pending",
      },
    ];
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
    notifyDemoStorage();
    render(<CardsManager />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search cards" }), {
      target: { value: "active-unclaimed-card-demo" },
    });
    const before = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    before.cardCorrectionRequests[0].profileId = "profile-admin-demo";
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(before));
    fireEvent.click(screen.getByRole("button", { name: "Correct assignment" }));

    const after = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    expect(after.cardCorrectionRequests[0].status).toBe("pending");
    expect(
      after.cards.find((card: { token: string }) => card.token === "active-unclaimed-card-demo")
        .profileId,
    ).toBe("profile-active-unclaimed");
    expect(screen.queryByText(/assignment for .* corrected/i)).not.toBeInTheDocument();
  });

  it("blocks a replacement confirmation if a correction becomes pending", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    const state = createDefaultDemoState();
    state.cards.find((card) => card.token === "active-unclaimed-card-demo")!.status = "inactive";
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
    render(<CardsManager />);
    fireEvent.click(screen.getByRole("button", { name: "Replace card" }));
    fireEvent.change(screen.getByLabelText("New pre-encoded card URL"), {
      target: { value: "/c/replacement-card" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review replacement" }));

    const updated = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    updated.cardCorrectionRequests = [
      {
        id: "request-late",
        token: "mara-card-7f2q",
        challenge: "challenge",
        profileId: "profile-admin-demo",
        requestedBy: "buyer@example.test",
        requestedAt: Date.now(),
        status: "pending",
      },
    ];
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(updated));
    fireEvent(
      window,
      new StorageEvent("storage", { key: "tapit:demo-state:v1", storageArea: localStorage }),
    );

    const confirm = screen.getByRole("dialog").querySelector("button:last-child");
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm!);
    expect(
      JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}").cards.find(
        (card: { token: string }) => card.token === "mara-card-7f2q",
      ).status,
    ).toBe("active");
  });

  it("disables replacement review when a correction appears before review", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    const state = createDefaultDemoState();
    state.cards.find((card) => card.token === "active-unclaimed-card-demo")!.status = "inactive";
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
    render(<CardsManager />);
    fireEvent.click(screen.getByRole("button", { name: "Replace card" }));

    const updated = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    updated.cardCorrectionRequests = [
      {
        id: "request-late",
        token: "mara-card-7f2q",
        challenge: "challenge",
        profileId: "profile-admin-demo",
        requestedBy: "buyer@example.test",
        requestedAt: Date.now(),
        status: "pending",
      },
    ];
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(updated));
    fireEvent(
      window,
      new StorageEvent("storage", { key: "tapit:demo-state:v1", storageArea: localStorage }),
    );

    expect(screen.getByRole("button", { name: "Review replacement" })).toBeDisabled();
  });

  it("blocks pending-card controls and refuses correction for a retired card", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    const state = createDefaultDemoState();
    state.cards.find((card) => card.token === "mara-card-7f2q")!.status = "inactive";
    state.cardCorrectionRequests = [
      {
        id: "request-stale",
        token: "mara-card-7f2q",
        challenge: "challenge",
        profileId: "profile-admin-demo",
        requestedBy: "buyer@example.test",
        requestedAt: Date.now(),
        status: "pending",
      },
    ];
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
    render(<CardsManager />);
    expect(screen.getByRole("button", { name: "Correct assignment" })).toBeDisabled();
    expect(
      JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}").cardCorrectionRequests[0]
        .status,
    ).toBe("pending");
  });

  it("disables deactivation and replacement while an assignment correction is pending", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    const state = createDefaultDemoState();
    state.cardCorrectionRequests = [
      {
        id: "request-pending",
        token: "active-unclaimed-card-demo",
        challenge: "challenge",
        profileId: "profile-claimable",
        requestedBy: "buyer@example.test",
        requestedAt: Date.now(),
        status: "pending",
      },
    ];
    localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
    render(<CardsManager />);
    expect(
      screen
        .getAllByRole("button", { name: "Deactivate" })
        .some((button) => button.hasAttribute("disabled")),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("button", { name: "Replace card" })
        .some((button) => button.hasAttribute("disabled")),
    ).toBe(true);
  });

  it("copies the stored URL from card details", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Copy card URL for mara-card-7f2q" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("https://tapit-eosin.vercel.app/c/mara-card-7f2q"),
    );
  });

  it("stores a normalized absolute URL with its complete query and leaves the card unassigned", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    render(<CardsManager />);
    fireEvent.change(screen.getByLabelText("Pre-encoded card URL"), {
      target: { value: " /c/query-card?source=qr&batch=190 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register card" }));

    await waitFor(() => {
      const state = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
      const card = state.cards.find(
        (candidate: { token: string }) => candidate.token === "query-card",
      );
      expect(card).toMatchObject({
        cardUrl: "https://tapit-eosin.vercel.app/c/query-card?source=qr&batch=190",
        status: "registered",
      });
      expect(card.profileId).toBeUndefined();
    });
  });

  it.each([
    "javascript://tapit-eosin.vercel.app/c/card-protocol",
    "https://user:secret@tapit-eosin.vercel.app/c/card-credentials",
    "https://tapit-eosin.vercel.app/c/card-fragment#claim",
  ])("rejects a card URL with an invalid protocol, credentials, or fragment (%s)", async (url) => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    localStorage.clear();
    render(<CardsManager />);
    fireEvent.change(screen.getByLabelText("Pre-encoded card URL"), { target: { value: url } });
    fireEvent.click(screen.getByRole("button", { name: "Register card" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/enter a canonical card url/i);
    expect(localStorage.getItem("tapit:demo-state:v1")).toBeNull();
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
    localStorage.clear();
    render(<CardsManager />);
    await screen.findByRole("heading", { name: "Card registry" });
    const stateBeforeQr = JSON.stringify(localStorage);

    const row = screen.getByText(`/c/${token}`).closest("article");
    expect(row).not.toBeNull();
    fireEvent.click(row!.querySelector("summary")!);
    fireEvent.click(within(row!).getByText("QR fallback"));

    const cardUrl = `https://tapit-eosin.vercel.app/c/${token}`;
    await waitFor(() => expect(generateQrSvg).toHaveBeenCalledWith(cardUrl));
    expect(qrGenerators.generateQrPng).toHaveBeenCalledWith(cardUrl);
    expect(within(row!).getByText(`Encodes ${cardUrl}`)).toBeInTheDocument();
    expect(JSON.stringify(localStorage)).toBe(stateBeforeQr);
  });

  it("reassigns an active card to an already-carded profile and clears only its old claim access", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    resetDemoState();
    updateDemoState((current) => ({
      ...current,
      cards: [
        ...current.cards.map((card) =>
          card.id === "card-mara-active"
            ? {
                ...card,
                claimCode: "SECRET-CLAIM-CODE",
                claimCodeExpiresAt: 3,
                claimCodeInvalidatedAt: 4,
                claimChallenge: "secret-challenge",
                claimChallengeExpiresAt: 5,
              }
            : card,
        ),
        {
          id: "card-mara-other",
          token: "mara-card-other",
          cardUrl: "/c/mara-card-other",
          status: "active",
          profileId: "profile-mara",
          claimedAt: 2,
        },
      ],
      customers: current.customers.map((customer) =>
        customer.id === "customer-mara"
          ? {
              ...customer,
              claimedCardIds: ["card-mara-active", "card-mara-other"],
              cardOwnerAccessOverride: true,
            }
          : customer,
      ),
    }));

    render(<CardsManager />);
    fireEvent.click(screen.getByText("/c/mara-card-7f2q"));
    fireEvent.click(screen.getAllByRole("button", { name: "Reassign" })[0]!);
    expect(screen.getByRole("dialog")).toHaveTextContent("Mara Velasquez");
    expect(screen.getByRole("dialog")).toHaveTextContent("Claimed profile");
    fireEvent.click(screen.getByRole("button", { name: "Confirm reassignment" }));

    expect(await screen.findByRole("status")).toHaveTextContent("fresh claim code");
    const state = getDemoState();
    const reassigned = state.cards.find((card) => card.id === "card-mara-active");
    expect(reassigned).toMatchObject({
      id: "card-mara-active",
      token: "mara-card-7f2q",
      cardUrl: "/c/mara-card-7f2q",
      status: "active",
      profileId: "profile-claimable",
    });
    expect(reassigned).toMatchObject({
      claimCode: undefined,
      claimCodeExpiresAt: undefined,
      claimChallenge: undefined,
      claimChallengeExpiresAt: undefined,
      claimedAt: undefined,
    });
    expect(reassigned?.claimCodeInvalidatedAt).toEqual(expect.any(Number));
    expect(state.customers.find((customer) => customer.id === "customer-mara")).toMatchObject({
      claimedCardIds: ["card-mara-other"],
      cardOwnerAccessOverride: true,
    });
    expect(state.audits[0]).toMatchObject({
      actor: "admin@tapit.local",
      action: "card.reassigned",
    });
    expect(state.audits[0]?.before).toContain("Mara Velasquez");
    expect(state.audits[0]?.after).toContain("Claimed profile");
    expect(state.audits[0]?.after).not.toContain("MARA2Q8K");
  });

  it("allows reassignment of a claimable card and preserves its status", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    resetDemoState();

    render(<CardsManager />);
    fireEvent.click(screen.getByText("/c/claimable-card-demo"));
    fireEvent.click(screen.getAllByRole("button", { name: "Reassign" })[0]!);
    expect(screen.getByRole("dialog")).toHaveTextContent("Claimed profile");
    expect(screen.getByRole("dialog")).toHaveTextContent("Mara Velasquez");
    fireEvent.click(screen.getByRole("button", { name: "Confirm reassignment" }));

    await screen.findByRole("status");
    expect(getDemoState().cards.find((card) => card.id === "card-claimable-demo")).toMatchObject({
      status: "claimable",
      profileId: "profile-mara",
    });
  });

  it("rejects a stale local-demo reassignment without overwriting current card state", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    resetDemoState();

    render(<CardsManager />);
    fireEvent.click(screen.getByText("/c/mara-card-7f2q"));
    fireEvent.click(screen.getAllByRole("button", { name: "Reassign" })[0]!);
    updateDemoState((current) => ({
      ...current,
      cards: current.cards.map((card) =>
        card.id === "card-mara-active" ? { ...card, profileId: "profile-admin-demo" } : card,
      ),
    }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm reassignment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The card or profile assignment changed. Review the current assignment and try again.",
    );
    expect(getDemoState().cards.find((card) => card.id === "card-mara-active")).toMatchObject({
      profileId: "profile-admin-demo",
      status: "active",
      claimedAt: 1,
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
