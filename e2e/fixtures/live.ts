import { test as base, expect } from "@playwright/test";

import {
  missingLiveContract,
  readLiveAppContract,
  readLiveVerificationCode,
  validateLiveContract,
} from "../../scripts/live-e2e-contract.mjs";

export type LiveTestEnv = {
  baseURL: string;
  appEnvironment: string;
  convexURL: string;
  adminEmail: string;
  adminPassword: string;
  customerEmail: string;
  customerPassword: string;
  profileSlug: string;
  publishedBio: string;
  emailDomain: string;
  emailCodeURL: string;
  emailCodeToken: string;
  setupEmail: string;
  setupPassword: string;
  setupToken: string;
};

export const liveEnvNames = {
  baseURL: "TAPIT_LIVE_BASE_URL",
  appEnvironment: "TAPIT_LIVE_APP_ENV",
  convexURL: "TAPIT_LIVE_CONVEX_URL",
  adminEmail: "TAPIT_LIVE_ADMIN_EMAIL",
  adminPassword: "TAPIT_LIVE_ADMIN_PASSWORD",
  customerEmail: "TAPIT_LIVE_CUSTOMER_EMAIL",
  customerPassword: "TAPIT_LIVE_CUSTOMER_PASSWORD",
  profileSlug: "TAPIT_LIVE_PROFILE_SLUG",
  publishedBio: "TAPIT_LIVE_PUBLISHED_BIO",
  emailDomain: "TAPIT_LIVE_EMAIL_DOMAIN",
  emailCodeURL: "TAPIT_LIVE_EMAIL_CODE_URL",
  emailCodeToken: "TAPIT_LIVE_EMAIL_CODE_TOKEN",
  setupEmail: "TAPIT_LIVE_SETUP_EMAIL",
  setupPassword: "TAPIT_LIVE_SETUP_PASSWORD",
  setupToken: "TAPIT_LIVE_SETUP_TOKEN",
} as const;

export function readLiveTestEnv(): { env?: LiveTestEnv; missing: string[] } {
  const missing = missingLiveContract(process.env, { includeSetup: true });
  if (missing.length > 0) return { missing };

  return {
    env: {
      baseURL: process.env[liveEnvNames.baseURL] as string,
      appEnvironment: process.env[liveEnvNames.appEnvironment] as string,
      convexURL: process.env[liveEnvNames.convexURL] as string,
      adminEmail: process.env[liveEnvNames.adminEmail] as string,
      adminPassword: process.env[liveEnvNames.adminPassword] as string,
      customerEmail: process.env[liveEnvNames.customerEmail] as string,
      customerPassword: process.env[liveEnvNames.customerPassword] as string,
      profileSlug: process.env[liveEnvNames.profileSlug] as string,
      publishedBio: process.env[liveEnvNames.publishedBio] as string,
      emailDomain: process.env[liveEnvNames.emailDomain] as string,
      emailCodeURL: process.env[liveEnvNames.emailCodeURL] as string,
      emailCodeToken: process.env[liveEnvNames.emailCodeToken] as string,
      setupEmail: process.env[liveEnvNames.setupEmail] as string,
      setupPassword: process.env[liveEnvNames.setupPassword] as string,
      setupToken: process.env[liveEnvNames.setupToken] as string,
    },
    missing: [],
  };
}

export const test = base.extend<{ liveEnv: LiveTestEnv }>({
  liveEnv: async ({}, provide, testInfo) => {
    const { env, missing } = readLiveTestEnv();
    if (process.env.TAPIT_E2E_MODE !== "live") {
      missing.push("TAPIT_E2E_MODE (run npm run test:e2e:live)");
    }
    testInfo.skip(
      env === undefined,
      `Live E2E skipped: missing ${missing.join(", ")}. Run npm run test:e2e:live for fail-fast preflight and provisioning.`,
    );
    const contractError = validateLiveContract(process.env, { requireWrapper: true });
    if (contractError) throw new Error(`Live E2E target rejected: ${contractError}`);
    const appContractError = await readLiveAppContract(process.env);
    if (appContractError) throw new Error(`Live E2E target rejected: ${appContractError}`);
    await provide(env as LiveTestEnv);
  },
});

export { expect };

export { readLiveVerificationCode };
