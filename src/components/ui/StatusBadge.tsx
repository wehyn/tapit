export function StatusBadge({ status }: { status: string }) {
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
  return (
    <span
      className={`inline-flex rounded-tapit px-2.5 py-1 text-xs font-semibold capitalize ${classes}`}
    >
      {status}
    </span>
  );
}
