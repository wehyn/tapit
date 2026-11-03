import { spawnSync } from "node:child_process";

const deploymentKeyKinds = {
  hostedDemo: ["dev", "preview"],
  livePreview: ["dev", "preview"],
  liveProduction: ["prod", "legacyProd"],
};

function classifyDeployKey(key) {
  if (!key || key === "<ignore_deploy_key>") return "missing";
  if (key.trim() !== key || key.startsWith("<missing_deploy_key:")) return "invalid";
  if (!key.includes(":")) return "legacyProd";

  const [prefix, secret, ...extraParts] = key.split("|");
  if (!secret || extraParts.length > 0) return "invalid";

  const [kind, ...scope] = prefix.split(":");
  if (kind === "preview" && (scope.length === 1 || scope.length === 2)) {
    return "preview";
  }
  if ((kind === "dev" || kind === "prod") && scope.length === 1) {
    return kind;
  }
  if (kind === "project") return "project";
  return "invalid";
}

function resolveBuildPlan(env) {
  const demoMode = env.NEXT_PUBLIC_DEMO_MODE !== "false";
  const keyKind = classifyDeployKey(env.CONVEX_DEPLOY_KEY);
  if (env.VERCEL_ENV === "preview" && (keyKind === "prod" || keyKind === "legacyProd")) {
    return { error: "Vercel Preview builds cannot use a Production deployment key." };
  }
  if (env.VERCEL_ENV === "production" && demoMode) {
    return { error: "Vercel Production builds must set NEXT_PUBLIC_DEMO_MODE=false." };
  }
  if (demoMode && env.NEXT_PUBLIC_DEMO_STORAGE !== "convex") {
    return { kind: "local-demo" };
  }

  if (env.VERCEL_ENV !== "preview" && env.VERCEL_ENV !== "production") {
    return {
      error: "VERCEL_ENV must be preview or production for live and hosted-demo builds.",
    };
  }

  const target = demoMode
    ? "hostedDemo"
    : env.VERCEL_ENV === "preview"
      ? "livePreview"
      : "liveProduction";
  if (keyKind === "missing") {
    return { error: "CONVEX_DEPLOY_KEY is required for live and hosted-demo builds." };
  }
  if (keyKind === "project") {
    return { error: "CONVEX_DEPLOY_KEY must target one deployment, not an entire project." };
  }
  if (!deploymentKeyKinds[target].includes(keyKind)) {
    const message = {
      hostedDemo:
        "Hosted demo requires a dev or preview deployment key and cannot deploy Production.",
      livePreview: "Live Preview requires a dev or preview deployment key.",
      liveProduction: "Live Production requires a production deployment key.",
    }[target];
    return { error: message };
  }

  return { kind: "convex", target };
}

function hasMatchingConvexUrls(env) {
  try {
    const cloudUrl = new URL(env.NEXT_PUBLIC_CONVEX_URL);
    const siteUrl = new URL(env.NEXT_PUBLIC_CONVEX_SITE_URL);
    const cleanHttpsOrigin = (url) =>
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash;

    return (
      cleanHttpsOrigin(cloudUrl) &&
      cleanHttpsOrigin(siteUrl) &&
      cloudUrl.hostname.endsWith(".convex.cloud") &&
      siteUrl.hostname === cloudUrl.hostname.replace(/\.convex\.cloud$/, ".convex.site")
    );
  } catch {
    return false;
  }
}

function runNextBuild(env, { validateTarget = false } = {}) {
  if (validateTarget && !hasMatchingConvexUrls(env)) {
    console.error(
      "Vercel release build refused: Convex CLI did not provide matching HTTPS cloud and site URLs.",
    );
    return 1;
  }

  const buildEnv = { ...env };
  delete buildEnv.CONVEX_DEPLOY_KEY;
  delete buildEnv.CONVEX_DEPLOYMENT_TOKEN;

  return runCommand("npm", ["run", "build"], buildEnv, "Next.js build");
}

function runCommand(command, args, env, label) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.error) {
    console.error(`Vercel release build refused: could not start ${label}.`);
    return 1;
  }
  return result.status ?? 1;
}

function fail(message) {
  console.error(`Vercel release build refused: ${message}`);
  return 1;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--run-next-build") {
    return runNextBuild(process.env, { validateTarget: true });
  }
  if (args.length > 0) return fail("unexpected arguments.");

  const plan = resolveBuildPlan(process.env);
  if (plan.error) return fail(plan.error);
  if (plan.kind === "local-demo") return runNextBuild(process.env);

  const frontendCommand =
    "env -u CONVEX_DEPLOY_KEY -u CONVEX_DEPLOYMENT_TOKEN node scripts/vercel-build.mjs --run-next-build";
  return runCommand(
    "convex",
    ["deploy", "--cmd", frontendCommand, "--cmd-url-env-var-name", "NEXT_PUBLIC_CONVEX_URL"],
    process.env,
    "Convex deployment",
  );
}

process.exitCode = main();
