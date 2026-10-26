#!/usr/bin/env node

// Small explicit-state model of the atomic card-claim transitions in
// convex/cardClaims.ts. Each operation represents one committed Convex mutation.
const initial = {
  codeValid: true,
  invalidated: false,
  claimed: false,
  challengeUsed: false,
  successfulClaims: 0,
  claimedAfterInvalidation: false,
};

const actions = [
  ["invalidate", (s) => ({ ...s, invalidated: true })],
  [
    "complete",
    (s) => {
      if (!s.codeValid || s.invalidated || s.claimed || s.challengeUsed) return s;
      return {
        ...s,
        claimed: true,
        challengeUsed: true,
        successfulClaims: s.successfulClaims + 1,
        claimedAfterInvalidation: s.invalidated,
      };
    },
  ],
];

const depthLimit = 6;
const seen = new Set();
let states = 0;
let transitions = 0;
let violations = 0;
const queue = [{ state: initial, trace: [] }];

while (queue.length) {
  const { state, trace } = queue.shift();
  const key = JSON.stringify(state);
  if (seen.has(key)) continue;
  seen.add(key);
  states += 1;

  if (state.successfulClaims > 1 || state.claimedAfterInvalidation) {
    violations += 1;
    process.stderr.write(`Invariant violation after: ${trace.join(" -> ")}\n`);
    continue;
  }

  if (trace.length === depthLimit) continue;
  for (const [name, step] of actions) {
    transitions += 1;
    queue.push({ state: step(state), trace: [...trace, name] });
  }
}

if (violations) process.exitCode = 1;
else
  console.log(
    `Card claim model passed: ${states} states, ${transitions} transitions, depth ${depthLimit}.`,
  );
