import Link from "next/link";

import type { ProfileContent } from "@/lib/domain";
import { profileChecklistSteps } from "@/lib/profile-checklist";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Icon, type IconName } from "@/components/ui/Icon";
import { tileClass } from "@/components/ui/Tile";

const stepIcons: Record<string, IconName> = {
  photo: "upload",
  name: "user",
  links: "link",
  look: "sliders",
  publish: "eye",
};

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
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-lg font-semibold text-tapit-ink">Finish your profile</h2>
          <p className="text-sm text-tapit-muted">
            {`${doneCount} of ${steps.length} done. Each step takes a minute.`}
          </p>
        </div>
        <Chip tone="accent">{percent}%</Chip>
      </div>
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
              className={`grid size-10 shrink-0 place-items-center rounded-control ${step.done ? "bg-tapit-success-soft text-tapit-success-ink" : "bg-tapit-surface text-tapit-ink"}`}
            >
              <Icon
                className="size-5"
                name={step.done ? "check" : (stepIcons[step.id] ?? "plus")}
                weight={step.done ? "bold" : "regular"}
              />
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
                  <Icon className="size-4" name="caretRight" />
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
