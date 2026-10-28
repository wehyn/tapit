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
        customer.email === session.email ? { ...customer, cardOwnerAccessOverride: true } : customer,
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
        customer.email === session.email ? { ...customer, cardOwnerAccessOverride: false } : customer,
      ),
    },
    session,
  );
  expect(claimed).toMatchObject({ kind: "active", hasCardOwnerFeatures: true });
});
