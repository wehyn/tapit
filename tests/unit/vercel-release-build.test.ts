import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const releaseScript = path.join(repoRoot, "scripts/vercel-build.mjs");
const vercelConfigPath = path.join(repoRoot, "vercel.json");
const packageJsonPath = path.join(repoRoot, "package.json");
const cloudUrl = "https://target-deployment.convex.cloud";
const siteUrl = "https://target-deployment.convex.site";
const fakeCommandSource = `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const commandName = path.basename(process.argv[1]);
const args = process.argv.slice(2);
function record(event, fields = {}) {
  appendFileSync(process.env.FAKE_RELEASE_LOG, JSON.stringify({ event, ...fields }) + "\\n");
}

if (commandName === "npm") {
  if (args[0] === "run" && args[1] === "build:vercel") {
    const result = spawnSync(process.execPath, [process.env.FAKE_RELEASE_SCRIPT], {
      env: process.env,
      stdio: "inherit",
    });
    process.exit(result.status ?? 1);
  }
  if (args[0] === "run" && args[1] === "build") {
    record("next-build", {
      cloudUrl: process.env.NEXT_PUBLIC_CONVEX_URL ?? null,
      siteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? null,
      hasDeployKey: Boolean(process.env.CONVEX_DEPLOY_KEY),
      hasDeploymentToken: Boolean(process.env.CONVEX_DEPLOYMENT_TOKEN),
    });
    process.exit(Number(process.env.FAKE_BUILD_EXIT_CODE ?? 0));
  }
  process.exit(90);
}

if (commandName !== "convex") process.exit(91);
record("convex-deploy", { args });
const commandIndex = args.indexOf("--cmd");
const urlNameIndex = args.indexOf("--cmd-url-env-var-name");
const frontendCommand = args[commandIndex + 1];
const cloudUrlName = args[urlNameIndex + 1];
if (args[0] !== "deploy" || !frontendCommand || cloudUrlName !== "NEXT_PUBLIC_CONVEX_URL") {
  process.exit(92);
}

const frontend = spawnSync(frontendCommand, {
  shell: true,
  env: {
    ...process.env,
    [cloudUrlName]: process.env.FAKE_TARGET_CLOUD_URL,
    NEXT_PUBLIC_CONVEX_SITE_URL: process.env.FAKE_TARGET_SITE_URL,
  },
  stdio: "inherit",
});
if (frontend.error || frontend.status !== 0) process.exit(frontend.status ?? 1);

const backendExitCode = Number(process.env.FAKE_BACKEND_EXIT_CODE ?? 0);
record("backend-deploy", { exitCode: backendExitCode });
process.exit(backendExitCode);
`;

const controlledEnvironmentNames = [
  "NEXT_PUBLIC_DEMO_MODE",
  "NEXT_PUBLIC_DEMO_STORAGE",
  "VERCEL_ENV",
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT_TOKEN",
  "NEXT_PUBLIC_CONVEX_URL",
  "NEXT_PUBLIC_CONVEX_SITE_URL",
  "FAKE_RELEASE_LOG",
  "FAKE_RELEASE_SCRIPT",
  "FAKE_TARGET_CLOUD_URL",
  "FAKE_TARGET_SITE_URL",
  "FAKE_BUILD_EXIT_CODE",
  "FAKE_BACKEND_EXIT_CODE",
];

let fakeContext: {
  directory: string;
  binDirectory: string;
  eventLogPath: string;
};

beforeAll(() => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "tapit-release-build-"));
  const binDirectory = path.join(directory, "bin");
  const eventLogPath = path.join(directory, "events.jsonl");
  mkdirSync(binDirectory);
  for (const name of ["convex", "npm"]) {
    writeFileSync(path.join(binDirectory, name), fakeCommandSource, { mode: 0o755 });
  }
  fakeContext = { directory, binDirectory, eventLogPath };
});

afterAll(() => {
  if (fakeContext) rmSync(fakeContext.directory, { force: true, recursive: true });
});

function readEvents() {
  const content = readFileSync(fakeContext.eventLogPath, "utf8").trim();
  return content ? content.split("\n").map((line) => JSON.parse(line)) : [];
}

function runRelease(overrides: Record<string, string | undefined> = {}) {
  const { binDirectory, eventLogPath } = fakeContext;
  const env = { ...process.env };
  for (const name of controlledEnvironmentNames) delete env[name];
  env.PATH = `${binDirectory}${path.delimiter}${env.PATH ?? ""}`;
  env.FAKE_RELEASE_LOG = eventLogPath;
  env.FAKE_RELEASE_SCRIPT = releaseScript;
  env.FAKE_TARGET_CLOUD_URL = cloudUrl;
  env.FAKE_TARGET_SITE_URL = siteUrl;

  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }

  writeFileSync(eventLogPath, "");
  const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, "utf8"));
  const result = spawnSync(vercelConfig.buildCommand, {
    cwd: repoRoot,
    encoding: "utf8",
    env,
    shell: true,
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    events: readEvents(),
  };
}

test("Vercel releases enter the Convex deployment gate", () => {
  expect(
    existsSync(vercelConfigPath),
    "Vercel has no explicit build command, so Next can publish without deploying matching Convex functions",
  ).toBe(true);

  const config: unknown = JSON.parse(readFileSync(vercelConfigPath, "utf8"));
  const packageJson: unknown = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  expect(config).toMatchObject({ buildCommand: "npm run build:vercel" });
  expect(packageJson).toMatchObject({
    scripts: {
      build: "next build",
      "build:vercel": "node scripts/vercel-build.mjs",
    },
  });
});

test("live Production builds use the selected Convex deployment's canonical URLs", () => {
  const deployKey = "prod:production-deployment|secret-production-key";
  const result = runRelease({
    NEXT_PUBLIC_DEMO_MODE: "false",
    VERCEL_ENV: "production",
    CONVEX_DEPLOY_KEY: deployKey,
    NEXT_PUBLIC_CONVEX_URL: "https://stale-deployment.convex.cloud",
    NEXT_PUBLIC_CONVEX_SITE_URL: "https://stale-deployment.convex.site",
  });

  expect(result.status).toBe(0);
  expect(result.events.map(({ event }) => event)).toEqual([
    "convex-deploy",
    "next-build",
    "backend-deploy",
  ]);
  expect(result.events[0].args).toContain("--cmd-url-env-var-name");
  expect(result.events[1]).toMatchObject({ cloudUrl, siteUrl, hasDeployKey: false });
  expect(result.output).not.toContain(deployKey);
});

test("live builds accept custom canonical domains supplied by Convex", () => {
  const result = runRelease({
    NEXT_PUBLIC_DEMO_MODE: "false",
    VERCEL_ENV: "production",
    CONVEX_DEPLOY_KEY: "prod:production-deployment|secret-production-key",
    FAKE_TARGET_CLOUD_URL: "https://api.example.com",
    FAKE_TARGET_SITE_URL: "https://auth.example.com",
  });

  expect(result.status).toBe(0);
  expect(result.events[1]).toMatchObject({
    cloudUrl: "https://api.example.com",
    siteUrl: "https://auth.example.com",
  });
});

const acceptedBuildModes: [string, Record<string, string>][] = [
  [
    "Live Preview accepts a Preview deployment key",
    {
      NEXT_PUBLIC_DEMO_MODE: "false",
      VERCEL_ENV: "preview",
      CONVEX_DEPLOY_KEY: "preview:team:tapit|secret-preview-key",
    },
  ],
  [
    "Live Preview accepts a development deployment key",
    {
      NEXT_PUBLIC_DEMO_MODE: "false",
      VERCEL_ENV: "preview",
      CONVEX_DEPLOY_KEY: "dev:development-deployment|secret-dev-key",
    },
  ],
  [
    "hosted demo on Vercel Preview can use a development deployment",
    {
      NEXT_PUBLIC_DEMO_MODE: "true",
      NEXT_PUBLIC_DEMO_STORAGE: "convex",
      VERCEL_ENV: "preview",
      CONVEX_DEPLOY_KEY: "dev:hosted-demo-deployment|secret-demo-key",
    },
  ],
];

test.each(acceptedBuildModes)("%s", (_name, env) => {
  const result = runRelease(env);
  expect(result.status).toBe(0);
  expect(result.events.map(({ event }) => event)).toEqual([
    "convex-deploy",
    "next-build",
    "backend-deploy",
  ]);
});

const rejectedBuildModes: [string, Record<string, string | undefined>][] = [
  [
    "Preview rejects a Production deploy key",
    {
      NEXT_PUBLIC_DEMO_MODE: "false",
      VERCEL_ENV: "preview",
      CONVEX_DEPLOY_KEY: "prod:production-deployment|secret-production-key",
    },
  ],
  [
    "Preview rejects a legacy Production key",
    {
      NEXT_PUBLIC_DEMO_MODE: "false",
      VERCEL_ENV: "preview",
      CONVEX_DEPLOY_KEY: "legacy-production-secret",
    },
  ],
  [
    "Preview rejects a Production key even when the app is in local demo mode",
    {
      NEXT_PUBLIC_DEMO_MODE: "true",
      VERCEL_ENV: "preview",
      CONVEX_DEPLOY_KEY: "prod:production-deployment|secret-production-key",
    },
  ],
  [
    "live Production rejects a development key",
    {
      NEXT_PUBLIC_DEMO_MODE: "false",
      VERCEL_ENV: "production",
      CONVEX_DEPLOY_KEY: "dev:development-deployment|secret-dev-key",
    },
  ],
  [
    "live Production rejects a Preview key",
    {
      NEXT_PUBLIC_DEMO_MODE: "false",
      VERCEL_ENV: "production",
      CONVEX_DEPLOY_KEY: "preview:team:tapit|secret-preview-key",
    },
  ],
  [
    "hosted demo rejects a Production key",
    {
      NEXT_PUBLIC_DEMO_MODE: "true",
      NEXT_PUBLIC_DEMO_STORAGE: "convex",
      VERCEL_ENV: "production",
      CONVEX_DEPLOY_KEY: "prod:production-deployment|secret-production-key",
    },
  ],
  [
    "hosted demo cannot use the Vercel Production environment",
    {
      NEXT_PUBLIC_DEMO_MODE: "true",
      NEXT_PUBLIC_DEMO_STORAGE: "convex",
      VERCEL_ENV: "production",
      CONVEX_DEPLOY_KEY: "dev:hosted-demo-deployment|secret-demo-key",
    },
  ],
  [
    "Vercel Production requires live mode instead of the repository demo default",
    {
      NEXT_PUBLIC_DEMO_MODE: undefined,
      VERCEL_ENV: "production",
      CONVEX_DEPLOY_KEY: "prod:production-deployment|secret-production-key",
    },
  ],
  [
    "a project key cannot choose the release deployment",
    {
      NEXT_PUBLIC_DEMO_MODE: "false",
      VERCEL_ENV: "production",
      CONVEX_DEPLOY_KEY: "project:team:tapit|secret-project-key",
    },
  ],
  [
    "live builds require an explicit deployment key",
    {
      NEXT_PUBLIC_DEMO_MODE: "false",
      VERCEL_ENV: "preview",
      CONVEX_DEPLOYMENT_TOKEN: "preview:team:tapit|secret-legacy-alias",
    },
  ],
  [
    "live builds reject an unknown Vercel environment",
    {
      NEXT_PUBLIC_DEMO_MODE: "false",
      VERCEL_ENV: "development",
      CONVEX_DEPLOY_KEY: "dev:development-deployment|secret-dev-key",
    },
  ],
];

test.each(rejectedBuildModes)("%s", (_name, env) => {
  const result = runRelease(env);
  expect(result.status).toBe(1);
  expect(result.events).toEqual([]);
  expect(result.output).not.toContain("secret-");
});

test("the default local demo build does not call Convex or forward deploy keys", () => {
  const result = runRelease({
    VERCEL_ENV: "preview",
    CONVEX_DEPLOY_KEY: "dev:preview-demo-deployment|secret-preview-demo-key",
    CONVEX_DEPLOYMENT_TOKEN: "legacy-secret-alias",
  });

  expect(result.status).toBe(0);
  expect(result.events.map(({ event }) => event)).toEqual(["next-build"]);
  expect(result.events[0]).toMatchObject({ hasDeployKey: false, hasDeploymentToken: false });
});

test("invalid Convex canonical URLs stop the build before Next runs", () => {
  const result = runRelease({
    NEXT_PUBLIC_DEMO_MODE: "false",
    VERCEL_ENV: "production",
    CONVEX_DEPLOY_KEY: "prod:production-deployment|secret-production-key",
    FAKE_TARGET_SITE_URL: "http://auth.example.com",
  });

  expect(result.status).toBe(1);
  expect(result.events.map(({ event }) => event)).toEqual(["convex-deploy"]);
  expect(result.output).toContain("did not provide valid HTTPS cloud and site URLs");
});

test("a frontend build failure stops the backend push and Vercel release", () => {
  const result = runRelease({
    NEXT_PUBLIC_DEMO_MODE: "false",
    VERCEL_ENV: "production",
    CONVEX_DEPLOY_KEY: "prod:production-deployment|secret-production-key",
    FAKE_BUILD_EXIT_CODE: "27",
  });

  expect(result.status).not.toBe(0);
  expect(result.events.map(({ event }) => event)).toEqual(["convex-deploy", "next-build"]);
});

test("a backend push failure stops Vercel from publishing the frontend build", () => {
  const result = runRelease({
    NEXT_PUBLIC_DEMO_MODE: "false",
    VERCEL_ENV: "production",
    CONVEX_DEPLOY_KEY: "prod:production-deployment|secret-production-key",
    FAKE_BACKEND_EXIT_CODE: "31",
  });

  expect(result.status).not.toBe(0);
  expect(result.events.map(({ event }) => event)).toEqual([
    "convex-deploy",
    "next-build",
    "backend-deploy",
  ]);
});

test(
  "release policy fuzz respects environment and credential modes (seed 0x5eedc0de, 32 cases)",
  {
    timeout: 120_000,
  },
  () => {
    const seed = 0x5eedc0de;
    let state = seed;
    const choose = <T>(items: readonly T[]): T => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return items[Math.floor((state / 2 ** 32) * items.length)]!;
    };
    const demoModes = [
      { NEXT_PUBLIC_DEMO_MODE: undefined, NEXT_PUBLIC_DEMO_STORAGE: undefined },
      { NEXT_PUBLIC_DEMO_MODE: "true", NEXT_PUBLIC_DEMO_STORAGE: "local" },
      { NEXT_PUBLIC_DEMO_MODE: "true", NEXT_PUBLIC_DEMO_STORAGE: "convex" },
      { NEXT_PUBLIC_DEMO_MODE: "false", NEXT_PUBLIC_DEMO_STORAGE: "convex" },
      { NEXT_PUBLIC_DEMO_MODE: "false", NEXT_PUBLIC_DEMO_STORAGE: "local" },
      { NEXT_PUBLIC_DEMO_MODE: "TRUE", NEXT_PUBLIC_DEMO_STORAGE: undefined },
    ];
    const environments = [undefined, "preview", "production", "development"];
    const credentials = [
      { kind: "missing", value: undefined },
      { kind: "prod", value: "prod:prod-target|secret-prod" },
      { kind: "dev", value: "dev:dev-target|secret-dev" },
      { kind: "preview", value: "preview:team:tapit|secret-preview" },
      { kind: "invalid", value: "preview:preview-target|secret-preview-deployment" },
      { kind: "legacyProd", value: "legacy-production-key" },
      { kind: "project", value: "project:team:tapit|secret-project" },
      { kind: "invalid", value: "custom:target|secret-custom" },
      { kind: "invalid", value: "prod:prod-target|" },
    ];

    for (let index = 0; index < 32; index += 1) {
      const mode = choose(demoModes);
      const vercelEnv = choose(environments);
      const credential = choose(credentials);
      const urlsMatch = choose([true, true, false]);
      const isDemo = mode.NEXT_PUBLIC_DEMO_MODE !== "false";
      const localDemo = isDemo && mode.NEXT_PUBLIC_DEMO_STORAGE !== "convex";
      const hostedDemo = isDemo && mode.NEXT_PUBLIC_DEMO_STORAGE === "convex";
      const supportedEnvironment = vercelEnv === "preview" || vercelEnv === "production";
      const previewCredentialAllowed =
        vercelEnv !== "preview" || (credential.kind !== "prod" && credential.kind !== "legacyProd");
      const acceptedKinds =
        hostedDemo || vercelEnv === "preview" ? ["dev", "preview"] : ["prod", "legacyProd"];
      const hostedDemoAllowed = !hostedDemo || vercelEnv === "preview";
      const localDemoAllowed = localDemo && vercelEnv !== "production" && previewCredentialAllowed;
      const shouldDeploy =
        !localDemo &&
        supportedEnvironment &&
        hostedDemoAllowed &&
        acceptedKinds.includes(credential.kind);
      const shouldSucceed = localDemoAllowed || (shouldDeploy && urlsMatch);
      const overrides = {
        ...mode,
        VERCEL_ENV: vercelEnv,
        CONVEX_DEPLOY_KEY: credential.value,
        FAKE_TARGET_SITE_URL: urlsMatch ? siteUrl : "http://invalid.example.com",
      };
      const result = runRelease(overrides);
      const expectedEvents = localDemoAllowed
        ? ["next-build"]
        : !shouldDeploy
          ? []
          : urlsMatch
            ? ["convex-deploy", "next-build", "backend-deploy"]
            : ["convex-deploy"];

      expect(result.status === 0, `seed=${seed} case=${index}`).toBe(shouldSucceed);
      expect(
        result.events.map(({ event }) => event),
        `seed=${seed} case=${index}`,
      ).toEqual(expectedEvents);
    }
  },
);
