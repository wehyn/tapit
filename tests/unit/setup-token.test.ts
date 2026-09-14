import { describe, expect, it } from "vitest";

import {
  createSetupToken,
  hashSetupToken,
  isSetupTokenUsable,
} from "../../src/lib/auth/setup-token";
import {
  DEFAULT_DEMO_PASSWORD_HASH,
  hashDemoPassword,
  verifyDemoPassword,
} from "../../src/lib/demo/password";

describe("setup tokens", () => {
  it("creates URL-safe random tokens", () => {
    const token = createSetupToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it("hashes the same token deterministically without returning the raw token", async () => {
    const token = "local-demo-token";
    const hash = await hashSetupToken(token);
    expect(hash).not.toContain(token);
    expect(await hashSetupToken(token)).toBe(hash);
  });

  it("only accepts unexpired timestamps", () => {
    expect(isSetupTokenUsable(101, 100)).toBe(true);
    expect(isSetupTokenUsable(100, 100)).toBe(false);
  });

  it("verifies setup passwords after they are persisted", async () => {
    const passwordHash = await hashDemoPassword("new-demo-password");

    await expect(verifyDemoPassword("new-demo-password", passwordHash)).resolves.toBe(true);
    await expect(verifyDemoPassword("tapit-demo", passwordHash)).resolves.toBe(false);
  });

  it("keeps the seeded demo password stable without browser crypto APIs", async () => {
    await expect(hashDemoPassword("tapit-demo")).resolves.toBe(DEFAULT_DEMO_PASSWORD_HASH);
  });
});
