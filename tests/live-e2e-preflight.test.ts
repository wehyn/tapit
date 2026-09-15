import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("live E2E deployment preflight", () => {
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
          TAPIT_LIVE_ADMIN_EMAIL: "admin@example.test",
          TAPIT_LIVE_ADMIN_PASSWORD: "not-a-real-password",
          TAPIT_LIVE_CUSTOMER_EMAIL: "customer@example.test",
          TAPIT_LIVE_CUSTOMER_PASSWORD: "not-a-real-password",
          TAPIT_LIVE_PROFILE_SLUG: "tapit-test-customer",
          TAPIT_LIVE_PUBLISHED_BIO: "A Tapit test profile.",
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
