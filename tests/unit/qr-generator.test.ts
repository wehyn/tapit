import { beforeEach, describe, expect, it, vi } from "vitest";

const { toString, toDataURL } = vi.hoisted(() => ({
  toString: vi.fn(),
  toDataURL: vi.fn(),
}));

vi.mock("qrcode", () => ({ default: { toString, toDataURL } }));

import QRCode from "qrcode";

import { generateQrPng, generateQrSvg } from "../../src/lib/qr";

describe("QR generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toString.mockResolvedValue("<svg />");
    toDataURL.mockResolvedValue("data:image/png;base64,qr");
  });

  it("passes the permanent URL unchanged with print-ready settings", async () => {
    const permanentUrl = "https://tapit-eosin.vercel.app/c/card-29y887jo?claim=1";

    await generateQrSvg(permanentUrl);
    await generateQrPng(permanentUrl);

    expect(QRCode.toString).toHaveBeenCalledExactlyOnceWith(permanentUrl, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 512,
      color: { dark: "#000000ff", light: "#ffffffff" },
      type: "svg",
    });
    expect(QRCode.toDataURL).toHaveBeenCalledExactlyOnceWith(permanentUrl, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 512,
      color: { dark: "#000000ff", light: "#ffffffff" },
    });
  });
});
