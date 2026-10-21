export function AdminPageHeader({ description, title }: { description: string; title: string }) {
  return (
    <header className="flex min-w-0 max-w-2xl flex-col gap-2">
      <h1 className="text-xl font-semibold text-tapit-ink">{title}</h1>
      <p className="text-base text-tapit-muted">{description}</p>
    </header>
  );
}
