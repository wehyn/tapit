"use client";

import { useMemo, useState } from "react";
import { ArrowRightIcon, ArrowsClockwiseIcon, PlusIcon, ProhibitIcon } from "@phosphor-icons/react";

import { canTransitionCard, isActiveAccount, transitionCard } from "@/lib/domain";
import type { DemoCard } from "@/lib/demo/fixtures";
import {
  getDemoProfileById,
  getDemoProfiles,
  useDemoState,
  updateDemoState,
} from "@/lib/demo/store";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { QrControls } from "@/components/qr/QrControls";
import { StatusBadge } from "@/components/ui/StatusBadge";

type Confirmation = { type: "deactivate" | "replace"; card: DemoCard } | null;

function cardTokenFromUrl(value: string): string | null {
  try {
    const parsed = new URL(value, "https://tapit.local");
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length !== 2 || segments[0] !== "c") return null;
    const token = segments[1];
    return token && /^[A-Za-z0-9_-]+$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

function normalizedCardUrl(value: string): string {
  return value.trim();
}

function cardUrlIdentity(value: string): string {
  const parsed = new URL(normalizedCardUrl(value), "https://tapit.local");
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return `${parsed.origin}${pathname}`;
}

export function CardsManager() {
  const state = useDemoState();
  const [cardUrl, setCardUrl] = useState("");
  const [replacementUrl, setReplacementUrl] = useState("");
  const [query, setQuery] = useState("");
  const profiles = getDemoProfiles(state);
  const [selectedProfileId, setSelectedProfileId] = useState(profiles[0]?.id ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [replacementReview, setReplacementReview] = useState(false);
  const selectedProfile = getDemoProfileById(state, selectedProfileId) ?? profiles[0];

  const cards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return state.cards.filter(
      (card) =>
        !normalized ||
        `${card.cardUrl} ${card.token} ${card.status}`.toLowerCase().includes(normalized),
    );
  }, [query, state.cards]);

  function validateCardUrl(value: string): string | null {
    const token = cardTokenFromUrl(value);
    if (!token) return "Enter a card URL with a /c/<unique-token> path.";
    if (state.cards.some((card) => cardUrlIdentity(card.cardUrl) === cardUrlIdentity(value)))
      return "That card URL is already registered.";
    if (state.cards.some((card) => card.token === token))
      return `The card token “${token}” is already registered. Enter a unique token.`;
    return null;
  }

  function registerCard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateCardUrl(cardUrl);
    if (error) {
      setMessage({ tone: "error", text: error });
      return;
    }
    const token = cardTokenFromUrl(cardUrl);
    if (!token) return;
    const nextCard: DemoCard = {
      id: `card-${token}`,
      token,
      cardUrl: normalizedCardUrl(cardUrl),
      status: "registered",
    };
    updateDemoState((current) => ({
      ...current,
      cards: [...current.cards, nextCard],
      audits: [
        {
          id: `audit-${Date.now()}`,
          actor: "admin@tapit.local",
          action: "card.registered",
          target: token,
          occurredAt: new Date().toISOString(),
          after: "registered",
        },
        ...current.audits,
      ],
    }));
    setCardUrl("");
    setMessage({ tone: "success", text: `Card ${token} registered and ready for assignment.` });
  }

  function assignCard(card: DemoCard) {
    if (!canTransitionCard(card.status, "active")) {
      setMessage({
        tone: "error",
        text: "Only a registered card can be assigned. Inactive and replaced cards cannot be reused.",
      });
      return;
    }
    if (selectedProfile === undefined) {
      setMessage({ tone: "error", text: "Create a profile before assigning a card." });
      return;
    }
    if (selectedProfile.status !== "published") {
      setMessage({ tone: "error", text: "Publish the selected profile before assigning a card." });
      return;
    }
    const owner = state.customers.find((customer) => customer.id === selectedProfile.ownerId);
    if (!isActiveAccount(owner?.status, owner?.deletionStatus)) {
      setMessage({ tone: "error", text: "The profile owner account is not active." });
      return;
    }
    const nextCard = transitionCard(card, "active", selectedProfile.id);
    updateDemoState((current) => ({
      ...current,
      cards: current.cards.map((candidate) =>
        candidate.id === card.id ? { ...candidate, ...nextCard } : candidate,
      ),
      audits: [
        {
          id: `audit-${Date.now()}`,
          actor: "admin@tapit.local",
          action: "card.assigned",
          target: `${card.token} → ${selectedProfile.draft.name || selectedProfile.draft.slug}`,
          occurredAt: new Date().toISOString(),
          before: "registered",
          after: "active",
        },
        ...current.audits,
      ],
    }));
    setMessage({
      tone: "success",
      text: `Card ${card.token} is active and assigned to ${selectedProfile.draft.name || selectedProfile.draft.slug}.`,
    });
  }

  function deactivateCard(card: DemoCard) {
    const nextCard = transitionCard(card, "inactive");
    updateDemoState((current) => ({
      ...current,
      cards: current.cards.map((candidate) =>
        candidate.id === card.id ? { ...candidate, ...nextCard } : candidate,
      ),
      audits: [
        {
          id: `audit-${Date.now()}`,
          actor: "admin@tapit.local",
          action: "card.deactivated",
          target: card.token,
          occurredAt: new Date().toISOString(),
          before: "active",
          after: "inactive",
        },
        ...current.audits,
      ],
    }));
    setConfirmation(null);
    setMessage({
      tone: "success",
      text: `Card ${card.token} is inactive. Its public path no longer exposes profile content.`,
    });
  }

  function replaceCard(card: DemoCard) {
    const error = validateCardUrl(replacementUrl);
    if (error) {
      setMessage({ tone: "error", text: error });
      return;
    }
    const token = cardTokenFromUrl(replacementUrl);
    if (!token) return;
    const replacementProfile = getDemoProfileById(state, card.profileId);
    const replacementOwner = state.customers.find(
      (customer) => customer.id === replacementProfile?.ownerId,
    );
    if (!isActiveAccount(replacementOwner?.status, replacementOwner?.deletionStatus)) {
      setMessage({ tone: "error", text: "The profile owner account is not active." });
      return;
    }
    const profileName =
      replacementProfile?.draft.name || replacementProfile?.draft.slug || "its existing profile";
    const replacement: DemoCard = {
      id: `card-${token}-replacement`,
      token,
      cardUrl: normalizedCardUrl(replacementUrl),
      status: "active",
      profileId: card.profileId,
    };
    const retired = transitionCard(card, "replaced", undefined, replacement.id);
    updateDemoState((current) => ({
      ...current,
      cards: [
        ...current.cards.map((candidate) =>
          candidate.id === card.id ? { ...candidate, ...retired } : candidate,
        ),
        replacement,
      ],
      audits: [
        {
          id: `audit-${Date.now()}-new`,
          actor: "admin@tapit.local",
          action: "card.assigned",
          target: `${replacement.token} → ${profileName}`,
          occurredAt: new Date().toISOString(),
          after: "active",
        },
        {
          id: `audit-${Date.now()}-old`,
          actor: "admin@tapit.local",
          action: "card.replaced",
          target: `${card.token} → ${replacement.token}`,
          occurredAt: new Date().toISOString(),
          before: "active",
          after: "replaced",
        },
        ...current.audits,
      ],
    }));
    setReplacementUrl("");
    setConfirmation(null);
    setReplacementReview(false);
    setMessage({
      tone: "success",
      text: `Card ${card.token} was replaced. ${replacement.token} is active; the old path is inactive.`,
    });
  }

  function confirmAction() {
    if (confirmation === null) return;
    if (confirmation.type === "deactivate") deactivateCard(confirmation.card);
    else replaceCard(confirmation.card);
  }

  function reviewReplacement() {
    if (confirmation?.type !== "replace") return;
    const error = validateCardUrl(replacementUrl);
    if (error) {
      setMessage({ tone: "error", text: error });
      return;
    }
    setReplacementReview(true);
  }

  function cancelConfirmation() {
    setReplacementReview(false);
    setConfirmation(null);
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
      <Panel
        description="Register the pre-encoded URL exactly once. Assignments and replacements are administrator-only and auditable."
        title="Register card URL"
      >
        <form className="mt-6 flex max-w-3xl flex-wrap items-end gap-3" onSubmit={registerCard}>
          <div className="min-w-72 flex-1">
            <Field
              id="card-url"
              label="Pre-encoded card URL"
              onChange={(event) => setCardUrl(event.target.value)}
              placeholder="/c/card-token or https://cards.example/c/card-token"
              value={cardUrl}
            />
          </div>
          <div className="min-w-64">
            <label
              className="block text-sm font-semibold text-tapit-ink"
              htmlFor="card-assignment-profile"
            >
              Assignment profile
            </label>
            <select
              className="mt-2 min-h-12 w-full rounded-tapit border border-tapit-line bg-tapit-surface px-3.5 py-3 text-sm text-tapit-ink"
              id="card-assignment-profile"
              onChange={(event) => setSelectedProfileId(event.target.value)}
              value={selectedProfileId}
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.draft.name || "Unnamed profile"} · {profile.draft.slug}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">
            <PlusIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
            Register card
          </Button>
        </form>
        {message ? (
          <div className="mt-5">
            <Notice tone={message.tone}>{message.text}</Notice>
          </div>
        ) : null}
      </Panel>

      <Panel
        description="Search registered URLs, tokens, and state. Inactive and replaced cards cannot be reactivated or reassigned."
        title="Card registry"
      >
        <div className="mt-6 max-w-md">
          <Field
            id="card-search"
            label="Search cards"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search URL or token"
            type="search"
            value={query}
          />
        </div>
        <div className="mt-6 grid gap-2">
          {cards.length === 0 ? <Notice>No registered cards match this search.</Notice> : null}
          {cards.map((card) => (
            <article
              className="rounded-tapit border border-tapit-line bg-tapit-paper p-4 transition-colors hover:border-tapit-accent/50 sm:p-5"
              key={card.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-tapit-ink">{card.token}</p>
                  <p className="mt-1 break-all text-sm text-tapit-muted">{card.cardUrl}</p>
                </div>
                <StatusBadge status={card.status} />
              </div>
              <dl className="mt-5 grid gap-3 border-t border-tapit-line pt-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
                    Profile
                  </dt>
                  <dd className="mt-1 text-tapit-ink">
                    {getDemoProfileById(state, card.profileId)?.draft.name ||
                      (card.profileId
                        ? getDemoProfileById(state, card.profileId)?.draft.slug
                        : "Unassigned")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
                    Public effect
                  </dt>
                  <dd className="mt-1 text-tapit-ink">
                    {card.status === "active"
                      ? "Resolves to published state"
                      : "No profile content"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
                    History
                  </dt>
                  <dd className="mt-1 text-tapit-ink">
                    {state.audits.filter((audit) => audit.target.includes(card.token)).length} audit
                    events
                  </dd>
                </div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                {card.status === "registered" ? (
                  <Button onClick={() => assignCard(card)} type="button">
                    <ArrowRightIcon aria-hidden="true" className="mr-2" size={18} />
                    Assign to profile
                  </Button>
                ) : null}
                {card.status === "active" ? (
                  <Button
                    onClick={() => setConfirmation({ type: "deactivate", card })}
                    type="button"
                    variant="danger"
                  >
                    <ProhibitIcon aria-hidden="true" className="mr-2" size={18} />
                    Deactivate
                  </Button>
                ) : null}
                {card.status === "active" ? (
                  <Button
                    onClick={() => setConfirmation({ type: "replace", card })}
                    type="button"
                    variant="secondary"
                  >
                    <ArrowsClockwiseIcon aria-hidden="true" className="mr-2" size={18} />
                    Replace card
                  </Button>
                ) : null}
              </div>
              {card.status === "active" ? (
                <QrControls cardUrl={card.cardUrl} label={card.token} />
              ) : null}
            </article>
          ))}
        </div>
      </Panel>

      {confirmation?.type === "replace" ? (
        <Panel
          description={`The old ${confirmation.card.token} path will become replaced and the new card will remain assigned to its existing profile.`}
          title="Replacement card URL"
        >
          <div className="mt-5 flex max-w-3xl flex-wrap items-end gap-3">
            <div className="min-w-72 flex-1">
              <Field
                id="replacement-card-url"
                label="New pre-encoded card URL"
                onChange={(event) => setReplacementUrl(event.target.value)}
                placeholder="/c/replacement-token"
                value={replacementUrl}
              />
            </div>
            <Button onClick={reviewReplacement} type="button">
              Review replacement
            </Button>
            <Button onClick={cancelConfirmation} type="button" variant="quiet">
              Cancel
            </Button>
          </div>
        </Panel>
      ) : null}

      <ConfirmDialog
        confirmLabel={confirmation?.type === "replace" ? "Replace card" : "Deactivate card"}
        description={
          confirmation?.type === "replace"
            ? `The old ${confirmation.card.token} path will become replaced and ${replacementUrl.trim()} will become the active card path. The former profile content will no longer be served from the old URL. Continue?`
            : confirmation?.type === "deactivate"
              ? `Deactivating ${confirmation.card.token} immediately removes its former profile content from the public path. Continue?`
              : ""
        }
        onCancel={cancelConfirmation}
        onConfirm={confirmAction}
        open={
          confirmation?.type === "deactivate" ||
          (confirmation?.type === "replace" && replacementReview)
        }
        title={confirmation?.type === "replace" ? "Replace this card?" : "Deactivate this card?"}
      />
    </div>
  );
}
