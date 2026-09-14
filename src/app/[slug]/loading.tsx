export default function PublicProfileLoading() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-tapit-paper px-5 py-10">
      <div
        aria-label="Loading profile"
        className="w-full max-w-xl border border-tapit-line bg-tapit-surface p-7 sm:p-10"
        role="status"
      >
        <div className="size-20 animate-pulse rounded-full bg-tapit-soft-surface" />
        <div className="mx-auto mt-6 h-8 w-48 animate-pulse rounded-tapit bg-tapit-soft-surface" />
        <div className="mx-auto mt-3 h-4 w-64 animate-pulse rounded-tapit bg-tapit-soft-surface" />
        <div className="mt-10 grid gap-3">
          <div className="h-14 animate-pulse rounded-tapit bg-tapit-soft-surface" />
          <div className="h-14 animate-pulse rounded-tapit bg-tapit-soft-surface" />
        </div>
      </div>
    </main>
  );
}
