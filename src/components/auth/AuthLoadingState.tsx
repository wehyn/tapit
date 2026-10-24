export function AuthLoadingState() {
  return (
    <div aria-busy="true" className="grid min-h-dvh place-items-center bg-tapit-paper px-4">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-card bg-tapit-surface p-6 shadow-card">
        <div className="flex items-center gap-4">
          <div aria-hidden="true" className="size-14 shrink-0 rounded-full bg-tapit-soft-surface" />
          <div aria-hidden="true" className="flex flex-1 flex-col gap-2">
            <div className="h-3.5 w-3/5 rounded-full bg-tapit-soft-surface" />
            <div className="h-3 w-2/5 rounded-full bg-tapit-soft-surface" />
          </div>
        </div>
        <div aria-hidden="true" className="flex flex-col gap-2">
          <div className="h-14 rounded-control bg-tapit-soft-surface motion-safe:animate-pulse" />
          <div className="h-14 rounded-control bg-tapit-soft-surface motion-safe:animate-pulse" />
          <div className="h-14 rounded-control bg-tapit-soft-surface motion-safe:animate-pulse" />
        </div>
        <p className="text-sm font-semibold text-tapit-ink" role="status">
          Loading your Tapit workspace...
        </p>
      </div>
    </div>
  );
}
