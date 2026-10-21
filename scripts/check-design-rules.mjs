import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "src");
const spacingSteps = new Set(["0", "px", "1", "2", "3", "4", "6", "8", "12", "16"]);
const spacingPrefix =
  "(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)";

const rules = [
  { name: "divider or side border", pattern: /(?<![\w-])border-[tbly](?![a-z])/g },
  { name: "divide-*", pattern: /(?<![\w-])divide-/g },
  { name: "arbitrary radius", pattern: /(?<![\w-])rounded(?:-[a-z]+)?-\[/g },
  { name: "arbitrary text size", pattern: /(?<![\w-])text-\[/g },
  { name: "arbitrary shadow", pattern: /(?<![\w-])shadow-\[/g },
  { name: "outline colour border", pattern: /(?<![\w-])border-tapit-/g },
  {
    name: "off-scale spacing",
    pattern: new RegExp(
      `(?<![\\w-])${spacingPrefix}-(\\[[^\\]]*\\]|\\d+(?:\\.\\d+)?)(?![\\w-])`,
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
          if (rule.skip?.(match)) continue;
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
