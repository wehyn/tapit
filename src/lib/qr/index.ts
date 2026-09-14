import QRCode from "qrcode";

const options = {
  errorCorrectionLevel: "M" as const,
  margin: 1,
  width: 512,
};

export function generateQrSvg(value: string): Promise<string> {
  return QRCode.toString(value, { ...options, type: "svg" });
}

export function generateQrPng(value: string): Promise<string> {
  return QRCode.toDataURL(value, options);
}
