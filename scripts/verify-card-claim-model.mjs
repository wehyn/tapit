#!/usr/bin/env node

// Explicit-state model of card setup, claim, correction, and routing transitions.
const challengeLifetimeMs = 10 * 60 * 1000;
const initial = {
  cardStatus: "registered",
  profileAssigned: false,
  profilePublished: false,
  codeGenerated: false,
  codeVersion: 0,
  codeInvalidated: false,
  codeConsumed: false,
  challenge: "none",
  challengeAgeMs: 0,
  challengeCodeVersion: 0,
  challengeUses: 0,
  correctionPending: false,
  hasOtherLiveCard: false,
  successfulClaims: 0,
  claimedAfterInvalidation: false,
  cardUrl: "https://tapit.test/c/card-1?claim=1",
  token: "card-1",
};

const cardCanUseCode = (state) =>
  !state.codeConsumed &&
  !state.codeInvalidated &&
  state.codeGenerated &&
  !state.correctionPending &&
  ["registered", "claimable", "active"].includes(state.cardStatus);
const challengeIsCurrent = (state) =>
  state.challenge === "valid" &&
  state.challengeAgeMs < challengeLifetimeMs &&
  state.challengeCodeVersion === state.codeVersion &&
  state.challengeUses === 0;

function route(state) {
  if (state === null) return "missing";
  if (state.correctionPending) return "unavailable";
  if (state.cardStatus === "inactive" || state.cardStatus === "replaced") return "inactive";
  if (!state.profileAssigned) return "setup";
  if (state.cardStatus === "claimable" && state.codeConsumed && !state.profilePublished)
    return "setup";
  if (!state.codeConsumed) return "claim";
  if (state.cardStatus === "active" && state.profilePublished) return "active";
  return "unavailable";
}

const actions = [
  [
    "adminAssign",
    (state) => {
      if (state.cardStatus !== "registered" || state.hasOtherLiveCard) return state;
      return {
        ...state,
        cardStatus: state.profilePublished ? "active" : "claimable",
        profileAssigned: true,
      };
    },
  ],
  [
    "generateCode",
    (state) => {
      if (!["registered", "claimable", "active"].includes(state.cardStatus) || state.codeConsumed)
        return state;
      return {
        ...state,
        codeGenerated: true,
        codeVersion: state.codeVersion + 1,
        codeInvalidated: false,
        challenge: "none",
        challengeAgeMs: 0,
        challengeCodeVersion: 0,
        challengeUses: 0,
      };
    },
  ],
  [
    "verifyCode",
    (state) =>
      cardCanUseCode(state)
        ? {
            ...state,
            challenge: "valid",
            challengeAgeMs: 0,
            challengeCodeVersion: state.codeVersion,
            challengeUses: 0,
          }
        : state,
  ],
  [
    "expireChallenge",
    (state) =>
      state.challenge === "valid"
        ? { ...state, challenge: "expired", challengeAgeMs: challengeLifetimeMs }
        : state,
  ],
  [
    "complete",
    (state) => {
      if (!cardCanUseCode(state) || !challengeIsCurrent(state) || state.hasOtherLiveCard)
        return state;
      return {
        ...state,
        cardStatus: state.profilePublished ? "active" : "claimable",
        profileAssigned: true,
        codeConsumed: true,
        challenge: "used",
        challengeUses: 1,
        successfulClaims: state.successfulClaims + 1,
        claimedAfterInvalidation: state.codeInvalidated,
      };
    },
  ],
  [
    "requestCorrection",
    (state) => {
      if (!state.profileAssigned || !cardCanUseCode(state) || !challengeIsCurrent(state))
        return state;
      return {
        ...state,
        correctionPending: true,
        challenge: "used",
        challengeUses: 1,
      };
    },
  ],
  [
    "correctAssignment",
    (state) => {
      if (!state.correctionPending || state.hasOtherLiveCard) return state;
      return {
        ...state,
        cardStatus: state.profilePublished ? "active" : "claimable",
        correctionPending: false,
      };
    },
  ],
  [
    "addOtherLiveCard",
    (state) => (state.successfulClaims === 0 ? { ...state, hasOtherLiveCard: true } : state),
  ],
  [
    "publishProfile",
    (state) => ({
      ...state,
      profilePublished: true,
      cardStatus:
        state.profileAssigned && state.codeConsumed && state.cardStatus === "claimable"
          ? "active"
          : state.cardStatus,
    }),
  ],
  [
    "invalidateCode",
    (state) =>
      state.codeGenerated && !state.codeConsumed ? { ...state, codeInvalidated: true } : state,
  ],
  [
    "deactivate",
    (state) => ({
      ...state,
      cardStatus: "inactive",
      codeInvalidated: state.codeGenerated && !state.codeConsumed,
    }),
  ],
  [
    "replace",
    (state) => ({
      ...state,
      cardStatus: "replaced",
      codeInvalidated: state.codeGenerated && !state.codeConsumed,
    }),
  ],
];

const depthLimit = 8;
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

  const publicState = route(state);
  const invariantFailed =
    state.successfulClaims > 1 ||
    state.claimedAfterInvalidation ||
    state.challengeUses > 1 ||
    (state.codeConsumed && state.successfulClaims !== 1) ||
    (state.correctionPending && publicState !== "unavailable") ||
    (publicState === "active" &&
      (!state.profileAssigned || !state.profilePublished || !state.codeConsumed)) ||
    (state.hasOtherLiveCard && state.successfulClaims > 0) ||
    state.cardUrl !== initial.cardUrl ||
    state.token !== initial.token ||
    Object.hasOwn(state, "codeExpiresAt");
  if (invariantFailed) {
    violations += 1;
    process.stderr.write("Invariant violation after: " + trace.join(" -> ") + "\n");
    continue;
  }

  if (trace.length === depthLimit) continue;
  for (const [name, step] of actions) {
    transitions += 1;
    queue.push({ state: step(state), trace: [...trace, name] });
  }
}

if (route(null) !== "missing") violations += 1;
if (violations) process.exitCode = 1;
else {
  console.log(
    "Card setup model passed: " +
      states +
      " states, " +
      transitions +
      " transitions, depth " +
      depthLimit +
      ".",
  );
}
