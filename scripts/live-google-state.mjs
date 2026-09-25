import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { isGitIgnoredPath } from "./live-e2e-contract.mjs";
import path from "node:path";
import readline from "node:readline/promises";

import { chromium } from "@playwright/test";

const outputPath = process.argv[2];
if (!outputPath || process.argv.length !== 3) {
  console.error("Usage: npm run live:google-state -- <ignored-storage-state-path>");
  process.exit(2);
}

const resolvedPath = path.resolve(outputPath);
if (!isGitIgnoredPath(resolvedPath)) {
  console.error("Google storage-state output paths must be ignored by Git; use .secrets/.");
  process.exit(2);
}
process.umask(0o077);
mkdirSync(path.dirname(resolvedPath), { recursive: true, mode: 0o700 });
if (existsSync(resolvedPath)) chmodSync(resolvedPath, 0o600);

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
try {
  await page.goto("https://accounts.google.com/", { waitUntil: "domcontentloaded" });
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  await prompt.question(
    "Complete Google sign-in in the visible browser, then press Enter here to save the state. ",
  );
  prompt.close();
  await context.storageState({ path: resolvedPath });
  chmodSync(resolvedPath, 0o600);
  console.log(`Saved Google storage state at ${resolvedPath}`);
} finally {
  await context.close();
  await browser.close();
}
