"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

export type DraftSaveHandler = () => Promise<boolean>;

const DraftSaveContext = createContext<DraftSaveHandler | null>(null);
type Registration = (handler: DraftSaveHandler) => () => void;
const DraftSaveRegistrationContext = createContext<Registration | null>(null);

export function DraftSaveProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const handlerRef = useRef<DraftSaveHandler | null>(null);
  const register = useCallback<Registration>((handler) => {
    handlerRef.current = handler;
    return () => {
      if (handlerRef.current === handler) handlerRef.current = null;
    };
  }, []);
  const saveDraft = useCallback<DraftSaveHandler>(async () => {
    const handler = handlerRef.current;
    return handler === null ? true : handler();
  }, []);

  return (
    <DraftSaveRegistrationContext.Provider value={register}>
      <DraftSaveContext.Provider value={saveDraft}>{children}</DraftSaveContext.Provider>
    </DraftSaveRegistrationContext.Provider>
  );
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

export function useDraftSaveLink(href: string): (event: MouseEvent<HTMLAnchorElement>) => void {
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
      void saveDraft().then(
        (shouldNavigate) => {
          if (shouldNavigate) router.push(href);
        },
        () => {
          // A failed draft save keeps the user on the current page.
        },
      );
    },
    [href, router, saveDraft],
  );
}
