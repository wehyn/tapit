import { describe, expect, it } from "vitest";

import {
  claimCodeState,
  transitionCardStatus,
  type CardEvent,
  type CardStatus,
} from "@/lib/domain/state-machines";

// Checks that the real card status machine and claim-code state function give
// the answers verification/card-lifecycle/CardLifecycle.tla assumes for every
// action. If this fails, the model and the code disagree: fix the model or
// the code, then re-run TLC.
const STATUSES: CardStatus[] = [
  "registered",
  "claimable",
  "active",
  "inactive",
  "replaced",
  "lost",
];
const result = (from: CardStatus, event: CardEvent) => {
  try {
    return transitionCardStatus(from, event);
  } catch {
    return null;
  }
};
const outcomes = (event: CardEvent) =>
  Object.fromEntries(STATUSES.map((from) => [from, result(from, event)]));
const none = Object.fromEntries(STATUSES.map((s) => [s, null]));
const only = (entries: Partial<Record<CardStatus, CardStatus>>) => ({ ...none, ...entries });

describe("card lifecycle model conformance", () => {
  for (const published of [true, false]) {
    const live: CardStatus = published ? "active" : "claimable";
    it(`AdminAttach, CompleteClaim, AdminReassign, OwnerReactivate (profile published: ${published})`, () => {
      expect(outcomes({ type: "attach", published })).toEqual(only({ registered: live }));
      expect(outcomes({ type: "claim", published })).toEqual(
        only({ registered: live, claimable: live, active: live }),
      );
      expect(outcomes({ type: "reassign", published })).toEqual(
        only({ claimable: live, active: live }),
      );
      expect(outcomes({ type: "reactivate_owner", published })).toEqual(only({ inactive: live }));
    });
    it(`AdminReactivate (profile published: ${published})`, () => {
      expect(outcomes({ type: "reactivate_admin", published, hasProfile: true })).toEqual(
        only({ inactive: live, replaced: live, lost: live }),
      );
    });
  }

  it("AdminReactivate of a lost card with no profile returns it to stock", () => {
    expect(outcomes({ type: "reactivate_admin", published: false, hasProfile: false })).toEqual(
      only({ lost: "registered" }),
    );
  });

  it("PublishProfile, AdminDeactivate, MarkLost (and the unused mark_replaced event)", () => {
    expect(outcomes({ type: "publish_profile" })).toEqual(only({ claimable: "active" }));
    expect(outcomes({ type: "deactivate" })).toEqual(only({ active: "inactive" }));
    expect(outcomes({ type: "mark_replaced", replacementCardId: "new" })).toEqual(
      only({ active: "replaced" }),
    );
    expect(outcomes({ type: "mark_lost" })).toEqual({
      ...Object.fromEntries(STATUSES.map((s) => [s, "lost"])),
      lost: null,
    });
  });

  it("derives the claim code state the way CodeState does", () => {
    for (const hash of [false, true])
      for (const invalidated of [false, true])
        for (const claimed of [false, true]) {
          const expected = invalidated
            ? "invalidated"
            : claimed
              ? "claimed"
              : !hash
                ? "missing"
                : "issued";
          expect(
            claimCodeState({
              claimCodeHash: hash ? "h" : undefined,
              claimCodeInvalidatedAt: invalidated ? 1 : undefined,
              claimCodeClaimedAt: claimed ? 1 : undefined,
            }),
          ).toBe(expected);
        }
  });
});
