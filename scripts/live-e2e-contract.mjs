import { existsSync, statSync } from "node:fs";

export const LIVE_PROVISION_CONFIRMATION = "I_UNDERSTAND_NON_PRODUCTION";

export const liveContractEnvNames = {
  baseURL: "TAPIT_LIVE_BASE_URL",
  appEnvironment: "TAPIT_LIVE_APP_ENV",
  convexURL: "TAPIT_LIVE_CONVEX_URL",
  convexSiteURL: "NEXT_PUBLIC_CONVEX_SITE_URL",
  convexDeployment: "TAPIT_LIVE_CONVEX_DEPLOYMENT",
  adminEmail: "TAPIT_LIVE_ADMIN_EMAIL",
  adminGoogleState: "TAPIT_LIVE_ADMIN_GOOGLE_STATE",
  customerEmail: "TAPIT_LIVE_CUSTOMER_EMAIL",
  customerGoogleState: "TAPIT_LIVE_CUSTOMER_GOOGLE_STATE",
  invitedEmail: "TAPIT_LIVE_INVITED_EMAIL",
  invitedGoogleState: "TAPIT_LIVE_INVITED_GOOGLE_STATE",
  profileSlug: "TAPIT_LIVE_PROFILE_SLUG",
  publishedBio: "TAPIT_LIVE_PUBLISHED_BIO",
  provisionConfirm: "TAPIT_LIVE_PROVISION_CONFIRM",
};

const requiredNames = Object.keys(liveContractEnvNames).filter(
  (name) => name !== "provisionConfirm",
);

export function missingLiveContract(env) {
  return requiredNames
    .filter((name) => !env[liveContractEnvNames[name]])
    .map((name) => liveContractEnvNames[name]);
}

export function validateLiveContract(
  env,
  { requireWrapper = false, requireConfirmation = true } = {},
) {
  if (requireWrapper && env.TAPIT_E2E_MODE !== "live") {
    return "run live E2E through npm run test:e2e:live so the fail-closed preflight runs";
  }
  const missing = missingLiveContract(env);
  if (missing.length > 0) return `missing ${missing.join(", ")}`;
  if (!/^(development|preview)$/i.test(env.TAPIT_LIVE_APP_ENV)) {
    return "production app targets are not permitted";
  }
  if (!/^(?:dev|preview)(?::|\/|$)/i.test(env.TAPIT_LIVE_CONVEX_DEPLOYMENT)) {
    return "production deployments are not permitted";
  }
  let baseURL;
  let convexURL;
  let siteURL;
  try {
    baseURL = new URL(env.TAPIT_LIVE_BASE_URL);
    convexURL = new URL(env.TAPIT_LIVE_CONVEX_URL);
    siteURL = new URL(env.NEXT_PUBLIC_CONVEX_SITE_URL);
  } catch {
    return "TAPIT_LIVE_BASE_URL, TAPIT_LIVE_CONVEX_URL, and NEXT_PUBLIC_CONVEX_SITE_URL must be valid URLs";
  }
  if (
    baseURL.username ||
    baseURL.password ||
    convexURL.username ||
    convexURL.password ||
    siteURL.username ||
    siteURL.password
  ) {
    return "live URLs must not contain URL credentials";
  }
  const localBase = baseURL.hostname === "127.0.0.1" || baseURL.hostname === "localhost";
  if (!localBase && baseURL.protocol !== "https:")
    return "remote live E2E requires an HTTPS app URL";
  if (convexURL.protocol !== "https:" || !convexURL.hostname.endsWith(".convex.cloud")) {
    return "the selected live Convex URL must use HTTPS and a convex.cloud origin";
  }
  if (
    siteURL.protocol !== "https:" ||
    siteURL.hostname !== convexURL.hostname.replace(/\.convex\.cloud$/, ".convex.site") ||
    siteURL.port ||
    siteURL.pathname !== "/" ||
    siteURL.search ||
    siteURL.hash
  ) {
    return "the Convex site URL does not match the selected live Convex deployment";
  }
  for (const name of ["adminGoogleState", "customerGoogleState", "invitedGoogleState"]) {
    const statePath = env[liveContractEnvNames[name]];
    if (!existsSync(statePath) || !statSync(statePath).isFile()) {
      return `${liveContractEnvNames[name]} must point to an existing Google storage-state file`;
    }
  }
  if (env.TAPIT_LIVE_PRODUCTION_BASE_URL) {
    try {
      if (baseURL.origin === new URL(env.TAPIT_LIVE_PRODUCTION_BASE_URL).origin) {
        return "production app targets are not permitted";
      }
    } catch {
      return "TAPIT_LIVE_PRODUCTION_BASE_URL must be a valid URL";
    }
  }
  if (requireConfirmation && env.TAPIT_LIVE_PROVISION_CONFIRM !== LIVE_PROVISION_CONFIRMATION) {
    return `set TAPIT_LIVE_PROVISION_CONFIRM=${LIVE_PROVISION_CONFIRMATION} to permit non-production provisioning`;
  }
  if (localBase && env.TAPIT_LIVE_LOCAL_SERVER !== "true") {
    return "a local base URL requires TAPIT_LIVE_LOCAL_SERVER=true";
  }
  return null;
}

export function validateObservedLiveApp(expected, observed) {
  if (observed?.mode !== "live") return "the selected app is not running in live mode";
  if (observed.authProvider !== "google") return "the live app must use Google authentication";
  if (observed.appEnvironment !== expected.TAPIT_LIVE_APP_ENV) {
    return "the app environment does not match the selected live target";
  }
  if (observed.appEnvironment === "production") return "production app targets are not permitted";
  if (!sameOrigin(observed.convexUrl, expected.TAPIT_LIVE_CONVEX_URL)) {
    return "the app's Convex URL does not match the selected live Convex URL";
  }
  if (!sameOrigin(observed.convexSiteUrl, expected.NEXT_PUBLIC_CONVEX_SITE_URL)) {
    return "the app's Convex site URL does not match the selected live site URL";
  }
  return null;
}

function sameOrigin(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  try {
    return new URL(actual).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}

export async function readLiveAppContract(env) {
  try {
    const response = await fetch(
      `${env.TAPIT_LIVE_BASE_URL.replace(/\/$/, "")}/api/live-contract`,
      {
        redirect: "error",
      },
    );
    if (!response.ok) return "the live app contract endpoint was not available";
    return validateObservedLiveApp(env, await response.json());
  } catch {
    return "the live app contract could not be verified";
  }
}

export async function verifyProfileImageCors(env, fetchImpl = fetch) {
  let appOrigin;
  try {
    appOrigin = new URL(env.TAPIT_LIVE_BASE_URL).origin;
  } catch {
    return "the live app origin could not be derived for image CORS verification";
  }
  try {
    const response = await fetchImpl(
      `${env.NEXT_PUBLIC_CONVEX_SITE_URL.replace(/\/$/, "")}/profile-image-upload`,
      {
        method: "OPTIONS",
        headers: {
          Origin: appOrigin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers":
            "authorization,content-type,x-profile-id,x-image-revision",
        },
        redirect: "error",
      },
    );
    if (!response.ok || response.headers.get("Access-Control-Allow-Origin") !== appOrigin) {
      return "the selected app origin is not allowed by the Convex profile-image upload CORS policy";
    }
    return null;
  } catch {
    return "the Convex profile-image upload CORS preflight could not be verified";
  }
}
