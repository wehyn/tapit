"use client";

import { useReducer, useState } from "react";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { initialWizardState, wizardReducer } from "./state";
import { filterPreparedRows, type PreparedFilter } from "./selectors";
import { validatePrepared, validateStep } from "./validation";
import type { PreparedRow } from "./types";
import {
  useConvexPreparedAccounts,
  useDemoPreparedAccounts,
  type PreparedAccounts,
} from "./use-prepared-accounts";
import { PreparedAccountsList } from "./PreparedAccountsList";
import { LegacyCustomersManager } from "./legacy/LegacyCustomersManager";
import { PreparedConfirmDialogs, type PreparedConfirmation } from "./PreparedConfirmDialogs";
import { PreparedHandoffScreen } from "./PreparedHandoffScreen";
import { PreviewScreen } from "./PreparedPreviewScreen";
import { WizardScreen } from "./PreparedWizardScreen";

function PreparedCustomers() {
  return isLocalDemoMode() ? <DemoPreparedWorkspace /> : <ConvexPreparedWorkspace />;
}

function DemoPreparedWorkspace() {
  return <PreparedWorkspace data={useDemoPreparedAccounts()} />;
}

function ConvexPreparedWorkspace() {
  return <PreparedWorkspace data={useConvexPreparedAccounts()} />;
}

export function PreparedWorkspace({ data }: { data: PreparedAccounts }) {
  const [wizard, dispatch] = useReducer(wizardReducer, undefined, initialWizardState);
  const [filter, setFilter] = useState<PreparedFilter>("all");
  const [search, setSearch] = useState("");
  const [confirmation, setConfirmation] = useState<PreparedConfirmation>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [legacySetupLink, setLegacySetupLink] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = filterPreparedRows(data.rows, filter, search);

  function startEdit(row: PreparedRow) {
    if (row.kind !== "prepared") return;
    const values = data.valuesFor(row.id);
    if (!values) {
      setNotice({ tone: "error", text: "This prepared account could not be loaded." });
      return;
    }
    dispatch({ type: "edit", customerId: row.id, values });
  }

  async function saveProfile() {
    const errors = validatePrepared(wizard.values);
    if (Object.keys(errors).length) {
      dispatch({ type: "showErrors", errors });
      setNotice({ tone: "error", text: "Review the highlighted fields before continuing." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      if (wizard.mode === "edit" && wizard.customerId) {
        await data.update(wizard.customerId, wizard.values);
        dispatch({ type: "reset" });
        setNotice({ tone: "success", text: "Changes saved." });
      } else {
        const result = await data.create(wizard.values);
        dispatch({ type: "handoff", token: result.token, title: "Account prepared" });
      }
    } catch (error) {
      if (error instanceof Error && /slug.*already in use/i.test(error.message)) {
        dispatch({ type: "editFromPreview", step: 1 });
        dispatch({ type: "showErrors", errors: { slug: "That URL is taken." } });
        setNotice({ tone: "error", text: "That URL is taken." });
      } else {
        setNotice({
          tone: "error",
          text: error instanceof Error ? error.message : "The prepared account could not be saved.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function generateLink(row: PreparedRow) {
    if (row.setupState !== "waiting" && row.setupState !== "draft") return;
    setBusy(true);
    try {
      const result = await data.generate(row.id, row.setupState);
      dispatch({ type: "handoff", token: result.token, title: result.title });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "A setup link could not be generated.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function confirmAction() {
    if (!confirmation) return;
    try {
      if (confirmation.kind === "revoke") {
        await data.revoke(confirmation.row);
        setNotice({
          tone: "success",
          text: "Link revoked. The account is kept as an unclaimed draft.",
        });
      } else if (confirmation.kind === "ownerAccess") {
        await data.setOwnerAccess(confirmation.row, confirmation.enabled);
        setNotice({
          tone: "success",
          text: `Owner access ${confirmation.enabled ? "granted" : "revoked"}.`,
        });
      } else {
        await data.remove(confirmation.row.id);
        setNotice({ tone: "success", text: "Draft deleted." });
      }
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "The action could not be completed.",
      });
    }
    setConfirmation(null);
  }

  if (wizard.screen === "handoff") {
    return (
      <PreparedHandoffScreen
        token={wizard.token}
        title={wizard.handoffTitle}
        name={wizard.values.name}
        demo={isLocalDemoMode()}
        onBack={() => dispatch({ type: "reset" })}
      />
    );
  }
  if (wizard.screen === "preview") {
    return (
      <PreviewScreen
        values={wizard.values}
        editMode={wizard.mode === "edit"}
        onEdit={(step) => dispatch({ type: "editFromPreview", step })}
        onBack={() => dispatch({ type: "editFromPreview", step: 3 })}
        onSave={() => void saveProfile()}
        busy={busy}
      />
    );
  }
  if (wizard.screen === "wizard") {
    return (
      <WizardScreen
        values={wizard.values}
        errors={wizard.errors}
        step={wizard.step}
        reached={wizard.reached}
        mode={wizard.mode}
        host="tapit.com"
        busy={busy}
        onChange={(values) => dispatch({ type: "change", values })}
        onJump={(step) => dispatch({ type: "jump", step })}
        onCancel={() => dispatch({ type: "reset" })}
        onAdvance={() => {
          const errors = validateStep(wizard.values, wizard.step);
          if (Object.keys(errors).length) {
            dispatch({ type: "showErrors", errors });
            return;
          }
          if (wizard.step === 3) dispatch({ type: "preview" });
          else dispatch({ type: "next" });
        }}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PreparedAccountsList
        rows={rows}
        filter={filter}
        search={search}
        loading={data.loading}
        notice={notice}
        onFilter={setFilter}
        onSearch={setSearch}
        onStart={() => {
          setNotice(null);
          dispatch({ type: "start" });
        }}
        onEdit={startEdit}
        onGenerate={(row) => void generateLink(row)}
        onRevoke={(row) => setConfirmation({ kind: "revoke", row })}
        onDelete={(row) => setConfirmation({ kind: "delete", row })}
        onLegacyRevoke={(row) => {
          const invitationId =
            ("setupToken" in row ? row.setupToken : undefined) || row.invitationId;
          if (!invitationId) {
            setNotice({ tone: "error", text: "The invitation could not be revoked." });
            return;
          }
          void data
            .revokeLegacy(invitationId)
            .then(() => setNotice({ tone: "success", text: "Invitation revoked." }))
            .catch((error: unknown) =>
              setNotice({
                tone: "error",
                text:
                  error instanceof Error ? error.message : "The invitation could not be revoked.",
              }),
            );
        }}
        onLegacyReplace={(row) => {
          void data
            .replaceLegacy(row.id)
            .then((token) => {
              setLegacySetupLink(`${window.location.origin}/setup/${token}`);
              setNotice({ tone: "success", text: "The replacement setup link is ready." });
            })
            .catch((error: unknown) =>
              setNotice({
                tone: "error",
                text:
                  error instanceof Error ? error.message : "The invitation could not be replaced.",
              }),
            );
        }}
        onChangeRole={(row, role) => {
          if (
            window.confirm(
              `${role === "admin" ? "Promote this Demo account to administrator" : "Demote this administrator to customer"}?`,
            )
          )
            void data
              .changeRole(row.id, role)
              .then(() =>
                setNotice({
                  tone: "success",
                  text: `Role updated to ${role === "admin" ? "administrator" : "customer"}.`,
                }),
              )
              .catch((error: unknown) =>
                setNotice({
                  tone: "error",
                  text: error instanceof Error ? error.message : "The role could not be changed.",
                }),
              );
        }}
        onPromoteToDemo={(row) => {
          if (window.confirm("Promote this customer to a Demo account?"))
            void data
              .promoteToDemo(row.id)
              .then(() => setNotice({ tone: "success", text: "Customer promoted to Demo." }))
              .catch((error: unknown) =>
                setNotice({
                  tone: "error",
                  text:
                    error instanceof Error
                      ? error.message
                      : "The customer could not be promoted to Demo.",
                }),
              );
        }}
        onOwnerAccess={(row, enabled) => setConfirmation({ kind: "ownerAccess", row, enabled })}
        onApproveDeletion={(row) => {
          if (window.confirm(`Approve account deletion for ${row.email}?`))
            void data
              .approveDeletion(row.id)
              .then(() => setNotice({ tone: "success", text: "Deletion approved." }))
              .catch((error: unknown) =>
                setNotice({
                  tone: "error",
                  text: error instanceof Error ? error.message : "Deletion could not be approved.",
                }),
              );
        }}
        legacySetupLink={legacySetupLink}
      />
      <LegacyCustomersManager />
      <PreparedConfirmDialogs
        confirmation={confirmation}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => void confirmAction()}
      />
    </div>
  );
}

export { PreparedCustomers };
