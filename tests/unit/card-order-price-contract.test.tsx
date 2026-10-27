import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  place: vi.fn(),
  preview: vi.fn(),
  save: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/demo/mode", () => ({ isLocalDemoMode: () => true }));
vi.mock("@/lib/card-design", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/card-design")>()),
  validateCardOrderDesignFile: vi.fn(async () => undefined),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoState: () => ({}),
  useDemoSession: () => ({ email: "mara@example.test", role: "customer" }),
  resolveDemoSessionAccess: () => ({
    kind: "active",
    account: { id: "customer-mara", role: "customer" },
  }),
  updateDemoState: vi.fn(),
}));
vi.mock("@/lib/demo/card-ordering", () => ({
  getDemoCardOrderCustomerSettings: () => ({
    launchEndDate: "2027-01-01",
    paymentMethods: [
      {
        id: "method-1",
        provider: "Bank",
        label: "Main",
        accountDetails: "123",
        instructions: "Pay",
      },
    ],
  }),
  getMyDemoCardOrders: () => [],
  placeDemoCardOrder: mocks.place,
  previewDemoCardOrderReferral: mocks.preview,
}));
vi.mock("@/lib/demo/card-order-assets", () => ({
  saveDemoCardOrderAsset: mocks.save,
  replaceDemoCardOrderAsset: mocks.replace,
}));
vi.mock("@/lib/demo/card-order-payment-assets", () => ({
  readDemoActivePaymentQr: vi.fn(async () => null),
  readDemoOrderPaymentQr: vi.fn(async () => null),
}));

import { OrderCardExperience } from "@/components/card-order/OrderCardExperience";

// Each keystroke re-renders the whole order form; these flows need more headroom than the default.
vi.setConfig({ testTimeout: 30_000 });

const FULL_LAUNCH_PRICE = "₱599.00 + shipping";
const CONFIRM_REPRICED = "Confirm ₱719.10 + shipping";

function artworkFile(name: string) {
  return new File(["png"], name, { type: "image/png" });
}

async function fillForm(user: ReturnType<typeof userEvent.setup>, front: File, back: File) {
  await user.type(screen.getByLabelText("Delivery name"), "Mara Santos");
  await user.type(screen.getByLabelText("Phone number"), "09170000000");
  await user.type(screen.getByLabelText("Delivery address"), "1 Test Street");
  await user.upload(screen.getByLabelText("Upload front artwork"), front);
  await user.click(screen.getByRole("button", { name: "back" }));
  await user.upload(screen.getByLabelText("Upload back artwork"), back);
}

beforeEach(() => {
  vi.clearAllMocks();
  let assetNumber = 0;
  mocks.save.mockImplementation(async (file: File) => {
    assetNumber += 1;
    return {
      kind: "upload",
      assetKey: `asset-${assetNumber}`,
      fileName: file.name,
      contentType: "image/png",
      byteSize: file.size,
    };
  });
  mocks.preview.mockReturnValue({ valid: false, discountCentavos: 0 });
  mocks.replace.mockResolvedValue(null);
  URL.createObjectURL ??= () => "blob:preview";
  URL.revokeObjectURL ??= () => undefined;
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

describe("card order price confirmation", () => {
  it("shows the authoritative amount and requires a separate confirmation", async () => {
    const user = userEvent.setup();
    mocks.place
      .mockResolvedValueOnce({
        kind: "price_changed",
        price: { cardPriceCentavos: 79_900, discountCentavos: 7_990 },
      })
      .mockResolvedValueOnce({ kind: "created", orderId: "order-1" });
    render(<OrderCardExperience />);
    await fillForm(user, artworkFile("front.png"), artworkFile("back.png"));

    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(mocks.place).toHaveBeenCalledTimes(1);
    expect(mocks.place.mock.calls[0]![0]).toMatchObject({ expectedAmountCentavos: 59_900 });
    expect(await screen.findByText(/The card amount changed to ₱719\.10/)).toBeInTheDocument();
    expect(screen.getByText(/Your order has not been placed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: CONFIRM_REPRICED })).toBeInTheDocument();
    expect(screen.queryByText("Your card order has been saved.")).not.toBeInTheDocument();
    // The price change alone never places an order.
    expect(mocks.place).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: CONFIRM_REPRICED }));

    expect(mocks.place).toHaveBeenCalledTimes(2);
    expect(mocks.place.mock.calls[1]![0]).toMatchObject({ expectedAmountCentavos: 71_910 });
    expect(await screen.findByText(/Your card order has been saved/)).toBeInTheDocument();
  });

  it("applies a valid referral to the amount it submits", async () => {
    const user = userEvent.setup();
    mocks.preview.mockReturnValue({ valid: true, discountCentavos: 5_990 });
    mocks.place.mockResolvedValueOnce({ kind: "created", orderId: "order-2" });
    render(<OrderCardExperience />);
    await fillForm(user, artworkFile("front.png"), artworkFile("back.png"));

    await user.type(screen.getByLabelText("Referral code"), "founding-ahron");
    expect(await screen.findByText("−₱59.90")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(mocks.place).toHaveBeenCalledWith(
      expect.objectContaining({ referralCode: "FOUNDING-AHRON", expectedAmountCentavos: 53_910 }),
    );
  });

  it("blocks submission while the referral result is unresolved", async () => {
    const user = userEvent.setup();
    mocks.preview.mockImplementation(() => {
      throw new Error("preview unavailable");
    });
    render(<OrderCardExperience />);
    await fillForm(user, artworkFile("front.png"), artworkFile("back.png"));

    await user.type(screen.getByLabelText("Referral code"), "BROKEN");
    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Referral status could not be checked.",
    );
    expect(mocks.place).not.toHaveBeenCalled();
  });

  it("drops a pinned amount when a price input changes", async () => {
    const user = userEvent.setup();
    mocks.place.mockResolvedValueOnce({
      kind: "price_changed",
      price: { cardPriceCentavos: 79_900, discountCentavos: 7_990 },
    });
    render(<OrderCardExperience />);
    await fillForm(user, artworkFile("front.png"), artworkFile("back.png"));
    await user.click(screen.getByRole("button", { name: "Place order" }));
    await screen.findByRole("button", { name: CONFIRM_REPRICED });

    await user.type(screen.getByLabelText("Referral code"), "X");

    expect(screen.getByRole("button", { name: "Place order" })).toBeInTheDocument();
    expect(screen.queryByText(/The card amount changed/)).not.toBeInTheDocument();
    expect(screen.getByText(FULL_LAUNCH_PRICE)).toBeInTheDocument();
  });

  it("uploads the same File once per side and sends distinct artwork", async () => {
    const user = userEvent.setup();
    const file = artworkFile("same.png");
    mocks.place.mockResolvedValueOnce({ kind: "created", orderId: "order-3" });
    render(<OrderCardExperience />);
    await fillForm(user, file, file);

    await user.click(screen.getByRole("button", { name: "Place order" }));

    await waitFor(() => expect(mocks.place).toHaveBeenCalledTimes(1));
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save).toHaveBeenNthCalledWith(1, file);
    expect(mocks.save).toHaveBeenNthCalledWith(2, file);
    expect(mocks.place.mock.calls[0]![0]).toMatchObject({
      designSource: { assetKey: "asset-1" },
      backDesignSource: { assetKey: "asset-2" },
    });
  });

  it("keeps saved artwork after a price change and reuses it on confirmation", async () => {
    const user = userEvent.setup();
    mocks.place
      .mockResolvedValueOnce({
        kind: "price_changed",
        price: { cardPriceCentavos: 79_900, discountCentavos: 7_990 },
      })
      .mockResolvedValueOnce({ kind: "created", orderId: "order-4" });
    render(<OrderCardExperience />);
    await fillForm(user, artworkFile("front.png"), artworkFile("back.png"));

    await user.click(screen.getByRole("button", { name: "Place order" }));
    await screen.findByRole("button", { name: CONFIRM_REPRICED });
    await user.click(screen.getByRole("button", { name: CONFIRM_REPRICED }));

    await screen.findByText(/Your card order has been saved/);
    expect(mocks.replace).not.toHaveBeenCalledWith(expect.anything(), null);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.place.mock.calls[1]![0]).toMatchObject({
      designSource: { assetKey: "asset-1" },
      backDesignSource: { assetKey: "asset-2" },
    });
  });
});
