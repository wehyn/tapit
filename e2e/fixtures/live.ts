import { test as base, expect } from "@playwright/test";

export type LiveTestEnv = {
  baseURL: string;
  adminEmail: string;
  adminPassword: string;
  customerEmail: string;
  customerPassword: string;
  profileSlug: string;
  publishedBio: string;
  setupEmail: string;
  setupPassword: string;
  setupToken: string;
};

export const liveEnvNames = {
  baseURL: "TAPIT_LIVE_BASE_URL",
  adminEmail: "TAPIT_LIVE_ADMIN_EMAIL",
  adminPassword: "TAPIT_LIVE_ADMIN_PASSWORD",
  customerEmail: "TAPIT_LIVE_CUSTOMER_EMAIL",
  customerPassword: "TAPIT_LIVE_CUSTOMER_PASSWORD",
  profileSlug: "TAPIT_LIVE_PROFILE_SLUG",
  publishedBio: "TAPIT_LIVE_PUBLISHED_BIO",
  setupEmail: "TAPIT_LIVE_SETUP_EMAIL",
  setupPassword: "TAPIT_LIVE_SETUP_PASSWORD",
  setupToken: "TAPIT_LIVE_SETUP_TOKEN",
} as const;

export function readLiveTestEnv(): { env?: LiveTestEnv; missing: string[] } {
  const missing = Object.values(liveEnvNames).filter((name) => !process.env[name]);
  if (missing.length > 0) return { missing };

  return {
    env: {
      baseURL: process.env[liveEnvNames.baseURL] as string,
      adminEmail: process.env[liveEnvNames.adminEmail] as string,
      adminPassword: process.env[liveEnvNames.adminPassword] as string,
      customerEmail: process.env[liveEnvNames.customerEmail] as string,
      customerPassword: process.env[liveEnvNames.customerPassword] as string,
      profileSlug: process.env[liveEnvNames.profileSlug] as string,
      publishedBio: process.env[liveEnvNames.publishedBio] as string,
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
    testInfo.skip(
      env === undefined,
      `Live E2E skipped: missing ${missing.join(", ")}. Provide the complete live contract (base URL, admin/customer credentials, profile slug, published bio, and one-time setup credentials). Run npm run test:e2e:live for fail-fast preflight and provisioning.`,
    );
    await provide(env as LiveTestEnv);
  },
});

export { expect };
