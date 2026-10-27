import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const convexHooks = vi.hoisted(() => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));
const authToken = vi.hoisted(() => vi.fn(() => "test-token"));
const fetchMock = vi.hoisted(() => vi.fn());
const savePaymentMethod = vi.hoisted(() => vi.fn());
const setPaymentMethodQr = vi.hoisted(() => vi.fn());

vi.mock("@/lib/demo/mode", () => ({ isLocalDemoMode: () => false }));
vi.mock("@convex-dev/auth/react", () => ({ useAuthToken: authToken }));
vi.mock("convex/react", () => convexHooks);

import { SettingsManager } from "@/components/admin/SettingsManager";

function functionName(reference: unknown): string {
  if (reference === null || (typeof reference !== "object" && typeof reference !== "function"))
    return "";
  const name = Reflect.get(reference, Symbol.for("functionName"));
  return typeof name === "string" ? name : "";
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://preview-123.convex.cloud");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://preview-123.convex.site");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:payment-qr");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ uploadId: "qr-upload-1" }),
  });
  savePaymentMethod.mockReset().mockResolvedValue("payment-method-1");
  setPaymentMethodQr.mockReset();
  convexHooks.useMutation.mockImplementation((mutation: unknown) => {
    const name = functionName(mutation);
    if (name === "cardOrderSettings:savePaymentMethod") return savePaymentMethod;
    if (name === "cardOrderPaymentQr:setPaymentMethodQr") return setPaymentMethodQr;
    return vi.fn().mockResolvedValue(undefined);
  });
  convexHooks.useQuery.mockImplementation((query: unknown) => {
    const name = functionName(query);
    if (name === "settings:support") return "https://support.example";
    if (name === "cardOrderSettings:adminSettings")
      return { launchEndDate: null, paymentMethods: [] };
    return undefined;
  });
});

describe("Settings payment QR upload", () => {
  it("keeps the selected QR while its attachment is pending", async () => {
    const user = userEvent.setup();
    let resolveAttachment!: () => void;
    setPaymentMethodQr.mockImplementation(
      () => new Promise<void>((resolve) => (resolveAttachment = resolve)),
    );
    const qrA = new File(["qr-a"], "qr-a.png", { type: "image/png" });
    const qrB = new File(["qr-b"], "qr-b.png", { type: "image/png" });
    render(<SettingsManager />);

    await user.type(screen.getByLabelText("Provider"), "GCash");
    await user.type(screen.getByLabelText("Method label"), "Main account");
    await user.type(screen.getByLabelText("Account details"), "123456");
    await user.type(screen.getByLabelText("Payment instructions"), "Pay here");
    const fileInput = screen.getByLabelText("Payment QR image");
    await user.upload(fileInput, qrA);
    await user.click(screen.getByRole("button", { name: "Add payment method" }));

    await waitFor(() => expect(setPaymentMethodQr).toHaveBeenCalledOnce());
    expect(fileInput).toBeDisabled();
    await user.upload(fileInput, qrB);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ body: qrA }));

    resolveAttachment();
    await screen.findByText("Payment method added.");
    expect(setPaymentMethodQr).toHaveBeenCalledExactlyOnceWith({
      methodId: "payment-method-1",
      uploadId: "qr-upload-1",
    });
    expect(savePaymentMethod).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
