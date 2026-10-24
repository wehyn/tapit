import type { ReactNode } from "react";

const toneClasses = {
  neutral: "bg-tapit-soft-surface text-tapit-ink",
  accent: "bg-tapit-accent-soft text-tapit-accent-strong",
  ok: "bg-tapit-success-soft text-tapit-success-ink",
  warn: "bg-tapit-warning-soft text-tapit-warning-ink",
  danger: "bg-tapit-danger-soft text-tapit-danger",
};

export type ChipTone = keyof typeof toneClasses;

const statusTones: Record<string, ChipTone> = {
  active: "ok",
  published: "ok",
  invited: "warn",
  unpublished: "warn",
  requested: "warn",
  inactive: "danger",
  replaced: "danger",
  suspended: "danger",
  deleted: "danger",
};

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: ChipTone }) {
  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1 rounded-full px-3 text-xs font-semibold ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  return (
    <Chip tone={statusTones[status] ?? "neutral"}>
      <span className="capitalize">{status}</span>
    </Chip>
  );
}
