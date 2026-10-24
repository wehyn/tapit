import type { HTMLAttributes } from "react";

export function tileClass(tone: "soft" | "white" = "soft") {
  return `flex min-h-14 items-center gap-3 rounded-control px-4 py-3 ${
    tone === "white" ? "bg-tapit-surface shadow-card" : "bg-tapit-soft-surface"
  }`;
}

export function Tile({
  className = "",
  tone,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: "soft" | "white" }) {
  return <div className={`${tileClass(tone)} ${className}`} {...props} />;
}
