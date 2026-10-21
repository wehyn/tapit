"use client";

import { isHostedDemoMode, isLocalDemoMode } from "@/lib/demo/mode";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";

import {
  getDemoProfileForSession,
  updateDemoProfile,
  useDemoSession,
  updateDemoState,
  useDemoState,
} from "@/lib/demo/store";
import { hashDemoPassword, verifyDemoPassword } from "@/lib/demo/password";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Chip, StatusChip } from "@/components/ui/Chip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Card } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { Tile } from "@/components/ui/Tile";
import { api } from "../../../convex/_generated/api";

const pageClass = "flex min-w-0 flex-col gap-8 pt-4";
const gridClass = "grid gap-4 md:grid-cols-2";

function AccountHeader({ email }: { email: string }) {
  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <h1 className="text-xl font-semibold tracking-tight text-tapit-ink">Account</h1>
      <p className="break-words text-base text-tapit-muted">
        Sign-in, publishing and support for {email}.
      </p>
    </div>
  );
}

function TileIcon({ name }: { name: IconName }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-control bg-tapit-surface text-tapit-ink">
      <Icon className="size-5" name={name} />
    </span>
  );
}

function SignInCard({
  email,
  joinedAt,
  status,
}: {
  email: string;
  joinedAt?: number;
  status: string;
}) {
  // Demo fixtures carry no sign-up date, so the demo shows the account kind instead.
  const joined =
    joinedAt === undefined
      ? null
      : new Date(joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return (
    <Card title="Sign-in">
      <div className="flex flex-col gap-2">
        <Tile>
          <TileIcon name="user" />
          <dl className="min-w-0 flex-1">
            <dt className="text-xs text-tapit-muted">Email</dt>
            <dd className="break-words text-sm font-semibold text-tapit-ink">{email}</dd>
          </dl>
        </Tile>
        <Tile>
          <TileIcon name="profiles" />
          <dl className="min-w-0 flex-1">
            <dt className="text-xs text-tapit-muted">{joined ? "Member since" : "Account"}</dt>
            <dd className="text-sm font-semibold text-tapit-ink">{joined ?? "Demo account"}</dd>
          </dl>
          <StatusChip status={status} />
        </Tile>
      </div>
    </Card>
  );
}

function PublicationCard({ onUnpublish, slug }: { onUnpublish: () => void; slug: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-tapit-ink">Publication</h2>
        <Chip tone="ok">
          <span aria-hidden="true" className="size-2 rounded-full bg-current" />
          Live
        </Chip>
      </div>
      <Tile>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-tapit-ink">Public profile</p>
          <p className="break-words text-xs text-tapit-muted">
            Turn off to pause /{slug}. Visitors see the unavailable profile page.
          </p>
        </div>
        <Switch aria-label="Public profile" checked onCheckedChange={onUnpublish} />
      </Tile>
    </Card>
  );
}

function SupportCard({ href }: { href: string }) {
  return (
    <Card description="Get help with access, publishing or card issues." title="Support">
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href={href} variant="tonal">
          Contact support
        </ButtonLink>
        <ButtonLink href="/privacy" variant="quiet">
          Privacy &amp; terms
        </ButtonLink>
      </div>
    </Card>
  );
}

function DeleteAccountCard({
  children,
  disabled,
  onRequest,
}: {
  children: ReactNode;
  disabled: boolean;
  onRequest: () => void;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-card bg-tapit-danger-soft p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-tapit-danger">Delete account</h2>
        <p className="text-sm text-tapit-ink">
          We take your profile offline right away and remove your data after an administrator
          approves the request.
        </p>
      </div>
      {children}
      <Button
        className="self-start"
        disabled={disabled}
        onClick={onRequest}
        type="button"
        variant="danger"
      >
        Request deletion
      </Button>
    </section>
  );
}

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
    <div className={pageClass}>
      <AccountHeader email={customer.email} />
      {publicationMessage ? (
        <Notice tone={publicationMessage.tone}>{publicationMessage.text}</Notice>
      ) : null}
      <div className={gridClass}>
        <SignInCard email={customer.email} status={customer.status} />
        {profile.status === "published" ? (
          <PublicationCard onUnpublish={unpublish} slug={profile.draft.slug} />
        ) : null}

        <Card title="Change password">
          <form className="flex flex-col gap-4" onSubmit={savePassword}>
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
            <div className="grid gap-4 xl:grid-cols-2">
              <Field
                autoComplete="new-password"
                help="At least 8 characters."
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
            </div>
            <Button className="self-end" disabled={savingPassword} type="submit">
              {savingPassword ? "Updating password" : "Update password"}
            </Button>
          </form>
        </Card>

        <div className="flex flex-col gap-4">
          {state.supportUrl ? <SupportCard href={state.supportUrl} /> : null}
          <DeleteAccountCard
            disabled={
              customer.role !== "customer" ||
              customer.deletionStatus === "requested" ||
              customer.deletionStatus === "deleted"
            }
            onRequest={() => setDeletionOpen(true)}
          >
            {deletionMessage ? <Notice tone="success">{deletionMessage}</Notice> : null}
          </DeleteAccountCard>
        </div>
      </div>

      <ConfirmDialog
        confirmLabel="Request deletion"
        description="Your public profile will become unavailable and active or registered cards will be deactivated immediately. An administrator will review the request before permanent removal. Continue?"
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
    <div className={pageClass}>
      <AccountHeader email={account.email} />
      {publicationMessage ? (
        <Notice tone={publicationMessage.tone}>{publicationMessage.text}</Notice>
      ) : null}
      <div className={gridClass}>
        <SignInCard email={account.email} joinedAt={account.createdAt} status={account.status} />
        {profile?.status === "published" ? (
          <PublicationCard onUnpublish={() => void unpublish()} slug={profile.draft.slug} />
        ) : null}
        {hostedDemo ? (
          <Card
            description="Hosted demo accounts retain their isolated password setup for demonstration purposes."
            title="Hosted demo access"
          >
            <Notice>Password reset email delivery is disabled in hosted demo mode.</Notice>
          </Card>
        ) : null}
        <div className="flex flex-col gap-4">
          {supportUrl ? <SupportCard href={supportUrl} /> : null}
          <DeleteAccountCard
            disabled={account.role !== "customer" || account.deletionStatus !== "active"}
            onRequest={() => setDeletionOpen(true)}
          >
            {message ? (
              <Notice tone={message.startsWith("Deletion requested") ? "success" : "error"}>
                {message}
              </Notice>
            ) : null}
          </DeleteAccountCard>
        </div>
      </div>
      <ConfirmDialog
        confirmLabel="Request deletion"
        description="Your public profile will become unavailable and every assigned card will be deactivated immediately. An administrator will review the request before permanent removal. Continue?"
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
