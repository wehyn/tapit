"use client";

import { useMemo, useState } from "react";
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

export function CustomersManager() {
  const state = useDemoState();
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
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
      normalizedEmail
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
          draft: { name: "", slug, links: [] },
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
          (card.status === "active" || card.status === "registered")
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
