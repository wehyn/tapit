"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CopyIcon,
  PlusIcon,
  ProhibitIcon,
} from "@phosphor-icons/react";

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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { QrControls } from "@/components/qr/QrControls";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api } from "../../../convex/_generated/api";

type Confirmation =
  | { type: "deactivate" | "replace"; card: DemoCard }
  | { type: "attach"; card: DemoCard; profileId: string }
  | null;

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

function DemoCardsManager() {
  const state = useDemoState();
  const [cardUrl, setCardUrl] = useState("");
  const [replacementUrl, setReplacementUrl] = useState("");
  const [query, setQuery] = useState("");
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

  const cards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return state.cards
      .map((card, index) => ({ card, createdAt: card.createdAt ?? index }))
      .filter(
        ({ card }) =>
          !normalized ||
          `${card.cardUrl} ${card.token} ${card.status}`.toLowerCase().includes(normalized),
      )
      .sort((first, second) => second.createdAt - first.createdAt)
      .map(({ card }) => card);
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
    const targetStatus = "claimable" as const;
    if (!canTransitionCard(card.status, targetStatus)) {
      setMessage({
        tone: "error",
        text: "Only a registered card can be assigned. Inactive and replaced cards cannot be reused.",
      });
      return;
    }
    const profile = getDemoProfileById(state, profileId);
    if (profile === undefined) {
      setMessage({ tone: "error", text: "Create a profile before assigning a card." });
      return;
    }
    const owner = state.customers.find((customer) => customer.id === profile.ownerId);
    if (
      owner === undefined ||
      owner.role !== "customer" ||
      owner.status === "deleted" ||
      owner.deletionStatus !== "active"
    ) {
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
      text: `Card ${card.token} is claimable and assigned to ${profile.draft.name || profile.draft.slug}. It must be activated with a claim code.`,
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
          <Button onClick={generateCardUrl} type="button" variant="secondary">
            Generate secure URL
          </Button>
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
          {cards.map((card) => {
            const profile = getDemoProfileById(state, card.profileId);
            const profileLabel = profile?.draft.name || profile?.draft.slug || "Unassigned";
            return (
              <article
                className="rounded-tapit border border-tapit-line bg-tapit-paper p-4 transition-colors hover:border-tapit-accent/50 sm:p-5"
                key={card.id}
              >
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-tapit outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-tapit-focus">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-tapit-ink">
                        {profileLabel}{" "}
                        <span className="font-mono text-sm font-normal text-tapit-muted">
                          ({card.token})
                        </span>
                      </p>
                      <p className="mt-1 break-all text-sm text-tapit-muted">{card.cardUrl}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge status={card.status} />
                      <CaretDownIcon
                        aria-hidden="true"
                        className="text-tapit-muted transition-transform group-open:rotate-180"
                        size={18}
                        weight="bold"
                      />
                    </div>
                  </summary>
                  <div>
                    <dl className="mt-5 grid gap-3 border-t border-tapit-line pt-4 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
                          Profile
                        </dt>
                        <dd className="mt-1 text-tapit-ink">{profileLabel}</dd>
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
                          {state.audits.filter((audit) => audit.target.includes(card.token)).length}{" "}
                          audit events
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-5 flex flex-wrap gap-2">
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
                          <ArrowRightIcon aria-hidden="true" className="mr-2" size={18} />
                          Assign to profile
                        </Button>
                      ) : null}
                      {card.status === "claimable" ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => {
                              const generatedCode = `DEMO${Date.now().toString(36).slice(-4).toUpperCase()}`;
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
                              className="inline-flex min-h-11 items-center gap-2 rounded-tapit bg-tapit-accent-soft px-3 font-mono font-semibold text-tapit-accent-strong"
                              aria-label={`Claim code for ${card.token}`}
                            >
                              {claimCode.code}
                              <button
                                aria-label="Copy claim code"
                                className="rounded p-1 hover:bg-white"
                                onClick={() => void navigator.clipboard?.writeText(claimCode.code)}
                                type="button"
                              >
                                <CopyIcon aria-hidden="true" size={18} />
                              </button>
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
                  </div>
                </details>
              </article>
            );
          })}
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
              ? `Attach ${confirmation.card.token} to ${getDemoProfileById(state, confirmation.profileId)?.draft.name || getDemoProfileById(state, confirmation.profileId)?.draft.slug || "the selected profile"}? The card will be claimable and must be activated with a claim code before it can serve profile content.`
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
  const cards = useQuery(api.cards.adminList);
  const profiles = useQuery(api.profiles.adminList);
  const customers = useQuery(api.customers.list, {});
  const register = useMutation(api.cards.register);
  const generateCardToken = useMutation(api.cards.generateCardToken);
  const attach = useMutation(api.cards.attach);
  const generateClaimCode = useMutation(api.cards.generateClaimCode);
  const invalidateClaimCode = useMutation(api.cards.invalidateClaimCode);
  const deactivate = useMutation(api.cards.deactivate);
  const replace = useMutation(api.cards.replace);
  const [cardUrl, setCardUrl] = useState("");
  const [replacementUrl, setReplacementUrl] = useState("");
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
    () => [...(cards ?? [])].sort((first, second) => second.createdAt - first.createdAt),
    [cards],
  );
  const assignableProfiles = profiles ?? [];
  const availableCustomers = customers ?? [];
  const selectedProfileId = profileId || assignableProfiles[0]?._id;

  if (cards === undefined || profiles === undefined || customers === undefined)
    return <div className="min-h-[60vh] bg-tapit-paper" />;
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
      const cardId = await register({ cardUrl: cardUrl.trim(), token });
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
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
      <Panel
        description="Register pre-encoded URLs and manage assignments. All operations are checked and audited server-side."
        title="Register card URL"
      >
        <form className="mt-6 flex max-w-5xl flex-wrap items-end gap-3" onSubmit={registerCard}>
          <div className="min-w-72 flex-1">
            <Field
              id="live-card-url"
              label="Pre-encoded card URL"
              onChange={(event) => setCardUrl(event.target.value)}
              placeholder="/c/card-token"
              value={cardUrl}
            />
          </div>
          <div className="min-w-64">
            <label
              className="block text-sm font-semibold text-tapit-ink"
              htmlFor="live-card-assignment-profile"
            >
              Assignment profile
            </label>
            <select
              className="mt-2 min-h-12 w-full rounded-tapit border border-tapit-line bg-tapit-surface px-3.5 py-3 text-sm text-tapit-ink"
              id="live-card-assignment-profile"
              onChange={(event) => setProfileId(event.target.value as Id<"profiles">)}
              value={selectedProfileId ?? ""}
            >
              {assignableProfiles.map((candidate) => (
                <option key={candidate._id} value={candidate._id}>
                  {candidate.draft.name || candidate.draft.slug} · {candidate.slug} ·{" "}
                  {customers.find((customer) => customer._id === candidate.ownerId)?.email ??
                    "unassigned"}
                </option>
              ))}
            </select>
          </div>
          <Button disabled={pending} onClick={generateCardUrl} type="button" variant="secondary">
            Generate secure URL
          </Button>
          <Button disabled={pending} type="submit">
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
      <Panel description="Inactive and replaced cards cannot be reused." title="Card registry">
        <div className="mt-6 grid gap-2">
          {orderedCards.length === 0 ? (
            <Notice>No registered cards.</Notice>
          ) : (
            orderedCards.map((card) => {
              const profile = profiles.find((candidate) => candidate._id === card.profileId);
              const profileLabel = profile?.draft.name || profile?.draft.slug || "Unassigned";
              return (
                <article
                  className="rounded-tapit border border-tapit-line bg-tapit-paper p-4 sm:p-5"
                  key={card._id}
                >
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-tapit outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-tapit-focus">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-tapit-ink">
                          {profileLabel}{" "}
                          <span className="font-mono text-sm font-normal text-tapit-muted">
                            ({card.token})
                          </span>
                        </p>
                        <p className="mt-1 break-all text-sm text-tapit-muted">{card.cardUrl}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <StatusBadge status={card.status} />
                        <CaretDownIcon
                          aria-hidden="true"
                          className="text-tapit-muted transition-transform group-open:rotate-180"
                          size={18}
                          weight="bold"
                        />
                      </div>
                    </summary>
                    <div>
                      <p className="mt-4 text-sm text-tapit-muted">{profileLabel}</p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        {card.status === "registered" ? (
                          <>
                            <select
                              aria-label={`Assign ${card.token}`}
                              className="min-h-11 rounded-tapit border border-tapit-line bg-white px-3"
                              onChange={(event) =>
                                setProfileId(event.target.value as Id<"profiles">)
                              }
                              value={selectedProfileId ?? ""}
                            >
                              {assignableProfiles.map((candidate) => (
                                <option key={candidate._id} value={candidate._id}>
                                  {candidate.draft.name || candidate.draft.slug} · {candidate.slug}{" "}
                                  ·{" "}
                                  {customers.find((customer) => customer._id === candidate.ownerId)
                                    ?.email ?? "unassigned"}
                                </option>
                              ))}
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
                                    profiles.find(
                                      (candidate) => candidate._id === selectedProfileId,
                                    )?.draft.name ||
                                    profiles.find(
                                      (candidate) => candidate._id === selectedProfileId,
                                    )?.draft.slug ||
                                    "selected profile",
                                  customer:
                                    customers.find(
                                      (candidate) =>
                                        candidate._id ===
                                        profiles.find(
                                          (candidate) => candidate._id === selectedProfileId,
                                        )?.ownerId,
                                    )?.email || "selected customer",
                                  profileStatus:
                                    profiles.find(
                                      (candidate) => candidate._id === selectedProfileId,
                                    )?.status || "unknown",
                                  cardStatus: card.status,
                                })
                              }
                              type="button"
                            >
                              <ArrowRightIcon aria-hidden="true" className="mr-2" size={18} />
                              Assign
                            </Button>
                          </>
                        ) : null}
                        {card.status === "claimable" ? (
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
                              {claimCodes[card._id]
                                ? "Regenerate claim code"
                                : "Generate claim code"}
                            </Button>
                            {claimCodes[card._id]
                              ? (() => {
                                  const generated = claimCodes[card._id]!;
                                  return (
                                    <>
                                      <code className="inline-flex min-h-11 items-center rounded-tapit bg-tapit-accent-soft px-3 font-semibold text-tapit-accent-strong">
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
                                        <CopyIcon aria-hidden="true" size={18} /> Copy
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
                            variant="danger"
                          >
                            <ProhibitIcon aria-hidden="true" className="mr-2" size={18} />
                            Deactivate
                          </Button>
                        ) : null}
                        {card.status === "active" ? (
                          <>
                            <input
                              aria-label={`Replacement URL for ${card.token}`}
                              className="min-h-11 rounded-tapit border border-tapit-line px-3"
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
                                      newCardUrl: replacementUrl.trim(),
                                      newToken: token,
                                    }).then(() => setReplacementUrl("")),
                                  `Card ${card.token} replaced.`,
                                );
                              }}
                              type="button"
                              variant="secondary"
                            >
                              <ArrowsClockwiseIcon aria-hidden="true" className="mr-2" size={18} />
                              Replace
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </details>
                </article>
              );
            })
          )}
        </div>
      </Panel>
      <ConfirmDialog
        confirmLabel="Confirm attachment"
        description={
          attachment
            ? `Attach ${attachment.token} to ${attachment.customer} / ${attachment.profile}? The card must be activated with a claim code before it can serve profile content. Profile status: ${attachment.profileStatus}. Current card status: ${attachment.cardStatus}. The assignment will be recorded in the audit log.`
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
            `Card ${pendingAttachment.token} is claimable and attached to ${pendingAttachment.profile}. It must be activated with a claim code.`,
          );
        }}
        open={attachment !== null}
        title="Confirm card attachment"
      />
    </div>
  );
}
