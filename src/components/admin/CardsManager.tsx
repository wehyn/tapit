"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";

import {
  canTransitionCard,
  isActiveAccount,
  transitionCard,
  validatePublication,
} from "@/lib/domain";
import { cardTokenFromUrl, cardUrlFromToken, normalizeCardUrl } from "@/lib/card-url";
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
  | { type: "deactivate" | "replace" | "archive" | "reactivate"; card: DemoCard }
  | { type: "attach"; card: DemoCard; profileId: string }
  | null;

type CardGroup = "unclaimed" | "claimed" | "inactive";
type CardFilter = "all" | CardGroup | "archived";

const cardFilterOptions: readonly { value: CardFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unclaimed", label: "Unclaimed" },
  { value: "claimed", label: "Claimed" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

const cardRowColumns = "grid-cols-[minmax(0,1.6fr)_112px_minmax(0,1fr)_16px]";

type CardGroupSource = {
  status: string;
  claimedAt?: number;
  claimCodeClaimedAt?: number;
  archivedAt?: number;
};

function cardGroup(card: CardGroupSource): CardGroup {
  if (card.status === "inactive" || card.status === "replaced") return "inactive";
  if ((card.claimedAt ?? card.claimCodeClaimedAt) !== undefined) return "claimed";
  return "unclaimed";
}

function countCards(cards: CardGroupSource[]): Record<CardFilter, number> {
  const counts: Record<CardFilter, number> = {
    all: 0,
    unclaimed: 0,
    claimed: 0,
    inactive: 0,
    archived: 0,
  };
  for (const card of cards) {
    if (card.archivedAt !== undefined) counts.archived += 1;
    else {
      counts.all += 1;
      counts[cardGroup(card)] += 1;
    }
  }
  return counts;
}

function demoClaimCode(token: string, generation: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const tokenSuffix = token
    .replace(/[^A-HJ-NP-Z2-9]/gi, "")
    .toUpperCase()
    .slice(-4)
    .padStart(4, "2");
  let serial = [...tokenSuffix].reduce(
    (value, character) => value * alphabet.length + alphabet.indexOf(character),
    0,
  );
  // shortcut: the demo suffix wraps after 32^4 generations per card; widen it if that matters.
  serial = (serial + generation - 1) % alphabet.length ** 4;
  let suffix = "";
  for (let index = 0; index < 4; index += 1) {
    suffix = `${alphabet[serial % alphabet.length]}${suffix}`;
    serial = Math.floor(serial / alphabet.length);
  }
  return `DEMA${suffix}`;
}

function cardMatchesFilter(card: CardGroupSource, filter: CardFilter): boolean {
  return filter === "archived"
    ? card.archivedAt !== undefined
    : card.archivedAt === undefined && (filter === "all" || cardGroup(card) === filter);
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
  const normalized = normalizeCardUrl(value);
  if (!normalized) return value;
  const parsed = new URL(normalized);
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
  cardUrl,
  children,
  onOpen,
  profileLabel,
  selected,
  status,
  token,
}: {
  cardUrl: string;
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
          <QrControls cardUrl={cardUrl} label={token} />
        </div>
      </details>
    </article>
  );
}

function CopyCardLinkButton({
  ariaLabel,
  token,
  cardUrl,
}: {
  ariaLabel?: string;
  token: string;
  cardUrl?: string;
}) {
  const [copyMessage, setCopyMessage] = useState<{
    tone: "success" | "error";
    text: string;
    url?: string;
  } | null>(null);

  async function copyCardLink() {
    const url = cardUrl === undefined ? cardUrlFromToken(token) : normalizeCardUrl(cardUrl);
    if (!url) {
      setCopyMessage({ tone: "error", text: "This card URL is invalid." });
      return;
    }
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
  cardUrl,
  children,
  status,
  token,
}: {
  cardUrl: string;
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
      <CopyCardLinkButton cardUrl={cardUrl} token={token} />
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
  } | null>(null);
  const selectedProfile = getDemoProfileById(state, selectedProfileId) ?? profiles[0];

  const counts = useMemo(() => countCards(state.cards), [state.cards]);

  const cards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return state.cards
      .map((card, index) => ({ card, createdAt: card.createdAt ?? index }))
      .filter(
        ({ card }) =>
          cardMatchesFilter(card, filter) &&
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
  const correctionRequests = (state.cardCorrectionRequests ?? []).filter(
    (request) => request.status === "pending",
  );
  const confirmationCorrectionPending =
    (confirmation?.type === "deactivate" || confirmation?.type === "replace") &&
    correctionRequests.some((request) => request.token === confirmation.card.token);

  function correctDemoAssignment(requestId: string) {
    let applied = false;
    let conflict = false;
    let token = "";
    updateDemoState((current) => {
      const currentRequest = current.cardCorrectionRequests?.find(
        (candidate) => candidate.id === requestId && candidate.status === "pending",
      );
      const requester = current.customers.find(
        (candidate) => candidate.email === currentRequest?.requestedBy,
      );
      const currentTarget = currentRequest?.profileId
        ? getDemoProfileById(current, currentRequest.profileId)
        : undefined;
      const currentCard = current.cards.find(
        (candidate) => candidate.token === currentRequest?.token,
      );
      if (
        !currentRequest ||
        !requester ||
        requester.role !== "customer" ||
        requester.status !== "active" ||
        requester.deletionStatus !== "active" ||
        !currentTarget ||
        currentTarget.ownerId !== requester.id ||
        requester.profileId !== currentTarget.id ||
        !currentCard ||
        (currentCard.status !== "active" && currentCard.status !== "claimable") ||
        currentCard.claimedAt !== undefined ||
        currentCard.claimCodeInvalidatedAt !== undefined
      )
        return current;
      conflict = current.cards.some(
        (candidate) =>
          candidate.id !== currentCard.id &&
          candidate.profileId === currentTarget.id &&
          (candidate.status === "active" || candidate.status === "claimable"),
      );
      if (conflict) return current;
      token = currentCard.token;
      applied = true;
      return {
        ...current,
        cards: current.cards.map((candidate) =>
          candidate.id === currentCard.id
            ? {
                ...candidate,
                profileId: currentTarget.id,
                status: currentTarget.status === "published" ? "active" : "claimable",
              }
            : candidate,
        ),
        cardCorrectionRequests: (current.cardCorrectionRequests ?? []).map((candidate) =>
          candidate.id === requestId ? { ...candidate, status: "corrected" } : candidate,
        ),
        audits: [
          {
            id: `audit-${Date.now()}`,
            actor: "admin@tapit.local",
            action: "card.assignment_corrected",
            target: `${currentCard.token} → ${currentTarget.draft.name || currentTarget.draft.slug}`,
            occurredAt: new Date().toISOString(),
          },
          ...current.audits,
        ],
      };
    });
    if (!applied) {
      if (conflict)
        setMessage({
          tone: "error",
          text: "This requester already has an active or claimable card. The correction request remains pending.",
        });
      return;
    }
    setMessage({ tone: "success", text: `Assignment for ${token} corrected.` });
  }

  function validateCardUrl(value: string): string | null {
    const normalized = normalizeCardUrl(value);
    const token = normalized && cardTokenFromUrl(normalized);
    if (!normalized || !token) return "Enter a canonical card URL with a /c/<unique-token> path.";
    if (state.cards.some((card) => cardUrlIdentity(card.cardUrl) === cardUrlIdentity(normalized)))
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
    const normalizedUrl = normalizeCardUrl(cardUrl);
    const token = normalizedUrl && cardTokenFromUrl(normalizedUrl);
    if (!normalizedUrl || !token) return;
    let applied = false;
    let rejection: string | null = null;
    updateDemoState((current) => {
      if (current.cards.some((card) => card.token === token)) {
        rejection = `The card token “${token}” is already registered. Enter a unique token.`;
        return current;
      }
      if (current.cards.some((card) => card.id === `card-${token}`)) {
        rejection = "That card ID is already registered. Enter a unique token.";
        return current;
      }
      if (
        current.cards.some(
          (card) => cardUrlIdentity(card.cardUrl) === cardUrlIdentity(normalizedUrl),
        )
      ) {
        rejection = "That card URL is already registered.";
        return current;
      }
      applied = true;
      const nextCard: DemoCard = {
        id: `card-${token}`,
        token,
        cardUrl: normalizedUrl,
        status: "registered",
        createdAt: Math.max(0, ...current.cards.map((card) => card.createdAt ?? 0)) + 1,
      };
      return {
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
      };
    });
    if (!applied) {
      if (rejection) setMessage({ tone: "error", text: rejection });
      return;
    }
    setCardUrl("");
    setMessage({ tone: "success", text: `Card ${token} registered and ready for assignment.` });
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
    let applied = false;
    let assignmentName = "";
    let assignedStatus: "active" | "claimable" | null = null;
    updateDemoState((current) => {
      const currentCard = current.cards.find((candidate) => candidate.id === card.id);
      const currentProfile = getDemoProfileById(current, profileId);
      const currentOwner = current.customers.find(
        (customer) => customer.id === currentProfile?.ownerId,
      );
      if (
        !currentCard ||
        currentCard.profileId !== undefined ||
        !currentProfile ||
        !canTransitionCard(
          currentCard.status,
          currentProfile.status === "published" ? "active" : "claimable",
        ) ||
        currentOwner === undefined ||
        currentOwner.status === "deleted" ||
        currentOwner.deletionStatus !== "active"
      )
        return current;
      assignedStatus = currentProfile.status === "published" ? "active" : "claimable";
      assignmentName = currentProfile.draft.name || currentProfile.draft.slug;
      const nextCard = transitionCard(currentCard, assignedStatus, currentProfile.id);
      applied = true;
      return {
        ...current,
        cards: current.cards.map((candidate) =>
          candidate.id === currentCard.id ? { ...candidate, ...nextCard } : candidate,
        ),
        audits: [
          {
            id: `audit-${Date.now()}`,
            actor: "admin@tapit.local",
            action: "card.assigned",
            target: `${currentCard.token} → ${assignmentName}`,
            occurredAt: new Date().toISOString(),
            before: "registered",
            after: assignedStatus,
          },
          ...current.audits,
        ],
      };
    });
    if (!applied || assignedStatus === null) return;
    setConfirmation(null);
    setMessage({
      tone: "success",
      text:
        assignedStatus === "active"
          ? `Card ${card.token} is active for ${assignmentName}. Generate and share a claim code so the owner can claim the card and its URL can show the published profile.`
          : `Card ${card.token} is claimable and assigned to ${assignmentName}. It must be activated with a claim code.`,
    });
  }

  function deactivateCard(card: DemoCard) {
    if (
      state.cardCorrectionRequests?.some(
        (request) => request.token === card.token && request.status === "pending",
      )
    )
      return;
    let applied = false;
    updateDemoState((current) => {
      const currentCard = current.cards.find((candidate) => candidate.id === card.id);
      if (
        !currentCard ||
        currentCard.status !== "active" ||
        current.cardCorrectionRequests?.some(
          (request) => request.token === card.token && request.status === "pending",
        )
      )
        return current;
      applied = true;
      const nextCard = transitionCard(currentCard, "inactive");
      return {
        ...current,
        cards: current.cards.map((candidate) =>
          candidate.id === currentCard.id ? { ...candidate, ...nextCard } : candidate,
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
      };
    });
    if (!applied) return;
    setConfirmation(null);
    setMessage({
      tone: "success",
      text: `Card ${card.token} is inactive. Its public path no longer exposes profile content.`,
    });
  }

  function replaceCard(card: DemoCard) {
    if (
      state.cardCorrectionRequests?.some(
        (request) => request.token === card.token && request.status === "pending",
      )
    )
      return;
    const error = validateCardUrl(replacementUrl);
    if (error) {
      setMessage({ tone: "error", text: error });
      return;
    }
    const replacementUrlValue = normalizeCardUrl(replacementUrl);
    const token = replacementUrlValue && cardTokenFromUrl(replacementUrlValue);
    if (!replacementUrlValue || !token) return;
    let applied = false;
    let rejection: string | null = null;
    let replacementProfileName = "its existing profile";
    updateDemoState((current) => {
      const currentCard = current.cards.find((candidate) => candidate.id === card.id);
      const replacementId = `card-${token}-replacement`;
      const replacementProfile = getDemoProfileById(current, currentCard?.profileId);
      const replacementOwner = current.customers.find(
        (customer) => customer.id === replacementProfile?.ownerId,
      );
      if (
        !currentCard ||
        currentCard.status !== "active" ||
        current.cardCorrectionRequests?.some(
          (request) => request.token === card.token && request.status === "pending",
        ) ||
        !replacementProfile ||
        !isActiveAccount(replacementOwner?.status, replacementOwner?.deletionStatus)
      )
        return current;
      if (
        current.cards.some(
          (candidate) =>
            candidate.id !== currentCard.id &&
            (candidate.token === token ||
              cardUrlIdentity(candidate.cardUrl) === cardUrlIdentity(replacementUrlValue)),
        )
      ) {
        rejection = "That replacement card URL or token is already registered.";
        return current;
      }
      if (current.cards.some((candidate) => candidate.id === replacementId)) {
        rejection = "That replacement card ID is already registered. Enter a unique token.";
        return current;
      }
      const replacement: DemoCard = {
        id: replacementId,
        token,
        cardUrl: replacementUrlValue,
        status: "active",
        profileId: currentCard.profileId,
        ...(currentCard.claimedAt === undefined
          ? {
              claimCode: currentCard.claimCode,
              claimCodeGeneration: currentCard.claimCodeGeneration,
              claimCodeExpiresAt: currentCard.claimCodeExpiresAt,
              claimCodeInvalidatedAt: currentCard.claimCodeInvalidatedAt,
            }
          : { claimedAt: currentCard.claimedAt }),
      };
      const retired = transitionCard(currentCard, "replaced", undefined, replacementId);
      replacementProfileName =
        replacementProfile.draft.name || replacementProfile.draft.slug || "its existing profile";
      applied = true;
      return {
        ...current,
        cards: [
          ...current.cards.map((candidate) =>
            candidate.id === currentCard.id ? { ...candidate, ...retired } : candidate,
          ),
          replacement,
        ],
        audits: [
          {
            id: `audit-${Date.now()}-new`,
            actor: "admin@tapit.local",
            action: "card.assigned",
            target: `${replacement.token} → ${replacementProfileName}`,
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
      };
    });
    if (!applied) {
      if (rejection) setMessage({ tone: "error", text: rejection });
      return;
    }
    setReplacementUrl("");
    setConfirmation(null);
    setReplacementReview(false);
    setMessage({
      tone: "success",
      text: `Card ${card.token} was replaced. ${token} is active; the old path is inactive.`,
    });
  }

  function archiveCard(card: DemoCard) {
    try {
      updateDemoState((current) => {
        const currentCard = current.cards.find((candidate) => candidate.id === card.id);
        if (
          !currentCard ||
          currentCard.archivedAt !== undefined ||
          (currentCard.status !== "inactive" && currentCard.status !== "replaced")
        )
          throw new Error("This card is no longer available to archive.");
        if (
          currentCard.correctionRequestedAt !== undefined ||
          current.cardCorrectionRequests?.some(
            (request) => request.token === currentCard.token && request.status === "pending",
          )
        )
          throw new Error("Resolve the pending assignment correction before archiving this card.");
        const now = Date.now();
        return {
          ...current,
          cards: current.cards.map((candidate) =>
            candidate.id === card.id ? { ...candidate, archivedAt: now } : candidate,
          ),
          audits: [
            {
              id: `audit-${now}`,
              actor: "admin@tapit.local",
              action: "card.archived",
              target: card.token,
              occurredAt: new Date(now).toISOString(),
              before: currentCard.status,
              after: "archived",
            },
            ...current.audits,
          ],
        };
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "The card could not be archived.",
      });
      setConfirmation(null);
      return;
    }
    setConfirmation(null);
    setMessage({
      tone: "success",
      text: `Card ${card.token} archived. Its URL remains inactive and its token stays reserved.`,
    });
  }

  function restoreCard(card: DemoCard) {
    try {
      updateDemoState((current) => {
        const currentCard = current.cards.find((candidate) => candidate.id === card.id);
        if (!currentCard || currentCard.archivedAt === undefined)
          throw new Error("This card is no longer archived.");
        const now = Date.now();
        return {
          ...current,
          cards: current.cards.map((candidate) => {
            if (candidate.id !== card.id) return candidate;
            const restored = { ...candidate };
            delete restored.archivedAt;
            return restored;
          }),
          audits: [
            {
              id: `audit-${now}`,
              actor: "admin@tapit.local",
              action: "card.restored",
              target: card.token,
              occurredAt: new Date(now).toISOString(),
              before: "archived",
              after: currentCard.status,
            },
            ...current.audits,
          ],
        };
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "The card could not be restored.",
      });
      return;
    }
    setMessage({ tone: "success", text: `Card ${card.token} restored as ${card.status}.` });
  }

  function reactivateCard(card: DemoCard) {
    const now = Date.now();
    try {
      updateDemoState((current) => {
        const currentCard = current.cards.find((candidate) => candidate.id === card.id);
        if (
          !currentCard ||
          currentCard.archivedAt !== undefined ||
          (currentCard.status !== "inactive" && currentCard.status !== "replaced")
        )
          throw new Error("This card is no longer eligible for reactivation.");
        if (
          currentCard.correctionRequestedAt !== undefined ||
          current.cardCorrectionRequests?.some(
            (request) => request.token === currentCard.token && request.status === "pending",
          )
        )
          throw new Error(
            "Resolve the pending assignment correction before reactivating this card.",
          );
        const profile = getDemoProfileById(current, currentCard.profileId);
        const owner = current.customers.find((customer) => customer.id === profile?.ownerId);
        if (!profile || !isActiveAccount(owner?.status, owner?.deletionStatus))
          throw new Error(
            "The assigned profile must have an active owner to reactivate this card.",
          );
        if (
          profile.status === "published" &&
          (!profile.published || validatePublication(profile.published, null).length > 0)
        )
          throw new Error("The assigned profile has no valid published snapshot.");
        const status = profile.status === "published" ? "active" : "claimable";
        return {
          ...current,
          cards: current.cards.map((candidate) =>
            candidate.id === card.id
              ? {
                  ...candidate,
                  status,
                  claimCode: undefined,
                  claimCodeExpiresAt: undefined,
                  claimCodeInvalidatedAt: now,
                  claimChallenge: undefined,
                  claimChallengeExpiresAt: undefined,
                  claimedAt: undefined,
                }
              : candidate,
          ),
          customers: current.customers.map((customer) => ({
            ...customer,
            claimedCardIds: customer.claimedCardIds?.filter((id) => id !== card.id),
          })),
          audits: [
            {
              id: `audit-${now}`,
              actor: "admin@tapit.local",
              action: "card.reactivated",
              target: card.token,
              occurredAt: new Date(now).toISOString(),
              before: currentCard.status,
              after: status,
            },
            ...current.audits,
          ],
        };
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "The card could not be reactivated.",
      });
      setConfirmation(null);
      return;
    }
    setClaimCode((current) => (current?.cardId === card.id ? null : current));
    setConfirmation(null);
    setMessage({
      tone: "success",
      text: `Card ${card.token} reactivated. Generate a fresh claim code for the profile owner.`,
    });
  }

  function confirmAction() {
    if (confirmation === null) return;
    if (confirmation.type === "deactivate") deactivateCard(confirmation.card);
    else if (confirmation.type === "replace") replaceCard(confirmation.card);
    else if (confirmation.type === "attach") assignCard(confirmation.card, confirmation.profileId);
    else if (confirmation.type === "archive") archiveCard(confirmation.card);
    else if (confirmation.type === "reactivate") reactivateCard(confirmation.card);
  }

  function reviewReplacement() {
    if (confirmation?.type !== "replace") return;
    if (confirmationCorrectionPending) return;
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
          Registration leaves a card unassigned. Assignments and replacements are administrator-only
          and auditable.
        </p>
        <form className="flex flex-wrap items-end gap-4" onSubmit={registerCard}>
          <div className="min-w-0 flex-1 sm:min-w-72">
            <Field
              id="card-url"
              label="Pre-encoded card URL"
              onChange={(event) => setCardUrl(event.target.value)}
              placeholder="/c/card-token or https://tapit-eosin.vercel.app/c/card-token"
              value={cardUrl}
            />
          </div>
          <Button onClick={generateCardUrl} type="button" variant="secondary">
            Generate secure URL
          </Button>
          <Button type="submit">Register card</Button>
        </form>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      </section>

      {correctionRequests.length ? (
        <section className="grid gap-3 rounded-card bg-tapit-surface p-4 shadow-card">
          <h2 className="text-lg font-semibold text-tapit-ink">Assignment corrections</h2>
          {correctionRequests.map((request) => {
            const profile = request.profileId
              ? getDemoProfileById(state, request.profileId)
              : undefined;
            const card = state.cards.find((candidate) => candidate.token === request.token);
            const conflict = Boolean(
              profile &&
              state.cards.some(
                (candidate) =>
                  candidate.id !== card?.id &&
                  candidate.profileId === profile.id &&
                  (candidate.status === "active" || candidate.status === "claimable"),
              ),
            );
            const invalidRequest =
              !card || (card.status !== "active" && card.status !== "claimable") || !profile;
            return (
              <article
                className="grid gap-2 rounded-control bg-tapit-soft-surface p-4"
                key={request.id}
              >
                <p className="font-semibold text-tapit-ink">
                  {request.token} · requested by {request.requestedBy}
                </p>
                <p className="text-sm text-tapit-muted">
                  Current assignment:{" "}
                  {card?.profileId
                    ? getDemoProfileById(state, card.profileId)?.draft.name || "Unknown profile"
                    : "Unassigned"}{" "}
                  · Requested profile: {profile?.draft.name || "Unknown profile"} (/
                  {profile?.draft.slug})
                </p>
                {conflict ? (
                  <Notice tone="error">
                    Requester already has an active or claimable card. This request remains pending.
                  </Notice>
                ) : null}
                <Button
                  disabled={invalidRequest || conflict}
                  onClick={() => correctDemoAssignment(request.id)}
                  type="button"
                >
                  Correct assignment
                </Button>
              </article>
            );
          })}
        </section>
      ) : null}

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_384px]">
        <Card description="Search registered URLs, tokens, and state." title="Card registry">
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
                const correctionPending = state.cardCorrectionRequests?.some(
                  (request) => request.token === card.token && request.status === "pending",
                );
                return (
                  <CardRow
                    key={card.id}
                    cardUrl={card.cardUrl}
                    onOpen={() => setSelectedId(card.id)}
                    profileLabel={profileLabel}
                    selected={card.id === detailCard?.id}
                    status={card.status}
                    token={card.token}
                  >
                    <div className="flex flex-wrap gap-2">
                      <CopyCardLinkButton
                        ariaLabel={`Copy card URL for ${card.token}`}
                        token={card.token}
                        cardUrl={card.cardUrl}
                      />
                      {filter === "archived" ? (
                        <Button onClick={() => restoreCard(card)} type="button" variant="secondary">
                          Restore
                        </Button>
                      ) : null}
                      {filter !== "archived" &&
                      (card.status === "inactive" || card.status === "replaced") ? (
                        <>
                          <Button
                            disabled={correctionPending}
                            onClick={() => setConfirmation({ type: "archive", card })}
                            type="button"
                            variant="secondary"
                          >
                            Remove
                          </Button>
                          <Button
                            disabled={correctionPending}
                            onClick={() => setConfirmation({ type: "reactivate", card })}
                            type="button"
                          >
                            Reactivate
                          </Button>
                        </>
                      ) : null}
                      {card.status === "registered" ? (
                        <>
                          <SelectField
                            id={`assignment-target-${card.id}`}
                            label={`Assign ${card.token} to profile`}
                            onChange={(event) => setSelectedProfileId(event.target.value)}
                            value={selectedProfileId}
                          >
                            {profiles.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.draft.name || "Unnamed profile"} · {profile.draft.slug}
                              </option>
                            ))}
                          </SelectField>
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
                        </>
                      ) : null}
                      {card.claimedAt === undefined &&
                      (card.status === "registered" ||
                        card.status === "claimable" ||
                        card.status === "active") ? (
                        <div className="flex flex-wrap gap-2">
                          {correctionPending ? (
                            <Notice>
                              Resolve the pending assignment correction before changing its claim
                              code.
                            </Notice>
                          ) : null}
                          <Button
                            disabled={correctionPending}
                            onClick={() => {
                              let generatedCode: string | null = null;
                              updateDemoState((current) => {
                                const currentCard = current.cards.find(
                                  (candidate) => candidate.id === card.id,
                                );
                                if (
                                  !currentCard ||
                                  (currentCard.status !== "registered" &&
                                    currentCard.status !== "claimable" &&
                                    currentCard.status !== "active") ||
                                  currentCard.claimedAt !== undefined ||
                                  current.cardCorrectionRequests?.some(
                                    (request) =>
                                      request.token === card.token && request.status === "pending",
                                  )
                                ) {
                                  return current;
                                }
                                const generation =
                                  (currentCard.claimCodeGeneration ??
                                    (currentCard.claimCode ? 1 : 0)) + 1;
                                generatedCode = demoClaimCode(card.token, generation);
                                return {
                                  ...current,
                                  cards: current.cards.map((candidate) =>
                                    candidate.id === currentCard.id
                                      ? {
                                          ...candidate,
                                          claimCodeGeneration: generation,
                                          claimCode: generatedCode!,
                                          claimCodeExpiresAt: undefined,
                                          claimCodeInvalidatedAt: undefined,
                                          claimChallenge: undefined,
                                          claimChallengeCode: undefined,
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
                                };
                              });
                              if (generatedCode === null) return;
                              setClaimCode({ cardId: card.id, code: generatedCode });
                            }}
                            type="button"
                          >
                            {claimCode?.cardId === card.id ? "Regenerate code" : "Generate code"}
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
                                disabled={correctionPending}
                                onClick={() => {
                                  let applied = false;
                                  updateDemoState((current) => {
                                    const currentCard = current.cards.find(
                                      (candidate) => candidate.id === card.id,
                                    );
                                    if (
                                      !currentCard ||
                                      (currentCard.status !== "registered" &&
                                        currentCard.status !== "claimable" &&
                                        currentCard.status !== "active") ||
                                      currentCard.claimedAt !== undefined ||
                                      currentCard.claimCode !== claimCode.code ||
                                      current.cardCorrectionRequests?.some(
                                        (request) =>
                                          request.token === card.token &&
                                          request.status === "pending",
                                      )
                                    ) {
                                      return current;
                                    }
                                    applied = true;
                                    return {
                                      ...current,
                                      cards: current.cards.map((candidate) =>
                                        candidate.id === currentCard.id
                                          ? {
                                              ...candidate,
                                              claimCode: undefined,
                                              claimCodeInvalidatedAt: Date.now(),
                                              claimChallenge: undefined,
                                              claimChallengeCode: undefined,
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
                                    };
                                  });
                                  if (!applied) return;
                                  setClaimCode(null);
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
                          disabled={correctionPending}
                          onClick={() => setConfirmation({ type: "deactivate", card })}
                          type="button"
                          variant="danger-soft"
                        >
                          Deactivate
                        </Button>
                      ) : null}
                      {card.status === "active" ? (
                        <Button
                          disabled={correctionPending}
                          onClick={() => setConfirmation({ type: "replace", card })}
                          type="button"
                          variant="secondary"
                        >
                          Replace card
                        </Button>
                      ) : null}
                    </div>
                  </CardRow>
                );
              })}
            </CardTable>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {detailCard ? (
            <CardDetail
              cardUrl={detailCard.cardUrl}
              key={detailCard.token}
              status={detailCard.status}
              token={detailCard.token}
            >
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
                <Button
                  disabled={confirmationCorrectionPending}
                  onClick={reviewReplacement}
                  type="button"
                >
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
        confirmDisabled={confirmationCorrectionPending}
        confirmLabel={
          confirmation?.type === "archive"
            ? "Remove card"
            : confirmation?.type === "reactivate"
              ? "Reactivate card"
              : confirmation?.type === "replace"
                ? "Replace card"
                : confirmation?.type === "attach"
                  ? "Attach card"
                  : "Deactivate card"
        }
        description={
          confirmation?.type === "archive"
            ? `The URL for ${confirmation.card.token} will stay inactive and its token will remain reserved. Continue?`
            : confirmation?.type === "reactivate"
              ? `The card URL will stay unavailable until its owner claims a fresh one-time code. Continue?`
              : confirmation?.type === "replace"
                ? `The old ${confirmation.card.token} path will become replaced and ${replacementUrl.trim()} will become the active card path. The former profile content will no longer be served from the old URL. Continue?`
                : confirmation?.type === "attach"
                  ? `Attach ${confirmation.card.token} to ${getDemoProfileById(state, confirmation.profileId)?.draft.name || getDemoProfileById(state, confirmation.profileId)?.draft.slug || "the selected profile"}? ${getDemoProfileById(state, confirmation.profileId)?.status === "published" ? "The card URL will stay unavailable until its owner claims a fresh one-time code, then it can serve the published profile." : "The card will be claimable and must be activated with a claim code before it can serve profile content."}`
                  : confirmation?.type === "deactivate"
                    ? `Deactivating ${confirmation.card.token} immediately removes its former profile content from the public path. Continue?`
                    : ""
        }
        onCancel={cancelConfirmation}
        onConfirm={confirmAction}
        open={
          confirmation?.type === "archive" ||
          confirmation?.type === "reactivate" ||
          confirmation?.type === "deactivate" ||
          confirmation?.type === "attach" ||
          (confirmation?.type === "replace" && replacementReview)
        }
        title={
          confirmation?.type === "archive"
            ? "Remove this card?"
            : confirmation?.type === "reactivate"
              ? "Reactivate this card?"
              : confirmation?.type === "replace"
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
  const correctionRequests = useQuery(api.cardCorrectionRequests.adminList);
  const correctAssignment = useMutation(api.cardCorrectionRequests.correctAssignment);
  const archive = useMutation(api.cards.archive);
  const restore = useMutation(api.cards.restore);
  const reactivate = useMutation(api.cards.reactivate);
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
  const [cardAction, setCardAction] = useState<{
    type: "archive" | "reactivate";
    cardId: Id<"cards">;
    token: string;
  } | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [claimCodes, setClaimCodes] = useState<Record<string, { code: string }>>({});

  const orderedCards = useMemo(
    () => [...cards].sort((first, second) => second.createdAt - first.createdAt),
    [cards],
  );
  const counts = useMemo(() => countCards(orderedCards), [orderedCards]);
  const visibleCards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orderedCards.filter(
      (card) =>
        cardMatchesFilter(card, filter) &&
        (!normalized ||
          `${card.cardUrl} ${card.token} ${card.status}`.toLowerCase().includes(normalized)),
    );
  }, [filter, orderedCards, query]);
  const detailCard = visibleCards.find((card) => card._id === selectedId) ?? visibleCards[0];
  const assignableProfiles = profiles;
  const availableCustomers = customerPages.results;
  const selectedProfileId = profileId || assignableProfiles[0]?._id;
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
    const normalized = normalizeCardUrl(cardUrl);
    const token = normalized && cardTokenFromUrl(normalized);
    if (!normalized || !token)
      return setMessage({
        tone: "error",
        text: "Enter a canonical card URL with a /c/<unique-token> path.",
      });
    void run(async () => {
      await register({
        cardUrl: normalized,
        token,
      });
      setCardUrl("");
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
          <Button disabled={pending} onClick={generateCardUrl} type="button" variant="secondary">
            Generate secure URL
          </Button>
          <Button disabled={pending} type="submit">
            Register card
          </Button>
        </form>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      </section>

      {correctionRequests?.length ? (
        <section className="grid gap-3 rounded-card bg-tapit-surface p-4 shadow-card">
          <h2 className="text-lg font-semibold text-tapit-ink">Assignment corrections</h2>
          {correctionRequests.map((request) => (
            <article
              className="grid gap-2 rounded-control bg-tapit-soft-surface p-4"
              key={request.requestId}
            >
              <p className="font-semibold text-tapit-ink">
                {request.token} · requested by {request.requesterProfileName} (/
                {request.requesterProfileSlug})
              </p>
              <p className="text-sm text-tapit-muted">
                Current assignment: {request.currentProfileName ?? "Unassigned"}
                {request.currentProfileSlug ? ` (/${request.currentProfileSlug})` : ""} · Card:{" "}
                {request.cardUrl}
              </p>
              {request.hasLiveCardConflict ? (
                <Notice tone="error">
                  This requester already has an active or claimable card. The request stays pending
                  until that conflict is resolved.
                </Notice>
              ) : null}
              <Button
                disabled={pending || request.hasLiveCardConflict}
                onClick={() =>
                  void run(
                    () => correctAssignment({ requestId: request.requestId }),
                    `Assignment for ${request.token} corrected.`,
                  )
                }
                type="button"
              >
                Correct assignment
              </Button>
            </article>
          ))}
        </section>
      ) : null}

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_384px]">
        <Card description="Search registered URLs, tokens, and state." title="Card registry">
          <CardRegistryToolbar
            counts={counts}
            filter={filter}
            onFilterChange={setFilter}
            onQueryChange={setQuery}
            query={query}
          />
          {profilesStatus === "CanLoadMore" || profilesStatus === "LoadingMore" ? (
            <Button
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
                const correctionPending = card.correctionRequestedAt !== undefined;
                return (
                  <CardRow
                    key={card._id}
                    cardUrl={card.cardUrl}
                    onOpen={() => setSelectedId(card._id)}
                    profileLabel={profileLabel}
                    selected={card._id === detailCard?._id}
                    status={card.status}
                    token={card.token}
                  >
                    <div className="flex flex-wrap gap-2">
                      <CopyCardLinkButton
                        ariaLabel={`Copy card URL for ${card.token}`}
                        token={card.token}
                        cardUrl={card.cardUrl}
                      />
                      {filter === "archived" ? (
                        <Button
                          disabled={pending}
                          onClick={() =>
                            void run(
                              () => restore({ cardId: card._id }),
                              `Card ${card.token} restored.`,
                            )
                          }
                          type="button"
                          variant="secondary"
                        >
                          Restore
                        </Button>
                      ) : null}
                      {filter !== "archived" &&
                      (card.status === "inactive" || card.status === "replaced") ? (
                        <>
                          <Button
                            disabled={pending || correctionPending}
                            onClick={() =>
                              setCardAction({
                                type: "archive",
                                cardId: card._id,
                                token: card.token,
                              })
                            }
                            type="button"
                            variant="secondary"
                          >
                            Remove
                          </Button>
                          <Button
                            disabled={pending || correctionPending}
                            onClick={() =>
                              setCardAction({
                                type: "reactivate",
                                cardId: card._id,
                                token: card.token,
                              })
                            }
                            type="button"
                          >
                            Reactivate
                          </Button>
                        </>
                      ) : null}
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
                          <Button
                            disabled={pending || !selectedProfileId}
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
                      (card.status === "registered" ||
                        card.status === "claimable" ||
                        card.status === "active") ? (
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
                            {claimCodes[card._id] ? "Regenerate code" : "Generate code"}
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
                                        void run(async () => {
                                          await invalidateClaimCode({ cardId: card._id });
                                          setClaimCodes((current) => {
                                            const next = { ...current };
                                            delete next[card._id];
                                            return next;
                                          });
                                        }, `Claim code for ${card.token} invalidated.`)
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
                              const normalized = normalizeCardUrl(replacementUrl);
                              const token = normalized && cardTokenFromUrl(normalized);
                              if (!normalized || !token)
                                return setMessage({
                                  tone: "error",
                                  text: "Enter a valid replacement card URL.",
                                });
                              void run(
                                () =>
                                  replace({
                                    oldCardId: card._id,
                                    newCardUrl: normalized,
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
            <CardDetail
              cardUrl={detailCard.cardUrl}
              key={detailCard.token}
              status={detailCard.status}
              token={detailCard.token}
            >
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
            ? `Attach ${attachment.token} to ${attachment.customer} / ${attachment.profile}? ${attachment.profileStatus === "published" ? "The card URL will stay unavailable until its owner claims a fresh one-time code, then it can serve the published profile." : "The card must be activated with a claim code before it can serve profile content."} Profile status: ${attachment.profileStatus}. Current card status: ${attachment.cardStatus}. The assignment will be recorded in the audit log.`
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
            `Card ${pendingAttachment.token} is attached to ${pendingAttachment.profile}. Generate and share a claim code so the owner can claim the card and ${pendingAttachment.profileStatus === "published" ? "its URL can show the published profile." : "continue profile setup."}`,
          );
        }}
        open={attachment !== null}
        title="Confirm card attachment"
      />
      <ConfirmDialog
        confirmLabel={cardAction?.type === "archive" ? "Remove card" : "Reactivate card"}
        description={
          cardAction?.type === "archive"
            ? `The URL for ${cardAction.token} will stay inactive and its token will remain reserved. Continue?`
            : cardAction
              ? `The card URL will stay unavailable until its owner claims a fresh one-time code. Continue?`
              : ""
        }
        onCancel={() => setCardAction(null)}
        onConfirm={() => {
          if (!cardAction) return;
          const action = cardAction;
          setCardAction(null);
          void run(
            () =>
              action.type === "archive"
                ? archive({ cardId: action.cardId })
                : reactivate({ cardId: action.cardId }),
            action.type === "archive"
              ? `Card ${action.token} archived.`
              : `Card ${action.token} reactivated. Generate a fresh claim code for the profile owner.`,
          );
          if (action.type === "reactivate")
            setClaimCodes((current) => {
              const next = { ...current };
              delete next[action.cardId];
              return next;
            });
        }}
        open={cardAction !== null}
        title={cardAction?.type === "archive" ? "Remove this card?" : "Reactivate this card?"}
      />
    </div>
  );
}
