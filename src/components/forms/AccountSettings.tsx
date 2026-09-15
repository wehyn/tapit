"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AtIcon, KeyIcon, LifebuoyIcon, TrashIcon } from "@phosphor-icons/react";

import {
  getDemoProfileForSession,
  updateDemoProfile,
  useDemoSession,
  updateDemoState,
  useDemoState,
} from "@/lib/demo/store";
import { hashDemoPassword, verifyDemoPassword } from "@/lib/demo/password";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api } from "../../../convex/_generated/api";

function DemoAccountSettings() {
  const state = useDemoState();
  const session = useDemoSession();
  const account =
    session === null
      ? undefined
      : state.customers.find((candidate) => candidate.email === session.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionMessage, setDeletionMessage] = useState("");

  if (session === null || account === undefined) return null;
  const customer = account;
  const profile = getDemoProfileForSession(state, session);

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);
    if (newPassword.length < 8) {
      setPasswordMessage({ tone: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmation) {
      setPasswordMessage({ tone: "error", text: "New passwords do not match." });
      return;
    }
    setSavingPassword(true);
    try {
      if (!(await verifyDemoPassword(currentPassword, customer.passwordHash))) {
        setPasswordMessage({ tone: "error", text: "The current password is not correct." });
        setSavingPassword(false);
        return;
      }
      const passwordHash = await hashDemoPassword(newPassword);
      updateDemoState((current) => ({
        ...current,
        customers: current.customers.map((candidate) =>
          candidate.id === customer.id ? { ...candidate, passwordHash } : candidate,
        ),
      }));
    } catch {
      setPasswordMessage({
        tone: "error",
        text: "The password service is unavailable. Try again.",
      });
      setSavingPassword(false);
      return;
    }
    setSavingPassword(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmation("");
    setPasswordMessage({ tone: "success", text: "Password change saved for this demo account." });
  }

  function requestDeletion() {
    const occurredAt = new Date().toISOString();
    updateDemoState((current) => ({
      ...updateDemoProfile(current, profile.id, (currentProfile) => ({
        ...currentProfile,
        status: "unpublished",
      })),
      customers: current.customers.map((candidate) =>
        candidate.id === customer.id ? { ...candidate, deletionStatus: "requested" } : candidate,
      ),
      cards: current.cards.map((card) =>
        card.profileId === profile.id && (card.status === "active" || card.status === "registered")
          ? { ...card, status: "inactive" }
          : card,
      ),
      audits: [
        {
          id: `audit-${Date.now()}`,
          actor: customer.email,
          action: "account.deletion_requested",
          target: customer.email,
          occurredAt,
          before: "active",
          after: "requested; profile unpublished; cards inactive",
        },
        ...current.audits,
      ],
    }));
    setDeletionOpen(false);
    setDeletionMessage(
      "Deletion requested. Your profile is now unavailable while an administrator reviews the request.",
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 pb-12 pt-5 sm:px-8 lg:gap-8 lg:px-10 lg:pt-8">
      <Panel
        description="Your email identifies the one profile attached to this account."
        title="Account"
      >
        <div className="mt-5 flex items-center gap-3 text-sm text-tapit-muted">
          <AtIcon aria-hidden="true" className="text-tapit-accent" size={20} weight="bold" />
          Account identity and access status
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-tapit bg-tapit-paper p-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
              Email
            </dt>
            <dd className="mt-2 font-semibold text-tapit-ink">{customer.email}</dd>
          </div>
          <div className="rounded-tapit bg-tapit-paper p-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
              Deletion status
            </dt>
            <dd className="mt-2">
              <StatusBadge status={customer.deletionStatus} />
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel
        description="Password recovery and email verification are not part of the local MVP. Contact support if you lose access."
        title="Change password"
      >
        <div className="mt-5 flex items-center gap-3 text-sm text-tapit-muted">
          <KeyIcon aria-hidden="true" className="text-tapit-accent" size={20} weight="bold" />
          Keep your workspace access secure.
        </div>
        <form className="mt-6 grid max-w-xl gap-5" onSubmit={savePassword}>
          {passwordMessage ? (
            <Notice tone={passwordMessage.tone}>{passwordMessage.text}</Notice>
          ) : null}
          <Field
            autoComplete="current-password"
            id="current-password"
            label="Current password"
            onChange={(event) => setCurrentPassword(event.target.value)}
            type="password"
            value={currentPassword}
          />
          <Field
            autoComplete="new-password"
            help="Use at least 8 characters."
            id="new-password"
            label="New password"
            minLength={8}
            onChange={(event) => setNewPassword(event.target.value)}
            type="password"
            value={newPassword}
          />
          <Field
            autoComplete="new-password"
            id="confirm-new-password"
            label="Confirm new password"
            minLength={8}
            onChange={(event) => setConfirmation(event.target.value)}
            type="password"
            value={confirmation}
          />
          <div>
            <Button disabled={savingPassword} type="submit">
              {savingPassword ? "Saving password" : "Save password"}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel
        description="Need help with a profile or card? The support route is intentionally generic in this local build."
        title="Support"
      >
        <div className="mt-5 flex items-center gap-3 text-sm text-tapit-muted">
          <LifebuoyIcon aria-hidden="true" className="text-tapit-accent" size={20} weight="bold" />
          Help is available for access, publication, or card issues.
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a className="font-semibold text-tapit-accent hover:underline" href={state.supportUrl}>
            Contact support
          </a>
          <span className="text-sm text-tapit-muted">
            We will help with access, publication, or card issues.
          </span>
        </div>
      </Panel>

      <Panel
        className="border-tapit-danger/30"
        description="Deletion immediately hides your public profile and deactivates assigned cards. An administrator must review the request before account data is permanently removed."
        title="Delete account"
      >
        <div className="mt-5 flex items-center gap-3 text-sm text-tapit-danger">
          <TrashIcon aria-hidden="true" size={20} weight="bold" />
          This action is reviewed separately from everyday account settings.
        </div>
        {deletionMessage ? (
          <div className="mt-5">
            <Notice tone="success">{deletionMessage}</Notice>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            disabled={
              customer.deletionStatus === "requested" || customer.deletionStatus === "deleted"
            }
            onClick={() => setDeletionOpen(true)}
            type="button"
            variant="danger"
          >
            Request deletion
          </Button>
          <span className="text-sm text-tapit-muted">
            This cannot be undone from the customer workspace.
          </span>
        </div>
      </Panel>

      <ConfirmDialog
        confirmLabel="Request deletion"
        description="Your public profile will become unavailable and every assigned card will be deactivated immediately. An administrator will review the request before permanent removal. Continue?"
        onCancel={() => setDeletionOpen(false)}
        onConfirm={requestDeletion}
        open={deletionOpen}
        title="Request account deletion?"
      />
    </div>
  );
}

function LiveAccountSettings() {
  const account = useQuery(api.customers.myAccount);
  const supportUrl = useQuery(api.settings.support);
  const requestDeletion = useMutation(api.customers.requestDeletion);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [message, setMessage] = useState("");
  if (account === undefined || supportUrl === undefined)
    return <div className="p-8 text-sm text-tapit-muted">Loading account settings…</div>;
  if (account === null) return <Notice tone="error">Your account could not be loaded.</Notice>;
  async function confirmDeletion() {
    try {
      await requestDeletion({});
      setMessage(
        "Deletion requested. Your profile is now unavailable while an administrator reviews the request.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Deletion request failed.");
    } finally {
      setDeletionOpen(false);
    }
  }
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 pb-12 pt-5 sm:px-8 lg:gap-8 lg:px-10 lg:pt-8">
      <Panel
        description="Your email identifies the one profile attached to this account."
        title="Account"
      >
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-tapit bg-tapit-paper p-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
              Email
            </dt>
            <dd className="mt-2 font-semibold text-tapit-ink">{account.email}</dd>
          </div>
          <div className="rounded-tapit bg-tapit-paper p-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
              Deletion status
            </dt>
            <dd className="mt-2">
              <StatusBadge status={account.deletionStatus} />
            </dd>
          </div>
        </dl>
      </Panel>
      <Panel
        description="Password changes use the configured Convex Auth provider."
        title="Change password"
      >
        <p className="mt-5 text-sm leading-6 text-tapit-muted">
          Password recovery and password changes are managed by the live authentication flow.
        </p>
        <a
          className="mt-5 inline-flex min-h-12 items-center rounded-tapit bg-tapit-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-tapit-accent-strong"
          href={`/login?reset=1&email=${encodeURIComponent(account.email)}`}
        >
          Reset password
        </a>
      </Panel>
      <Panel title="Support">
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a className="font-semibold text-tapit-accent hover:underline" href={supportUrl}>
            Contact support
          </a>
          <span className="text-sm text-tapit-muted">
            We will help with access, publication, or card issues.
          </span>
        </div>
      </Panel>
      <Panel
        className="border-tapit-danger/30"
        description="Deletion hides your profile and deactivates assigned cards immediately."
        title="Delete account"
      >
        {message ? (
          <div className="mt-5">
            <Notice tone={message.startsWith("Deletion requested") ? "success" : "error"}>
              {message}
            </Notice>
          </div>
        ) : null}
        <div className="mt-5">
          <Button
            disabled={account.deletionStatus !== "active"}
            onClick={() => setDeletionOpen(true)}
            type="button"
            variant="danger"
          >
            Request deletion
          </Button>
        </div>
      </Panel>
      <ConfirmDialog
        confirmLabel="Request deletion"
        description="Your public profile will become unavailable and assigned cards will be deactivated immediately. Continue?"
        onCancel={() => setDeletionOpen(false)}
        onConfirm={confirmDeletion}
        open={deletionOpen}
        title="Request account deletion?"
      />
    </div>
  );
}

export function AccountSettings() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "false" ? (
    <LiveAccountSettings />
  ) : (
    <DemoAccountSettings />
  );
}
