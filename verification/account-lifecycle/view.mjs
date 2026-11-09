// Statechart view for AccountLifecycle.tla: one customer account.
export const title = "Customer account: sign-up, setup link, deletion";

export const state = (v) => {
  switch (v.cstatus) {
    case "pending":
      return "Signed up, onboarding not finished";
    case "invited":
      return v.setup === "waiting"
        ? "Prepared, setup link waiting"
        : "Prepared, no live setup link";
    case "active":
      return v.delstat === "requested" ? "Active, deletion requested" : "Active";
    case "deleted":
      return "Deleted";
    default:
      return "Prepared account removed";
  }
};

export const group = (v) =>
  ({ pending: "yellow", invited: "blue", active: "teal", deleted: "tan", gone: "tan" })[v.cstatus];

export const colors = { yellow: "yellow", blue: "blue", teal: "teal", tan: "tan" };

export const step = (action) =>
  ({
    CompleteOnboarding: "customer finishes onboarding",
    ClaimSetupLink: "customer opens the setup link",
    ExpireLink: "the setup link expires",
    RevokeLink: "admin revokes the setup link",
    GenerateLink: "admin sends a new setup link",
    DeletePreparedDraft: "admin deletes the prepared account",
    DeletePending: "customer abandons sign-up",
    RequestDeletion: "customer requests deletion",
    ApproveDeletion: "admin approves deletion",
    RestartAccount: "customer who never got a profile signs in again",
    Done: null,
  })[action] ?? action;
