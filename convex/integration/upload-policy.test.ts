import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  runUploadCleanup,
  safeUploadError,
  UPLOAD_FAILURE_MESSAGE,
  UPLOAD_ERROR_CODES,
  uploadErrorResponse,
  uploadError,
  withUploadStorage,
} from "../uploadErrors";

afterEach(() => vi.restoreAllMocks());

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

  it.each([
    ["Authentication required.", "UNAUTHENTICATED", 401],
    ["Profile access denied.", "FORBIDDEN", 403],
    ["Administrator permission required.", "FORBIDDEN", 403],
    ["This upload request is no longer available.", "UPLOAD_EXPIRED", 410],
    ["Choose a receipt under 5 MB.", "FILE_TOO_LARGE", 413],
    ["Upload a JPEG, PNG, or PDF receipt.", "UNSUPPORTED_TYPE", 415],
    ["Too many profile media upload jobs are assigned to this profile.", "QUOTA_EXCEEDED", 429],
    ["Too many upload attempts. Try again later.", "RATE_LIMITED", 429],
    ["Media changed elsewhere. Reload and try again.", "CONFLICT", 409],
    ["Upload a valid JPEG or PNG image.", "INVALID_IMAGE", 422],
    ["Upload a valid PDF receipt matching its file type.", "INVALID_SIGNATURE", 422],
  ] as const)("allows only classified safe message %s", (message, code, status) => {
    expect(safeUploadError(new Error(message))).toMatchObject({ code, message });
    expect(httpStatusForUploadError(safeUploadError(new Error(message))!)).toBe(status);
  });

  it("recovers direct and ConvexError structured upload errors", () => {
    const error = uploadError("STORAGE_UNAVAILABLE", UPLOAD_FAILURE_MESSAGE);
    expect(safeUploadError(error)).toEqual(error);
    expect(safeUploadError(new ConvexError(error))).toEqual(error);
    expect(safeUploadError(new Error("private internal detail"))).toBeNull();
  });

  it("returns safe plain-text responses and logs unexpected failures", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "secret-storage-detail";
    const response = uploadErrorResponse(new Error(secret), "/test-upload", { "X-Test": "yes" });
    expect(response.status).toBe(422);
    expect(response.headers.get("X-Test")).toBe("yes");
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(await response.text()).toBe(UPLOAD_FAILURE_MESSAGE);
    const storageResponse = uploadErrorResponse(
      new ConvexError(uploadError("STORAGE_UNAVAILABLE", secret)),
      "/test-upload",
      {},
    );
    expect(storageResponse.status).toBe(503);
    expect(await storageResponse.text()).toBe(UPLOAD_FAILURE_MESSAGE);
    const unknownResponse = uploadErrorResponse(secret, "/test-upload", {});
    expect(unknownResponse.status).toBe(422);
    expect(await unknownResponse.text()).toBe(UPLOAD_FAILURE_MESSAGE);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("/test-upload"), expect.any(Error));
  });

  it("tags storage failures and leaves cleanup best-effort", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const storageFailure = new Error("secret-storage-detail");
    await expect(
      withUploadStorage("store profile image", async () => {
        throw storageFailure;
      }),
    ).rejects.toMatchObject({
      data: { code: "STORAGE_UNAVAILABLE", message: UPLOAD_FAILURE_MESSAGE },
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("store profile image"),
      storageFailure,
    );
    await expect(
      runUploadCleanup("remove failed upload", async () => {
        throw storageFailure;
      }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("remove failed upload"),
      storageFailure,
    );
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
