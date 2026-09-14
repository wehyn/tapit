export default function PublicProfileLoading() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-tapit-paper px-5">
      <div
        aria-label="Loading profile"
        className="w-full max-w-lg rounded-[2rem] border border-tapit-line bg-tapit-surface p-10"
        role="status"
      >
        <div className="mx-auto size-24 animate-pulse rounded-full bg-tapit-accent-soft" />
        <div className="mx-auto mt-6 h-8 w-48 animate-pulse rounded-full bg-tapit-accent-soft" />
        <div className="mx-auto mt-3 h-4 w-64 animate-pulse rounded-full bg-tapit-accent-soft" />
        <div className="mt-10 grid gap-3">
          <div className="h-14 animate-pulse rounded-2xl bg-tapit-accent-soft" />
          <div className="h-14 animate-pulse rounded-2xl bg-tapit-accent-soft" />
        </div>
      </div>
    </main>
  );
}
