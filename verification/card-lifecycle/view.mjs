// Statechart view for CardLifecycle.tla: one card as its owner and the admin see it.
export const title = "Card: from the box to the owner's profile";

export const state = (v) => {
  if (v.correction) return "Assignment correction pending";
  switch (v.status) {
    case "registered":
      return "In stock, no profile";
    case "claimable":
      return v.claimed ? "Claimed, profile not published yet" : "Assigned, waiting to be claimed";
    case "active":
      return v.claimed ? "Live and claimed" : "Assigned, waiting to be claimed";
    case "inactive":
    case "replaced":
      return "Switched off or replaced";
    default:
      return "Marked lost";
  }
};

export const group = (v) =>
  v.correction
    ? "purple"
    : {
        registered: "tan",
        claimable: "yellow",
        active: "teal",
        inactive: "orange",
        replaced: "orange",
        lost: "pink",
      }[v.status];

export const colors = {
  purple: "purple",
  tan: "tan",
  yellow: "yellow",
  teal: "teal",
  orange: "orange",
  pink: "pink",
};

export const step = (action) =>
  ({
    AdminAttach: "admin attaches the card to a profile",
    GenerateCode: "admin issues a claim code",
    InvalidateCode: "admin invalidates the claim code",
    VerifyCode: null,
    CompleteClaim: "owner enters the code and claims the card",
    RequestCorrection: "owner reports a wrong assignment",
    ResolveCorrection: "admin fixes the assignment",
    AdminReassign: "admin moves the card to another profile",
    OwnerDisable: "owner switches the card off",
    AdminDeactivate: "admin deactivates the card",
    MarkLost: "the card is marked lost",
    OwnerReactivate: "owner switches the card back on",
    AdminReactivate: "admin reactivates the card",
    Replace: null,
    RetireForDeletion: "the owner deletes their account",
    PublishProfile: "owner publishes the profile",
    UnpublishProfile: null,
    PeerChanges: null,
    RequesterPeerChanges: null,
  })[action] ?? action;
