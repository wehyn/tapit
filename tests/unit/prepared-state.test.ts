import { describe, expect, it } from "vitest";
import { initialWizardState, wizardReducer } from "@/components/admin/prepared/state";

describe("prepared wizard transitions", () => {
  it("tracks reached steps, previews, and returns from preview to the requested step", () => {
    let state = wizardReducer(initialWizardState(), { type: "start" });
    state = wizardReducer(state, { type: "next" });
    expect(wizardReducer(state, { type: "back" })).toMatchObject({ step: 1 });
    state = wizardReducer(state, { type: "next" });
    state = wizardReducer(state, { type: "preview" });
    state = wizardReducer(state, { type: "editFromPreview", step: 1 });
    expect(state).toMatchObject({ screen: "wizard", step: 1, reached: [1, 2, 3] });
  });
  it("preserves edit mode and profile values through preview navigation", () => {
    const state = wizardReducer(initialWizardState(), {
      type: "edit",
      customerId: "c1",
      values: { name: "Sam", slug: "sam", links: [] },
    });
    const preview = wizardReducer(state, { type: "preview" });
    const back = wizardReducer(preview, { type: "editFromPreview", step: 3 });
    expect(back).toMatchObject({
      mode: "edit",
      customerId: "c1",
      step: 3,
      values: { name: "Sam" },
    });
  });
  it("requires handoff details only on the handoff screen", () => {
    const wizard = wizardReducer(initialWizardState(), { type: "start" });
    const handoff = wizardReducer(wizard, {
      type: "handoff",
      token: "setup-token",
      title: "Account prepared",
    });
    expect(handoff).toMatchObject({
      screen: "handoff",
      token: "setup-token",
      handoffTitle: "Account prepared",
    });
    expect(wizardReducer(handoff, { type: "reset" })).toMatchObject({ screen: "list" });
  });
});
