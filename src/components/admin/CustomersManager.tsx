"use client";

import { useMemo, useState } from "react";

import type { DemoCustomer, DemoProfile } from "@/lib/demo/fixtures";
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

  const customers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return state.customers.filter((customer) => !normalized || customer.email.includes(normalized));
  }, [query, state.customers]);

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
          draft: { name: "", slug: `${baseSlug}-${Date.now().toString(36)}`, links: [] },
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
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 pb-12 pt-6 sm:px-8">
      <Panel
        description="Create invited customer accounts and keep account, profile, card, and invitation state visible separately."
        title="Create customer"
      >
        <form className="mt-6 flex max-w-2xl flex-wrap items-end gap-3" onSubmit={createCustomer}>
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
          <Button type="submit">Create and invite</Button>
        </form>
        {message ? (
          <div className="mt-5">
            <Notice tone={message.tone}>{message.text}</Notice>
          </div>
        ) : null}
        {setupLink ? (
          <p className="mt-4 rounded-xl bg-tapit-paper px-4 py-3 text-sm text-tapit-muted">
            Local setup link:{" "}
            <a className="font-semibold text-tapit-accent hover:underline" href={setupLink}>
              {setupLink}
            </a>
          </p>
        ) : null}
      </Panel>

      <Panel
        description="Search by email. New invitations remain separate from profile publication and card assignment."
        title="Customer accounts"
      >
        <div className="mt-6 max-w-md">
          <Field
            id="customer-search"
            label="Search customers"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search email"
            type="search"
            value={query}
          />
        </div>
        <div className="mt-6 grid gap-3">
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
                className="rounded-2xl border border-tapit-line bg-tapit-paper p-4 sm:p-5"
                key={customer.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-tapit-ink">{customer.email}</p>
                    <p className="mt-1 text-sm text-tapit-muted">
                      {isProfileOwner
                        ? `${profile.draft.name || "Unnamed profile"} · ${profile.draft.slug}`
                        : "Profile pending setup"}
                    </p>
                  </div>
                  <StatusBadge status={customer.status} />
                </div>
                <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
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
                <div className="mt-5 flex flex-wrap gap-2">
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
