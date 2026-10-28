import { render, screen, waitFor, within } from "@testing-library/react";
import { ConvexError } from "convex/values";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const demoApi = vi.hoisted(() => ({
  getDemoCardOrderAdminSettings: vi.fn(),
  getDemoCardOrderReferralCodeUsage: vi.fn(),
  saveDemoCardOrderOffer: vi.fn(),
  saveDemoCardOrderReferralCode: vi.fn(),
  setDemoCardOrderReferralCodeActive: vi.fn(),
}));
const hooks = vi.hoisted(() => ({
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
}));
vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  ...hooks,
}));
vi.mock("@/lib/demo/card-ordering", () => demoApi);
import { CodesManager } from "@/components/admin/CodesManager";

const saveAlias = vi.fn();
const saveOffer = vi.fn();
function functionName(reference: unknown) {
  if (reference === null || (typeof reference !== "object" && typeof reference !== "function"))
    return "";
  const name = Reflect.get(reference, Symbol.for("functionName"));
  return typeof name === "string" ? name : "";
}
const offers = [
  {
    _id: "offers:founding",
    code: "FOUNDING",
    fixedPriceCentavos: 29900,
    usageCount: 5,
    usageLimit: 25,
  },
  { _id: "offers:launch", code: "LAUNCH", usageCount: 2 },
  { _id: "offers:orphan", code: "ZERO-ALIASES", usageCount: 0 },
];
const rows = [
  { _id: "aliases:founding", code: "FOUNDING", offerId: "offers:founding", active: true },
  {
    _id: "aliases:founding-ahron",
    code: "FOUNDING-AHRON",
    offerId: "offers:founding",
    referrerCode: "AHRON",
    referrerLabel: "Ahron",
    active: true,
  },
  { _id: "aliases:launch", code: "LAUNCH", offerId: "offers:launch", active: true },
  {
    _id: "aliases:launch-ahron",
    code: "LAUNCH-AHRON",
    offerId: "offers:launch",
    referrerCode: "AHRON",
    referrerLabel: "Ahron",
    active: true,
  },
  {
    _id: "aliases:legacy",
    code: "OLDREF",
    referrerCode: "MIRA",
    referrerLabel: "Mira",
    active: true,
  },
];
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
  vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "convex");
  saveAlias.mockReset().mockResolvedValue("aliases:founding-ahron");
  saveOffer.mockReset().mockResolvedValue("offers:founding");
  hooks.useMutation.mockImplementation((mutation: unknown) => {
    const name = functionName(mutation);
    return name === "cardOrderSettings:saveReferralCode"
      ? saveAlias
      : name === "cardOrderSettings:saveCardOrderOffer"
        ? saveOffer
        : vi.fn().mockResolvedValue(undefined);
  });
  hooks.useQuery.mockImplementation((query: unknown) => {
    const name = functionName(query);
    return name === "cardOrderSettings:adminReferralCodes"
      ? rows
      : name === "cardOrderSettings:adminCardOrderOffers"
        ? offers
        : undefined;
  });
  hooks.usePaginatedQuery.mockReturnValue({ results: [], status: "Exhausted", loadMore: vi.fn() });
  demoApi.getDemoCardOrderAdminSettings.mockReturnValue({ referralCodes: [], offers: [] });
  demoApi.getDemoCardOrderReferralCodeUsage.mockReturnValue({
    page: [],
    isDone: true,
    continueCursor: "",
  });
  demoApi.saveDemoCardOrderOffer.mockReset().mockResolvedValue("demo-offer");
  demoApi.saveDemoCardOrderReferralCode.mockReset().mockResolvedValue("demo-alias");
  demoApi.setDemoCardOrderReferralCodeActive.mockReset().mockResolvedValue(undefined);
});

describe("codes manager", () => {
  it("lists independent offers, including one with no aliases, and maps shared aliases once", async () => {
    const user = userEvent.setup();
    render(<CodesManager />);
    expect(screen.getByText("Manage codes and review their order usage.")).toBeVisible();
    expect(screen.getByText(/5 of 25 uses · 20 remaining/)).toBeVisible();
    expect(screen.getByText("Codes: FOUNDING, FOUNDING-AHRON")).toBeVisible();
    expect(screen.getByText("Codes: LAUNCH, LAUNCH-AHRON")).toBeVisible();
    expect(screen.getByText("Codes: None")).toBeVisible();
    expect(screen.getByRole("option", { name: "ZERO-ALIASES" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Offer (optional)"), "offers:orphan");
    expect(screen.getByLabelText("Offer (optional)")).toHaveValue("offers:orphan");
    expect(screen.getByText("FOUNDING-AHRON").parentElement).toHaveTextContent("→ FOUNDING");
    expect(screen.getByText("LAUNCH-AHRON").parentElement).toHaveTextContent("→ LAUNCH");
    expect(screen.getByRole("button", { name: /FOUNDING.*Offer only/ })).toBeVisible();
    expect(screen.getByText("OLDREF").parentElement).toHaveTextContent("Mira");
  });

  it("keeps an offer visible after its final alias disappears", () => {
    let currentRows = [rows[0]!];
    hooks.useQuery.mockImplementation((query: unknown) =>
      functionName(query) === "cardOrderSettings:adminReferralCodes"
        ? currentRows
        : functionName(query) === "cardOrderSettings:adminCardOrderOffers"
          ? [offers[0]!]
          : undefined,
    );
    const view = render(<CodesManager />);
    expect(screen.getByText("Codes: FOUNDING")).toBeVisible();
    currentRows = [];
    view.rerender(<CodesManager />);
    expect(screen.getByText("FOUNDING", { selector: "h3" })).toBeVisible();
    expect(screen.getByText("Codes: None")).toBeVisible();
  });

  it("edits an offer limit and permits clearing it without saving through aliases", async () => {
    const user = userEvent.setup();
    render(<CodesManager />);
    await user.click(screen.getAllByRole("button", { name: "Edit offer" })[0]!);
    const limit = screen.getByLabelText("Usage limit (orders, optional)");
    expect(limit).toHaveValue(25);
    await user.clear(limit);
    await user.type(limit, "30");
    await user.click(screen.getByRole("button", { name: "Save offer" }));
    await waitFor(() =>
      expect(saveOffer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "offers:founding",
          code: "FOUNDING",
          usageLimit: 30,
          fixedPriceCentavos: 29900,
        }),
      ),
    );
    expect(saveAlias).not.toHaveBeenCalled();
  });

  it("saves a cleared offer usage limit as undefined", async () => {
    const user = userEvent.setup();
    render(<CodesManager />);
    await user.click(screen.getAllByRole("button", { name: "Edit offer" })[0]!);
    await user.clear(screen.getByLabelText("Usage limit (orders, optional)"));
    await user.click(screen.getByRole("button", { name: "Save offer" }));
    await waitFor(() =>
      expect(saveOffer).toHaveBeenCalledWith(
        expect.objectContaining({ id: "offers:founding", code: "FOUNDING", usageLimit: undefined }),
      ),
    );
  });

  it("shows the safe message when historical usage counting blocks a limit save", async () => {
    const user = userEvent.setup();
    const message =
      "Usage limits are unavailable until historical order usage has been counted. Please wait and try again.";
    saveOffer.mockRejectedValueOnce(new ConvexError(message));
    render(<CodesManager />);

    await user.click(screen.getAllByRole("button", { name: "Edit offer" })[0]!);
    const limit = screen.getByLabelText("Usage limit (orders, optional)");
    await user.clear(limit);
    await user.type(limit, "20");
    await user.click(screen.getByRole("button", { name: "Save offer" }));

    expect(await screen.findByText(message)).toBeVisible();
  });

  it("rejects decimal and zero usage limits before saving", async () => {
    const user = userEvent.setup();
    render(<CodesManager />);

    await user.click(screen.getAllByRole("button", { name: "Edit offer" })[0]!);
    const limit = screen.getByLabelText("Usage limit (orders, optional)");
    await user.clear(limit);
    await user.type(limit, "1.5");
    await user.click(screen.getByRole("button", { name: "Save offer" }));
    expect(saveOffer).not.toHaveBeenCalled();

    await user.clear(limit);
    await user.type(limit, "0");
    await user.click(screen.getByRole("button", { name: "Save offer" }));
    expect(saveOffer).not.toHaveBeenCalled();
  });

  it("saves an alias mapping without pricing or limit fields", async () => {
    const user = userEvent.setup();
    render(<CodesManager />);
    await user.type(screen.getByLabelText("Referral code"), "FOUNDING-NEW");
    await user.selectOptions(screen.getByLabelText("Offer (optional)"), "offers:founding");
    await user.type(screen.getByLabelText("Referrer key (optional)"), "Ahron");
    await user.type(screen.getByLabelText("Referrer label (optional)"), "Ahron");
    await user.click(screen.getByRole("button", { name: "Create code" }));
    expect(saveAlias).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "FOUNDING-NEW",
        offerId: "offers:founding",
        referrerCode: "AHRON",
        referrerLabel: "Ahron",
        active: true,
      }),
    );
    expect(saveAlias.mock.calls[0]![0]).not.toHaveProperty("fixedPriceCentavos");
    expect(saveAlias.mock.calls[0]![0]).not.toHaveProperty("usageLimit");
  });

  it("retains an alias offer and referrer mapping while editing its label", async () => {
    const user = userEvent.setup();
    render(<CodesManager />);
    const aliasRow = screen.getByText("FOUNDING-AHRON").parentElement!.parentElement!;
    await user.click(within(aliasRow).getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Offer (optional)")).toHaveValue("offers:founding");
    expect(screen.getByLabelText("Referrer key (optional)")).toHaveValue("AHRON");
    expect(screen.getByLabelText("Referrer label (optional)")).toHaveValue("Ahron");
    await user.click(screen.getByRole("button", { name: "Save code" }));
    expect(saveAlias).toHaveBeenCalledWith({
      id: "aliases:founding-ahron",
      code: "FOUNDING-AHRON",
      offerId: "offers:founding",
      referrerCode: "AHRON",
      referrerLabel: "Ahron",
      active: true,
    });
  });

  it("validates alias spelling before calling the save mutation", async () => {
    const user = userEvent.setup();
    render(<CodesManager />);
    await user.type(screen.getByLabelText("Referral code"), "bad code");
    await user.click(screen.getByRole("button", { name: "Create code" }));
    expect(
      screen.getByText("Use letters, numbers, hyphens, or underscores in the code."),
    ).toBeVisible();
    expect(saveAlias).not.toHaveBeenCalled();
  });

  it("keeps demo offer saves and alias saves separate", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    demoApi.getDemoCardOrderAdminSettings.mockReturnValue({
      offers: [
        {
          id: "demo-offer",
          code: "FOUNDING",
          fixedPriceCentavos: 29900,
          usageCount: 5,
          usageLimit: 25,
        },
      ],
      referralCodes: [],
    });
    const user = userEvent.setup();
    render(<CodesManager />);
    await user.type(screen.getByLabelText("Offer code"), "NEW-OFFER");
    await user.type(screen.getByLabelText("Fixed card price (₱)"), "299");
    await user.type(screen.getByLabelText("Usage limit (orders, optional)"), "12");
    await user.click(screen.getByRole("button", { name: "Save offer" }));
    expect(demoApi.saveDemoCardOrderOffer).toHaveBeenCalledWith({
      code: "NEW-OFFER",
      fixedPriceCentavos: 29900,
      usageLimit: 12,
    });
    expect(demoApi.saveDemoCardOrderReferralCode).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Referral code"), "FOUNDING-AHRON");
    await user.selectOptions(screen.getByLabelText("Offer (optional)"), "demo-offer");
    await user.type(screen.getByLabelText("Referrer key (optional)"), "AHRON");
    await user.type(screen.getByLabelText("Referrer label (optional)"), "Ahron");
    await user.click(screen.getByRole("button", { name: "Create code" }));
    expect(demoApi.saveDemoCardOrderReferralCode).toHaveBeenCalledWith({
      code: "FOUNDING-AHRON",
      offerId: "demo-offer",
      referrerCode: "AHRON",
      referrerLabel: "Ahron",
      active: true,
    });
    expect(demoApi.saveDemoCardOrderReferralCode.mock.calls[0]![0]).not.toHaveProperty(
      "fixedPriceCentavos",
    );
    expect(demoApi.saveDemoCardOrderReferralCode.mock.calls[0]![0]).not.toHaveProperty(
      "usageLimit",
    );
  });
});
