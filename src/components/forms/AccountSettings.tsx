"use client";

import { isHostedDemoMode, isLocalDemoMode } from "@/lib/demo/mode";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { LifebuoyIcon, TrashIcon } from "@phosphor-icons/react";

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
  const [publicationMessage, setPublicationMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

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
    if (customer.role !== "customer") return;
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

  function unpublish() {
    try {
      updateDemoState((current) => ({
        ...updateDemoProfile(current, profile.id, (currentProfile) => ({
          ...currentProfile,
          status: "unpublished",
        })),
        audits: [
          {
            id: `audit-${Date.now()}`,
            actor: session?.email ?? profile.draft.name,
            action: "profile.unpublished",
            target: profile.draft.slug,
            occurredAt: new Date().toISOString(),
            before: "published",
            after: "unpublished",
          },
          ...current.audits,
        ],
      }));
      setPublicationMessage({
        tone: "success",
        text: "Profile unpublished. Visitors now see the unavailable page.",
      });
    } catch (error) {
      setPublicationMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Profile could not be unpublished.",
      });
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 lg:gap-7 lg:px-10 lg:pt-8">
      <Panel title="Account">
        <dl className="mt-6 grid gap-4">
          <div className="rounded-tapit bg-tapit-paper p-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
              Email
            </dt>
            <dd className="mt-2 font-semibold text-tapit-ink">{customer.email}</dd>
          </div>
        </dl>
      </Panel>

      {publicationMessage ? (
        <Notice tone={publicationMessage.tone}>{publicationMessage.text}</Notice>
      ) : null}
      {profile.status === "published" ? (
        <Panel
          description="Take your public profile offline when you need to pause public access."
          title="Publication"
        >
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={unpublish} type="button" variant="secondary">
              Unpublish
            </Button>
            <span className="text-sm text-tapit-muted">
              Visitors will see the unavailable profile page.
            </span>
          </div>
        </Panel>
      ) : null}

      <Panel title="Change password">
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

      <Panel className="border-tapit-danger/30 bg-tapit-danger/[0.025]" title="Delete account">
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
              customer.role !== "customer" ||
              customer.deletionStatus === "requested" ||
              customer.deletionStatus === "deleted"
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
  const hostedDemo = isHostedDemoMode();
  const account = useQuery(api.customers.myAccount);
  const profile = useQuery(api.profiles.mine);
  const supportUrl = useQuery(api.settings.support);
  const requestDeletion = useMutation(api.customers.requestDeletion);
  const unpublishMine = useMutation(api.profiles.unpublishMine);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [publicationMessage, setPublicationMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  if (account === undefined || profile === undefined || supportUrl === undefined)
    return <div className="p-8 text-sm text-tapit-muted">Loading account settings…</div>;
  if (account === null) return <Notice tone="error">Your account could not be loaded.</Notice>;
  async function unpublish() {
    setPublicationMessage(null);
    try {
      await unpublishMine({});
      setPublicationMessage({
        tone: "success",
        text: "Profile unpublished. Visitors now see the unavailable page.",
      });
    } catch (error) {
      setPublicationMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Profile could not be unpublished.",
      });
    }
  }
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
    <div className="mx-auto grid w-full max-w-5xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 lg:gap-7 lg:px-10 lg:pt-8">
      <Panel title="Account">
        <dl className="mt-6 grid gap-4">
          <div className="rounded-tapit bg-tapit-paper p-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
              Email
            </dt>
            <dd className="mt-2 font-semibold text-tapit-ink">{account.email}</dd>
          </div>
        </dl>
      </Panel>
      {publicationMessage ? (
        <Notice tone={publicationMessage.tone}>{publicationMessage.text}</Notice>
      ) : null}
      {profile?.status === "published" ? (
        <Panel
          description="Take your public profile offline when you need to pause public access."
          title="Publication"
        >
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={() => void unpublish()} type="button" variant="secondary">
              Unpublish
            </Button>
            <span className="text-sm text-tapit-muted">
              Visitors will see the unavailable profile page.
            </span>
          </div>
        </Panel>
      ) : null}
      {hostedDemo ? (
        <Panel
          description="Hosted demo accounts retain their isolated password setup for demonstration purposes."
          title="Hosted demo access"
        >
          <div className="mt-5">
            <Notice>Password reset email delivery is disabled in hosted demo mode.</Notice>
          </div>
        </Panel>
      ) : null}
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
        className="border-tapit-danger/30 bg-tapit-danger/[0.025]"
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
            disabled={account.role !== "customer" || account.deletionStatus !== "active"}
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
  return !isLocalDemoMode() ? <LiveAccountSettings /> : <DemoAccountSettings />;
}
