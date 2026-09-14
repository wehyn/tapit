export function Notice({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "error";
}) {
  const classes = {
    neutral: "border-tapit-line bg-tapit-paper text-tapit-muted",
    success: "border-[#b9d1c0] bg-[#e8f1eb] text-[#17352b]",
    error: "border-[#e5b4b1] bg-[#fff1f0] text-tapit-danger",
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
