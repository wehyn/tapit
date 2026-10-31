"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { Id } from "convex/_generated/dataModel";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { isLocalDemoMode } from "@/lib/demo/mode";
import {
  disableMyDemoCard,
  getMyDemoCards,
  markMyDemoCardLost,
  setMyLostDemoCardResolution,
  startMyDemoCardReactivation,
  useDemoSession,
  useDemoState,
} from "@/lib/demo/store";
import type { MyDemoCard } from "@/lib/demo/store";
import { api } from "../../../convex/_generated/api";

type CardRow = {
  id: string;
  convexId?: Id<"cards">;
  cardUrl: string;
  status: string;
  archivedAt?: number;
  lostCardResolution: "return" | "inactive";
  canDisable: boolean;
  canMarkLost: boolean;
  canSetLostResolution: boolean;
  canReactivate: boolean;
};

type PendingAction = { kind: "disable" | "lost" | "reactivate"; card: CardRow };
type CardActions = {
  disable: (card: CardRow) => void | Promise<void>;
  markLost: (card: CardRow, resolution: "return" | "inactive") => void | Promise<void>;
  setResolution: (card: CardRow, resolution: "return" | "inactive") => void | Promise<void>;
  reactivate: (card: CardRow) => void | Promise<void>;
};

function formatStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function CardsList({
  cards,
  onDisable,
  onMarkLost,
  onSetResolution,
  onReactivate,
}: {
  cards: CardRow[];
  onDisable: (card: CardRow) => void;
  onMarkLost: (card: CardRow) => void;
  onSetResolution: (card: CardRow, resolution: "return" | "inactive") => void;
  onReactivate: (card: CardRow) => void;
}) {
  if (!cards.length) {
    return (
      <section className="rounded-card bg-tapit-surface p-6 shadow-card">
        <p className="text-sm text-tapit-muted">You don&apos;t have any cards yet.</p>
        <Link
          className="mt-4 inline-flex min-h-11 items-center rounded-control bg-tapit-accent px-4 text-sm font-semibold text-white"
          href="/app/card/order"
        >
          Order more cards
        </Link>
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      {cards.map((card) => (
        <article
          aria-label={`Card ${card.cardUrl}`}
          className="rounded-card bg-tapit-surface p-4 shadow-card sm:p-6"
          key={card.id}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-tapit-ink">Permanent URL</p>
              <a
                className="mt-1 block break-all text-sm text-tapit-accent-strong underline underline-offset-2"
                href={card.cardUrl}
                rel="noreferrer"
                target="_blank"
                aria-label="Open permanent card URL"
              >
                {card.cardUrl}
              </a>
              <p className="mt-3 text-sm text-tapit-muted">Status: {formatStatus(card.status)}</p>
              {card.archivedAt !== undefined ? (
                <p className="mt-2 text-sm text-tapit-muted">
                  Archived. Ask an administrator to restore this card before it can be reactivated.
                </p>
              ) : null}
              {card.status === "lost" ? (
                <div className="mt-4 max-w-md">
                  <label
                    className="block text-sm font-medium text-tapit-ink"
                    htmlFor={`lost-page-${card.id}`}
                  >
                    Lost card page
                  </label>
                  {card.canSetLostResolution ? (
                    <select
                      className="mt-2 min-h-11 w-full rounded-control bg-tapit-soft-surface px-3 text-sm text-tapit-ink"
                      id={`lost-page-${card.id}`}
                      onChange={(event) =>
                        onSetResolution(card, event.currentTarget.value as "return" | "inactive")
                      }
                      value={card.lostCardResolution}
                    >
                      <option value="return">Shared return instructions</option>
                      <option value="inactive">Neutral inactive page</option>
                    </select>
                  ) : (
                    <p className="mt-1 text-sm text-tapit-muted">
                      {card.lostCardResolution === "return"
                        ? "Shared return instructions"
                        : "Neutral inactive page"}
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {card.canDisable ? (
                <Button onClick={() => onDisable(card)} type="button" variant="secondary">
                  Disable card
                </Button>
              ) : null}
              {card.canMarkLost ? (
                <Button onClick={() => onMarkLost(card)} type="button" variant="secondary">
                  Mark card lost
                </Button>
              ) : null}
              {card.canReactivate ? (
                <Button onClick={() => onReactivate(card)} type="button" variant="secondary">
                  Reactivate card
                </Button>
              ) : null}
            </div>
          </div>
        </article>
      ))}
      <Link
        className="inline-flex min-h-11 w-fit items-center rounded-control bg-tapit-accent px-4 text-sm font-semibold text-white"
        href="/app/card/order"
      >
        Order more cards
      </Link>
    </div>
  );
}

export function CustomerCardsExperience() {
  return isLocalDemoMode() ? <DemoCardsRoute /> : <ConvexCardsRoute />;
}

function AdminCardsEntry() {
  return (
    <section className="grid gap-4" aria-labelledby="admin-cards-heading">
      <div>
        <h1 className="text-2xl font-semibold text-tapit-ink" id="admin-cards-heading">
          Cards
        </h1>
        <p className="mt-2 text-sm text-tapit-muted">
          Order cards and prepare a design for an account.
        </p>
      </div>
      <Link
        className="inline-flex min-h-11 w-fit items-center rounded-control bg-tapit-accent px-4 text-sm font-semibold text-white"
        href="/app/card/order"
      >
        Order cards
      </Link>
    </section>
  );
}

function DemoCardsRoute() {
  const session = useDemoSession();
  return session?.role === "admin" ? <AdminCardsEntry /> : <DemoCardsData />;
}

function ConvexCardsRoute() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess, isAuthenticated ? {} : "skip");
  if (isLoading || (isAuthenticated && access === undefined)) {
    return (
      <p className="text-sm text-tapit-muted" role="status">
        Loading your cards…
      </p>
    );
  }
  if (access?.accountStatus === "active" && access.role === "admin") return <AdminCardsEntry />;
  return <ConvexCardsData />;
}

function DemoCardsData() {
  const demoState = useDemoState();
  const cards: CardRow[] = getMyDemoCards().map((card: MyDemoCard) => {
    const source = demoState.cards.find((candidate) => candidate.id === card.id);
    const hasCorrection =
      source !== undefined &&
      (source.correctionRequestedAt !== undefined ||
        (demoState.cardCorrectionRequests ?? []).some(
          (request) => request.token === source.token && request.status === "pending",
        ));
    return {
      id: card.id,
      cardUrl: card.cardUrl,
      status: card.status,
      archivedAt: card.archivedAt,
      lostCardResolution: card.lostCardResolution ?? "return",
      canDisable:
        source?.status === "active" &&
        source.archivedAt === undefined &&
        source.claimedAt !== undefined &&
        source.claimCodeInvalidatedAt === undefined &&
        !hasCorrection,
      canMarkLost:
        source !== undefined &&
        source.status !== "lost" &&
        source.claimedAt !== undefined &&
        source.claimCodeInvalidatedAt === undefined &&
        !hasCorrection,
      canSetLostResolution: source?.status === "lost" && !hasCorrection,
      canReactivate: card.canReactivate,
    };
  });
  const actions: CardActions = {
    disable: (card) => disableMyDemoCard(card.id),
    markLost: (card, resolution) => markMyDemoCardLost(card.id, resolution),
    setResolution: (card, resolution) => setMyLostDemoCardResolution(card.id, resolution),
    reactivate: (card) => startMyDemoCardReactivation(card.id),
  };
  return <CardsWorkspace cards={cards} actions={actions} />;
}

function ConvexCardsData() {
  const pages = usePaginatedQuery(api.cards.myCards, {}, { initialNumItems: 25 });
  const disable = useMutation(api.cards.ownerDisable);
  const markLost = useMutation(api.cards.ownerMarkLost);
  const setResolution = useMutation(api.cards.ownerSetLostResolution);
  const reactivate = useMutation(api.cards.ownerReactivate);
  if (pages.results === undefined) {
    return (
      <p className="text-sm text-tapit-muted" role="status">
        Loading your cards…
      </p>
    );
  }
  const cards: CardRow[] = pages.results.map((card) => ({
    id: card._id,
    convexId: card._id,
    cardUrl: card.cardUrl,
    status: card.status,
    archivedAt: card.archivedAt,
    lostCardResolution: card.lostCardResolution,
    canDisable: card.canDisable,
    canMarkLost: card.canMarkLost,
    canSetLostResolution: card.canSetLostResolution,
    canReactivate: card.canReactivate,
  }));
  const actions: CardActions = {
    disable: async (card) => {
      if (!card.convexId) throw new Error("Card could not be updated. Refresh and try again.");
      await disable({ cardId: card.convexId });
    },
    markLost: async (card, resolution) => {
      if (!card.convexId) throw new Error("Card could not be updated. Refresh and try again.");
      await markLost({ cardId: card.convexId, lostCardResolution: resolution });
    },
    setResolution: async (card, resolution) => {
      if (!card.convexId)
        throw new Error("Lost card page could not be updated. Refresh and try again.");
      await setResolution({ cardId: card.convexId, lostCardResolution: resolution });
    },
    reactivate: async (card) => {
      if (!card.convexId) throw new Error("Card could not be updated. Refresh and try again.");
      await reactivate({ cardId: card.convexId });
    },
  };
  return (
    <CardsWorkspace
      actions={actions}
      cards={cards}
      canLoadMore={pages.status === "CanLoadMore"}
      onLoadMore={() => pages.loadMore(25)}
    />
  );
}

function CardsWorkspace({
  cards,
  actions,
  canLoadMore = false,
  onLoadMore,
}: {
  cards: CardRow[];
  actions: CardActions;
  canLoadMore?: boolean;
  onLoadMore?: () => void;
}) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [lostResolution, setLostResolution] = useState<"return" | "inactive">("return");
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const lostDialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (pending?.kind !== "lost") return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lostDialogRef.current?.querySelector("select")?.focus();
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPending(null);
      if (event.key !== "Tab" || !lostDialogRef.current) return;
      const controls = Array.from(
        lostDialogRef.current.querySelectorAll<HTMLElement>("select, button:not(:disabled)"),
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      returnFocusRef.current?.focus();
    };
  }, [pending]);

  async function runAction(action: PendingAction, resolution = "return" as "return" | "inactive") {
    setBusyCardId(action.card.id);
    setError("");
    setFeedback("");
    try {
      if (action.kind === "disable") {
        await actions.disable(action.card);
        setFeedback("Card disabled. Its profile is no longer available from this card.");
      } else if (action.kind === "lost") {
        await actions.markLost(action.card, resolution);
        setFeedback("Card marked lost.");
      } else {
        await actions.reactivate(action.card);
        setFeedback(
          "Reactivation started. Contact support or an administrator for a new claim code.",
        );
      }
      setPending(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Card could not be updated. Try again.");
    } finally {
      setBusyCardId(null);
    }
  }

  async function changeResolution(card: CardRow, resolution: "return" | "inactive") {
    setBusyCardId(card.id);
    setError("");
    setFeedback("");
    try {
      await actions.setResolution(card, resolution);
      setFeedback("Lost card page updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Lost card page could not be updated.");
    } finally {
      setBusyCardId(null);
    }
  }

  return (
    <section className="grid gap-4" aria-labelledby="customer-cards-heading">
      <div>
        <h1 className="text-2xl font-semibold text-tapit-ink" id="customer-cards-heading">
          Cards
        </h1>
        <p className="mt-2 text-sm text-tapit-muted">
          Your assigned cards and their permanent URLs.
        </p>
      </div>
      {feedback ? (
        <p className="text-sm text-tapit-success" role="status">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-tapit-danger" role="alert">
          {error}
        </p>
      ) : null}
      <CardsList
        cards={cards}
        onDisable={(card) => setPending({ kind: "disable", card })}
        onMarkLost={(card) => {
          setLostResolution("return");
          setPending({ kind: "lost", card });
        }}
        onSetResolution={(card, resolution) => void changeResolution(card, resolution)}
        onReactivate={(card) => setPending({ kind: "reactivate", card })}
      />
      {canLoadMore && onLoadMore ? (
        <Button
          disabled={busyCardId !== null}
          onClick={onLoadMore}
          type="button"
          variant="secondary"
        >
          Load more cards
        </Button>
      ) : null}
      {pending?.kind === "lost" ? (
        <div className="fixed inset-0 z-20 grid place-items-center bg-tapit-ink/45 p-4">
          <div
            aria-describedby="mark-lost-description"
            aria-labelledby="mark-lost-title"
            aria-modal="true"
            className="flex w-full max-w-lg flex-col gap-4 rounded-card bg-tapit-surface p-6 shadow-card"
            ref={lostDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <h2 className="text-lg font-semibold text-tapit-ink" id="mark-lost-title">
              Mark this card lost?
            </h2>
            <p className="text-sm text-tapit-muted" id="mark-lost-description">
              Mark this card lost and choose which public page its permanent URL should show.
            </p>
            <label
              className="grid gap-2 text-sm font-medium text-tapit-ink"
              htmlFor="mark-lost-page"
            >
              Lost card page
              <select
                className="min-h-11 rounded-control bg-tapit-soft-surface px-3 text-sm text-tapit-ink"
                id="mark-lost-page"
                onChange={(event) =>
                  setLostResolution(event.currentTarget.value as "return" | "inactive")
                }
                value={lostResolution}
              >
                <option value="return">Shared return instructions</option>
                <option value="inactive">Neutral inactive page</option>
              </select>
            </label>
            <div className="flex flex-wrap justify-end gap-3">
              <Button onClick={() => setPending(null)} type="button" variant="secondary">
                Cancel
              </Button>
              <Button
                disabled={busyCardId !== null}
                onClick={() => void runAction(pending, lostResolution)}
                type="button"
              >
                Mark lost
              </Button>
            </div>
          </div>
        </div>
      ) : pending ? (
        <ConfirmDialog
          cancelLabel="Cancel"
          confirmLabel={pending.kind === "disable" ? "Disable card" : "Start reactivation"}
          confirmDisabled={busyCardId !== null}
          description={
            pending.kind === "disable"
              ? "This card's profile will become unavailable. A fresh administrator code is required to reactivate it."
              : "This starts a fresh-claim recovery. Contact support or an administrator for a new code before the profile can return."
          }
          onCancel={() => setPending(null)}
          onConfirm={() => void runAction(pending, lostResolution)}
          open
          title={pending.kind === "disable" ? "Disable this card?" : "Start card reactivation?"}
        />
      ) : null}
    </section>
  );
}
