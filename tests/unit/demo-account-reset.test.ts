import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultDemoState } from "../../src/lib/demo/fixtures";
import { serializeDemoState } from "../../src/lib/demo/storage-codec";

describe("local Demo account state", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("resets only the session Demo account and re-onboards that same identity", async () => {
    const state = createDefaultDemoState();
    const mara = state.customers.find((customer) => customer.id === "customer-mara")!;
    mara.isDemo = true;
    state.customers.push({
      id: "other-customer",
      email: "other@example.test",
      role: "customer",
      profileId: "profile-claimable",
      status: "active",
      deletionStatus: "active",
    });
    localStorage.setItem("tapit:demo-state:v1", serializeDemoState(state));
    const store = await import("../../src/lib/demo/store");
    store.setDemoSession({ email: mara.email, role: "customer" });

    const id = store.beginCurrentDemoAccountReset();
    expect(id).toBe(mara.id);
    expect(
      store.getDemoState().customers.find((customer) => customer.id === mara.id),
    ).toMatchObject({
      status: "active",
      isDemo: true,
      demoResetInProgress: true,
    });
    store.finishCurrentDemoAccountReset(id);

    let result = store.getDemoState();
    expect(result.customers.find((customer) => customer.id === mara.id)).toMatchObject({
      email: mara.email,
      passwordHash: mara.passwordHash,
      isDemo: true,
      demoOnboardingPending: true,
    });
    expect(result.customers.find((customer) => customer.id === "other-customer")).toBeDefined();
    expect(result.profiles.some((profile) => profile.id === "profile-mara")).toBe(false);
    expect(result.cards.some((card) => card.profileId === "profile-mara")).toBe(false);
    expect(result.analytics.some((bucket) => bucket.profileId === "profile-mara")).toBe(false);
    expect(result.audits.some((event) => event.target === "mara-velasquez")).toBe(false);
    expect(result.cardOrderPaymentMethods).toEqual(state.cardOrderPaymentMethods);
    expect(store.getDemoSession()).toEqual({ email: mara.email, role: "customer" });

    store.completeDemoReOnboarding({ name: "Mara Again", slug: "mara-again" });
    result = store.getDemoState();
    expect(result.customers.find((customer) => customer.id === mara.id)).toMatchObject({
      email: mara.email,
      passwordHash: mara.passwordHash,
      isDemo: true,
      status: "active",
    });
    expect(result.profiles.find((profile) => profile.ownerId === mara.id)?.draft.name).toBe(
      "Mara Again",
    );
  });

  it("guards the staged customer to Demo to administrator transitions", async () => {
    const state = createDefaultDemoState();
    localStorage.setItem("tapit:demo-state:v1", serializeDemoState(state));
    const store = await import("../../src/lib/demo/store");
    store.setDemoSession({ email: "admin@tapit.local", role: "admin" });

    expect(() => store.beginCurrentDemoAccountReset()).toThrow(/Active Demo account/i);
    expect(() => store.promoteDemoCustomerToAdmin("customer-mara")).toThrow(/Demo customer/i);
    store.promoteDemoCustomerToDemo("customer-mara");
    expect(
      store.getDemoState().customers.find((customer) => customer.id === "customer-mara"),
    ).toMatchObject({ role: "customer", isDemo: true });
    store.promoteDemoCustomerToAdmin("customer-mara");
    expect(
      store.getDemoState().customers.find((customer) => customer.id === "customer-mara"),
    ).toMatchObject({ role: "admin", profileId: "profile-mara" });
    expect(
      store.getDemoState().customers.find((customer) => customer.id === "customer-mara")?.isDemo,
    ).toBeUndefined();
    expect(store.getDemoState().profiles.some((profile) => profile.id === "profile-mara")).toBe(
      true,
    );
  });
});
