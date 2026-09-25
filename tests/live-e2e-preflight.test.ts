import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";
import { signInWithGoogle } from "../e2e/fixtures/live";

const confirmation = "I_UNDERSTAND_NON_PRODUCTION";

function stateFiles(parent = path.join(process.cwd(), ".secrets")) {
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(path.join(parent, "tapit-google-state-"));
  const paths = ["admin", "customer", "invited"].map((name) => {
    const statePath = path.join(directory, `${name}-google.json`);
    writeFileSync(statePath, JSON.stringify({ cookies: [], origins: [] }));
    return statePath;
  });
  return { directory, paths };
}

function validEnv(paths: string[]) {
  return {
    TAPIT_E2E_MODE: "live",
    TAPIT_LIVE_BASE_URL: "https://preview.tapit.example",
    TAPIT_LIVE_APP_ENV: "preview",
    TAPIT_LIVE_CONVEX_URL: "https://preview-123.convex.cloud",
    TAPIT_LIVE_CONVEX_DEPLOYMENT: "preview:tapit",
    NEXT_PUBLIC_CONVEX_SITE_URL: "https://preview-123.convex.site",
    TAPIT_LIVE_ADMIN_EMAIL: "admin@example.test",
    TAPIT_LIVE_ADMIN_GOOGLE_STATE: paths[0],
    TAPIT_LIVE_CUSTOMER_EMAIL: "customer@example.test",
    TAPIT_LIVE_CUSTOMER_GOOGLE_STATE: paths[1],
    TAPIT_LIVE_INVITED_EMAIL: "invited@example.test",
    TAPIT_LIVE_INVITED_GOOGLE_STATE: paths[2],
    TAPIT_LIVE_PROFILE_SLUG: "tapit-test-customer",
    TAPIT_LIVE_PUBLISHED_BIO: "A Tapit test profile.",
    TAPIT_LIVE_PROVISION_CONFIRM: confirmation,
  };
}

describe("live Google E2E deployment preflight", () => {
  it("requires the wrapper and accepts a complete non-production Google contract", async () => {
    const { directory, paths } = stateFiles();
    try {
      const { missingLiveContract, validateLiveContract } =
        await import("../scripts/live-e2e-contract.mjs");
      const env = validEnv(paths);

      expect(missingLiveContract(env)).toEqual([]);
      expect(
        validateLiveContract({ ...env, TAPIT_E2E_MODE: undefined }, { requireWrapper: true }),
      ).toContain("npm run test:e2e:live");
      expect(validateLiveContract(env)).toBeNull();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["production app", { TAPIT_LIVE_APP_ENV: "production" }, "production app targets"],
    [
      "production deployment",
      { TAPIT_LIVE_CONVEX_DEPLOYMENT: "prod:tapit" },
      "production deployments",
    ],
    [
      "URL credentials",
      { TAPIT_LIVE_BASE_URL: "https://user:pass@preview.tapit.example" },
      "URL credentials",
    ],
  ])("rejects %s", async (_label, overrides, expected) => {
    const { directory, paths } = stateFiles();
    try {
      const { validateLiveContract } = await import("../scripts/live-e2e-contract.mjs");
      expect(validateLiveContract({ ...validEnv(paths), ...overrides })).toContain(expected);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects missing Google state files and mismatched Convex site origins", async () => {
    const { directory, paths } = stateFiles();
    try {
      const { liveContractEnvNames, validateLiveContract } =
        await import("../scripts/live-e2e-contract.mjs");
      const env = validEnv(paths);
      rmSync(paths[2]!);
      expect(validateLiveContract(env)).toContain(liveContractEnvNames.invitedGoogleState);
      expect(
        validateLiveContract({ ...env, NEXT_PUBLIC_CONVEX_SITE_URL: "https://other.convex.site" }),
      ).toContain("site URL does not match");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects Google state files that are not ignored by Git", async () => {
    const { directory, paths } = stateFiles(tmpdir());
    try {
      const { validateLiveContract } = await import("../scripts/live-e2e-contract.mjs");
      expect(validateLiveContract(validEnv(paths))).toContain("ignored by Git");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses to start Google sign-in when the storage-state output is not ignored", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "tapit-unignored-google-state-"));
    try {
      const output = path.join(directory, "google-state.json");
      const result = spawnSync(process.execPath, ["scripts/live-google-state.mjs", output], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("must be ignored by Git");
      expect(result.stderr).not.toContain("Complete Google sign-in");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("lets Playwright discover the live Google suite without starting a browser", () => {
    const result = spawnSync(
      process.execPath,
      ["node_modules/@playwright/test/cli.js", "test", "--project", "live-chromium", "--list"],
      { cwd: process.cwd(), encoding: "utf8", timeout: 15_000 },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("live Google OAuth journeys");
  });

  it("fails a live journey when the Google sign-in action is missing", async () => {
    const page = {
      getByRole: () => ({ count: async () => 0 }),
    } as unknown as Page;

    await expect(signInWithGoogle(page)).rejects.toThrow("Google sign-in control is unavailable");
  });

  it("requires Google as the observed live auth provider", async () => {
    const { validateObservedLiveApp } = await import("../scripts/live-e2e-contract.mjs");
    const observed = {
      mode: "live",
      authProvider: "password",
      appEnvironment: "preview",
      convexUrl: "https://preview-123.convex.cloud",
      convexSiteUrl: "https://preview-123.convex.site",
    };
    expect(
      validateObservedLiveApp(
        {
          TAPIT_LIVE_APP_ENV: "preview",
          TAPIT_LIVE_CONVEX_URL: "https://preview-123.convex.cloud",
          NEXT_PUBLIC_CONVEX_SITE_URL: "https://preview-123.convex.site",
        },
        observed,
      ),
    ).toContain("Google");
  });

  it("accepts equivalent Convex origins with trailing slashes", async () => {
    const { validateObservedLiveApp } = await import("../scripts/live-e2e-contract.mjs");
    const observed = {
      mode: "live",
      authProvider: "google",
      appEnvironment: "preview",
      convexUrl: "https://preview-123.convex.cloud",
      convexSiteUrl: "https://preview-123.convex.site",
    };
    expect(
      validateObservedLiveApp(
        {
          TAPIT_LIVE_APP_ENV: "preview",
          TAPIT_LIVE_CONVEX_URL: "https://preview-123.convex.cloud/",
          NEXT_PUBLIC_CONVEX_SITE_URL: "https://preview-123.convex.site/",
        },
        observed,
      ),
    ).toBeNull();
  });

  it("verifies the app origin is present in the upload CORS policy", async () => {
    const { verifyProfileImageCors } = await import("../scripts/live-e2e-contract.mjs");
    const env = {
      TAPIT_LIVE_BASE_URL: "https://preview.tapit.example/path",
      NEXT_PUBLIC_CONVEX_SITE_URL: "https://preview-123.convex.site/",
    };
    const allowed = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: { "Access-Control-Allow-Origin": "https://preview.tapit.example" },
      }),
    );
    await expect(verifyProfileImageCors(env, allowed)).resolves.toBeNull();
    expect(allowed).toHaveBeenCalledWith(
      "https://preview-123.convex.site/profile-image-upload",
      expect.objectContaining({ method: "OPTIONS" }),
    );
  });

  it("rejects production deployments before invoking the Convex CLI", async () => {
    const { directory, paths } = stateFiles();
    const binDirectory = mkdtempSync(path.join(tmpdir(), "tapit-live-preflight-bin-"));
    const mockNpx = path.join(binDirectory, "npx");
    writeFileSync(mockNpx, "#!/bin/sh\nprintf 'mock npx called\\n' >&2\nexit 42\n");
    chmodSync(mockNpx, 0o755);
    try {
      const result = spawnSync(process.execPath, ["scripts/live-e2e.mjs"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
          ...validEnv(paths),
          TAPIT_LIVE_CONVEX_DEPLOYMENT: "prod:tapit",
        },
      });
      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.status).toBe(1);
      expect(output).toContain("production deployments are not permitted");
      expect(output).not.toContain("mock npx called");
    } finally {
      rmSync(binDirectory, { recursive: true, force: true });
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
