"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";

import { canTransitionCard, isActiveAccount, transitionCard } from "@/lib/domain";
import type { DemoCard } from "@/lib/demo/fixtures";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  getDemoProfileById,
  getDemoProfiles,
  useDemoState,
  updateDemoState,
} from "@/lib/demo/store";

import { Button } from "@/components/ui/Button";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, SelectField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Card } from "@/components/ui/Card";
import { QrControls } from "@/components/qr/QrControls";
import { Segmented } from "@/components/ui/Segmented";
import { StatusChip } from "@/components/ui/Chip";
import { Tile } from "@/components/ui/Tile";
import { api } from "../../../convex/_generated/api";

type Confirmation =
  | { type: "deactivate" | "replace"; card: DemoCard }
  | { type: "attach"; card: DemoCard; profileId: string }
  | null;

type CardGroup = "unclaimed" | "claimed" | "inactive";
type CardFilter = "all" | CardGroup;

const cardFilterOptions: readonly { value: CardFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unclaimed", label: "Unclaimed" },
  { value: "claimed", label: "Claimed" },
  { value: "inactive", label: "Inactive" },
];

const cardRowColumns = "grid-cols-[minmax(0,1.6fr)_112px_minmax(0,1fr)_16px]";

type CardGroupSource = {
  status: string;
  claimedAt?: number;
  claimCodeClaimedAt?: number;
};

function cardGroup(card: CardGroupSource): CardGroup {
  if (card.status === "inactive" || card.status === "replaced") return "inactive";
  if ((card.claimedAt ?? card.claimCodeClaimedAt) !== undefined) return "claimed";
  return "unclaimed";
}

function countCards(cards: CardGroupSource[]): Record<CardFilter, number> {
  const counts: Record<CardFilter, number> = {
    all: cards.length,
    unclaimed: 0,
    claimed: 0,
    inactive: 0,
  };
  for (const card of cards) counts[cardGroup(card)] += 1;
  return counts;
}

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

function cardUrlFromToken(token: string): string {
  return new URL(`/c/${token}`, window.location.origin).toString();
}

function randomDemoCardToken(existingTokens: Set<string>): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bucketSize = 256 - (256 % alphabet.length);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const suffixCharacters: string[] = [];
    for (const byte of bytes) {
      if (byte >= bucketSize) continue;
      suffixCharacters.push(alphabet[byte % alphabet.length]!);
      if (suffixCharacters.length === 8) break;
    }
    if (suffixCharacters.length !== 8) continue;
    const suffix = suffixCharacters.join("");
    const token = `card-${suffix}`;
    if (!existingTokens.has(token)) return token;
  }
  throw new Error("Unable to generate an available card token. Try again.");
}

function cardUrlIdentity(value: string): string {
  const parsed = new URL(normalizedCardUrl(value), "https://tapit.local");
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return `${parsed.origin}${pathname}`;
}

function CardRegistryToolbar({
  counts,
  filter,
  onFilterChange,
  onQueryChange,
  query,
}: {
  counts: Record<CardFilter, number>;
  filter: CardFilter;
  onFilterChange: (filter: CardFilter) => void;
  onQueryChange: (query: string) => void;
  query: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented
        label="Filter cards"
        onChange={onFilterChange}
        options={cardFilterOptions.map((option) => ({
          label: `${option.label} ${counts[option.value]}`,
          value: option.value,
        }))}
        tone="soft"
        value={filter}
      />
      <label className="flex min-h-11 min-w-0 flex-1 basis-64 items-center gap-2 rounded-control bg-tapit-soft-surface px-3 text-tapit-muted sm:max-w-80">
        <Icon name="search" size={18} />
        <input
          aria-label="Search cards"
          className="min-w-0 flex-1 bg-transparent text-sm text-tapit-ink outline-none placeholder:text-tapit-muted"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search URL or token"
          type="search"
          value={query}
        />
      </label>
    </div>
  );
}

function CardTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-160 flex-col gap-2">
        <div
          className={`grid ${cardRowColumns} min-h-8 items-center gap-4 px-4 text-xs font-semibold text-tapit-muted`}
        >
          <span>Card</span>
          <span>Status</span>
          <span>Attached profile</span>
          <span aria-hidden="true" />
        </div>
        {children}
      </div>
    </div>
  );
}

function CardRow({
  children,
  onOpen,
  profileLabel,
  selected,
  status,
  token,
}: {
  children: ReactNode;
  onOpen: () => void;
  profileLabel: string;
  selected: boolean;
  status: string;
  token: string;
}) {
  return (
    <article
      className={`min-w-0 rounded-control ${selected ? "bg-tapit-accent-soft" : "bg-tapit-soft-surface"}`}
    >
      <details
        className="group"
        onToggle={(event) => {
          if (event.currentTarget.open) onOpen();
        }}
      >
        <summary
          className={`grid ${cardRowColumns} min-h-14 cursor-pointer list-none items-center gap-4 rounded-control px-4 text-sm hover:bg-tapit-accent-soft [&::-webkit-details-marker]:hidden`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-control bg-tapit-surface text-tapit-accent-strong shadow-card">
              <Icon name="card" size={16} />
            </span>
            <span className="min-w-0 truncate font-semibold text-tapit-ink">/c/{token}</span>
          </span>
          <span>
            <StatusChip status={status} />
          </span>
          <span className="min-w-0 truncate text-tapit-muted">{profileLabel}</span>
          <span className="grid place-items-center text-tapit-muted">
            <Icon className="group-open:hidden" name="caretDown" size={16} />
            <Icon className="hidden group-open:block" name="caretUp" size={16} />
          </span>
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className="text-sm text-tapit-muted">
            {profileLabel} ({token})
          </p>
          {children}
        </div>
      </details>
    </article>
  );
}

function CopyCardLinkButton({ ariaLabel, token }: { ariaLabel?: string; token: string }) {
  const [copyMessage, setCopyMessage] = useState<{
    tone: "success" | "error";
    text: string;
    url?: string;
  } | null>(null);

  async function copyCardLink() {
    const url = `${cardUrlFromToken(token)}?claim=1`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyMessage({ tone: "success", text: "Card link copied." });
    } catch {
      setCopyMessage({
        tone: "error",
        text: "Clipboard access failed. Copy this URL manually: ",
        url,
      });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        aria-label={ariaLabel}
        onClick={() => void copyCardLink()}
        type="button"
        variant="secondary"
      >
        <Icon name="copy" size={16} />
        Copy link
      </Button>
      {copyMessage ? (
        <Notice tone={copyMessage.tone}>
          {copyMessage.text}
          {copyMessage.url ? <span className="break-all">{copyMessage.url}</span> : null}
        </Notice>
      ) : null}
    </div>
  );
}

function CardDetail({
  children,
  status,
  token,
}: {
  children: ReactNode;
  status: string;
  token: string;
}) {
  return (
    <Card title={`Card ${token}`}>
      <div className="flex">
        <StatusChip status={status} />
      </div>
      <div className="flex flex-col gap-2">{children}</div>
      <CopyCardLinkButton token={token} />
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Tile className="justify-between">
      <span className="text-sm text-tapit-muted">{label}</span>
      <span className="min-w-0 break-words text-right text-sm text-tapit-ink">{value}</span>
    </Tile>
  );
}

function DemoCardsManager() {
  const state = useDemoState();
  const [cardUrl, setCardUrl] = useState("");
  const [replacementUrl, setReplacementUrl] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CardFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const profiles = getDemoProfiles(state);
  const [selectedProfileId, setSelectedProfileId] = useState(profiles[0]?.id ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [replacementReview, setReplacementReview] = useState(false);
  const [claimCode, setClaimCode] = useState<{
    cardId: string;
    code: string;
    expiresAt: number;
  } | null>(null);
  const selectedProfile = getDemoProfileById(state, selectedProfileId) ?? profiles[0];

  const counts = useMemo(() => countCards(state.cards), [state.cards]);

  const cards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return state.cards
      .map((card, index) => ({ card, createdAt: card.createdAt ?? index }))
      .filter(
        ({ card }) =>
          (filter === "all" || cardGroup(card) === filter) &&
          (!normalized ||
            `${card.cardUrl} ${card.token} ${card.status}`.toLowerCase().includes(normalized)),
      )
      .sort((first, second) => second.createdAt - first.createdAt)
      .map(({ card }) => card);
  }, [filter, query, state.cards]);

  const detailCard = cards.find((card) => card.id === selectedId) ?? cards[0];
  const detailProfile = detailCard ? getDemoProfileById(state, detailCard.profileId) : undefined;
  const detailOwner = state.customers.find((customer) => customer.id === detailProfile?.ownerId);
  const detailLabel = detailProfile?.draft.name || detailProfile?.draft.slug || "Unassigned";
  const detailAuditCount = detailCard
    ? state.audits.filter((audit) => audit.target.includes(detailCard.token)).length
    : 0;

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
    const createdAt = Math.max(0, ...state.cards.map((card) => card.createdAt ?? 0)) + 1;
    const nextCard: DemoCard = {
      id: `card-${token}`,
      token,
      cardUrl: normalizedCardUrl(cardUrl),
      status: "registered",
      createdAt,
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
    if (selectedProfile !== undefined)
      setConfirmation({ type: "attach", card: nextCard, profileId: selectedProfile.id });
  }

  function generateCardUrl() {
    try {
      const token = randomDemoCardToken(new Set(state.cards.map((card) => card.token)));
      setCardUrl(cardUrlFromToken(token));
      setMessage({
        tone: "success",
        text: `Generated ${token}. Review it, then register the card.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to generate a card token.",
      });
    }
  }

  function assignCard(card: DemoCard, profileId: string) {
    const profile = getDemoProfileById(state, profileId);
    if (profile === undefined) {
      setMessage({ tone: "error", text: "Create a profile before assigning a card." });
      return;
    }
    const targetStatus = profile.status === "published" ? "active" : "claimable";
    if (!canTransitionCard(card.status, targetStatus)) {
      setMessage({
        tone: "error",
        text: "Only a registered card can be assigned. Inactive and replaced cards cannot be reused.",
      });
      return;
    }
    const owner = state.customers.find((customer) => customer.id === profile.ownerId);
    if (owner === undefined || owner.status === "deleted" || owner.deletionStatus !== "active") {
      setMessage({ tone: "error", text: "The profile owner account is not available." });
      return;
    }
    const nextCard = transitionCard(card, targetStatus, profile.id);
    updateDemoState((current) => ({
      ...current,
      cards: current.cards.map((candidate) =>
        candidate.id === card.id ? { ...candidate, ...nextCard, profileId: profile.id } : candidate,
      ),
      audits: [
        {
          id: `audit-${Date.now()}`,
          actor: "admin@tapit.local",
          action: "card.assigned",
          target: `${card.token} → ${profile.draft.name || profile.draft.slug}`,
          occurredAt: new Date().toISOString(),
          before: "registered",
          after: targetStatus,
        },
        ...current.audits,
      ],
    }));
    setConfirmation(null);
    setMessage({
      tone: "success",
      text:
        targetStatus === "active"
          ? `Card ${card.token} is active for ${profile.draft.name || profile.draft.slug}. Generate and share a claim code so the owner can unlock card-owner features.`
          : `Card ${card.token} is claimable and assigned to ${profile.draft.name || profile.draft.slug}. It must be activated with a claim code.`,
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
    else if (confirmation.type === "replace") replaceCard(confirmation.card);
    else if (confirmation.type === "attach") assignCard(confirmation.card, confirmation.profileId);
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
    <div className="flex min-w-0 flex-col gap-8 pt-2">
      <AdminPageHeader
        description="Register pre-encoded NFC cards, hand out claim codes and replace lost cards."
        title="Cards"
      />
      <section className="flex min-w-0 flex-col gap-4 rounded-card bg-tapit-accent-soft p-6">
        <h2 className="text-lg font-semibold text-tapit-ink">Register card URL</h2>
        <p className="text-sm text-tapit-muted">
          Register the pre-encoded URL exactly once. Assignments and replacements are
          administrator-only and auditable.
        </p>
        <form className="flex flex-wrap items-end gap-4" onSubmit={registerCard}>
          <div className="min-w-0 flex-1 sm:min-w-72">
            <Field
              id="card-url"
              label="Pre-encoded card URL"
              onChange={(event) => setCardUrl(event.target.value)}
              placeholder="/c/card-token or https://cards.example/c/card-token"
              value={cardUrl}
            />
          </div>
          <Button onClick={generateCardUrl} type="button" variant="secondary">
            Generate secure URL
          </Button>
          <div className="min-w-0 sm:min-w-64">
            <SelectField
              id="card-assignment-profile"
              label="Assignment profile"
              onChange={(event) => setSelectedProfileId(event.target.value)}
              value={selectedProfileId}
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.draft.name || "Unnamed profile"} · {profile.draft.slug}
                </option>
              ))}
            </SelectField>
          </div>
          <Button type="submit">Register card</Button>
        </form>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      </section>

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_384px]">
        <Card
          description="Search registered URLs, tokens, and state. Inactive and replaced cards cannot be reactivated or reassigned."
          title="Card registry"
        >
          <CardRegistryToolbar
            counts={counts}
            filter={filter}
            onFilterChange={setFilter}
            onQueryChange={setQuery}
            query={query}
          />
          {cards.length === 0 ? (
            <Notice>No registered cards match this search.</Notice>
          ) : (
            <CardTable>
              {cards.map((card) => {
                const profile = getDemoProfileById(state, card.profileId);
                const profileLabel = profile?.draft.name || profile?.draft.slug || "Unassigned";
                return (
                  <CardRow
                    key={card.id}
                    onOpen={() => setSelectedId(card.id)}
                    profileLabel={profileLabel}
                    selected={card.id === detailCard?.id}
                    status={card.status}
                    token={card.token}
                  >
                    <div className="flex flex-wrap gap-2">
                      <CopyCardLinkButton
                        ariaLabel={`Copy claim link for ${card.token}`}
                        token={card.token}
                      />
                      {card.status === "registered" ? (
                        <Button
                          onClick={() =>
                            selectedProfile &&
                            setConfirmation({
                              type: "attach",
                              card,
                              profileId: selectedProfile.id,
                            })
                          }
                          type="button"
                        >
                          Assign to profile
                        </Button>
                      ) : null}
                      {card.claimedAt === undefined &&
                      (card.status === "claimable" || card.status === "active") ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => {
                              const generatedCode = `DEMA${Date.now()
                                .toString(36)
                                .slice(-4)
                                .toUpperCase()
                                .replace(/[IO01]/g, "2")}`;
                              setClaimCode({
                                cardId: card.id,
                                code: generatedCode,
                                expiresAt: Date.now() + 86400000,
                              });
                              updateDemoState((current) => ({
                                ...current,
                                cards: current.cards.map((candidate) =>
                                  candidate.id === card.id
                                    ? {
                                        ...candidate,
                                        claimCode: generatedCode,
                                        claimCodeExpiresAt: Date.now() + 86400000,
                                        claimCodeInvalidatedAt: undefined,
                                        claimChallenge: undefined,
                                        claimChallengeExpiresAt: undefined,
                                        claimedAt: undefined,
                                      }
                                    : candidate,
                                ),
                                audits: [
                                  {
                                    id: `audit-${Date.now()}`,
                                    actor: "admin@tapit.local",
                                    action: "card.claim_code_generated",
                                    target: card.token,
                                    occurredAt: new Date().toISOString(),
                                    after: "generated",
                                  },
                                  ...current.audits,
                                ],
                              }));
                            }}
                            type="button"
                          >
                            Generate claim code
                          </Button>
                          {claimCode?.cardId === card.id ? (
                            <span
                              className="inline-flex min-h-11 items-center gap-1 rounded-control bg-tapit-accent-soft py-1 pl-4 pr-1 font-mono font-semibold text-tapit-accent-strong"
                              aria-label={`Claim code for ${card.token}`}
                            >
                              {claimCode.code}
                              <Button
                                aria-label="Copy claim code"
                                onClick={() => void navigator.clipboard?.writeText(claimCode.code)}
                                type="button"
                                variant="quiet"
                              >
                                <Icon name="link" size={16} />
                              </Button>
                              <Button
                                onClick={() => {
                                  setClaimCode(null);
                                  updateDemoState((current) => ({
                                    ...current,
                                    cards: current.cards.map((candidate) =>
                                      candidate.id === card.id
                                        ? {
                                            ...candidate,
                                            claimCode: undefined,
                                            claimCodeInvalidatedAt: Date.now(),
                                            claimChallenge: undefined,
                                            claimChallengeExpiresAt: undefined,
                                          }
                                        : candidate,
                                    ),
                                    audits: [
                                      {
                                        id: `audit-${Date.now()}`,
                                        actor: "admin@tapit.local",
                                        action: "card.claim_code_invalidated",
                                        target: card.token,
                                        occurredAt: new Date().toISOString(),
                                        after: "invalidated",
                                      },
                                      ...current.audits,
                                    ],
                                  }));
                                  setMessage({
                                    tone: "success",
                                    text: `Claim code for ${card.token} invalidated.`,
                                  });
                                }}
                                type="button"
                                variant="quiet"
                              >
                                Invalidate
                              </Button>
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {card.status === "active" ? (
                        <Button
                          onClick={() => setConfirmation({ type: "deactivate", card })}
                          type="button"
                          variant="danger-soft"
                        >
                          Deactivate
                        </Button>
                      ) : null}
                      {card.status === "active" ? (
                        <Button
                          onClick={() => setConfirmation({ type: "replace", card })}
                          type="button"
                          variant="secondary"
                        >
                          Replace card
                        </Button>
                      ) : null}
                    </div>
                    {card.status === "active" ? (
                      <QrControls cardUrl={card.cardUrl} label={card.token} />
                    ) : null}
                  </CardRow>
                );
              })}
            </CardTable>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {detailCard ? (
            <CardDetail key={detailCard.token} status={detailCard.status} token={detailCard.token}>
              <DetailRow label="Owner" value={detailOwner?.email ?? "Unassigned"} />
              <DetailRow label="Profile" value={detailLabel} />
              <DetailRow
                label="Public effect"
                value={
                  detailCard.status === "active"
                    ? "Resolves to published state"
                    : "No profile content"
                }
              />
              <DetailRow label="History" value={`${detailAuditCount} audit events`} />
            </CardDetail>
          ) : null}
          {confirmation?.type === "replace" ? (
            <Card
              description={`The old ${confirmation.card.token} path will become replaced and the new card will remain assigned to its existing profile.`}
              title="Replacement card URL"
            >
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-0 flex-1 sm:min-w-72">
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
            </Card>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        confirmLabel={
          confirmation?.type === "replace"
            ? "Replace card"
            : confirmation?.type === "attach"
              ? "Attach card"
              : "Deactivate card"
        }
        description={
          confirmation?.type === "replace"
            ? `The old ${confirmation.card.token} path will become replaced and ${replacementUrl.trim()} will become the active card path. The former profile content will no longer be served from the old URL. Continue?`
            : confirmation?.type === "attach"
              ? `Attach ${confirmation.card.token} to ${getDemoProfileById(state, confirmation.profileId)?.draft.name || getDemoProfileById(state, confirmation.profileId)?.draft.slug || "the selected profile"}? ${getDemoProfileById(state, confirmation.profileId)?.status === "published" ? "Its card URL will serve the published profile now; the owner must complete a claim code to unlock card-owner features." : "The card will be claimable and must be activated with a claim code before it can serve profile content."}`
              : confirmation?.type === "deactivate"
                ? `Deactivating ${confirmation.card.token} immediately removes its former profile content from the public path. Continue?`
                : ""
        }
        onCancel={cancelConfirmation}
        onConfirm={confirmAction}
        open={
          confirmation?.type === "deactivate" ||
          confirmation?.type === "attach" ||
          (confirmation?.type === "replace" && replacementReview)
        }
        title={
          confirmation?.type === "replace"
            ? "Replace this card?"
            : confirmation?.type === "attach"
              ? "Confirm card attachment"
              : "Deactivate this card?"
        }
      />
    </div>
  );
}

export function CardsManager() {
  return !isLocalDemoMode() ? <LiveCardsManager /> : <DemoCardsManager />;
}

function LiveCardsManager() {
  const {
    results: cards,
    status: cardsStatus,
    loadMore: loadMoreCards,
  } = usePaginatedQuery(api.cards.adminListPaginated, {}, { initialNumItems: 50 });
  const {
    results: profiles,
    status: profilesStatus,
    loadMore: loadMoreProfiles,
  } = usePaginatedQuery(api.profiles.adminListPaginated, {}, { initialNumItems: 50 });
  const customerPages = usePaginatedQuery(api.customers.list, {}, { initialNumItems: 50 });
  const register = useMutation(api.cards.register);
  const generateCardToken = useMutation(api.cards.generateCardToken);
  const attach = useMutation(api.cards.attach);
  const generateClaimCode = useMutation(api.cards.generateClaimCode);
  const invalidateClaimCode = useMutation(api.cards.invalidateClaimCode);
  const deactivate = useMutation(api.cards.deactivate);
  const replace = useMutation(api.cards.replace);
  const [cardUrl, setCardUrl] = useState("");
  const [replacementUrl, setReplacementUrl] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CardFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<Id<"profiles"> | undefined>();
  const [attachment, setAttachment] = useState<{
    cardId: Id<"cards">;
    token: string;
    profileId: Id<"profiles">;
    profile: string;
    customer: string;
    profileStatus: string;
    cardStatus: string;
  } | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [claimCodes, setClaimCodes] = useState<Record<string, { code: string; expiresAt: number }>>(
    {},
  );

  const orderedCards = useMemo(
    () => [...cards].sort((first, second) => second.createdAt - first.createdAt),
    [cards],
  );
  const counts = useMemo(() => countCards(orderedCards), [orderedCards]);
  const visibleCards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orderedCards.filter(
      (card) =>
        (filter === "all" || cardGroup(card) === filter) &&
        (!normalized ||
          `${card.cardUrl} ${card.token} ${card.status}`.toLowerCase().includes(normalized)),
    );
  }, [filter, orderedCards, query]);
  const detailCard = visibleCards.find((card) => card._id === selectedId) ?? visibleCards[0];
  const assignableProfiles = profiles;
  const availableCustomers = customerPages.results;
  const selectedProfileId = profileId || assignableProfiles[0]?._id;
  const selectedProfileCard =
    selectedProfileId === undefined ? undefined : liveCardForProfile(selectedProfileId);
  const detailProfile = profiles.find((candidate) => candidate._id === detailCard?.profileId);
  const detailOwner = availableCustomers.find(
    (customer) => customer._id === detailProfile?.ownerId,
  );
  const detailLabel = detailProfile?.draft.name || detailProfile?.draft.slug || "Unassigned";

  function liveCardForProfile(profileId: Id<"profiles">) {
    return orderedCards.find(
      (card) =>
        card.profileId === profileId && (card.status === "active" || card.status === "claimable"),
    );
  }

  if (
    cardsStatus === "LoadingFirstPage" ||
    profilesStatus === "LoadingFirstPage" ||
    customerPages.status === "LoadingFirstPage"
  )
    return (
      <div className="flex min-w-0 flex-col gap-8 pt-2">
        <AdminPageHeader
          description="Register pre-encoded NFC cards, hand out claim codes and replace lost cards."
          title="Cards"
        />
        <Notice>Loading card registry…</Notice>
      </div>
    );
  async function run(operation: () => Promise<unknown>, success: string) {
    setPending(true);
    setMessage(null);
    try {
      await operation();
      setMessage({ tone: "success", text: success });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Card operation failed.",
      });
    } finally {
      setPending(false);
    }
  }
  function registerCard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = cardTokenFromUrl(cardUrl);
    if (!token)
      return setMessage({ tone: "error", text: "Enter a card URL with a /c/<unique-token> path." });
    void run(async () => {
      const cardId = await register({
        cardUrl: new URL(cardUrl.trim(), window.location.origin).toString(),
        token,
      });
      setCardUrl("");
      const profile = assignableProfiles.find((candidate) => candidate._id === selectedProfileId);
      if (profile === undefined || selectedProfileId === undefined) return;
      setAttachment({
        cardId,
        token,
        profileId: profile._id,
        profile: profile.draft.name || profile.draft.slug || "selected profile",
        customer:
          availableCustomers.find((candidate) => candidate._id === profile.ownerId)?.email ||
          "selected customer",
        profileStatus: profile.status,
        cardStatus: "registered",
      });
    }, `Card ${token} registered and ready for assignment.`);
  }

  function generateCardUrl() {
    void run(async () => {
      const token = await generateCardToken({});
      setCardUrl(cardUrlFromToken(token));
    }, "Generated a secure card URL. Review it, then register the card.");
  }
  return (
    <div className="flex min-w-0 flex-col gap-8 pt-2">
      <AdminPageHeader
        description="Register pre-encoded NFC cards, hand out claim codes and replace lost cards."
        title="Cards"
      />
      <section className="flex min-w-0 flex-col gap-4 rounded-card bg-tapit-accent-soft p-6">
        <h2 className="text-lg font-semibold text-tapit-ink">Register card URL</h2>
        <form className="flex flex-wrap items-end gap-4" onSubmit={registerCard}>
          <div className="min-w-0 flex-1 sm:min-w-72">
            <Field
              id="live-card-url"
              label="Pre-encoded card URL"
              onChange={(event) => setCardUrl(event.target.value)}
              placeholder="/c/card-token"
              value={cardUrl}
            />
          </div>
          <div className="min-w-0 sm:min-w-64">
            <SelectField
              id="live-card-assignment-profile"
              label="Assignment profile"
              onChange={(event) => setProfileId(event.target.value as Id<"profiles">)}
              value={selectedProfileId ?? ""}
            >
              {assignableProfiles.map((candidate) =>
                (() => {
                  const attachedCard = liveCardForProfile(candidate._id);
                  return (
                    <option key={candidate._id} value={candidate._id}>
                      {candidate.draft.name || candidate.draft.slug} · {candidate.slug} ·{" "}
                      {availableCustomers.find((customer) => customer._id === candidate.ownerId)
                        ?.email ?? "unassigned"}
                      {attachedCard ? ` · ${attachedCard.status}: ${attachedCard.token}` : ""}
                    </option>
                  );
                })(),
              )}
            </SelectField>
            {profilesStatus === "CanLoadMore" || profilesStatus === "LoadingMore" ? (
              <Button
                className="mt-2"
                disabled={profilesStatus === "LoadingMore"}
                onClick={() => loadMoreProfiles(50)}
                type="button"
                variant="quiet"
              >
                {profilesStatus === "LoadingMore" ? "Loading profiles…" : "Load more profiles"}
              </Button>
            ) : null}
            {customerPages.status === "CanLoadMore" || customerPages.status === "LoadingMore" ? (
              <Button
                className="mt-2"
                disabled={customerPages.status === "LoadingMore"}
                onClick={() => customerPages.loadMore(50)}
                type="button"
                variant="quiet"
              >
                {customerPages.status === "LoadingMore"
                  ? "Loading customers…"
                  : "Load more customers"}
              </Button>
            ) : null}
          </div>
          <Button disabled={pending} onClick={generateCardUrl} type="button" variant="secondary">
            Generate secure URL
          </Button>
          <Button disabled={pending} type="submit">
            Register card
          </Button>
        </form>
        {selectedProfileId && liveCardForProfile(selectedProfileId) ? (
          <Notice tone="error">
            This profile already has {liveCardForProfile(selectedProfileId)!.status} card{" "}
            <span className="font-mono">{liveCardForProfile(selectedProfileId)!.token}</span>. A
            second card cannot be attached; use Replace on the existing card when this is a
            physical-card replacement.
          </Notice>
        ) : null}
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      </section>

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_384px]">
        <Card description="Inactive and replaced cards cannot be reused." title="Card registry">
          <CardRegistryToolbar
            counts={counts}
            filter={filter}
            onFilterChange={setFilter}
            onQueryChange={setQuery}
            query={query}
          />
          {visibleCards.length === 0 ? (
            <Notice>
              {orderedCards.length === 0
                ? "No registered cards."
                : "No registered cards match this search."}
            </Notice>
          ) : (
            <CardTable>
              {visibleCards.map((card) => {
                const profile = profiles.find((candidate) => candidate._id === card.profileId);
                const profileLabel = profile?.draft.name || profile?.draft.slug || "Unassigned";
                return (
                  <CardRow
                    key={card._id}
                    onOpen={() => setSelectedId(card._id)}
                    profileLabel={profileLabel}
                    selected={card._id === detailCard?._id}
                    status={card.status}
                    token={card.token}
                  >
                    <div className="flex flex-wrap gap-2">
                      <CopyCardLinkButton
                        ariaLabel={`Copy claim link for ${card.token}`}
                        token={card.token}
                      />
                      {card.status === "registered" ? (
                        <>
                          <select
                            aria-label={`Assign ${card.token}`}
                            className="min-h-11 rounded-control bg-tapit-soft-surface px-4 text-sm text-tapit-ink"
                            onChange={(event) => setProfileId(event.target.value as Id<"profiles">)}
                            value={selectedProfileId ?? ""}
                          >
                            {assignableProfiles.map((candidate) =>
                              (() => {
                                const attachedCard = liveCardForProfile(candidate._id);
                                return (
                                  <option key={candidate._id} value={candidate._id}>
                                    {candidate.draft.name || candidate.draft.slug} ·{" "}
                                    {candidate.slug} ·{" "}
                                    {availableCustomers.find(
                                      (customer) => customer._id === candidate.ownerId,
                                    )?.email ?? "unassigned"}
                                    {attachedCard
                                      ? ` · ${attachedCard.status}: ${attachedCard.token}`
                                      : ""}
                                  </option>
                                );
                              })(),
                            )}
                          </select>
                          {selectedProfileCard ? (
                            <p className="basis-full text-sm text-tapit-danger">
                              This profile already has {selectedProfileCard.status} card{" "}
                              {selectedProfileCard.token}. Use Replace on that card instead.
                            </p>
                          ) : null}
                          <Button
                            disabled={
                              pending || !selectedProfileId || selectedProfileCard !== undefined
                            }
                            onClick={() =>
                              selectedProfileId &&
                              setAttachment({
                                cardId: card._id,
                                token: card.token,
                                profileId: selectedProfileId,
                                profile:
                                  profiles.find((candidate) => candidate._id === selectedProfileId)
                                    ?.draft.name ||
                                  profiles.find((candidate) => candidate._id === selectedProfileId)
                                    ?.draft.slug ||
                                  "selected profile",
                                customer:
                                  availableCustomers.find(
                                    (candidate) =>
                                      candidate._id ===
                                      profiles.find(
                                        (candidate) => candidate._id === selectedProfileId,
                                      )?.ownerId,
                                  )?.email || "selected customer",
                                profileStatus:
                                  profiles.find((candidate) => candidate._id === selectedProfileId)
                                    ?.status || "unknown",
                                cardStatus: card.status,
                              })
                            }
                            type="button"
                          >
                            <Icon name="caretRight" size={16} />
                            Assign
                          </Button>
                        </>
                      ) : null}
                      {card.claimCodeClaimedAt === undefined &&
                      (card.status === "claimable" || card.status === "active") ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            disabled={pending}
                            onClick={() =>
                              void run(async () => {
                                const result = await generateClaimCode({ cardId: card._id });
                                setClaimCodes((current) => ({ ...current, [card._id]: result }));
                              }, `A new claim code for ${card.token} is ready to share.`)
                            }
                            type="button"
                          >
                            {claimCodes[card._id] ? "Regenerate claim code" : "Generate claim code"}
                          </Button>
                          {claimCodes[card._id]
                            ? (() => {
                                const generated = claimCodes[card._id]!;
                                return (
                                  <>
                                    <code className="inline-flex min-h-11 items-center rounded-control bg-tapit-accent-soft px-4 font-semibold text-tapit-accent-strong">
                                      {generated.code}
                                    </code>
                                    <Button
                                      aria-label={`Copy claim code for ${card.token}`}
                                      onClick={() =>
                                        void navigator.clipboard?.writeText(generated.code)
                                      }
                                      type="button"
                                      variant="secondary"
                                    >
                                      <Icon name="link" size={16} />
                                      Copy
                                    </Button>
                                    <Button
                                      onClick={() =>
                                        void run(
                                          () => invalidateClaimCode({ cardId: card._id }),
                                          `Claim code for ${card.token} invalidated.`,
                                        )
                                      }
                                      type="button"
                                      variant="quiet"
                                    >
                                      Invalidate
                                    </Button>
                                  </>
                                );
                              })()
                            : null}
                        </div>
                      ) : null}
                      {card.status === "active" ? (
                        <Button
                          disabled={pending}
                          onClick={() =>
                            void run(
                              () => deactivate({ cardId: card._id }),
                              `Card ${card.token} deactivated.`,
                            )
                          }
                          type="button"
                          variant="danger-soft"
                        >
                          Deactivate
                        </Button>
                      ) : null}
                      {card.status === "active" ? (
                        <>
                          <input
                            aria-label={`Replacement URL for ${card.token}`}
                            className="min-h-11 min-w-0 flex-1 basis-56 rounded-control bg-tapit-soft-surface px-4 text-sm text-tapit-ink placeholder:text-tapit-muted"
                            onChange={(event) => setReplacementUrl(event.target.value)}
                            placeholder="/c/replacement-token"
                            value={replacementUrl}
                          />
                          <Button
                            disabled={pending}
                            onClick={() => {
                              const token = cardTokenFromUrl(replacementUrl);
                              if (!token)
                                return setMessage({
                                  tone: "error",
                                  text: "Enter a valid replacement card URL.",
                                });
                              void run(
                                () =>
                                  replace({
                                    oldCardId: card._id,
                                    newCardUrl: new URL(
                                      replacementUrl.trim(),
                                      window.location.origin,
                                    ).toString(),
                                    newToken: token,
                                  }).then(() => setReplacementUrl("")),
                                `Card ${card.token} replaced.`,
                              );
                            }}
                            type="button"
                            variant="secondary"
                          >
                            Replace
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </CardRow>
                );
              })}
            </CardTable>
          )}
          {cardsStatus === "CanLoadMore" || cardsStatus === "LoadingMore" ? (
            <Button
              className="self-start"
              disabled={cardsStatus === "LoadingMore"}
              onClick={() => loadMoreCards(50)}
              type="button"
              variant="secondary"
            >
              {cardsStatus === "LoadingMore" ? "Loading cards…" : "Load more cards"}
            </Button>
          ) : null}
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {detailCard ? (
            <CardDetail key={detailCard.token} status={detailCard.status} token={detailCard.token}>
              <DetailRow label="Owner" value={detailOwner?.email ?? "Unassigned"} />
              <DetailRow label="Profile" value={detailLabel} />
            </CardDetail>
          ) : null}
        </div>
      </div>
      <ConfirmDialog
        confirmLabel="Confirm attachment"
        description={
          attachment
            ? `Attach ${attachment.token} to ${attachment.customer} / ${attachment.profile}? ${attachment.profileStatus === "published" ? "Its card URL can serve the published profile now; the owner must complete a claim code to unlock card-owner features." : "The card must be activated with a claim code before it can serve profile content."} Profile status: ${attachment.profileStatus}. Current card status: ${attachment.cardStatus}. The assignment will be recorded in the audit log.`
            : ""
        }
        onCancel={() => setAttachment(null)}
        onConfirm={() => {
          if (attachment === null) return;
          const pendingAttachment = attachment;
          setAttachment(null);
          void run(
            () =>
              attach({ cardId: pendingAttachment.cardId, profileId: pendingAttachment.profileId }),
            `Card ${pendingAttachment.token} is attached to ${pendingAttachment.profile}. Generate and share a claim code so the owner can unlock card-owner features.`,
          );
        }}
        open={attachment !== null}
        title="Confirm card attachment"
      />
    </div>
  );
}
