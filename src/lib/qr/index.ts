import QRCode from "qrcode";

const options = {
  errorCorrectionLevel: "M" as const,
  margin: 4,
  width: 512,
  color: { dark: "#000000ff", light: "#ffffffff" },
};

export function generateQrSvg(value: string): Promise<string> {
  return QRCode.toString(value, { ...options, type: "svg" });
}

export function generateQrPng(value: string): Promise<string> {
  return QRCode.toDataURL(value, options);
}
