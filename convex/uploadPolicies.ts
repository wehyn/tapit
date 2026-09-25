export type AssetKind = "profile-photo" | "card-design";

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
};

export function getUploadPolicy(kind: AssetKind): UploadPolicy {
  return UPLOAD_POLICIES[kind];
}
