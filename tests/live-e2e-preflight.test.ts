import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

describe("live E2E deployment preflight", () => {
  it("requires the wrapper and rejects a production app target", async () => {
    const { validateLiveContract } = await import("../scripts/live-e2e-contract.mjs");
    const env = {
      TAPIT_LIVE_BASE_URL: "https://tapit.example.com",
      TAPIT_LIVE_APP_ENV: "production",
      TAPIT_LIVE_CONVEX_URL: "https://prod.convex.cloud",
      TAPIT_LIVE_CONVEX_DEPLOYMENT: "preview/tapit",
      TAPIT_LIVE_PROVISION_CONFIRM: "I_UNDERSTAND_NON_PRODUCTION",
    };

    expect(validateLiveContract(env, { requireWrapper: true })).toContain("npm run test:e2e:live");
    expect(validateLiveContract({ ...env, TAPIT_E2E_MODE: "live" })).toContain(
      "production app targets are not permitted",
    );
  });

  it("rejects a runtime app contract whose Convex URL does not match the selected target", async () => {
    const { validateObservedLiveApp } = await import("../scripts/live-e2e-contract.mjs");

    expect(
      validateObservedLiveApp(
        {
          TAPIT_LIVE_APP_ENV: "preview",
          TAPIT_LIVE_CONVEX_URL: "https://preview.convex.cloud",
        },
        { mode: "live", appEnvironment: "preview", convexUrl: "https://other.convex.cloud" },
      ),
    ).toContain("does not match the selected live Convex URL");
  });

  it("requires a protected verification-code sink for live email flows", async () => {
    const { liveContractEnvNames, missingLiveContract, validateLiveContract } =
      await import("../scripts/live-e2e-contract.mjs");
    const env = {
      TAPIT_LIVE_BASE_URL: "https://preview.tapit.example",
      TAPIT_LIVE_APP_ENV: "preview",
      TAPIT_LIVE_CONVEX_URL: "https://preview.convex.cloud",
      TAPIT_LIVE_CONVEX_DEPLOYMENT: "preview/tapit",
      TAPIT_LIVE_PROVISION_CONFIRM: "I_UNDERSTAND_NON_PRODUCTION",
    };

    expect(missingLiveContract(env)).toEqual(
      expect.arrayContaining([
        liveContractEnvNames.emailDomain,
        liveContractEnvNames.emailCodeURL,
        liveContractEnvNames.emailCodeToken,
      ]),
    );
    expect(
      validateLiveContract(
        {
          ...env,
          TAPIT_LIVE_EMAIL_DOMAIN: "example.test",
          TAPIT_LIVE_EMAIL_CODE_URL: "http://mailbox.example.test/code",
          TAPIT_LIVE_EMAIL_CODE_TOKEN: "mailbox-token",
        },
        { requireConfirmation: false },
      ),
    ).toContain("require HTTPS");
  });

  it("reads only an authenticated verification code from the live mail adapter", async () => {
    const { readLiveVerificationCode } = await import("../scripts/live-e2e-contract.mjs");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ code: "A1b2C3d4E5f6G7h8" }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      readLiveVerificationCode(
        {
          emailCodeURL: "https://mailbox.example.test/code",
          emailCodeToken: "mailbox-token",
        },
        "person@example.test",
        "signup",
        { timeoutMs: 100, pollIntervalMs: 0 },
      ),
    ).resolves.toBe("A1b2C3d4E5f6G7h8");

    const requestedURL = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(requestedURL.searchParams.get("email")).toBe("person@example.test");
    expect(requestedURL.searchParams.get("kind")).toBe("signup");
    expect(fetchMock.mock.calls[0]![1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer mailbox-token" }),
      }),
    );
  });

  it("rejects production deployment references before invoking the Convex CLI", () => {
    const binDirectory = mkdtempSync(path.join(tmpdir(), "tapit-live-preflight-"));
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
          TAPIT_LIVE_BASE_URL: "https://non-production-app.example",
          TAPIT_LIVE_APP_ENV: "preview",
          TAPIT_LIVE_CONVEX_URL: "https://preview.convex.cloud",
          TAPIT_LIVE_ADMIN_EMAIL: "admin@example.test",
          TAPIT_LIVE_ADMIN_PASSWORD: "not-a-real-password",
          TAPIT_LIVE_CUSTOMER_EMAIL: "customer@example.test",
          TAPIT_LIVE_CUSTOMER_PASSWORD: "not-a-real-password",
          TAPIT_LIVE_PROFILE_SLUG: "tapit-test-customer",
          TAPIT_LIVE_PUBLISHED_BIO: "A Tapit test profile.",
          TAPIT_LIVE_EMAIL_DOMAIN: "example.test",
          TAPIT_LIVE_EMAIL_CODE_URL: "https://mailbox.example.test/code",
          TAPIT_LIVE_EMAIL_CODE_TOKEN: "mailbox-token",
          TAPIT_LIVE_CONVEX_DEPLOYMENT: "prod:tapit",
          TAPIT_LIVE_ADMIN_USER_ID: "admin-user-id",
          TAPIT_LIVE_CUSTOMER_USER_ID: "customer-user-id",
          TAPIT_LIVE_PROVISION_CONFIRM: "I_UNDERSTAND_NON_PRODUCTION",
        },
      });
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(1);
      expect(output).toContain("production deployments are not permitted");
      expect(output).not.toContain("mock npx called");
    } finally {
      rmSync(binDirectory, { recursive: true, force: true });
    }
  });
});
