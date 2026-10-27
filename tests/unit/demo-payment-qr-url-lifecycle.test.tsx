import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readMethodQr: vi.fn(),
  readActiveQr: vi.fn(),
  readOrderQr: vi.fn(),
  isLocalDemoMode: vi.fn(() => true),
}));

vi.mock("@/lib/demo/mode", () => ({ isLocalDemoMode: mocks.isLocalDemoMode }));
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
  getDemoCardOrderAdminSettings: () => ({
    launchEndDate: "2027-01-01",
    paymentMethods: [
      {
        id: "method-1",
        provider: "Bank",
        label: "Main",
        accountDetails: "123",
        instructions: "Pay",
        active: true,
        qrAssetKey: "qr-1",
      },
    ],
    referralCodes: [],
  }),
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
  saveDemoCardOrderPaymentMethod: vi.fn(),
  deactivateDemoCardOrderPaymentMethod: vi.fn(),
  setDemoCardOrderLaunchEndDate: vi.fn(),
  placeDemoCardOrder: vi.fn(),
  previewDemoCardOrderReferral: vi.fn(),
}));
vi.mock("@/lib/demo/card-order-assets", () => ({
  replaceDemoCardOrderAsset: vi.fn(),
  saveDemoCardOrderAsset: vi.fn(),
}));
vi.mock("@/lib/demo/card-order-payment-assets", () => ({
  readDemoPaymentMethodQr: mocks.readMethodQr,
  readDemoActivePaymentQr: mocks.readActiveQr,
  readDemoOrderPaymentQr: mocks.readOrderQr,
  saveDemoCardOrderPaymentQr: vi.fn(),
}));

import { SettingsManager } from "@/components/admin/SettingsManager";
import { OrderCardExperience } from "@/components/card-order/OrderCardExperience";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.isLocalDemoMode.mockReturnValue(true);
  mocks.readMethodQr.mockReset();
  mocks.readActiveQr.mockReset();
  mocks.readOrderQr.mockReset();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:late-qr");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

describe("demo payment QR object URL cleanup", () => {
  it("does not create a settings preview URL when the read finishes after unmount", async () => {
    const read = deferred<Blob | null>();
    mocks.readMethodQr.mockReturnValue(read.promise);
    const view = render(<SettingsManager />);
    await waitFor(() => expect(mocks.readMethodQr).toHaveBeenCalledWith("method-1"));
    view.unmount();

    await act(async () => {
      read.resolve(new Blob(["qr"]));
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("does not create a customer URL when the read finishes after unmount", async () => {
    const read = deferred<Blob | null>();
    mocks.readActiveQr.mockReturnValue(read.promise);
    const view = render(<OrderCardExperience />);
    await waitFor(() => expect(mocks.readActiveQr).toHaveBeenCalledWith("method-1"));
    view.unmount();

    await act(async () => {
      read.resolve(new Blob(["qr"]));
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("revokes URLs created before each surface unmounts", async () => {
    mocks.readMethodQr.mockResolvedValue(new Blob(["qr"]));
    const settings = render(<SettingsManager />);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
    settings.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:late-qr");

    vi.mocked(URL.createObjectURL).mockClear();
    vi.mocked(URL.revokeObjectURL).mockClear();
    mocks.readActiveQr.mockResolvedValue(new Blob(["qr"]));
    const orders = render(<OrderCardExperience />);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
    orders.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:late-qr");
  });
});
