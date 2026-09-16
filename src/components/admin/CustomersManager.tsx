"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowRightIcon, UserPlusIcon, UsersThreeIcon } from "@phosphor-icons/react";

import type { DemoCustomer, DemoProfile } from "@/lib/demo/fixtures";
import { validateProfileSlug } from "@/lib/domain";
import {
  getDemoProfiles,
  updateDemoProfile,
  updateDemoState,
  useDemoState,
} from "@/lib/demo/store";

import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { hashSetupToken } from "@/lib/auth/setup-token";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function DemoCustomersManager() {
  const state = useDemoState();
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileSlug, setProfileSlug] = useState("");
  const [theme, setTheme] = useState<"paper" | "moss" | "night">("paper");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [setupLink, setSetupLink] = useState("");
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
          draft: { name: profileName.trim(), slug, links: [], theme },
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

  function approveDeletion(customerId: string) {
    const occurredAt = new Date().toISOString();
    updateDemoState((current) => {
      const customer = current.customers.find((candidate) => candidate.id === customerId);
      if (customer === undefined || customer.deletionStatus !== "requested") return current;
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
            ? { ...candidate, status: "deleted", deletionStatus: "deleted", setupToken: undefined }
            : candidate,
        ),
        cards: withProfile.cards.map((card) =>
          card.profileId === customer.profileId &&
          (card.status === "active" || card.status === "claimable" || card.status === "registered")
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
            after: "deleted; profile unpublished; cards inactive",
          },
          ...withProfile.audits,
        ],
      };
    });
    setApprovalCustomer(null);
    setMessage({
      tone: "success",
      text: "Deletion approved. The account is closed and its profile and cards remain unavailable.",
    });
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
      <Panel
        description="Create invited customer accounts and keep account, profile, card, and invitation state visible separately."
        title="Create customer"
      >
        <form
          className="mt-6 grid max-w-3xl gap-3 sm:flex sm:flex-wrap sm:items-end"
          onSubmit={createCustomer}
        >
          <div className="sm:min-w-64 sm:flex-1">
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
          <div className="sm:min-w-52">
            <Field
              id="customer-profile-name"
              label="Initial profile name"
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Optional display name"
              value={profileName}
            />
          </div>
          <div className="sm:min-w-52">
            <Field
              id="customer-profile-slug"
              label="Profile slug"
              onChange={(event) => setProfileSlug(event.target.value)}
              placeholder="Optional stable slug"
              value={profileSlug}
            />
          </div>
          <div>
            <label
              className="block text-sm font-semibold text-tapit-ink"
              htmlFor="customer-profile-theme"
            >
              Initial theme
            </label>
            <select
              className="mt-2 min-h-12 rounded-tapit border border-tapit-line bg-tapit-surface px-3.5 text-sm text-tapit-ink"
              id="customer-profile-theme"
              onChange={(event) => setTheme(event.target.value as typeof theme)}
              value={theme}
            >
              <option value="paper">Paper</option>
              <option value="moss">Moss</option>
              <option value="night">Night</option>
            </select>
          </div>
          <Button type="submit">
            <UserPlusIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
            Create and invite
          </Button>
        </form>
        {message ? (
          <div className="mt-5">
            <Notice tone={message.tone}>{message.text}</Notice>
          </div>
        ) : null}
        {setupLink ? (
          <p className="mt-4 rounded-tapit bg-tapit-paper px-4 py-3 text-sm text-tapit-muted">
            Local setup link:{" "}
            <a className="font-semibold text-tapit-accent hover:underline" href={setupLink}>
              {setupLink}
            </a>
          </p>
        ) : null}
      </Panel>

      <Panel
        className="overflow-hidden"
        description="Search by email. New invitations remain separate from profile publication and card assignment."
        title="Customer accounts"
      >
        <div className="mt-6 flex items-end gap-3">
          <UsersThreeIcon
            aria-hidden="true"
            className="mb-3 hidden text-tapit-muted sm:block"
            size={22}
          />
          <div className="max-w-md flex-1">
            <Field
              id="customer-search"
              label="Search customers"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search email"
              type="search"
              value={query}
            />
          </div>
        </div>
        <div className="mt-6 grid gap-2">
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
            return (
              <article
                className={`rounded-tapit border bg-tapit-paper p-4 transition-colors sm:p-5 ${selectedCustomer?.id === customer.id ? "border-tapit-accent shadow-[0_8px_24px_rgba(24,116,97,0.10)]" : "border-tapit-line hover:border-tapit-accent/50"}`}
                key={customer.id}
              >
                <button
                  className="flex min-h-11 w-full items-start justify-between gap-4 text-left"
                  onClick={() => setSelectedCustomerId(customer.id)}
                  type="button"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-tapit-ink">{customer.email}</p>
                    <p className="mt-1 truncate text-sm text-tapit-muted">
                      {isProfileOwner
                        ? `${profile.draft.name || "Unnamed profile"} · ${profile.draft.slug}`
                        : "Profile pending setup"}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={customer.status} />
                    <ArrowRightIcon aria-hidden="true" className="text-tapit-muted" size={18} />
                  </span>
                </button>
                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-tapit-line pt-4 text-sm">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
                      Setup
                    </dt>
                    <dd className="mt-1 text-tapit-ink">
                      {customer.setupToken ? "Invitation pending" : "Complete"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
                      Profile
                    </dt>
                    <dd className="mt-1 text-tapit-ink">
                      {isProfileOwner ? profile.status : "Not created"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
                      Cards
                    </dt>
                    <dd className="mt-1 text-tapit-ink">{cardCount}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
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
                    <ButtonLink href={`/setup/${customer.setupToken}`} variant="quiet">
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
                </div>
              </article>
            );
          })}
        </div>
      </Panel>
      {selectedCustomer
        ? (() => {
            const profile = getDemoProfiles(state).find(
              (candidate) => candidate.id === selectedCustomer.profileId,
            );
            return (
              <Panel
                className="border-tapit-accent/30"
                description="A focused view keeps account operations separate from the registry."
                title="Selected customer"
              >
                <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-tapit-ink">{selectedCustomer.email}</p>
                    <p className="mt-1 text-sm text-tapit-muted">
                      {profile?.draft.name || "Profile pending setup"}
                    </p>
                  </div>
                  <StatusBadge
                    status={
                      selectedCustomer.deletionStatus === "requested"
                        ? "requested"
                        : selectedCustomer.status
                    }
                  />
                </div>
                <dl className="mt-5 grid gap-4 border-t border-tapit-line pt-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
                      Account
                    </dt>
                    <dd className="mt-1 text-tapit-ink">{selectedCustomer.status}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
                      Setup
                    </dt>
                    <dd className="mt-1 text-tapit-ink">
                      {selectedCustomer.setupToken ? "Invitation pending" : "Complete"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
                      Cards
                    </dt>
                    <dd className="mt-1 text-tapit-ink">
                      {profile
                        ? state.cards.filter((card) => card.profileId === profile.id).length
                        : 0}
                    </dd>
                  </div>
                </dl>
              </Panel>
            );
          })()
        : null}
      <ConfirmDialog
        confirmLabel="Approve deletion"
        description={
          approvalCustomer
            ? `Close ${approvalCustomer.email}'s account? Its profile will stay unavailable and assigned cards will remain inactive.`
            : ""
        }
        onCancel={() => setApprovalCustomer(null)}
        onConfirm={() => {
          if (approvalCustomer !== null) approveDeletion(approvalCustomer.id);
        }}
        open={approvalCustomer !== null}
        title="Approve account deletion?"
      />
    </div>
  );
}

function LiveCustomersManager() {
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileSlug, setProfileSlug] = useState("");
  const [theme, setTheme] = useState<"paper" | "moss" | "night">("paper");
  const [setupLink, setSetupLink] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const customers = useQuery(api.customers.list, { search: query.trim() || undefined });
  const requests = useQuery(api.customers.listDeletionRequests);
  const create = useMutation(api.customers.createCustomer);
  const approve = useMutation(api.customers.approveDeletion);
  const requestPasswordReset = useAction(api.auth.adminRequestPasswordReset);
  if (customers === undefined || requests === undefined)
    return <div className="p-8 text-sm text-tapit-muted">Loading customer operations…</div>;

  async function createCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSetupLink("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setMessage({ tone: "error", text: "Enter a valid customer email address." });
      return;
    }
    const baseSlug =
      (profileSlug.trim() || normalizedEmail)
        .split("@")[0]
        ?.replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "profile";
    const suffix = crypto.randomUUID().slice(0, 8);
    const requestedSlug = profileSlug.trim() ? baseSlug : `${baseSlug}-${suffix}`;
    const token = crypto.randomUUID().replaceAll("-", "");
    setPending(true);
    try {
      await (create as unknown as (args: Record<string, unknown>) => Promise<unknown>)({
        email: normalizedEmail,
        slug: requestedSlug,
        name: profileName.trim(),
        theme,
        tokenHash: await hashSetupToken(token),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      setEmail("");
      setSetupLink(`/setup/${token}`);
      setMessage({
        tone: "success",
        text: `Customer account created for ${normalizedEmail}. Share the one-time setup link through a controlled channel.`,
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

  async function resetPassword(customerId: Id<"customers">, email: string) {
    setMessage(null);
    try {
      await requestPasswordReset({ customerId });
      setMessage({
        tone: "success",
        text: `A secure password setup/reset email was queued for ${email}.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "The password reset could not be queued.",
      });
    }
  }
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
      <Panel
        description="Create invited customer accounts. The one-time setup link is shown once for controlled handoff."
        title="Create customer"
      >
        <form className="mt-6 flex max-w-3xl flex-wrap items-end gap-3" onSubmit={createCustomer}>
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
          <div className="min-w-52">
            <Field
              id="live-customer-profile-name"
              label="Initial profile name"
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Optional display name"
              value={profileName}
            />
          </div>
          <div className="min-w-52">
            <Field
              id="live-customer-profile-slug"
              label="Profile slug"
              onChange={(event) => setProfileSlug(event.target.value)}
              placeholder="Optional stable slug"
              value={profileSlug}
            />
          </div>
          <div>
            <label
              className="block text-sm font-semibold text-tapit-ink"
              htmlFor="live-customer-profile-theme"
            >
              Initial theme
            </label>
            <select
              className="mt-2 min-h-12 rounded-tapit border border-tapit-line bg-tapit-surface px-3.5 text-sm text-tapit-ink"
              id="live-customer-profile-theme"
              onChange={(event) => setTheme(event.target.value as typeof theme)}
              value={theme}
            >
              <option value="paper">Paper</option>
              <option value="moss">Moss</option>
              <option value="night">Night</option>
            </select>
          </div>
          <Button disabled={pending} loading={pending} type="submit">
            <UserPlusIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
            Create and invite
          </Button>
        </form>
        {message ? (
          <div className="mt-5">
            <Notice tone={message.tone}>{message.text}</Notice>
          </div>
        ) : null}
        {setupLink ? (
          <p className="mt-4 break-all rounded-tapit bg-tapit-paper px-4 py-3 text-sm text-tapit-muted">
            One-time setup link: <strong className="text-tapit-accent">{setupLink}</strong>
          </p>
        ) : null}
      </Panel>
      <Panel
        description="Search the first 100 customer accounts returned by the administrator query."
        title="Customer accounts"
      >
        <div className="mt-6 max-w-md">
          <Field
            id="live-customer-search"
            label="Search customers"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search email"
            type="search"
            value={query}
          />
        </div>
        <div className="mt-6 grid gap-2">
          {customers.length === 0 ? <Notice>No customer accounts match this search.</Notice> : null}
          {customers.map((customer) => (
            <article
              className="flex flex-wrap items-center justify-between gap-3 rounded-tapit border border-tapit-line bg-tapit-paper p-4"
              key={customer._id}
            >
              <div>
                <p className="font-semibold text-tapit-ink">{customer.email}</p>
                <p className="mt-1 text-sm text-tapit-muted">
                  {customer.role} · {customer.status} · {customer.deletionStatus}
                </p>
              </div>
              <StatusBadge status={customer.status} />
              {customer.status !== "deleted" ? (
                <Button
                  onClick={() => void resetPassword(customer._id, customer.email)}
                  type="button"
                  variant="quiet"
                >
                  Send password setup/reset
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      </Panel>
      <Panel title="Deletion requests">
        <div className="mt-5 grid gap-2">
          {requests.length === 0 ? (
            <Notice>No pending deletion requests.</Notice>
          ) : (
            requests.map(({ request, customer }) => (
              <article
                className="flex flex-wrap items-center justify-between gap-3 rounded-tapit border border-tapit-line bg-tapit-paper p-4"
                key={request._id}
              >
                <div>
                  <p className="font-semibold text-tapit-ink">
                    {customer?.email ?? "Unknown customer"}
                  </p>
                  <p className="mt-1 text-sm text-tapit-muted">
                    Requested {new Date(request.requestedAt).toLocaleString()}
                  </p>
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
                  <StatusBadge status={request.status} />
                )}
              </article>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

export function CustomersManager() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "false" ? (
    <LiveCustomersManager />
  ) : (
    <DemoCustomersManager />
  );
}
