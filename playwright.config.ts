import { defineConfig, devices } from "@playwright/test";

const isLiveCommand = process.env.TAPIT_E2E_MODE === "live";
const isLiveProject = isLiveCommand || process.argv.includes("live-chromium");
const useLiveLocalServer = isLiveProject && process.env.TAPIT_LIVE_LOCAL_SERVER === "true";
const liveBaseURL = process.env.TAPIT_LIVE_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: isLiveCommand ? liveBaseURL : "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer:
    isLiveProject && !useLiveLocalServer
      ? undefined
      : {
          command: "npm run dev -- --hostname 127.0.0.1",
          reuseExistingServer: isLiveProject ? true : !process.env.CI,
          url: "http://127.0.0.1:3000",
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
