import { expect, it } from "vitest";

import { createDefaultDemoState } from "@/lib/demo/fixtures";
import { resolveDemoSessionAccess } from "@/lib/demo/store";

it("combines the admin override with claimed-card access", () => {
  const fixture = createDefaultDemoState();
  const session = { email: "mara@example.test", role: "customer" as const };
  const cardless = {
    ...fixture,
    cards: fixture.cards.map((card) => ({ ...card, claimedAt: undefined })),
  };
  const limited = resolveDemoSessionAccess(cardless, session);
  expect(limited).toMatchObject({ kind: "active", hasCardOwnerFeatures: false });

  const granted = resolveDemoSessionAccess(
    {
      ...cardless,
      customers: cardless.customers.map((customer) =>
        customer.email === session.email
          ? { ...customer, cardOwnerAccessOverride: true }
          : customer,
      ),
    },
    session,
  );
  expect(granted).toMatchObject({ kind: "active", hasCardOwnerFeatures: true });

  const revoked = resolveDemoSessionAccess(
    {
      ...cardless,
      customers: cardless.customers.map((customer) =>
        customer.email === session.email
          ? { ...customer, cardOwnerAccessOverride: undefined }
          : customer,
      ),
    },
    session,
  );
  expect(revoked).toMatchObject({ kind: "active", hasCardOwnerFeatures: false });

  const claimed = resolveDemoSessionAccess(
    {
      ...fixture,
      customers: fixture.customers.map((customer) =>
        customer.email === session.email
          ? { ...customer, cardOwnerAccessOverride: false }
          : customer,
      ),
    },
    session,
  );
  expect(claimed).toMatchObject({ kind: "active", hasCardOwnerFeatures: true });
});

it("removes access from the reassigned card while preserving other claimed-card access and the override", () => {
  const fixture = createDefaultDemoState();
  const session = { email: "mara@example.test", role: "customer" as const };
  const formerOwner = fixture.customers.find((customer) => customer.email === session.email)!;
  const reassignedState = {
    ...fixture,
    cards: [
      ...fixture.cards.map((card) =>
        card.id === "card-mara-active"
          ? {
              ...card,
              profileId: "profile-claimable",
              claimCode: undefined,
              claimCodeExpiresAt: undefined,
              claimCodeInvalidatedAt: Date.now(),
              claimChallenge: undefined,
              claimChallengeExpiresAt: undefined,
              claimedAt: undefined,
            }
          : card,
      ),
      {
        id: "card-mara-other",
        token: "mara-card-other",
        cardUrl: "/c/mara-card-other",
        status: "active" as const,
        profileId: "profile-mara",
        claimedAt: 2,
      },
    ],
    customers: fixture.customers.map((customer) =>
      customer.id === formerOwner.id
        ? {
            ...customer,
            claimedCardIds: ["card-mara-other"],
            cardOwnerAccessOverride: false,
          }
        : customer,
    ),
  };

  expect(resolveDemoSessionAccess(reassignedState, session)).toMatchObject({
    kind: "active",
    hasCardOwnerFeatures: true,
  });
  expect(reassignedState.customers.find((customer) => customer.id === formerOwner.id)).toMatchObject({
    claimedCardIds: ["card-mara-other"],
    cardOwnerAccessOverride: false,
  });

  const withoutOtherClaim = {
    ...reassignedState,
    cards: reassignedState.cards.map((card) =>
      card.id === "card-mara-other" ? { ...card, claimedAt: undefined } : card,
    ),
    customers: reassignedState.customers.map((customer) =>
      customer.id === formerOwner.id ? { ...customer, cardOwnerAccessOverride: true } : customer,
    ),
  };
  expect(resolveDemoSessionAccess(withoutOtherClaim, session)).toMatchObject({
    kind: "active",
    hasCardOwnerFeatures: true,
  });
});
