import { describe, expect, it } from "vitest";

import { convexTest } from "convex-test";
import schema from "../schema";
import {
  CARD_DESIGN_POLICY_VERSION,
  getUploadPolicy,
  type AssetKind,
  type UploadStatus,
  type VariantPurpose,
} from "../uploadPolicies";
import {
  httpStatusForUploadError,
  isUploadError,
  UPLOAD_ERROR_CODES,
  uploadError,
} from "../uploadErrors";

const modules = import.meta.glob("../**/*.{ts,js}");

describe("generic upload policy foundation", () => {
  it("exports the bounded lifecycle and compatibility policy", () => {
    const kinds: AssetKind[] = ["profile-photo", "card-design"];
    const statuses: UploadStatus[] = [
      "initiated",
      "uploaded",
      "validating",
      "processing",
      "ready",
      "attached",
      "rejected",
      "failed",
      "expired",
      "deleted",
    ];
    const purposes: VariantPurpose[] = ["preview", "thumbnail"];

    expect(kinds).toHaveLength(2);
    expect(statuses).toHaveLength(10);
    expect(purposes).toEqual(["preview", "thumbnail"]);
    expect(getUploadPolicy("profile-photo")).toMatchObject({
      legacy: true,
      maxBytesExclusive: 5 * 1024 * 1024,
      variants: [
        { purpose: "preview", maxEdge: 384 },
        { purpose: "thumbnail", maxEdge: 192 },
      ],
    });
    expect(getUploadPolicy("card-design").version).toBe(CARD_DESIGN_POLICY_VERSION);
  });

  it("provides stable sanitized errors and HTTP statuses", () => {
    expect(UPLOAD_ERROR_CODES).toEqual([
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "UNSUPPORTED_TYPE",
      "FILE_TOO_LARGE",
      "INVALID_SIGNATURE",
      "INVALID_IMAGE",
      "DIMENSIONS_EXCEEDED",
      "RATE_LIMITED",
      "QUOTA_EXCEEDED",
      "UPLOAD_EXPIRED",
      "PROCESSING_FAILED",
      "STORAGE_UNAVAILABLE",
      "CONFLICT",
    ]);
    const error = uploadError("FILE_TOO_LARGE", "50 MB maximum");
    expect(error).toEqual({
      code: "FILE_TOO_LARGE",
      message: "50 MB maximum",
      retryable: false,
    });
    expect(isUploadError(error)).toBe(true);
    expect(isUploadError({ code: "not-a-code" })).toBe(false);
    expect(httpStatusForUploadError(error)).toBe(413);
  });

  it("creates separate generic asset, variant, reference, and card-design records", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "owner@example.com" });
      const ownerId = await ctx.db.insert("customers", {
        userId,
        email: "owner@example.com",
        role: "customer",
        status: "active",
        deletionStatus: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const profileId = await ctx.db.insert("profiles", {
        ownerId,
        slug: "owner",
        status: "draft",
        draft: {
          name: "Owner",
          slug: "owner",
          links: [],
        },
        createdAt: 1,
        updatedAt: 1,
      });
      const assetId = await ctx.db.insert("uploadAssets", {
        kind: "card-design",
        policyVersion: CARD_DESIGN_POLICY_VERSION,
        ownerId,
        scope: "demo",
        domainType: "card-design",
        domainRecordId: "card-design-1",
        status: "initiated",
        createdAt: 1,
        expiresAt: 2,
        retryCount: 0,
      });
      const storageId = await ctx.storage.store(new Blob(["preview"]));
      const variantId = await ctx.db.insert("uploadAssetVariants", {
        assetId,
        purpose: "preview",
        storageId,
        contentType: "image/png",
        byteSize: 10,
        width: 100,
        height: 100,
        checksum: "a".repeat(64),
        createdAt: 1,
      });
      const referenceId = await ctx.db.insert("uploadAssetReferences", {
        assetId,
        domainType: "card-design",
        domainRecordId: "card-design-1",
        role: "current",
        createdAt: 1,
      });
      const cardDesignId = await ctx.db.insert("cardDesigns", {
        customerId: ownerId,
        profileId,
        templateId: "standard",
        currentAssetId: assetId,
        createdAt: 1,
        updatedAt: 1,
      });
      return { assetId, variantId, referenceId, cardDesignId };
    });

    expect(ids.assetId).toBeDefined();
    expect(ids.variantId).toBeDefined();
    expect(ids.referenceId).toBeDefined();
    expect(ids.cardDesignId).toBeDefined();
  });
});
