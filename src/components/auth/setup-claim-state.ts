export type SetupPreview = {
  name: string;
  slug: string;
  bio?: string;
  contactEmail?: string;
  phone?: string;
  website?: string;
  links: { label: string; url: string }[];
};

export type ClaimState =
  | { status: "loading" }
  | { status: "valid"; preview: SetupPreview }
  | { status: "invalid" }
  | { status: "signing-in"; preview: SetupPreview }
  | { status: "claiming"; preview: SetupPreview }
  | { status: "claimed"; preview: SetupPreview };

export type ClaimEvent =
  | { type: "PREVIEW_VALID"; preview: SetupPreview }
  | { type: "PREVIEW_INVALID" }
  | { type: "SIGN_IN" }
  | { type: "SIGN_IN_RETURNED" }
  | { type: "CLAIM_SUCCEEDED" }
  | { type: "CLAIM_FAILED" };

export const initialClaimState: ClaimState = { status: "loading" };

export function transitionClaimState(state: ClaimState, event: ClaimEvent): ClaimState {
  switch (event.type) {
    case "PREVIEW_VALID":
      return state.status === "loading" ? { status: "valid", preview: event.preview } : state;
    case "PREVIEW_INVALID":
      return state.status === "loading" ? { status: "invalid" } : state;
    case "SIGN_IN":
      return state.status === "valid" ? { status: "signing-in", preview: state.preview } : state;
    case "SIGN_IN_RETURNED":
      return state.status === "valid" || state.status === "signing-in"
        ? { status: "claiming", preview: state.preview }
        : state;
    case "CLAIM_SUCCEEDED":
      return state.status === "claiming" ? { status: "claimed", preview: state.preview } : state;
    case "CLAIM_FAILED":
      return state.status === "claiming" ? { status: "invalid" } : state;
  }
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}
