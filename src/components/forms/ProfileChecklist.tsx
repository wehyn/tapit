import Link from "next/link";

import type { ProfileContent } from "@/lib/domain";
import { profileChecklistSteps } from "@/lib/profile-checklist";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { tileClass } from "@/components/ui/Tile";

export function ProfileChecklist({
  draft,
  published,
}: {
  draft: ProfileContent;
  published: boolean;
}) {
  const steps = profileChecklistSteps(draft, published);
  const doneCount = steps.filter((step) => step.done).length;
  if (doneCount === steps.length) return null;
  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <Card
      description={`${doneCount} of ${steps.length} done. Each step takes a minute.`}
      title="Finish your profile"
    >
      <div
        aria-label="Profile setup progress"
        aria-valuemax={steps.length}
        aria-valuemin={0}
        aria-valuenow={doneCount}
        className="h-2 overflow-hidden rounded-full bg-tapit-soft-surface"
        role="progressbar"
      >
        <span
          className="block h-full rounded-full bg-tapit-accent"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {steps.map((step) => {
          const marker = (
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full ${step.done ? "bg-tapit-success-soft text-tapit-success-ink" : "bg-tapit-surface text-tapit-muted"}`}
            >
              {step.done ? (
                <Icon name="check" size={16} weight="bold" />
              ) : (
                <span className="size-2 rounded-full bg-current" />
              )}
            </span>
          );
          if (step.href && !step.done) {
            return (
              <li key={step.id}>
                <Link
                  className={`${tileClass()} text-sm font-semibold text-tapit-ink hover:text-tapit-accent-strong`}
                  href={step.href}
                >
                  {marker}
                  <span className="flex-1">{step.label}</span>
                  <Icon name="caretRight" size={16} />
                </Link>
              </li>
            );
          }
          return (
            <li
              className={`${tileClass()} text-sm ${step.done ? "text-tapit-muted" : "font-semibold text-tapit-ink"}`}
              key={step.id}
            >
              {marker}
              <span className="flex-1">{step.label}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
