import { describe, expect, it, vi } from "vitest";
import { savePaymentMethodWithQr } from "@/components/admin/savePaymentMethodWithQr";

describe("savePaymentMethodWithQr", () => {
  it("retries a failed QR attach on the saved method before clearing the selection", async () => {
    const file = new File(["qr"], "payment.png", { type: "image/png" });
    const save = vi.fn(async ({ id }: { id?: string }) => id ?? "payment-method-1");
    const attachQr = vi
      .fn()
      .mockRejectedValueOnce(new Error("Upload failed"))
      .mockResolvedValue(undefined);
    const onSavedId = vi.fn();
    const onQrAttached = vi.fn();

    await expect(
      savePaymentMethodWithQr({
        fields: {
          provider: "GCash",
          label: "Main",
          accountDetails: "123",
          instructions: "Pay here",
        },
        file,
        save,
        attachQr,
        onSavedId,
        onQrAttached,
      }),
    ).rejects.toThrow("Upload failed");

    expect(onSavedId).toHaveBeenCalledWith("payment-method-1");
    expect(onQrAttached).not.toHaveBeenCalled();

    await savePaymentMethodWithQr({
      fields: {
        id: "payment-method-1",
        provider: "GCash",
        label: "Main",
        accountDetails: "123",
        instructions: "Pay here",
      },
      file,
      save,
      attachQr,
      onSavedId,
      onQrAttached,
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0].id).toBe("payment-method-1");
    expect(attachQr).toHaveBeenNthCalledWith(2, "payment-method-1", file);
    expect(onQrAttached).toHaveBeenCalledTimes(1);
  });
});
