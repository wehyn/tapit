import type { ButtonHTMLAttributes } from "react";

export function Switch({
  checked,
  onCheckedChange,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "role"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      {...props}
      aria-checked={checked}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center disabled:cursor-not-allowed disabled:opacity-55"
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        aria-hidden="true"
        className={`relative h-7 w-11 rounded-full transition-colors ${checked ? "bg-tapit-accent" : "bg-tapit-muted/40"}`}
      >
        <span
          className={`absolute top-1 left-1 size-5 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : ""}`}
        />
      </span>
    </button>
  );
}
