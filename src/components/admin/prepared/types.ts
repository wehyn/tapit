import type { PreparedProfileInput } from "@/lib/demo/store";

export type PreparedStep = 1 | 2 | 3;
export type PreparedMode = "create" | "edit";
export type PreparedFormValues = PreparedProfileInput;
export type PreparedField =
  | "name"
  | "slug"
  | "bio"
  | "contactEmail"
  | "phone"
  | "website"
  | `links.${number}.label`
  | `links.${number}.url`;
export type PreparedErrors = Partial<Record<PreparedField, string>>;

type WizardFields = {
  step: PreparedStep;
  reached: PreparedStep[];
  mode: PreparedMode;
  customerId?: string;
  values: PreparedFormValues;
  errors: PreparedErrors;
};

export type WizardState = WizardFields &
  (
    | { screen: "list" | "wizard" | "preview"; token?: never; handoffTitle?: never }
    | { screen: "handoff"; token: string; handoffTitle: string }
  );

type CustomerRowBase = {
  id: string;
  email: string;
  profileName: string;
  profileSlug: string;
  linkExpiresAt: number | null;
  invitationId?: string;
  invitationStatus?: "pending" | "accepted" | "revoked";
};

export type WaitingCustomerRow = CustomerRowBase & {
  setupState: "waiting";
  kind: "prepared";
};

export type DraftCustomerRow = CustomerRowBase & {
  setupState: "draft";
  kind: "prepared";
};

export type ActiveCustomerRow = CustomerRowBase & {
  setupState: "active";
  kind: "active";
  role: "customer" | "admin";
  status: string;
  deletionStatus: string;
  profileStatus: string | null;
  cardCount: number;
  hasDeletionRequest: boolean;
  cardOwnerAccessOverride: boolean;
  ownsProfile: boolean;
  legacyInvitationActive: boolean;
  invitationStatus?: "pending" | "accepted" | "revoked";
  setupToken?: string;
};

export type LegacyCustomerRow = CustomerRowBase & {
  setupState: null;
  kind: "legacy";
  role: "customer" | "admin";
  status: string;
  deletionStatus: string;
  profileStatus: string | null;
  cardCount: number;
  invitationStatus?: "pending" | "accepted" | "revoked";
  setupToken?: string;
};

export type PreparedRow =
  WaitingCustomerRow | DraftCustomerRow | ActiveCustomerRow | LegacyCustomerRow;

export const emptyPreparedValues = (): PreparedFormValues => ({ name: "", slug: "", links: [] });
