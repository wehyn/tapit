import { defineConfig, devices } from "@playwright/test";

const isLiveCommand = process.env.TAPIT_E2E_MODE === "live";
const isLiveProject = isLiveCommand || process.argv.includes("live-chromium");
const useLiveLocalServer = isLiveProject && process.env.TAPIT_LIVE_LOCAL_SERVER === "true";
const liveBaseURL = process.env.TAPIT_LIVE_BASE_URL ?? "http://127.0.0.1:3000";
const localPort = Number(process.env.TAPIT_E2E_PORT ?? 3000);
if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) {
  throw new Error("TAPIT_E2E_PORT must be an available TCP port number.");
}
const localBaseURL = `http://127.0.0.1:${localPort}`;
const e2eReportFile = process.env.PLAYWRIGHT_JSON_OUTPUT_FILE ?? "test-results/e2e-results.json";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [[process.env.CI ? "github" : "list"], ["json", { outputFile: e2eReportFile }]],
  use: {
    baseURL: isLiveCommand ? liveBaseURL : localBaseURL,
    trace: "retain-on-failure",
  },
  webServer:
    isLiveProject && !useLiveLocalServer
      ? undefined
      : {
          command: `npm run dev -- --hostname 127.0.0.1 --port ${localPort}`,
          reuseExistingServer: isLiveProject
            ? true
            : !process.env.CI && process.env.TAPIT_E2E_PORT === undefined,
          url: localBaseURL,
        },
  projects: [
    {
      name: "chromium",
      testIgnore: /live\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "live-chromium",
      testMatch: /live\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: liveBaseURL,
      },
    },
  ],
});
