import type { WizardState, PreparedStep, PreparedFormValues } from "./types";
import { emptyPreparedValues } from "./types";

type WizardAction =
  | { type: "start" }
  | { type: "edit"; customerId: string; values: PreparedFormValues }
  | { type: "change"; values: PreparedFormValues }
  | { type: "showErrors"; errors: WizardState["errors"] }
  | { type: "next" }
  | { type: "back" }
  | { type: "jump"; step: PreparedStep }
  | { type: "preview" }
  | { type: "editFromPreview"; step: PreparedStep }
  | { type: "handoff"; token: string; title: string }
  | { type: "reset" };

const nextStep: Record<PreparedStep, PreparedStep> = { 1: 2, 2: 3, 3: 3 };
export const previousStep: Record<PreparedStep, PreparedStep> = { 1: 1, 2: 1, 3: 2 };

export const initialWizardState = (): WizardState => ({
  screen: "list",
  step: 1,
  reached: [1],
  mode: "create",
  values: emptyPreparedValues(),
  errors: {},
});

function wizardFields(state: WizardState) {
  return {
    step: state.step,
    reached: state.reached,
    mode: state.mode,
    customerId: state.customerId,
    values: state.values,
    errors: state.errors,
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "start":
      return { ...wizardFields(initialWizardState()), screen: "wizard" };
    case "edit":
      return {
        ...wizardFields(initialWizardState()),
        screen: "wizard",
        mode: "edit",
        customerId: action.customerId,
        values: action.values,
      };
    case "change":
      return { ...state, values: action.values, errors: {} };
    case "showErrors":
      return { ...state, errors: action.errors };
    case "next": {
      const step = nextStep[state.step];
      return { ...state, step, reached: [...new Set([...state.reached, step])], errors: {} };
    }
    case "back":
      return {
        ...wizardFields(state),
        screen: "wizard",
        step: previousStep[state.step],
        errors: {},
      };
    case "jump":
      return { ...wizardFields(state), screen: "wizard", step: action.step, errors: {} };
    case "preview":
      return { ...wizardFields(state), screen: "preview", step: 3, errors: {} };
    case "editFromPreview":
      return { ...wizardFields(state), screen: "wizard", step: action.step, errors: {} };
    case "handoff":
      return { ...state, screen: "handoff", token: action.token, handoffTitle: action.title };
    case "reset":
      return initialWizardState();
  }
}
