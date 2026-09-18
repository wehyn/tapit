import { act, render, screen, waitFor } from "@testing-library/react";
import { createElement, StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolverMocks = vi.hoisted(() => ({
  demoMode: false,
  result: undefined as unknown,
  recordView: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: () => resolverMocks.recordView,
  useQuery: () => resolverMocks.result,
}));
vi.mock("../../src/lib/demo/mode", () => ({
  isLocalDemoMode: () => resolverMocks.demoMode,
}));
vi.mock("../../src/components/profile/PublicProfile", () => ({
  PublicProfile: ({ onView }: { onView?: (profileId?: string) => void }) => {
    return createElement(
      "div",
      { "data-testid": "public-profile", onClick: () => onView?.("profile-live") },
      "Public profile",
    );
  },
}));
vi.mock("../../src/components/profile/UnpublishedCardClaim", () => ({
  UnpublishedCardClaim: () => createElement("div", null, "Claim card"),
}));
vi.mock("../../src/components/state/StatePage", () => ({
  InactiveCardPage: () => createElement("div", null, "Inactive card"),
  MissingProfilePage: () => createElement("div", null, "Missing profile"),
  UnavailableProfilePage: () => createElement("div", null, "Unavailable profile"),
}));

import {
  getDemoState,
  recordProfileView,
  resetDemoState,
  updateDemoState,
} from "../../src/lib/demo/store";
import { CardResolverClient } from "../../src/components/profile/CardResolverClient";

const activeResult = {
  status: "active" as const,
  profile: {
    id: "profile-live",
    slug: "live-profile",
    name: "Live profile",
    theme: "paper" as const,
    links: [],
  },
};

describe("demo state persistence", () => {
  beforeEach(() => {
    resolverMocks.demoMode = false;
    localStorage.clear();
  });

  it("rolls back the in-memory update and reports storage failures", () => {
    updateDemoState((current) => ({ ...current, supportUrl: "/support" }));
    const persisted = localStorage.getItem("tapit:demo-state:v1");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(() =>
      updateDemoState((current) => ({ ...current, supportUrl: "/should-not-save" })),
    ).toThrow("Could not save Tapit data locally. Your changes were not saved.");
    expect(getDemoState().supportUrl).toBe("/support");
    expect(localStorage.getItem("tapit:demo-state:v1")).toBe(persisted);

    expect(() => recordProfileView()).not.toThrow();

    setItem.mockRestore();
  });
});

describe("card redirect hydration", () => {
  beforeEach(() => {
    resolverMocks.result = activeResult;
    resolverMocks.recordView.mockReset();
    resolverMocks.replace.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, replace: resolverMocks.replace },
    });
    window.sessionStorage.clear();
  });

  it("waits for analytics before replacing location and preserves the source", async () => {
    let resolveView!: () => void;
    resolverMocks.recordView.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveView = resolve;
      }),
    );
    resolverMocks.result = {
      ...activeResult,
      redirectDestination: "https://destination.example/",
    };

    render(createElement(CardResolverClient, { cardToken: "card-live", source: "qr" }));
    expect(screen.getByRole("status")).toHaveTextContent("Taking you to the destination");
    expect(resolverMocks.replace).not.toHaveBeenCalled();

    const [analytics] = resolverMocks.recordView.mock.calls;
    expect(analytics).toBeDefined();
    expect(analytics![0]).toMatchObject({ profileId: "profile-live", source: "qr" });
    resolveView();
    await waitFor(() =>
      expect(resolverMocks.replace).toHaveBeenCalledWith("https://destination.example/"),
    );
  });

  it("navigates when analytics rejects", async () => {
    resolverMocks.recordView.mockRejectedValue(new Error("analytics unavailable"));
    resolverMocks.result = {
      ...activeResult,
      redirectDestination: "https://destination.example/rejected",
    };

    render(createElement(CardResolverClient, { cardToken: "card-live" }));
    await waitFor(() =>
      expect(resolverMocks.replace).toHaveBeenCalledWith("https://destination.example/rejected"),
    );
    expect(resolverMocks.recordView).toHaveBeenCalledWith(
      expect.objectContaining({ source: "nfc" }),
    );
  });

  it("renders the profile when an active card has no redirect", () => {
    render(createElement(CardResolverClient, { cardToken: "card-live" }));
    expect(screen.getByTestId("public-profile")).toBeInTheDocument();
    expect(resolverMocks.replace).not.toHaveBeenCalled();
  });

  it("records and redirects only once even when the resolver rerenders", async () => {
    resolverMocks.recordView.mockResolvedValue(undefined);
    resolverMocks.result = {
      ...activeResult,
      redirectDestination: "https://destination.example/once",
    };
    const view = render(
      createElement(CardResolverClient, { cardToken: "card-live", source: "nfc" }),
    );
    view.rerender(createElement(CardResolverClient, { cardToken: "card-live", source: "nfc" }));

    await waitFor(() =>
      expect(resolverMocks.replace).toHaveBeenCalledWith("https://destination.example/once"),
    );
    expect(resolverMocks.recordView).toHaveBeenCalledTimes(1);
    expect(resolverMocks.replace).toHaveBeenCalledTimes(1);
  });

  it("does not navigate when unmounted before analytics settles", async () => {
    let resolveView!: () => void;
    resolverMocks.recordView.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveView = resolve;
      }),
    );
    resolverMocks.result = {
      ...activeResult,
      redirectDestination: "https://destination.example/unmounted",
    };
    const view = render(createElement(CardResolverClient, { cardToken: "card-live" }));
    view.unmount();

    await act(async () => resolveView());
    expect(resolverMocks.replace).not.toHaveBeenCalled();
  });

  it.each([
    ["fulfills", () => Promise.resolve()],
    ["rejects", () => Promise.reject(new Error("analytics unavailable"))],
  ])("supports StrictMode effect replay when analytics %s", async (_outcome, analytics) => {
    resolverMocks.recordView.mockImplementation(analytics);
    resolverMocks.result = {
      ...activeResult,
      redirectDestination: "https://destination.example/strict-mode",
    };

    render(
      createElement(
        StrictMode,
        null,
        createElement(CardResolverClient, { cardToken: "card-live" }),
      ),
    );

    await waitFor(() =>
      expect(resolverMocks.replace).toHaveBeenCalledWith("https://destination.example/strict-mode"),
    );
    expect(resolverMocks.recordView).toHaveBeenCalledTimes(1);
    expect(resolverMocks.replace).toHaveBeenCalledTimes(1);
  });

  it("redirects an active demo card after recording one demo view", async () => {
    resolverMocks.demoMode = true;
    resetDemoState();
    updateDemoState((current) => {
      const profile = current.profiles.find((candidate) => candidate.id === "profile-mara");
      if (profile?.published === null || profile?.published === undefined) return current;
      const updated = {
        ...profile,
        published: {
          ...profile.published,
          redirect: { enabled: true, destination: "https://destination.example/demo" },
        },
      };
      return {
        ...current,
        profile: current.profile.id === updated.id ? updated : current.profile,
        profiles: current.profiles.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      };
    });
    const before =
      getDemoState().analytics.find(
        (bucket) => bucket.profileId === "profile-mara" && bucket.source === "qr",
      )?.views ?? 0;

    render(createElement(CardResolverClient, { cardToken: "mara-card-7f2q", source: "qr" }));
    await waitFor(() =>
      expect(resolverMocks.replace).toHaveBeenCalledWith("https://destination.example/demo"),
    );
    const after = getDemoState().analytics.find(
      (bucket) => bucket.profileId === "profile-mara" && bucket.source === "qr",
    )?.views;
    expect(after).toBe(before + 1);
    expect(screen.queryByTestId("public-profile")).not.toBeInTheDocument();
  });

  it("keeps the default demo card on its profile without a redirect", async () => {
    resolverMocks.demoMode = true;
    resetDemoState();

    render(createElement(CardResolverClient, { cardToken: "mara-card-7f2q" }));
    await waitFor(() => expect(screen.getByTestId("public-profile")).toBeInTheDocument());
    expect(resolverMocks.replace).not.toHaveBeenCalled();
  });
});
