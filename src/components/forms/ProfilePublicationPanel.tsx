import type { ReactNode } from "react";

import type { ProfileStatus } from "@/lib/domain";
import { Notice } from "@/components/ui/Notice";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Chip";

export type ProfilePublicationPanelProps = {
  status: ProfileStatus;
  publicationState: string;
  errors: readonly string[];
  customizationErrors: readonly string[];
  hasChangesSincePublish: boolean;
  onOpenCustomize: ReactNode;
};

export function ProfilePublicationPanel({
  status,
  publicationState,
  errors,
  customizationErrors,
  hasChangesSincePublish,
  onOpenCustomize,
}: ProfilePublicationPanelProps) {
  const hasErrors = errors.length > 0 || customizationErrors.length > 0;
  const readyMessage =
    status !== "published"
      ? "Ready to publish. The required name and one valid enabled link are present."
      : hasChangesSincePublish
        ? "Your saved changes are ready to publish."
        : "Your published profile is up to date.";

  return (
    <Card title="Publication">
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip status={status} />
        <span className="text-sm text-tapit-muted">{publicationState}</span>
      </div>
      {errors.length > 0 ? (
        <Notice tone="error">
          <ul className="grid gap-2">
            {errors.map((error, index) => (
              <li key={`${error}-${index}`}>{error}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {customizationErrors.length > 0 ? (
        <Notice tone="error">
          Some customization settings need attention before you can publish.
          <span className="mt-3 block">{onOpenCustomize}</span>
        </Notice>
      ) : null}
      {!hasErrors ? <Notice tone="success">{readyMessage}</Notice> : null}
    </Card>
  );
}
