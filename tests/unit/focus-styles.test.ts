import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("focus color contract", () => {
  it("uses the Tapit accent instead of orange for focus indicators", () => {
    expect(globalsCss).toContain("--tapit-focus: var(--tapit-accent);");
    expect(globalsCss).toContain("outline: 3px solid var(--tapit-focus);");
    expect(globalsCss).not.toContain("--tapit-focus: #b86500;");
  });
});
