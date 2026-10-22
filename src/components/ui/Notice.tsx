export function Notice({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "error";
}) {
  const classes = {
    neutral: "bg-tapit-accent-soft text-tapit-ink",
    success: "bg-tapit-success-soft text-tapit-success-ink",
    warning: "bg-tapit-warning-soft text-tapit-warning-ink",
    error: "bg-tapit-danger-soft text-tapit-danger",
  }[tone];
  return (
    <div
      aria-live="polite"
      className={`rounded-control p-4 text-sm ${classes}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
