/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { httpRouter } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { httpAction, internalAction, type ActionCtx } from "../_generated/server";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");
const identity = (userId: string) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: "owner@example.test" });
    await ctx.db.insert("customers", {
      userId,
      email: "owner@example.test",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    return userId;
  });
}

describe("card order design upload HTTP errors", () => {
  it("keeps safe processor messages and hides unknown and structured storage failures", async () => {
    vi.stubEnv("TAPIT_ALLOWED_ORIGINS", "http://localhost:3000");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const png = new Uint8Array(
        await sharp({ create: { width: 32, height: 32, channels: 4, background: "white" } })
          .png()
          .toBuffer(),
      );
      const post = async (t: ReturnType<typeof convexTest>) => {
        const userId = await seed(t);
        return await t.withIdentity(identity(userId)).fetch("/card-order-design-upload", {
          method: "POST",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "image/jpeg",
            "X-File-Name": "design.png",
          },
          body: png,
        });
      };

      const regular = convexTest(schema, modules);
      const expected = await post(regular);
      expect(expected.status).toBe(422);
      expect(await expected.text()).toBe("Upload a valid JPEG or PNG image.");

      const process = internalAction({
        args: { uploadId: v.id("cardOrderDesignUploads") },
        returns: v.id("cardOrderDesignUploads"),
        handler: async () => {
          throw new Error("processor sentinel secret");
        },
      });
      const overriddenModules = {
        ...modules,
        "../cardOrderDesignProcessing.ts": async () => ({ process }),
      };
      const t = convexTest(schema, overriddenModules);
      const response = await post(t);
      const body = await response.text();
      expect(response.status).toBe(422);
      expect(body).toBe("Upload failed. Please try again.");
      expect(body).not.toContain("sentinel");
      expect(errorLog).toHaveBeenCalledWith(
        "Unexpected upload failure at /card-order-design-upload",
        expect.objectContaining({ message: "processor sentinel secret" }),
      );

      const processLoader = modules["../cardOrderDesignProcessing.ts"];
      expect(processLoader).toBeDefined();
      const realProcess = ((await processLoader!()) as { process: unknown }).process as {
        _handler: (
          ctx: ActionCtx,
          args: { uploadId: Id<"cardOrderDesignUploads"> },
        ) => Promise<Id<"cardOrderDesignUploads">>;
      };
      const processWithFailedStorageGet = internalAction({
        args: { uploadId: v.id("cardOrderDesignUploads") },
        returns: v.id("cardOrderDesignUploads"),
        handler: (ctx, args) =>
          realProcess._handler(
            {
              ...ctx,
              storage: {
                ...ctx.storage,
                get: async () => {
                  throw new Error("storage sentinel secret");
                },
              },
            },
            args,
          ),
      });
      const storageTest = convexTest(schema, {
        ...modules,
        "../cardOrderDesignProcessing.ts": async () => ({ process: processWithFailedStorageGet }),
      });
      const storageResponse = await post(storageTest);
      const storageBody = await storageResponse.text();
      expect(storageResponse.status).toBe(503);
      expect(storageBody).toBe("Upload failed. Please try again.");
      expect(storageBody).not.toContain("sentinel");
      await storageTest.run(async (ctx) => {
        expect(await ctx.db.query("cardOrderDesignUploads").collect()).toHaveLength(0);
        expect(await ctx.db.system.query("_storage").collect()).toHaveLength(0);
      });

      const uploadLoader = modules["../cardOrderDesignUploadHttp.ts"];
      expect(uploadLoader).toBeDefined();
      const realUpload = ((await uploadLoader!()) as { upload: unknown }).upload as {
        _handler: (ctx: ActionCtx, request: Request) => Promise<Response>;
      };
      const uploadWithFailedStorageStore = httpAction((ctx, request) =>
        realUpload._handler(
          {
            ...ctx,
            storage: {
              ...ctx.storage,
              store: async () => {
                throw new Error("store sentinel secret");
              },
            },
          },
          request,
        ),
      );
      const testHttp = httpRouter();
      testHttp.route({
        path: "/card-order-design-upload",
        method: "POST",
        handler: uploadWithFailedStorageStore,
      });
      const storeTest = convexTest(schema, {
        ...modules,
        "../http.ts": async () => ({ default: testHttp }),
      });
      const storeResponse = await post(storeTest);
      const storeBody = await storeResponse.text();
      expect(storeResponse.status).toBe(503);
      expect(storeBody).toBe("Upload failed. Please try again.");
      expect(storeBody).not.toContain("sentinel");
      await storeTest.run(async (ctx) => {
        expect(await ctx.db.query("cardOrderDesignUploads").collect()).toHaveLength(0);
        expect(await ctx.db.system.query("_storage").collect()).toHaveLength(0);
      });
    } finally {
      errorLog.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
