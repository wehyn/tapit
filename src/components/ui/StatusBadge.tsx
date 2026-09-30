export function StatusBadge({
  status,
  prominent = false,
}: {
  status: string;
  prominent?: boolean;
}) {
  const classes =
    {
      active: "bg-tapit-success-soft text-tapit-success-ink",
      published: "bg-tapit-success-soft text-tapit-success-ink",
      draft: "bg-tapit-soft-surface text-tapit-ink",
      invited: "bg-tapit-warning-soft text-tapit-warning-ink",
      inactive: "bg-tapit-danger-soft text-tapit-danger",
      replaced: "bg-tapit-danger-soft text-tapit-danger",
      unpublished: "bg-tapit-warning-soft text-tapit-warning-ink",
      suspended: "bg-tapit-danger-soft text-tapit-danger",
      requested: "bg-tapit-warning-soft text-tapit-warning-ink",
      deleted: "bg-tapit-danger-soft text-tapit-danger",
    }[status] ?? "bg-tapit-paper text-tapit-muted";
  const emphasisClasses = prominent
    ? "rounded-full bg-tapit-accent px-4 py-2 text-sm tracking-[0.04em] text-white shadow-[0_2px_5px_rgba(23,35,30,0.08)]"
    : `rounded-full px-2.5 py-1 text-xs capitalize ${classes}`;

  return (
    <span className={`inline-flex items-center gap-2 font-semibold ${emphasisClasses}`}>
      {prominent ? <span aria-hidden="true" className="size-2 rounded-full bg-white/80" /> : null}
      {status}
    </span>
  );
}
