"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery_experimental } from "convex/react";

import type { DemoCustomer, DemoProfile } from "@/lib/demo/fixtures";
import {
  assertDemoCardOrderDeletionAccess,
  deleteDemoCardOrderAssetsForApprovedDeletion,
} from "@/lib/demo/card-order-assets";
import { validateProfileSlug } from "@/lib/domain";
import {
  getDemoProfiles,
  promoteDemoCustomerToAdmin,
  promoteDemoCustomerToDemo,
  updateDemoProfile,
  updateDemoState,
  useDemoState,
} from "@/lib/demo/store";

import { Button, ButtonLink } from "@/components/ui/Button";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Chip";
import { Tile } from "@/components/ui/Tile";
import { hashSetupToken } from "@/lib/auth/setup-token";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function OwnerAccessConfirmDialog({
  email,
  enabled,
  onCancel,
  onConfirm,
  open,
}: {
  email: string;
  enabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
}) {
  return (
    <ConfirmDialog
      confirmLabel={enabled ? "Grant access" : "Revoke access"}
      description={
        enabled
          ? `Grant ${email} access to owner analytics and card-owner tools. This admin override is recorded in the audit log and does not record a card claim.`
          : `Remove the admin override for ${email}. Access from a successfully claimed card remains. This change is recorded in the audit log.`
      }
      onCancel={onCancel}
      onConfirm={onConfirm}
      open={open}
      title={enabled ? "Grant owner access?" : "Revoke owner access?"}
    />
  );
}

function DemoCustomersManager() {
  const state = useDemoState();
  const approvingDeletionCustomerIds = useRef(new Set<string>());
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileSlug, setProfileSlug] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [setupLink, setSetupLink] = useState("");
  const [copiedSetupLink, setCopiedSetupLink] = useState(false);
  const [ownerAccessConfirmation, setOwnerAccessConfirmation] = useState<{
    customer: DemoCustomer;
    enabled: boolean;
  } | null>(null);
  const [approvalCustomer, setApprovalCustomer] = useState<DemoCustomer | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  const customers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return state.customers.filter((customer) => !normalized || customer.email.includes(normalized));
  }, [query, state.customers]);
  const selectedCustomer =
    customers.find((customer) => customer.id === selectedCustomerId) ?? customers[0];

  function createCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSetupLink("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setMessage({ tone: "error", text: "Enter a valid customer email address." });
      return;
    }
    if (state.customers.some((customer) => customer.email === normalizedEmail)) {
      setMessage({ tone: "error", text: "That customer email is already registered." });
      return;
    }
    const token = `demo-${Date.now().toString(36)}`;
    const customerId = `customer-${Date.now()}`;
    const profileId = `profile-${Date.now()}`;
    const baseSlug =
      (profileSlug.trim() || normalizedEmail)
        .split("@")[0]
        ?.replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "new-profile";
    const slug = `${baseSlug}-${Date.now().toString(36)}`;
    const existingSlugs = getDemoProfiles(state).flatMap((profile) => [
      profile.draft.slug,
      ...(profile.published === null ? [] : [profile.published.slug]),
    ]);
    const slugError = validateProfileSlug(slug, { existingSlugs });
    if (slugError !== null) {
      setMessage({ tone: "error", text: slugError });
      return;
    }
    const occurredAt = new Date().toISOString();
    updateDemoState((current) => ({
      ...current,
      profiles: [
        ...getDemoProfiles(current),
        {
          id: profileId,
          ownerId: customerId,
          status: "draft",
          theme: "paper",
          draft: {
            name: profileName.trim(),
            slug,
            email: normalizedEmail,
            links: [],
          },
          published: null,
        } satisfies DemoProfile,
      ],
      customers: [
        ...current.customers,
        {
          id: customerId,
          email: normalizedEmail,
          role: "customer",
          profileId,
          status: "invited",
          deletionStatus: "active",
          setupToken: token,
        },
      ],
      audits: [
        {
          id: `audit-${Date.now()}`,
          actor: "admin@tapit.local",
          action: "customer.created",
          target: normalizedEmail,
          occurredAt,
          after: "invited",
        },
        ...current.audits,
      ],
    }));
    setEmail("");
    setSetupLink(`/setup/${token}`);
    setMessage({
      tone: "success",
      text: `Customer account created for ${normalizedEmail}. The one-time setup link is ready for your controlled handoff.`,
    });
  }

  async function approveDeletion(customerId: string) {
    if (approvingDeletionCustomerIds.current.has(customerId)) return;
    approvingDeletionCustomerIds.current.add(customerId);
    try {
      const adminId = assertDemoCardOrderDeletionAccess(customerId);
      const occurredAt = new Date().toISOString();
      await deleteDemoCardOrderAssetsForApprovedDeletion(customerId, adminId, (current) => {
        const customer = current.customers.find((candidate) => candidate.id === customerId);
        if (customer === undefined) return current;
        const profile = getDemoProfiles(current).find(
          (candidate) => candidate.id === customer.profileId,
        );
        const withProfile =
          profile === undefined
            ? current
            : updateDemoProfile(current, profile.id, (currentProfile) => ({
                ...currentProfile,
                status: "unpublished",
              }));
        return {
          ...withProfile,
          customers: withProfile.customers.map((candidate) =>
            candidate.id === customerId
              ? {
                  ...candidate,
                  status: "deleted",
                  deletionStatus: "deleted",
                  setupToken: undefined,
                }
              : candidate,
          ),
          cards: withProfile.cards.map((card) =>
            card.profileId === customer.profileId &&
            (card.status === "active" ||
              card.status === "claimable" ||
              card.status === "registered")
              ? { ...card, status: "inactive" }
              : card,
          ),
          audits: [
            {
              id: `audit-${Date.now()}`,
              actor: "admin@tapit.local",
              action: "account.deletion_approved",
              target: customer.email,
              occurredAt,
              before: "requested",
              after: "deleted; profile unpublished; cards inactive; orders and artwork removed",
            },
            ...withProfile.audits,
          ],
        };
      });
      setApprovalCustomer(null);
      setMessage({
        tone: "success",
        text: "Deletion approved. The account is closed and its profile and cards remain unavailable. Orders and original artwork were removed.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Deletion approval could not be completed. The request remains available to retry.",
      });
    } finally {
      approvingDeletionCustomerIds.current.delete(customerId);
    }
  }

  function setOwnerAccessOverride(customer: DemoCustomer, enabled: boolean) {
    const profile = getDemoProfiles(state).find((candidate) => candidate.id === customer.profileId);
    if (
      customer.status !== "active" ||
      customer.role !== "customer" ||
      customer.deletionStatus !== "active"
    )
      return;
    if (enabled && (profile === undefined || profile.ownerId !== customer.id)) {
      setMessage({
        tone: "error",
        text: "An owned customer profile is required to grant owner access.",
      });
      return;
    }
    const before = customer.cardOwnerAccessOverride === true;
    if (before === enabled) return;
    try {
      updateDemoState((current) => {
        const target = current.customers.find((candidate) => candidate.id === customer.id);
        if (
          target === undefined ||
          target.status !== "active" ||
          target.role !== "customer" ||
          target.deletionStatus !== "active" ||
          (target.cardOwnerAccessOverride === true) === enabled
        )
          return current;
        if (enabled) {
          const ownedProfile = getDemoProfiles(current).find(
            (candidate) => candidate.id === target.profileId,
          );
          if (ownedProfile === undefined || ownedProfile.ownerId !== target.id) return current;
        }
        const occurredAt = new Date().toISOString();
        return {
          ...current,
          customers: current.customers.map((candidate) =>
            candidate.id === target.id
              ? { ...candidate, cardOwnerAccessOverride: enabled ? true : undefined }
              : candidate,
          ),
          audits: [
            {
              id: `audit-${Date.now()}`,
              actor: "admin@tapit.local",
              action: "customer.card_owner_access_override_changed",
              target: target.email,
              occurredAt,
              before: String(target.cardOwnerAccessOverride === true),
              after: String(enabled),
            },
            ...current.audits,
          ],
        };
      });
      setMessage({
        tone: "success",
        text: `Owner access ${enabled ? "granted" : "revoked"} for ${customer.email}.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Owner access could not be updated. Check browser storage and try again.",
      });
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-8 pt-2">
      <AdminPageHeader
        description="Invite people, manage access and handle deletion requests."
        title="Customers"
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_384px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card
            description="Create invited customer accounts and keep account, profile, card, and invitation state visible separately."
            title="Create customer"
          >
            <form className="flex flex-wrap items-end gap-4" onSubmit={createCustomer}>
              <div className="min-w-64 flex-1">
                <Field
                  autoComplete="off"
                  id="customer-email"
                  label="Customer email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="person@example.com"
                  type="email"
                  value={email}
                />
              </div>
              <div className="min-w-52 flex-1">
                <Field
                  id="customer-profile-name"
                  label="Initial profile name"
                  onChange={(event) => setProfileName(event.target.value)}
                  placeholder="Optional display name"
                  value={profileName}
                />
              </div>
              <div className="min-w-52 flex-1">
                <Field
                  id="customer-profile-slug"
                  label="Profile slug"
                  onChange={(event) => setProfileSlug(event.target.value)}
                  placeholder="Optional stable slug"
                  value={profileSlug}
                />
              </div>
              <Button type="submit">
                <Icon name="user" size={18} />
                Create and invite
              </Button>
            </form>
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
            {setupLink ? (
              <div className="flex flex-wrap items-center gap-3 rounded-control bg-tapit-soft-surface px-4 py-3 text-sm text-tapit-muted">
                <span>
                  Local setup link:{" "}
                  <a
                    className="font-semibold text-tapit-accent-strong hover:text-tapit-ink"
                    href={setupLink}
                  >
                    {setupLink}
                  </a>
                </span>
                <Button
                  onClick={() => {
                    void navigator.clipboard?.writeText(
                      new URL(setupLink, window.location.origin).href,
                    );
                    setCopiedSetupLink(true);
                  }}
                  type="button"
                  variant="secondary"
                >
                  <Icon name="link" size={17} />
                  {copiedSetupLink ? "Copied" : "Copy link"}
                </Button>
              </div>
            ) : null}
          </Card>

          <Card
            description="Search by email. New invitations remain separate from profile publication and card assignment."
            title="Customer accounts"
          >
            <Field
              id="customer-search"
              label="Search customers"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search email"
              type="search"
              value={query}
            />
            <div className="flex flex-col gap-2">
              {customers.length === 0 ? (
                <Notice>No customers match this search. Create an invited account above.</Notice>
              ) : null}
              {customers.map((customer) => {
                const profile = getDemoProfiles(state).find(
                  (candidate) => candidate.id === customer.profileId,
                );
                const isProfileOwner = profile !== undefined;
                const cardCount =
                  profile === undefined
                    ? 0
                    : state.cards.filter((card) => card.profileId === profile.id).length;
                const isSelected = selectedCustomer?.id === customer.id;
                return (
                  <article
                    className={`flex min-w-0 flex-col gap-3 rounded-control p-4 transition-colors ${isSelected ? "bg-tapit-accent-soft" : "bg-tapit-soft-surface hover:bg-tapit-accent-soft"}`}
                    key={customer.id}
                  >
                    <button
                      aria-pressed={isSelected}
                      className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-left"
                      onClick={() => setSelectedCustomerId(customer.id)}
                      type="button"
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="font-semibold text-tapit-ink">{customer.email}</span>
                        <span
                          className={`truncate text-sm ${isSelected ? "text-tapit-ink" : "text-tapit-muted"}`}
                        >
                          {isProfileOwner
                            ? `${profile.draft.name || "Unnamed profile"} · ${profile.draft.slug}`
                            : "Profile pending setup"}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <StatusChip status={customer.status} />
                        {customer.isDemo === true ? <StatusChip status="Demo" /> : null}
                        <Icon name="caretRight" size={16} />
                      </span>
                    </button>
                    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <dt
                          className={`text-xs font-semibold ${isSelected ? "text-tapit-ink" : "text-tapit-muted"}`}
                        >
                          Setup
                        </dt>
                        <dd className="break-words text-tapit-ink">
                          {customer.setupToken ? "Invitation pending" : "Complete"}
                        </dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt
                          className={`text-xs font-semibold ${isSelected ? "text-tapit-ink" : "text-tapit-muted"}`}
                        >
                          Profile
                        </dt>
                        <dd className="text-tapit-ink">
                          {isProfileOwner ? profile.status : "Not created"}
                        </dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt
                          className={`text-xs font-semibold ${isSelected ? "text-tapit-ink" : "text-tapit-muted"}`}
                        >
                          Cards
                        </dt>
                        <dd className="text-tapit-ink">{cardCount}</dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap gap-2">
                      {isProfileOwner ? (
                        <ButtonLink href="/admin/profiles" variant="secondary">
                          View profile
                        </ButtonLink>
                      ) : null}
                      {isProfileOwner ? (
                        <ButtonLink href="/admin/cards" variant="secondary">
                          View cards
                        </ButtonLink>
                      ) : null}
                      {customer.setupToken ? (
                        <ButtonLink
                          href={`/setup/${customer.setupToken}`}
                          variant={isSelected ? "secondary" : "quiet"}
                        >
                          Open setup link
                        </ButtonLink>
                      ) : null}
                      {customer.deletionStatus === "requested" ? (
                        <Button
                          onClick={() => setApprovalCustomer(customer)}
                          type="button"
                          variant="danger"
                        >
                          Approve deletion
                        </Button>
                      ) : null}
                      {customer.status === "active" &&
                      customer.deletionStatus === "active" &&
                      customer.role === "customer" &&
                      !customer.isDemo ? (
                        <Button
                          onClick={() => {
                            if (window.confirm("Promote this customer to a Demo account?")) {
                              try {
                                promoteDemoCustomerToDemo(customer.id);
                                setMessage({ tone: "success", text: "Customer promoted to Demo." });
                              } catch (error) {
                                setMessage({
                                  tone: "error",
                                  text:
                                    error instanceof Error
                                      ? error.message
                                      : "The customer could not be promoted to Demo.",
                                });
                              }
                            }
                          }}
                          type="button"
                          variant="tonal"
                        >
                          Promote to Demo
                        </Button>
                      ) : null}
                      {customer.status === "active" &&
                      customer.deletionStatus === "active" &&
                      customer.role === "customer" &&
                      customer.isDemo === true ? (
                        <Button
                          onClick={() => {
                            if (window.confirm("Promote this Demo account to administrator?")) {
                              try {
                                promoteDemoCustomerToAdmin(customer.id);
                                setMessage({
                                  tone: "success",
                                  text: "Demo account promoted to administrator.",
                                });
                              } catch (error) {
                                setMessage({
                                  tone: "error",
                                  text:
                                    error instanceof Error
                                      ? error.message
                                      : "The Demo account could not be promoted.",
                                });
                              }
                            }
                          }}
                          type="button"
                          variant="tonal"
                        >
                          Promote to Administrator
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {selectedCustomer
            ? (() => {
                const profile = getDemoProfiles(state).find(
                  (candidate) => candidate.id === selectedCustomer.profileId,
                );
                return (
                  <Card title="Selected customer">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="grid size-12 shrink-0 place-items-center rounded-full bg-tapit-accent text-sm font-semibold text-white"
                      >
                        {selectedCustomer.email.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <p className="truncate font-semibold text-tapit-ink">
                          {selectedCustomer.email}
                        </p>
                        <p className="truncate text-sm text-tapit-muted">
                          {profile?.draft.name || "Profile pending setup"}
                        </p>
                      </div>
                      <StatusChip
                        status={
                          selectedCustomer.deletionStatus === "requested"
                            ? "requested"
                            : selectedCustomer.status
                        }
                      />
                      {selectedCustomer.isDemo === true ? <StatusChip status="Demo" /> : null}
                    </div>
                    <div className="flex flex-col gap-2">
                      <Tile className="min-h-12">
                        <span className="grow text-sm text-tapit-muted">Account</span>
                        <span className="text-sm text-tapit-ink">{selectedCustomer.status}</span>
                      </Tile>
                      {selectedCustomer.status === "active" &&
                      selectedCustomer.role === "customer" &&
                      selectedCustomer.deletionStatus === "active" ? (
                        <>
                          <Tile className="min-h-12">
                            <span className="grow text-sm text-tapit-muted">
                              Owner access override
                            </span>
                            <span className="text-sm text-tapit-ink">
                              {selectedCustomer.cardOwnerAccessOverride === true
                                ? "Granted"
                                : "Not granted"}
                            </span>
                          </Tile>
                          <Button
                            onClick={() =>
                              setOwnerAccessConfirmation({
                                customer: selectedCustomer,
                                enabled: selectedCustomer.cardOwnerAccessOverride !== true,
                              })
                            }
                            type="button"
                            variant="secondary"
                          >
                            {selectedCustomer.cardOwnerAccessOverride === true
                              ? "Revoke owner access"
                              : "Grant owner access"}
                          </Button>
                        </>
                      ) : null}
                      <Tile className="min-h-12">
                        <span className="grow text-sm text-tapit-muted">Setup</span>
                        <span className="text-sm text-tapit-ink">
                          {selectedCustomer.setupToken ? "Invitation pending" : "Complete"}
                        </span>
                      </Tile>
                      <Tile className="min-h-12">
                        <span className="grow text-sm text-tapit-muted">Cards</span>
                        <span className="text-sm text-tapit-ink">
                          {profile
                            ? state.cards.filter((card) => card.profileId === profile.id).length
                            : 0}
                        </span>
                      </Tile>
                    </div>
                  </Card>
                );
              })()
            : null}
        </div>
      </div>
      <OwnerAccessConfirmDialog
        email={ownerAccessConfirmation?.customer.email ?? ""}
        enabled={ownerAccessConfirmation?.enabled ?? false}
        onCancel={() => setOwnerAccessConfirmation(null)}
        onConfirm={() => {
          const confirmation = ownerAccessConfirmation;
          setOwnerAccessConfirmation(null);
          if (confirmation !== null)
            setOwnerAccessOverride(confirmation.customer, confirmation.enabled);
        }}
        open={ownerAccessConfirmation !== null}
      />
      <ConfirmDialog
        confirmLabel="Approve deletion"
        description={
          approvalCustomer
            ? `Close ${approvalCustomer.email}'s account? Its profile will stay unavailable and assigned cards will remain inactive.`
            : ""
        }
        onCancel={() => setApprovalCustomer(null)}
        onConfirm={() => {
          if (approvalCustomer !== null) void approveDeletion(approvalCustomer.id);
        }}
        open={approvalCustomer !== null}
        title="Approve account deletion?"
      />
    </div>
  );
}

function LiveCustomersManager() {
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileSlug, setProfileSlug] = useState("");
  const [setupLink, setSetupLink] = useState("");
  const [copiedSetupLink, setCopiedSetupLink] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [ownerAccessConfirmation, setOwnerAccessConfirmation] = useState<{
    customerId: Id<"customers">;
    email: string;
    enabled: boolean;
  } | null>(null);
  const {
    results: customers,
    status: customersStatus,
    loadMore: loadMoreCustomers,
  } = usePaginatedQuery(
    api.customers.list,
    { search: query.trim() || undefined },
    { initialNumItems: 50 },
  );
  const {
    results: requests,
    status: requestsStatus,
    loadMore: loadMoreRequests,
  } = usePaginatedQuery(api.customers.listDeletionRequests, {}, { initialNumItems: 50 });
  const overdueDeletionRequests = useQuery_experimental({
    query: api.customers.hasOverdueDeletionRequests,
    args: { now },
  });
  const {
    results: invitations,
    status: invitationsStatus,
    loadMore: loadMoreInvitations,
  } = usePaginatedQuery(api.invitations.listForAdmin, {}, { initialNumItems: 50 });
  const create = useMutation(api.customers.createCustomer);
  const approve = useMutation(api.customers.approveDeletion);
  const revokeInvitation = useMutation(api.invitations.revoke);
  const replaceInvitation = useMutation(api.invitations.replace);
  const setRole = useMutation(api.customers.setRole);
  const promoteToDemoMutation = useMutation(api.customers.promoteToDemo);
  const setOwnerAccess = useMutation(api.customers.setCardOwnerAccessOverride);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const invitationByCustomer = useMemo(() => {
    const byCustomer = new Map<string, (typeof invitations)[number]>();
    for (const invitation of invitations) {
      if (!byCustomer.has(invitation.customerId)) byCustomer.set(invitation.customerId, invitation);
    }
    return byCustomer;
  }, [invitations]);
  if (
    customersStatus === "LoadingFirstPage" ||
    requestsStatus === "LoadingFirstPage" ||
    invitationsStatus === "LoadingFirstPage"
  )
    return (
      <div className="flex min-w-0 flex-col gap-8 pt-2">
        <AdminPageHeader
          description="Invite people, manage access and handle deletion requests."
          title="Customers"
        />
        <Notice>Loading customer operations…</Notice>
      </div>
    );

  async function createCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSetupLink("");
    setCopiedSetupLink(false);
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setMessage({ tone: "error", text: "Enter a valid customer email address." });
      return;
    }
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = btoa(String.fromCharCode(...tokenBytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    setPending(true);
    try {
      await create({
        email: normalizedEmail,
        ...(profileSlug.trim() ? { slug: profileSlug.trim() } : {}),
        name: profileName.trim(),
        tokenHash: await hashSetupToken(token),
      });
      setEmail("");
      setSetupLink(`/setup/${token}`);
      setMessage({
        tone: "success",
        text: `Customer account created for ${normalizedEmail}. Reusable until revoked.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Customer could not be created.",
      });
    } finally {
      setPending(false);
    }
  }

  async function approveRequest(requestId: Id<"deletionRequests">) {
    setMessage(null);
    try {
      await approve({ requestId });
      setMessage({
        tone: "success",
        text: "Deletion approved. The account and its public data remain unavailable.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Deletion could not be approved.",
      });
    }
  }

  async function revoke(customerId: Id<"invitations">) {
    setMessage(null);
    setSetupLink("");
    setCopiedSetupLink(false);
    try {
      await revokeInvitation({ invitationId: customerId });
      setMessage({
        tone: "success",
        text: "Invitation revoked.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "The invitation could not be revoked.",
      });
    }
  }

  async function replace(customerId: Id<"customers">) {
    setMessage(null);
    setSetupLink("");
    setCopiedSetupLink(false);
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = btoa(String.fromCharCode(...tokenBytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    try {
      await replaceInvitation({ customerId, tokenHash: await hashSetupToken(token) });
      setSetupLink(`/setup/${token}`);
      setMessage({ tone: "success", text: "The previous link is invalid immediately." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "The invitation could not be replaced.",
      });
    }
  }

  async function changeRole(customerId: Id<"customers">, role: "customer" | "admin") {
    setMessage(null);
    setSetupLink("");
    setCopiedSetupLink(false);
    try {
      await setRole({ customerId, role });
      setMessage({
        tone: "success",
        text: `Role updated to ${role === "admin" ? "administrator" : "customer"}.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "The customer role could not be updated.",
      });
    }
  }
  async function promoteToDemo(customerId: Id<"customers">) {
    setMessage(null);
    try {
      await promoteToDemoMutation({ customerId });
      setMessage({ tone: "success", text: "Customer promoted to Demo." });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error ? error.message : "The customer could not be promoted to Demo.",
      });
    }
  }
  async function changeOwnerAccess(customerId: Id<"customers">, enabled: boolean) {
    setMessage(null);
    try {
      await setOwnerAccess({ customerId, enabled });
      setMessage({ tone: "success", text: `Owner access ${enabled ? "granted" : "revoked"}.` });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Owner access could not be updated.",
      });
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-8 pt-2">
      <AdminPageHeader
        description="Invite people, manage access and handle deletion requests."
        title="Customers"
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_384px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Create customer">
            <form className="flex flex-wrap items-end gap-4" onSubmit={createCustomer}>
              <div className="min-w-72 flex-1">
                <Field
                  autoComplete="off"
                  id="live-customer-email"
                  label="Customer email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="person@example.com"
                  type="email"
                  value={email}
                />
              </div>
              <div className="min-w-52 flex-1">
                <Field
                  id="live-customer-profile-name"
                  label="Initial profile name"
                  onChange={(event) => setProfileName(event.target.value)}
                  placeholder="Optional display name"
                  value={profileName}
                />
              </div>
              <div className="min-w-52 flex-1">
                <Field
                  id="live-customer-profile-slug"
                  label="Profile slug"
                  onChange={(event) => setProfileSlug(event.target.value)}
                  placeholder="Optional stable slug"
                  value={profileSlug}
                />
              </div>
              <Button disabled={pending} loading={pending} type="submit">
                <Icon name="user" size={18} />
                Create and invite
              </Button>
            </form>
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
            {setupLink ? (
              <div className="flex flex-wrap items-center gap-3 rounded-control bg-tapit-soft-surface px-4 py-3 text-sm text-tapit-muted">
                <span className="break-all">
                  Reusable until revoked:{" "}
                  <strong className="text-tapit-accent-strong">{setupLink}</strong>
                </span>
                <Button
                  onClick={() => {
                    void navigator.clipboard?.writeText(
                      new URL(setupLink, window.location.origin).href,
                    );
                    setCopiedSetupLink(true);
                  }}
                  type="button"
                  variant="secondary"
                >
                  <Icon name="link" size={17} />
                  {copiedSetupLink ? "Copied" : "Copy link"}
                </Button>
              </div>
            ) : null}
          </Card>
          <Card title="Customer accounts">
            <div className="max-w-md">
              <Field
                id="live-customer-search"
                label="Search customers"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search email"
                type="search"
                value={query}
              />
            </div>
            <div className="flex flex-col gap-2">
              {customers.length === 0 ? (
                <Notice>
                  {customersStatus === "CanLoadMore"
                    ? "No matching accounts are in the loaded pages. Load older accounts to continue."
                    : "No customer accounts match this search."}
                </Notice>
              ) : null}
              {customers.map((customer) => (
                <article
                  className="grid min-w-0 gap-3 rounded-control bg-tapit-soft-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                  key={customer._id}
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-semibold text-tapit-ink">{customer.email}</p>
                    <p className="text-sm text-tapit-muted">
                      {[
                        customer.role,
                        ...(customer.isDemo === true ? ["Demo"] : []),
                        ...new Set(
                          [customer.status, customer.deletionStatus].filter(
                            (status) => status !== "active",
                          ),
                        ),
                      ].join(" · ")}
                    </p>
                    {(() => {
                      const invitation = invitationByCustomer.get(customer._id);
                      if (!invitation) return null;
                      const status =
                        invitation.invalidatedAt !== null
                          ? "revoked"
                          : invitation.acceptedAt !== null
                            ? "accepted"
                            : "pending";
                      return (
                        <>
                          <p className="text-sm text-tapit-muted">Invitation: {status}</p>
                          {invitation.profileName !== null || invitation.slug !== null ? (
                            <p className="text-sm text-tapit-muted">
                              Profile: {invitation.profileName ?? "Unnamed profile"}
                              {invitation.slug === null ? "" : ` · /${invitation.slug}`}
                            </p>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-xs font-semibold text-tapit-muted sm:hidden">
                      Account status
                    </span>
                    <StatusChip status={customer.status} />
                  </div>
                  {(() => {
                    const invitation = invitationByCustomer.get(customer._id);
                    const invitationActive = invitation?.invalidatedAt === null;
                    return (
                      <div className="flex flex-wrap gap-2">
                        {invitation && invitationActive ? (
                          <Button
                            onClick={() => {
                              if (window.confirm("Revoke this invitation?"))
                                void revoke(invitation.invitationId);
                            }}
                            type="button"
                            variant="quiet"
                          >
                            Revoke invitation
                          </Button>
                        ) : null}
                        {customer.status === "invited" && !customer.userId ? (
                          <Button
                            onClick={() => void replace(customer._id)}
                            type="button"
                            variant="quiet"
                          >
                            Replace invitation
                          </Button>
                        ) : null}
                        {customer.status === "active" &&
                        customer.deletionStatus === "active" &&
                        customer.role === "customer" &&
                        !customer.isDemo ? (
                          <Button
                            onClick={() => {
                              if (window.confirm("Promote this customer to a Demo account?"))
                                void promoteToDemo(customer._id);
                            }}
                            type="button"
                            variant="quiet"
                          >
                            Promote to Demo
                          </Button>
                        ) : null}
                        {customer.status === "active" &&
                        customer.deletionStatus === "active" &&
                        customer.role === "customer" &&
                        customer.isDemo === true ? (
                          <Button
                            onClick={() => {
                              if (window.confirm("Promote this Demo account to administrator?"))
                                void changeRole(customer._id, "admin");
                            }}
                            type="button"
                            variant="quiet"
                          >
                            Promote to Administrator
                          </Button>
                        ) : null}
                        {customer.status === "active" &&
                        customer.deletionStatus === "active" &&
                        customer.role === "customer" ? (
                          <>
                            <span className="self-center text-sm text-tapit-muted">
                              Owner access override:{" "}
                              {customer.cardOwnerAccessOverride === true
                                ? "Granted"
                                : "Not granted"}
                            </span>
                            <Button
                              onClick={() => {
                                const enabled = customer.cardOwnerAccessOverride !== true;
                                setOwnerAccessConfirmation({
                                  customerId: customer._id,
                                  email: customer.email,
                                  enabled,
                                });
                              }}
                              type="button"
                              variant="quiet"
                            >
                              {customer.cardOwnerAccessOverride === true
                                ? "Revoke owner access"
                                : "Grant owner access"}
                            </Button>
                          </>
                        ) : null}
                        {customer.status === "active" && customer.role === "admin" ? (
                          <Button
                            onClick={() => {
                              if (window.confirm("Demote this administrator to customer?"))
                                void changeRole(customer._id, "customer");
                            }}
                            type="button"
                            variant="quiet"
                          >
                            Demote to customer
                          </Button>
                        ) : null}
                      </div>
                    );
                  })()}
                </article>
              ))}
            </div>
            {customersStatus === "CanLoadMore" || customersStatus === "LoadingMore" ? (
              <Button
                disabled={customersStatus === "LoadingMore"}
                onClick={() => loadMoreCustomers(50)}
                type="button"
                variant="secondary"
              >
                {customersStatus === "LoadingMore" ? "Loading accounts…" : "Load more accounts"}
              </Button>
            ) : null}
            {invitationsStatus === "CanLoadMore" || invitationsStatus === "LoadingMore" ? (
              <Button
                disabled={invitationsStatus === "LoadingMore"}
                onClick={() => loadMoreInvitations(50)}
                type="button"
                variant="secondary"
              >
                {invitationsStatus === "LoadingMore"
                  ? "Loading invitations…"
                  : "Load more invitation history"}
              </Button>
            ) : null}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Deletion requests">
            {overdueDeletionRequests.status === "error" ? (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-tapit-warning-soft p-4 text-sm text-tapit-warning-ink"
                role="alert"
              >
                <p>
                  Overdue deletion status could not be loaded. Customer management is still
                  available.
                </p>
                <Button
                  onClick={() => setNow((current) => Math.max(Date.now(), current + 1))}
                  type="button"
                  variant="secondary"
                >
                  Retry
                </Button>
              </div>
            ) : overdueDeletionRequests.status === "success" && overdueDeletionRequests.data ? (
              <p
                className="rounded-control bg-tapit-danger-soft p-4 text-sm font-semibold text-tapit-danger"
                role="alert"
              >
                At least one deletion request is over 30 days old and still awaits administrator
                approval. Review the request history below.
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              {requests.length === 0 ? (
                <Notice>No deletion requests.</Notice>
              ) : (
                requests.map(({ request, customer }) => (
                  <article
                    className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-tapit-soft-surface p-4"
                    key={request._id}
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="font-semibold text-tapit-ink">
                        {customer?.email ?? "Unknown customer"}
                      </p>
                      <p className="text-sm text-tapit-muted">
                        Requested {new Date(request.requestedAt).toLocaleString()}
                      </p>
                      {request.status === "requested" &&
                      request.requestedAt < now - 30 * 24 * 60 * 60 * 1000 ? (
                        <p className="text-sm font-semibold text-tapit-danger" role="status">
                          Overdue — review and approve or resolve this request now.
                        </p>
                      ) : null}
                    </div>
                    {request.status === "requested" ? (
                      <Button
                        onClick={() => approveRequest(request._id)}
                        type="button"
                        variant="danger"
                      >
                        Approve deletion
                      </Button>
                    ) : (
                      <StatusChip status={request.status} />
                    )}
                  </article>
                ))
              )}
            </div>
            {requestsStatus === "CanLoadMore" || requestsStatus === "LoadingMore" ? (
              <Button
                disabled={requestsStatus === "LoadingMore"}
                onClick={() => loadMoreRequests(50)}
                type="button"
                variant="secondary"
              >
                {requestsStatus === "LoadingMore" ? "Loading requests…" : "Load more requests"}
              </Button>
            ) : null}
          </Card>
        </div>
      </div>
      <OwnerAccessConfirmDialog
        email={ownerAccessConfirmation?.email ?? ""}
        enabled={ownerAccessConfirmation?.enabled ?? false}
        onCancel={() => setOwnerAccessConfirmation(null)}
        onConfirm={() => {
          const confirmation = ownerAccessConfirmation;
          setOwnerAccessConfirmation(null);
          if (confirmation !== null)
            void changeOwnerAccess(confirmation.customerId, confirmation.enabled);
        }}
        open={ownerAccessConfirmation !== null}
      />
    </div>
  );
}

export function CustomersManager() {
  return !isLocalDemoMode() ? <LiveCustomersManager /> : <DemoCustomersManager />;
}
