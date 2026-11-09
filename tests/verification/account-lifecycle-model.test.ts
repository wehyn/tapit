import { describe, expect, it } from "vitest";

import {
  transitionCustomerStatus,
  transitionDeletionRequestStatus,
  transitionDeletionStatus,
  transitionPreparedSetup,
  type CustomerStatus,
  type DeletionStatus,
  type PreparedSetupState,
} from "@/lib/domain/state-machines";

// Checks that the real account machines allow what
// verification/account-lifecycle/AccountLifecycle.tla relies on, and refuse
// what its guards rely on being refused. A mismatch means the model and the
// code disagree: fix one, then re-run TLC.
const CUSTOMER: CustomerStatus[] = ["pending", "invited", "active", "deleted"];
const DELETION: DeletionStatus[] = ["active", "requested", "deleted"];
const SETUP: PreparedSetupState[] = [null, "waiting", "draft", "active"];
const attempt = <T>(run: () => T): { value: T } | null => {
  try {
    return { value: run() };
  } catch {
    return null;
  }
};

describe("account lifecycle model conformance", () => {
  it("CompleteOnboarding, DeletePending, RequestDeletion, ApproveDeletion, RestartAccount", () => {
    const table = (event: Parameters<typeof transitionCustomerStatus>[1]) =>
      CUSTOMER.filter((from) => attempt(() => transitionCustomerStatus(from, event)) !== null);
    expect(table("complete_onboarding")).toEqual(["pending"]);
    expect(table("delete_pending")).toEqual(["pending"]);
    expect(table("approve_deletion")).toEqual(["active"]);
    expect(table("restart_deleted_customer")).toEqual(["deleted"]);
    expect(table("delete_prepared")).toEqual(["invited"]);
  });

  it("ClaimSetupLink accepts an invited account (the mutation also requires an unclaimed one)", () => {
    expect(transitionCustomerStatus("invited", "accept_invitation")).toBe("active");
  });

  it("RequestDeletion and ApproveDeletion move deletionStatus as the model does", () => {
    const from = (event: "request" | "approve") =>
      DELETION.filter((s) => attempt(() => transitionDeletionStatus(s, event)) !== null);
    expect(from("request")).toEqual(["active"]);
    expect(from("approve")).toEqual(["active", "requested"]);
    expect(transitionDeletionRequestStatus("requested", "approve")).toBe("approved");
    expect(attempt(() => transitionDeletionRequestStatus("approved", "approve"))).toBeNull();
  });

  it("ExpireLink, RevokeLink, GenerateLink, ClaimSetupLink, DeletePreparedDraft", () => {
    const from = (event: Parameters<typeof transitionPreparedSetup>[1]) =>
      SETUP.filter((s) => attempt(() => transitionPreparedSetup(s, event)) !== null);
    expect(from("expire_link")).toEqual(["waiting"]);
    expect(from("revoke_link")).toEqual(["waiting"]);
    expect(from("issue_link")).toEqual(["waiting", "draft"]);
    expect(from("claim")).toEqual(["waiting"]);
    expect(from("delete_draft")).toEqual(["waiting", "draft"]);
    expect(transitionPreparedSetup("waiting", "expire_link")).toBe("draft");
    expect(transitionPreparedSetup("waiting", "revoke_link")).toBe("draft");
    expect(transitionPreparedSetup("draft", "issue_link")).toBe("waiting");
    expect(transitionPreparedSetup("waiting", "claim")).toBe("active");
  });
});
