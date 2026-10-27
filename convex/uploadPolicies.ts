export type AssetKind = "profile-photo" | "card-design" | "card-order-payment-qr";

export type UploadStatus =
  | "initiated"
  | "uploaded"
  | "validating"
  | "processing"
  | "ready"
  | "attached"
  | "rejected"
  | "failed"
  | "expired"
  | "deleted";

export type VariantPurpose = "preview" | "thumbnail";

export type UploadVariantPolicy = {
  purpose: VariantPurpose;
  maxEdge: number;
};

export type UploadPolicy = {
  kind: AssetKind;
  version: string;
  acceptedContentTypes: readonly string[];
  maxBytesExclusive: number;
  maxWidth?: number;
  maxHeight?: number;
  maxPixels?: number;
  variants: readonly UploadVariantPolicy[];
  sourceVisibility: "private";
  allowedDomainTypes: readonly string[];
  legacy?: boolean;
};

export const CARD_DESIGN_POLICY_VERSION = "card-design-v1";
export const CARD_DESIGN_MAX_BYTES_EXCLUSIVE = 50 * 1024 * 1024;

export const CARD_DESIGN_POLICY: UploadPolicy = {
  kind: "card-design",
  version: CARD_DESIGN_POLICY_VERSION,
  acceptedContentTypes: ["image/jpeg", "image/png"],
  maxBytesExclusive: CARD_DESIGN_MAX_BYTES_EXCLUSIVE,
  maxWidth: 12_000,
  maxHeight: 12_000,
  maxPixels: 50_000_000,
  variants: [
    { purpose: "preview", maxEdge: 2_048 },
    { purpose: "thumbnail", maxEdge: 512 },
  ],
  sourceVisibility: "private",
  allowedDomainTypes: ["card-design"],
};

export const CARD_ORDER_DESIGN_MAX_BYTES_EXCLUSIVE = 5 * 1024 * 1024;
export const CARD_ORDER_DESIGN_MAX_PIXELS = 6_000_000;
export const CARD_ORDER_DESIGN_FILE_TOO_LARGE_MESSAGE = "Choose an image under 5 MB.";
export const CARD_ORDER_DESIGN_DIMENSIONS_EXCEEDED_MESSAGE =
  "Choose an image with 6 megapixels or fewer and no side over 12,000 pixels.";

export const CARD_ORDER_DESIGN_POLICY: UploadPolicy = {
  ...CARD_DESIGN_POLICY,
  version: "card-order-design-v1",
  maxBytesExclusive: CARD_ORDER_DESIGN_MAX_BYTES_EXCLUSIVE,
  maxPixels: CARD_ORDER_DESIGN_MAX_PIXELS,
};

export const CARD_ORDER_PAYMENT_QR_POLICY: UploadPolicy = {
  ...CARD_ORDER_DESIGN_POLICY,
  kind: "card-order-payment-qr",
  version: "card-order-payment-qr-v1",
  allowedDomainTypes: ["card-order-payment-qr"],
};

/** Compatibility documentation for the isolated legacy profile-image pipeline. */
export const PROFILE_PHOTO_COMPATIBILITY_POLICY: UploadPolicy = {
  kind: "profile-photo",
  version: "profile-photo-legacy",
  acceptedContentTypes: ["image/jpeg", "image/png", "image/webp"],
  maxBytesExclusive: 5 * 1024 * 1024,
  variants: [
    { purpose: "preview", maxEdge: 384 },
    { purpose: "thumbnail", maxEdge: 192 },
  ],
  sourceVisibility: "private",
  allowedDomainTypes: ["profile"],
  legacy: true,
};

const UPLOAD_POLICIES: Record<AssetKind, UploadPolicy> = {
  "profile-photo": PROFILE_PHOTO_COMPATIBILITY_POLICY,
  "card-design": CARD_DESIGN_POLICY,
  "card-order-payment-qr": CARD_ORDER_PAYMENT_QR_POLICY,
};

export function getUploadPolicy(kind: AssetKind): UploadPolicy {
  return UPLOAD_POLICIES[kind];
}
