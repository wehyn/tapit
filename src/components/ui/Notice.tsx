export function Notice({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "error";
}) {
  const classes = {
    neutral: "border-tapit-line bg-tapit-soft-surface text-tapit-ink",
    success: "border-[#b7ddc8] bg-tapit-success-soft text-tapit-success-ink",
    error: "border-[#e5b4b1] bg-tapit-danger-soft text-tapit-danger",
  }[tone];
  return (
    <div
      aria-live="polite"
      className={`rounded-tapit border px-4 py-3 text-sm leading-6 ${classes}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
