export function AdminPageHeader({ description, title }: { description: string; title: string }) {
  return (
    <header className="min-w-0 pb-1 pt-1 sm:pb-2">
      <p className="tapit-eyebrow">Tapit operations</p>
      <h1 className="tapit-display mt-2 text-3xl leading-tight text-tapit-ink sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-tapit-muted sm:text-base">
        {description}
      </p>
    </header>
  );
}
