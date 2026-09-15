export const LIVE_PROVISION_CONFIRMATION = "I_UNDERSTAND_NON_PRODUCTION";

export const liveContractEnvNames = {
  baseURL: "TAPIT_LIVE_BASE_URL",
  appEnvironment: "TAPIT_LIVE_APP_ENV",
  convexURL: "TAPIT_LIVE_CONVEX_URL",
  convexDeployment: "TAPIT_LIVE_CONVEX_DEPLOYMENT",
  adminEmail: "TAPIT_LIVE_ADMIN_EMAIL",
  adminPassword: "TAPIT_LIVE_ADMIN_PASSWORD",
  customerEmail: "TAPIT_LIVE_CUSTOMER_EMAIL",
  customerPassword: "TAPIT_LIVE_CUSTOMER_PASSWORD",
  profileSlug: "TAPIT_LIVE_PROFILE_SLUG",
  publishedBio: "TAPIT_LIVE_PUBLISHED_BIO",
  emailDomain: "TAPIT_LIVE_EMAIL_DOMAIN",
  emailCodeURL: "TAPIT_LIVE_EMAIL_CODE_URL",
  emailCodeToken: "TAPIT_LIVE_EMAIL_CODE_TOKEN",
  adminUserId: "TAPIT_LIVE_ADMIN_USER_ID",
  customerUserId: "TAPIT_LIVE_CUSTOMER_USER_ID",
  setupEmail: "TAPIT_LIVE_SETUP_EMAIL",
  setupPassword: "TAPIT_LIVE_SETUP_PASSWORD",
  setupToken: "TAPIT_LIVE_SETUP_TOKEN",
};

const coreContractNames = [
  "baseURL",
  "appEnvironment",
  "convexURL",
  "convexDeployment",
  "adminEmail",
  "adminPassword",
  "customerEmail",
  "customerPassword",
  "profileSlug",
  "publishedBio",
  "emailDomain",
  "emailCodeURL",
  "emailCodeToken",
  "adminUserId",
  "customerUserId",
];

export function missingLiveContract(env, { includeSetup = false } = {}) {
  const names = includeSetup
    ? [...coreContractNames, "setupEmail", "setupPassword", "setupToken"]
    : coreContractNames;
  return names.map((name) => liveContractEnvNames[name]).filter((name) => !env[name]);
}

export function validateLiveContract(
  env,
  { requireWrapper = false, requireConfirmation = true } = {},
) {
  if (requireWrapper && env.TAPIT_E2E_MODE !== "live") {
    return "run live E2E through npm run test:e2e:live so the fail-closed preflight runs";
  }
  if (!env.TAPIT_LIVE_BASE_URL || !env.TAPIT_LIVE_APP_ENV || !env.TAPIT_LIVE_CONVEX_URL) {
    return "the live app URL, app environment, and Convex URL are required";
  }
  if (!/^(development|preview)$/i.test(env.TAPIT_LIVE_APP_ENV)) {
    return "production app targets are not permitted";
  }
  if (
    !env.TAPIT_LIVE_EMAIL_DOMAIN ||
    !env.TAPIT_LIVE_EMAIL_CODE_URL ||
    !env.TAPIT_LIVE_EMAIL_CODE_TOKEN
  ) {
    return "the live email domain, verification-code URL, and code-sink token are required";
  }
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
      env.TAPIT_LIVE_EMAIL_DOMAIN,
    )
  ) {
    return "TAPIT_LIVE_EMAIL_DOMAIN must be a hostname such as example.test";
  }
  if (!/^(?:dev|preview)(?::|\/|$)/i.test(env.TAPIT_LIVE_CONVEX_DEPLOYMENT ?? "")) {
    return "TAPIT_LIVE_CONVEX_DEPLOYMENT must reference a dev or preview deployment; production deployments are not permitted.";
  }
  let baseURL;
  let convexURL;
  let emailCodeURL;
  try {
    baseURL = new URL(env.TAPIT_LIVE_BASE_URL);
    convexURL = new URL(env.TAPIT_LIVE_CONVEX_URL);
    emailCodeURL = new URL(env.TAPIT_LIVE_EMAIL_CODE_URL);
  } catch {
    return "TAPIT_LIVE_BASE_URL, TAPIT_LIVE_CONVEX_URL, and TAPIT_LIVE_EMAIL_CODE_URL must be valid URLs";
  }
  const localBase = baseURL.hostname === "127.0.0.1" || baseURL.hostname === "localhost";
  if (!localBase && baseURL.protocol !== "https:") {
    return "remote live E2E requires an HTTPS app URL";
  }
  if (convexURL.protocol !== "https:") {
    return "the selected live Convex URL must use HTTPS";
  }
  const localEmailCodeSink =
    emailCodeURL.hostname === "127.0.0.1" || emailCodeURL.hostname === "localhost";
  if (!localEmailCodeSink && emailCodeURL.protocol !== "https:") {
    return "remote live E2E verification-code sinks require HTTPS";
  }
  if (localEmailCodeSink && !["http:", "https:"].includes(emailCodeURL.protocol)) {
    return "local live E2E verification-code sinks must use HTTP or HTTPS";
  }
  if (emailCodeURL.username || emailCodeURL.password) {
    return "TAPIT_LIVE_EMAIL_CODE_URL must not contain URL credentials";
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
  if (observed?.mode !== "live") {
    return "the selected app is not running in live mode";
  }
  if (observed.appEnvironment !== expected.TAPIT_LIVE_APP_ENV) {
    return "the app environment does not match the selected live target";
  }
  if (observed.appEnvironment === "production") {
    return "production app targets are not permitted";
  }
  if (observed.convexUrl !== expected.TAPIT_LIVE_CONVEX_URL) {
    return "the app's Convex URL does not match the selected live Convex URL";
  }
  return null;
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
    const observed = await response.json();
    return validateObservedLiveApp(env, observed);
  } catch {
    return "the live app contract could not be verified";
  }
}

const liveVerificationKinds = new Set(["signup", "setup", "reset", "verification"]);
const liveVerificationCodePattern = /^[A-Za-z0-9_-]{8,128}$/;

export async function readLiveVerificationCode(
  env,
  recipient,
  kind,
  { timeoutMs = 30_000, pollIntervalMs = 500 } = {},
) {
  if (!liveVerificationKinds.has(kind)) {
    throw new Error("the live E2E email code kind is invalid");
  }
  const deadline = Date.now() + Math.max(0, timeoutMs);
  const endpoint = new URL(env.emailCodeURL);
  endpoint.searchParams.set("email", recipient);
  endpoint.searchParams.set("kind", kind);
  const requestOptions = {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${env.emailCodeToken}`,
    },
    redirect: "error",
  };

  while (Date.now() <= deadline) {
    try {
      const response = await fetch(endpoint, requestOptions);
      if (response.ok) {
        const payload = await response.json();
        const code = typeof payload?.code === "string" ? payload.code.trim() : "";
        if (liveVerificationCodePattern.test(code)) return code;
      }
    } catch {
      // The adapter may not have observed the provider message yet.
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remaining)));
  }
  throw new Error("the live E2E email code sink did not return a verification code");
}
