import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("Vercel releases enter the Convex deployment gate", () => {
  const vercelConfigPath = path.join(repoRoot, "vercel.json");

  expect(
    existsSync(vercelConfigPath),
    "Vercel has no explicit build command, so Next can publish without deploying matching Convex functions",
  ).toBe(true);

  const config: unknown = JSON.parse(readFileSync(vercelConfigPath, "utf8"));
  expect(config).toMatchObject({ buildCommand: "npm run build:vercel" });
});
