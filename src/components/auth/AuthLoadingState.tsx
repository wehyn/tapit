import { FingerprintIcon } from "@phosphor-icons/react";

export function AuthLoadingState() {
  return (
    <div aria-busy="true" className="grid min-h-[100dvh] place-items-center bg-tapit-paper px-5">
      <div className="w-full max-w-sm rounded-tapit border border-tapit-line bg-tapit-surface p-6 shadow-[0_18px_42px_rgba(21,25,24,0.08)]">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-tapit bg-tapit-accent text-white"
          >
            <FingerprintIcon size={21} weight="bold" />
          </div>
          <div aria-hidden="true" className="grid gap-2">
            <div className="h-3 w-24 rounded-full bg-tapit-soft-surface" />
            <div className="h-2.5 w-36 rounded-full bg-tapit-soft-surface" />
          </div>
        </div>
        <p className="mt-6 text-sm font-semibold text-tapit-ink" role="status">
          Loading your Tapit workspace...
        </p>
        <div
          aria-hidden="true"
          className="mt-3 h-2 overflow-hidden rounded-full bg-tapit-soft-surface"
        >
          <div className="h-full w-2/5 rounded-full bg-tapit-accent motion-safe:animate-pulse" />
        </div>
      </div>
    </div>
  );
}
