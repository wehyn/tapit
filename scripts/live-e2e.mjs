import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

import { chromium } from "@playwright/test";
import {
  missingLiveContract,
  readLiveAppContract,
  validateLiveContract,
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
  const isLocalURL =
    baseURL.startsWith("http://127.0.0.1") || baseURL.startsWith("http://localhost");
  if (!isLocalURL || process.env.TAPIT_LIVE_LOCAL_SERVER !== "true") return;

  localServer = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1"], {
    detached: true,
    env: process.env,
    stdio: "ignore",
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (localServer.exitCode !== null) {
      fail("the local Next.js server exited before live provisioning was ready.");
    }
    try {
      const response = await fetch(`${baseURL}/login`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail("the local Next.js server did not become ready within 30 seconds.");
}

function stopLocalServer() {
  if (localServer?.pid === undefined) return;
  try {
    process.kill(-localServer.pid, "SIGTERM");
  } catch {
    // The process may already have exited.
  }
  localServer = undefined;
}

process.on("exit", stopLocalServer);

async function provision() {
  const cardToken = `live-e2e-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const bootstrapArgs = [
    "convex",
    "run",
    "bootstrap:bootstrap",
    JSON.stringify({
      adminUserId: process.env.TAPIT_LIVE_ADMIN_USER_ID,
      customerUserId: process.env.TAPIT_LIVE_CUSTOMER_USER_ID,
      adminEmail: process.env.TAPIT_LIVE_ADMIN_EMAIL,
      customerEmail: process.env.TAPIT_LIVE_CUSTOMER_EMAIL,
      customerSlug: process.env.TAPIT_LIVE_PROFILE_SLUG,
      publishedBio: process.env.TAPIT_LIVE_PUBLISHED_BIO,
      cardUrl: `https://tapit.test/c/${cardToken}`,
      cardToken,
    }),
    "--deployment",
    process.env.TAPIT_LIVE_CONVEX_DEPLOYMENT,
  ];
  const bootstrap = await run("npx", bootstrapArgs);
  if (bootstrap.code !== 0) {
    fail(
      "bootstrap:bootstrap could not run against the selected deployment. " +
        "The CLI needs existing Convex Auth user IDs; it cannot create Password-provider identities. " +
        "Provision those two users through the supported auth flow, set TAPIT_LIVE_ADMIN_USER_ID and " +
        "TAPIT_LIVE_CUSTOMER_USER_ID, and ensure the deployment is non-production. No command output or secret was printed.",
    );
  }

  const setupEmail = `live-e2e-${Date.now()}@${process.env.TAPIT_LIVE_EMAIL_DOMAIN}`;
  const setupPassword = randomBytes(18).toString("base64url");
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: process.env.TAPIT_LIVE_BASE_URL });
  const page = await context.newPage();
  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.TAPIT_LIVE_ADMIN_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(process.env.TAPIT_LIVE_ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/admin\/customers(?:\?.*)?$/);
    await page.goto("/admin/customers");
    await page.getByLabel("Customer email").fill(setupEmail);
    await page.getByRole("button", { name: "Create and invite" }).click();
    const linkText = await page
      .locator("p")
      .filter({ hasText: /One-time setup link:/ })
      .textContent();
    const setupToken = linkText?.match(/\/setup\/([A-Za-z0-9_-]+)/)?.[1];
    if (!setupToken) fail("admin customer creation did not return a setup link.");
    return { setupEmail, setupPassword, setupToken };
  } catch {
    fail(
      "admin customer creation could not provision a fresh setup token. Confirm the admin credentials, " +
        "live deployment, and Convex deployment are aligned. The setup token and password were not printed.",
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

const missing = missingLiveContract(process.env);
if (missing.length > 0)
  fail(`missing ${missing.join(", ")}. See docs/live-e2e.md for the complete contract.`);
const preflightError = validateLiveContract(process.env);
if (preflightError) fail(preflightError);

await startLocalServer();
const appContractError = await readLiveAppContract(process.env);
if (appContractError) fail(appContractError);
let exitCode = 0;
try {
  const setup = await provision();
  Object.assign(process.env, {
    TAPIT_LIVE_SETUP_EMAIL: setup.setupEmail,
    TAPIT_LIVE_SETUP_PASSWORD: setup.setupPassword,
    TAPIT_LIVE_SETUP_TOKEN: setup.setupToken,
  });
  const result = await run("npx", ["playwright", "test", "--project", "live-chromium"]);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  exitCode = result.code;
} finally {
  stopLocalServer();
}
if (exitCode !== 0) process.exit(exitCode);
