import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "src");
const spacingSteps = new Set(["0", "px", "1", "2", "3", "4", "6", "8", "12", "16"]);
const spacingPrefix =
  "(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)";
const allowedTextTokens = new Set(["xs", "sm", "base", "lg", "xl", "2xl"]);

const rules = [
  { name: "divider or side border", pattern: /(?<![\w-])border-[tbly](?![a-z])/g },
  { name: "divide-*", pattern: /(?<![\w-])divide-/g },
  { name: "arbitrary radius", pattern: /(?<![\w-])rounded(?:-[a-z]+)?-\[/g },
  {
    name: "non-token radius",
    pattern:
      /(?<![\w-])rounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br))?-(?:xs|sm|md|lg|xl|[2-9]xl)(?![\w-])/g,
  },
  { name: "arbitrary text utility", pattern: /(?<![\w-])text-\[/g },
  {
    name: "non-token text size",
    pattern: /(?<![\w-])text-(2xs|3xs|3xl|4xl|5xl|6xl|7xl|8xl|9xl)(?![\w-])/g,
    skip: (match, file) =>
      (allowedTextTokens.has(match[1]) || match[1] === "3xl") &&
      path.relative(root, file) === "app/page.tsx",
  },
  {
    name: "arbitrary palette color",
    pattern: /(?<![\w-])(?:bg|text|border|ring)-\[#[\da-fA-F]{3,8}\]/g,
  },
  { name: "arbitrary shadow", pattern: /(?<![\w-])shadow-\[/g },
  { name: "outline colour border", pattern: /(?<![\w-])border-tapit-/g },
  {
    name: "1px outline utility",
    pattern: /(?<![\w-])(?:ring-1|outline-1)(?![\w-])/g,
  },
  {
    name: "non-token shadow",
    pattern: /(?<![\w-])shadow-([\w.[\]#%/-]+)/g,
    skip: (match) => match[1] === "card" || match[1] === "image" || match[1] === "none",
  },
  {
    name: "hover motion",
    pattern: /(?<![\w-])hover:(?:scale|translate)-[^\s"`]+/g,
  },
  {
    name: "direct icon import outside registry",
    pattern: /from\s+["']@phosphor-icons\/react["']/g,
    skip: (_match, file) => path.relative(root, file) === "components/ui/Icon.tsx",
  },
  {
    name: "off-scale spacing",
    pattern: new RegExp(
      `(?<![\\w-])-?${spacingPrefix}-(\\[[^\\]]*\\]|\\d+(?:\\.\\d+)?)(?![\\w-])`,
      "g",
    ),
    skip: (match) => spacingSteps.has(match[1]),
  },
];

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (/\.(tsx?|css)$/.test(entry.name)) yield full;
  }
}

const counts = new Map(rules.map((rule) => [rule.name, 0]));
const verbose = process.argv.includes("--verbose");

for (const file of sourceFiles(root)) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      for (const rule of rules) {
        for (const match of line.matchAll(rule.pattern)) {
          if (rule.skip?.(match, file)) continue;
          counts.set(rule.name, counts.get(rule.name) + 1);
          if (verbose)
            console.log(`${path.relative(root, file)}:${index + 1}  ${rule.name}  ${match[0]}`);
        }
      }
    });
}

let total = 0;
for (const [name, count] of counts) {
  console.log(`${String(count).padStart(5)}  ${name}`);
  total += count;
}
if (total > 0) process.exit(1);
