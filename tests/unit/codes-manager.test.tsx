import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ useMutation: vi.fn(), usePaginatedQuery: vi.fn(), useQuery: vi.fn() }));
vi.mock("convex/react", async (importOriginal) => ({ ...(await importOriginal<typeof import("convex/react")>()), ...hooks }));
import { CodesManager } from "@/components/admin/CodesManager";

const saveAlias = vi.fn(); const saveOffer = vi.fn();
function functionName(reference: unknown) { if (reference === null || (typeof reference !== "object" && typeof reference !== "function")) return ""; const name = Reflect.get(reference, Symbol.for("functionName")); return typeof name === "string" ? name : ""; }
const rows = [
  { _id: "aliases:founding", code: "FOUNDING", active: true, offer: { _id: "offers:founding", code: "FOUNDING", fixedPriceCentavos: 29900, usageCount: 5, usageLimit: 25 } },
  { _id: "aliases:founding-ahron", code: "FOUNDING-AHRON", referrerCode: "AHRON", referrerLabel: "Ahron", active: true, offer: { _id: "offers:founding", code: "FOUNDING", fixedPriceCentavos: 29900, usageCount: 5, usageLimit: 25 } },
  { _id: "aliases:launch", code: "LAUNCH", active: true, offer: { _id: "offers:launch", code: "LAUNCH", usageCount: 2 } },
  { _id: "aliases:launch-ahron", code: "LAUNCH-AHRON", referrerCode: "AHRON", referrerLabel: "Ahron", active: true, offer: { _id: "offers:launch", code: "LAUNCH", usageCount: 2 } },
  { _id: "aliases:legacy", code: "OLDREF", referrerCode: "MIRA", referrerLabel: "Mira", active: true },
];
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false"); vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "convex"); saveAlias.mockReset().mockResolvedValue("aliases:founding-ahron"); saveOffer.mockReset().mockResolvedValue("offers:founding");
  hooks.useMutation.mockImplementation((mutation: unknown) => { const name = functionName(mutation); return name === "cardOrderSettings:saveReferralCode" ? saveAlias : name === "cardOrderSettings:saveCardOrderOffer" ? saveOffer : vi.fn().mockResolvedValue(undefined); });
  hooks.useQuery.mockImplementation((query: unknown) => functionName(query) === "cardOrderSettings:adminReferralCodes" ? rows : undefined);
  hooks.usePaginatedQuery.mockReturnValue({ results: [], status: "Exhausted", loadMore: vi.fn() });
});

describe("codes manager", () => {
  it("groups aliases under one shared offer and displays the historical use count", () => {
    render(<CodesManager />);
    expect(screen.getByText("Manage codes and review their order usage.")).toBeVisible();
    expect(screen.getByText(/5 of 25 uses · 20 remaining/)).toBeVisible();
    expect(screen.getByText("Codes: FOUNDING, FOUNDING-AHRON")).toBeVisible();
    expect(screen.getByText("Codes: LAUNCH, LAUNCH-AHRON")).toBeVisible();
    expect(screen.getByText("FOUNDING-AHRON").parentElement).toHaveTextContent("→ FOUNDING");
    expect(screen.getByText("OLDREF").parentElement).toHaveTextContent("Mira");
  });

  it("edits an offer limit and permits clearing it without saving through aliases", async () => {
    const user = userEvent.setup(); render(<CodesManager />);
    await user.click(screen.getAllByRole("button", { name: "Edit offer" })[0]!);
    const limit = screen.getByLabelText("Usage limit (orders, optional)"); expect(limit).toHaveValue(25);
    await user.clear(limit); await user.type(limit, "30"); await user.click(screen.getByRole("button", { name: "Save offer" }));
    await waitFor(() => expect(saveOffer).toHaveBeenCalledWith(expect.objectContaining({ id: "offers:founding", code: "FOUNDING", usageLimit: 30, fixedPriceCentavos: 29900 })));
    expect(saveAlias).not.toHaveBeenCalled();
  });

  it("saves an alias with an explicit offer and referrer mapping", async () => {
    const user = userEvent.setup(); render(<CodesManager />);
    await user.type(screen.getByLabelText("Referral code"), "FOUNDING-NEW"); await user.selectOptions(screen.getByLabelText("Offer (optional)"), "offers:founding");
    await user.type(screen.getByLabelText("Referrer key (optional)"), "Ahron"); await user.type(screen.getByLabelText("Referrer label (optional)"), "Ahron");
    await user.click(screen.getByRole("button", { name: "Create code" }));
    expect(saveAlias).toHaveBeenCalledWith(expect.objectContaining({ code: "FOUNDING-NEW", offerId: "offers:founding", referrerCode: "AHRON", referrerLabel: "Ahron", active: true }));
  });

  it("validates alias spelling before calling the save mutation", async () => {
    const user = userEvent.setup(); render(<CodesManager />);
    await user.type(screen.getByLabelText("Referral code"), "bad code"); await user.click(screen.getByRole("button", { name: "Create code" }));
    expect(screen.getByText("Use letters, numbers, hyphens, or underscores in the code.")).toBeVisible(); expect(saveAlias).not.toHaveBeenCalled();
  });
});
