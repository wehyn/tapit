import { spawn } from "node:child_process";

import { chromium } from "@playwright/test";
import {
  missingLiveContract,
  readLiveAppContract,
  validateLiveContract,
  verifyProfileImageCors,
} from "./live-e2e-contract.mjs";

function fail(message) {
  console.error(`Live E2E preflight failed: ${message}`);
  process.exit(1);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

let localServer;

async function startLocalServer() {
  const baseURL = process.env.TAPIT_LIVE_BASE_URL;
  const isLocalURL = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/.test(baseURL);
  if (!isLocalURL || process.env.TAPIT_LIVE_LOCAL_SERVER !== "true") return;
  localServer = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1"], {
    detached: true,
    env: process.env,
    stdio: "ignore",
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (localServer.exitCode !== null)
      fail("the local Next.js server exited before live E2E was ready");
    try {
      const response = await fetch(`${baseURL}/login`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail("the local Next.js server did not become ready within 30 seconds");
}

function stopLocalServer() {
  if (localServer?.pid === undefined) return;
  try {
    process.kill(-localServer.pid, "SIGTERM");
  } catch {
    /* already stopped */
  }
  localServer = undefined;
}

process.on("exit", stopLocalServer);

async function createInvitationThroughAdmin() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    baseURL: process.env.TAPIT_LIVE_BASE_URL,
    storageState: process.env.TAPIT_LIVE_ADMIN_GOOGLE_STATE,
  });
  const page = await context.newPage();
  try {
    await page.goto("/admin/customers");
    await page.getByLabel("Customer email").fill(process.env.TAPIT_LIVE_INVITED_EMAIL);
    await page.getByLabel("Initial profile name").fill("Live invited customer");
    await page.getByRole("button", { name: "Create and invite", exact: true }).click();
    const link = page
      .locator("a")
      .filter({ hasText: /\/setup\// })
      .last();
    const href = await link.getAttribute("href");
    const token = href?.match(/\/setup\/([A-Za-z0-9_-]+)/)?.[1];
    if (!token) fail("admin invitation creation did not return a setup link");
    return token;
  } catch {
    fail("admin invitation creation failed; confirm the dedicated Google admin state and target");
  } finally {
    await context.close();
    await browser.close();
  }
}

const missing = missingLiveContract(process.env);
if (missing.length > 0)
  fail(`missing ${missing.join(", ")}. See docs/live-e2e.md for the complete contract.`);
const contractError = validateLiveContract(process.env, { requireWrapper: true });
if (contractError) fail(contractError);

await startLocalServer();
const appContractError = await readLiveAppContract(process.env);
if (appContractError) fail(appContractError);
const imageCorsError = await verifyProfileImageCors(process.env);
if (imageCorsError) fail(imageCorsError);

let setupToken;
try {
  setupToken = await createInvitationThroughAdmin();
  // Keep the raw token in this process only. Playwright reads it through the test's URL fixture.
  process.env.TAPIT_LIVE_SETUP_PATH = `/setup/${setupToken}`;
  const result = await run("npx", ["playwright", "test", "--project", "live-chromium"]);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.code !== 0) process.exitCode = result.code;
} finally {
  setupToken = undefined;
  delete process.env.TAPIT_LIVE_SETUP_PATH;
  stopLocalServer();
}
