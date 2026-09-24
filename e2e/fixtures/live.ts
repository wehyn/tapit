import type { Browser, Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";

import liveContract from "../../scripts/live-e2e-contract.cjs";

const { liveContractEnvNames, missingLiveContract, readLiveAppContract, validateLiveContract } =
  liveContract;

export type LiveIdentity = "admin" | "customer" | "invited";

export type LiveTestEnv = {
  baseURL: string;
  appEnvironment: string;
  convexURL: string;
  convexSiteURL: string;
  adminEmail: string;
  adminGoogleState: string;
  customerEmail: string;
  customerGoogleState: string;
  invitedEmail: string;
  invitedGoogleState: string;
  profileSlug: string;
  publishedBio: string;
};

export const liveEnvNames = liveContractEnvNames;
const envNames = liveContractEnvNames as Record<string, string>;
const envValue = (name: string) => process.env[envNames[name]!] as string;

export function readLiveTestEnv(): { env?: LiveTestEnv; missing: string[] } {
  const missing = missingLiveContract(process.env);
  if (missing.length > 0) return { missing };

  return {
    env: {
      baseURL: envValue("baseURL"),
      appEnvironment: envValue("appEnvironment"),
      convexURL: envValue("convexURL"),
      convexSiteURL: envValue("convexSiteURL"),
      adminEmail: envValue("adminEmail"),
      adminGoogleState: envValue("adminGoogleState"),
      customerEmail: envValue("customerEmail"),
      customerGoogleState: envValue("customerGoogleState"),
      invitedEmail: envValue("invitedEmail"),
      invitedGoogleState: envValue("invitedGoogleState"),
      profileSlug: envValue("profileSlug"),
      publishedBio: envValue("publishedBio"),
    },
    missing: [],
  };
}

export async function contextForIdentity(
  browser: Browser,
  env: LiveTestEnv,
  identity: LiveIdentity,
) {
  const statePath =
    identity === "admin"
      ? env.adminGoogleState
      : identity === "customer"
        ? env.customerGoogleState
        : env.invitedGoogleState;
  return browser.newContext({ baseURL: env.baseURL, storageState: statePath });
}

export async function signInWithGoogle(page: Page, expectedPath?: RegExp) {
  const button = page.getByRole("button", { name: "Continue with Google", exact: true });
  if ((await button.count()) !== 1)
    throw new Error("Google sign-in control is unavailable; refusing to skip OAuth.");
  await Promise.all([
    page.waitForURL(/\/api\/auth\/callback\/google(?:\?.*)?$/, { timeout: 30_000 }),
    button.click(),
  ]);
  if (expectedPath) await expect(page).toHaveURL(expectedPath);
}

export const test = base.extend<{ liveEnv: LiveTestEnv }>({
  liveEnv: async ({}, provide, testInfo) => {
    const { env, missing } = readLiveTestEnv();
    if (process.env.TAPIT_E2E_MODE !== "live")
      missing.push("TAPIT_E2E_MODE (run npm run test:e2e:live)");
    testInfo.skip(
      env === undefined,
      `Live E2E skipped: missing ${missing.join(", ")}. Run npm run test:e2e:live for fail-fast preflight.`,
    );
    const contractError = validateLiveContract(process.env, { requireWrapper: true });
    if (contractError) throw new Error(`Live E2E target rejected: ${contractError}`);
    const appContractError = await readLiveAppContract(process.env);
    if (appContractError) throw new Error(`Live E2E target rejected: ${appContractError}`);
    await provide(env as LiveTestEnv);
  },
});

export { expect };
