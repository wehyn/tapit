import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  place: vi.fn(),
  preview: vi.fn(),
  save: vi.fn(),
  replace: vi.fn(),
  actorId: "customer-mara",
  demoState: {},
  demoSession: { email: "mara@example.test", role: "customer" },
}));

vi.mock("@/lib/demo/mode", () => ({ isLocalDemoMode: () => true }));
vi.mock("@/lib/card-design", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/card-design")>()),
  validateCardOrderDesignFile: vi.fn(async () => undefined),
}));
vi.mock("@/lib/demo/store", () => ({
  useDemoState: () => mocks.demoState,
  useDemoSession: () => mocks.demoSession,
  resolveDemoSessionAccess: () => ({
    kind: "active",
    account: { id: mocks.actorId, role: "customer" },
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

function fillFast(artwork: { front?: File; back?: File; frontUrl?: string; backUrl?: string }) {
  fireEvent.change(screen.getByLabelText("Delivery name"), { target: { value: "Mara Santos" } });
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "09170000000" } });
  fireEvent.change(screen.getByLabelText("Delivery address"), {
    target: { value: "1 Test Street" },
  });
  if (artwork.frontUrl !== undefined) {
    fireEvent.click(screen.getByRole("radio", { name: /Use a design link/ }));
    fireEvent.change(screen.getByLabelText("Front design URL"), {
      target: { value: artwork.frontUrl },
    });
  } else {
    fireEvent.change(screen.getByLabelText("Upload front artwork"), {
      target: { files: [artwork.front] },
    });
  }
  fireEvent.click(screen.getByRole("button", { name: "back" }));
  if (artwork.backUrl !== undefined) {
    fireEvent.click(screen.getByRole("radio", { name: /Use a design link/ }));
    fireEvent.change(screen.getByLabelText("Back design URL"), {
      target: { value: artwork.backUrl },
    });
  } else {
    fireEvent.change(screen.getByLabelText("Upload back artwork"), {
      target: { files: [artwork.back] },
    });
  }
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Drains promise continuations without a timer, so fake timers stay usable. */
async function drainMicrotasks() {
  await act(async () => {
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actorId = "customer-mara";
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
    expect(mocks.place.mock.calls[0]![0]).toMatchObject({ expectedCardAmountCentavos: 59_900 });
    expect(await screen.findByText(/The card amount changed to ₱719\.10/)).toBeInTheDocument();
    expect(screen.getByText(/Your order has not been placed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: CONFIRM_REPRICED })).toBeInTheDocument();
    expect(screen.queryByText("Your card order has been saved.")).not.toBeInTheDocument();
    expect(mocks.place).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: CONFIRM_REPRICED }));

    expect(mocks.place).toHaveBeenCalledTimes(2);
    expect(mocks.place.mock.calls[1]![0]).toMatchObject({ expectedCardAmountCentavos: 71_910 });
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
      expect.objectContaining({
        referralCode: "FOUNDING-AHRON",
        expectedCardAmountCentavos: 53_910,
      }),
    );
  });

  it("disables submission when the referral preview itself failed", async () => {
    const user = userEvent.setup();
    mocks.preview.mockImplementation(() => {
      throw new Error("preview unavailable");
    });
    render(<OrderCardExperience />);
    await fillForm(user, artworkFile("front.png"), artworkFile("back.png"));

    await user.type(screen.getByLabelText("Referral code"), "BROKEN");

    expect(screen.getByRole("button", { name: "Place order" })).toBeDisabled();
    expect(screen.getByText("Referral status could not be checked.")).toBeInTheDocument();
    expect(mocks.place).not.toHaveBeenCalled();
  });

  it("keeps a pinned quote's status lines when a late preview changes", async () => {
    let tick: (() => void) | undefined;
    const intervalSpy = vi.spyOn(window, "setInterval").mockImplementation(((
      handler: TimerHandler,
      ms?: number,
    ) => {
      if (ms === 30_000) tick = handler as () => void;
      return 0;
    }) as typeof window.setInterval);
    const start = Date.now();
    try {
      mocks.preview.mockReturnValue({ valid: false, discountCentavos: 0 });
      mocks.place.mockResolvedValueOnce({
        kind: "price_changed",
        price: { cardPriceCentavos: 59_900, discountCentavos: 0 },
      });
      render(<OrderCardExperience />);
      await fillForm(userEvent.setup(), artworkFile("front.png"), artworkFile("back.png"));
      fireEvent.change(screen.getByLabelText("Referral code"), { target: { value: "ABC" } });
      await act(async () => {
        fireEvent.submit(screen.getByRole("button", { name: "Place order" }).closest("form")!);
      });
      expect(await screen.findByText(/The card amount changed to ₱599\.00/)).toBeInTheDocument();

      mocks.preview.mockImplementation(() => {
        throw new Error("late failure");
      });
      vi.spyOn(Date, "now").mockReturnValue(start + 30_000);
      const callsBeforeTick = mocks.preview.mock.calls.length;
      act(() => tick?.());

      await waitFor(() => expect(mocks.preview.mock.calls.length).toBeGreaterThan(callsBeforeTick));
      await drainMicrotasks();
      expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
      expect(screen.queryByText("Not available")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Confirm ₱599.00 + shipping" }),
      ).toBeInTheDocument();
    } finally {
      intervalSpy.mockRestore();
      vi.restoreAllMocks();
    }
  });

  it("places no order for a changed actor during an awaited URL-only submit", async () => {
    const { rerender } = render(<OrderCardExperience />);
    fillFast({
      frontUrl: "https://example.test/front.png",
      backUrl: "https://example.test/back.png",
    });

    // Submit and switch accounts in the same tick, before the adapter's awaits resolve.
    fireEvent.submit(screen.getByRole("button", { name: "Place order" }).closest("form")!);
    act(() => {
      mocks.actorId = "customer-other";
      rerender(<OrderCardExperience />);
    });
    await flush();

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

  it("keeps uploaded artwork untouched while a price change awaits confirmation", async () => {
    const user = userEvent.setup();
    mocks.place.mockResolvedValueOnce({
      kind: "price_changed",
      price: { cardPriceCentavos: 79_900, discountCentavos: 7_990 },
    });
    render(<OrderCardExperience />);
    await fillForm(user, artworkFile("front.png"), artworkFile("back.png"));

    await user.click(screen.getByRole("button", { name: "Place order" }));
    await screen.findByRole("button", { name: CONFIRM_REPRICED });

    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("releases abandoned local artwork when the form is left", async () => {
    const user = userEvent.setup();
    mocks.place.mockResolvedValueOnce({
      kind: "price_changed",
      price: { cardPriceCentavos: 79_900, discountCentavos: 7_990 },
    });
    const view = render(<OrderCardExperience />);
    await fillForm(user, artworkFile("front.png"), artworkFile("back.png"));
    await user.click(screen.getByRole("button", { name: "Place order" }));
    await screen.findByRole("button", { name: CONFIRM_REPRICED });

    view.unmount();

    expect(mocks.replace).toHaveBeenCalledWith("asset-1", null);
    expect(mocks.replace).toHaveBeenCalledWith("asset-2", null);
  });

  it("never releases artwork that a successful order attached", async () => {
    const user = userEvent.setup();
    mocks.place.mockResolvedValueOnce({ kind: "created", orderId: "order-5" });
    const view = render(<OrderCardExperience />);
    await fillForm(user, artworkFile("front.png"), artworkFile("back.png"));
    await user.click(screen.getByRole("button", { name: "Place order" }));
    await screen.findByText(/Your card order has been saved/);

    view.unmount();

    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
