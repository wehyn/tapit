"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

export type DraftSaveOutcome =
  | { kind: "saved" }
  | {
      kind: "blocked";
      blocker:
        | { kind: "media-validation"; messages: readonly string[] }
        | { kind: "links-validation"; messages: readonly string[] };
    }
  | { kind: "deferred"; reason: "pending-media" | "crop-open" | "pending-save" }
  | { kind: "failed"; message: string };

export type DraftSaveHandler = (href?: string) => Promise<DraftSaveOutcome>;
export type DraftDepartureState =
  | { kind: "idle" }
  | { kind: "saving"; href: string }
  | {
      kind: "repair";
      href: string;
      outcome: Exclude<DraftSaveOutcome, { kind: "saved" }>;
    };

const DraftSaveContext = createContext<DraftSaveHandler | null>(null);
type Registration = (handler: DraftSaveHandler) => () => void;
const DraftSaveRegistrationContext = createContext<Registration | null>(null);

export type DraftStatus = "saved" | "unsaved" | "saving";
type DraftStatusReporter = (status: DraftStatus) => void;
const DraftStatusContext = createContext<DraftStatus>("saved");
const DraftStatusReportContext = createContext<DraftStatusReporter | null>(null);

function keepDraftAfterSaveFailure(): undefined {
  return undefined;
}

export function DraftSaveProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const handlerRef = useRef<DraftSaveHandler | null>(null);
  const [status, setStatus] = useState<DraftStatus>("saved");
  const register = useCallback<Registration>((handler) => {
    handlerRef.current = handler;
    return () => {
      if (handlerRef.current === handler) handlerRef.current = null;
    };
  }, []);
  const saveDraft = useCallback<DraftSaveHandler>(async (href) => {
    const handler = handlerRef.current;
    return handler === null ? { kind: "saved" } : handler(href);
  }, []);

  return (
    <DraftSaveRegistrationContext.Provider value={register}>
      <DraftSaveContext.Provider value={saveDraft}>
        <DraftStatusContext.Provider value={status}>
          <DraftStatusReportContext.Provider value={setStatus}>
            {children}
          </DraftStatusReportContext.Provider>
        </DraftStatusContext.Provider>
      </DraftSaveContext.Provider>
    </DraftSaveRegistrationContext.Provider>
  );
}

export function useDraftStatus(): DraftStatus {
  return useContext(DraftStatusContext);
}

export function useDraftStatusReport(status: DraftStatus): void {
  const report = useContext(DraftStatusReportContext);

  useEffect(() => {
    if (report === null) return;
    report(status);
    return () => report("saved");
  }, [report, status]);
}

export function useDraftSaveRegistration(handler: DraftSaveHandler | null): void {
  const register = useContext(DraftSaveRegistrationContext);

  useEffect(() => {
    if (register === null || handler === null) return;
    return register(handler);
  }, [handler, register]);
}

export function useDraftSave(): DraftSaveHandler {
  const handler = useContext(DraftSaveContext);
  if (handler === null) {
    throw new Error("useDraftSave must be used within a DraftSaveProvider");
  }
  return handler;
}

export function useDraftSaveLink(
  href: string,
  onInterceptedClick?: () => void,
): (event: MouseEvent<HTMLAnchorElement>) => void {
  const saveDraft = useDraftSave();
  const router = useRouter();

  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      onInterceptedClick?.();
      void saveDraft(href).then((outcome) => {
        if (outcome.kind === "saved") router.push(href);
      }, keepDraftAfterSaveFailure);
    },
    [href, onInterceptedClick, router, saveDraft],
  );
}
