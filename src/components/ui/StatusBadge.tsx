export function StatusBadge({
  status,
  prominent = false,
}: {
  status: string;
  prominent?: boolean;
}) {
  const classes =
    {
      active: "bg-tapit-accent-soft text-tapit-accent-strong",
      published: "bg-tapit-accent-soft text-tapit-accent-strong",
      draft: "bg-tapit-paper text-tapit-muted",
      invited: "bg-[#fff4df] text-[#784b13]",
      inactive: "bg-[#fff1f0] text-tapit-danger",
      replaced: "bg-[#fff1f0] text-tapit-danger",
      unpublished: "bg-[#fff4df] text-[#784b13]",
      suspended: "bg-[#fff1f0] text-tapit-danger",
      requested: "bg-[#fff4df] text-[#784b13]",
      deleted: "bg-[#fff1f0] text-tapit-danger",
    }[status] ?? "bg-tapit-paper text-tapit-muted";
  const emphasisClasses = prominent
    ? "rounded-full bg-tapit-accent px-4 py-2 text-sm tracking-[0.04em] text-white shadow-[0_8px_24px_rgba(24,116,97,0.18)]"
    : `rounded-tapit px-2.5 py-1 text-xs capitalize ${classes}`;

  return (
    <span className={`inline-flex items-center gap-2 font-semibold ${emphasisClasses}`}>
      {prominent ? <span aria-hidden="true" className="size-2 rounded-full bg-white/80" /> : null}
      {status}
    </span>
  );
}
