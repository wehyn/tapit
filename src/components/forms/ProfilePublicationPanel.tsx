import { CheckCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { ProfileStatus } from "@/lib/domain";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";

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

  return (
    <Panel className="shadow-none" title="Publication">
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <StatusBadge status={status} />
        <span className="text-sm text-tapit-muted">{publicationState}</span>
      </div>
      {errors.length > 0 ? (
        <ul className="mt-5 grid gap-2 text-sm text-tapit-muted">
          {errors.map((error, index) => (
            <li className="flex gap-2" key={`${error}-${index}`}>
              <span aria-hidden="true" className="text-tapit-danger">
                !
              </span>
              {error}
            </li>
          ))}
        </ul>
      ) : null}
      {customizationErrors.length > 0 ? (
        <div className="mt-5">
          <Notice tone="error">
            Some customization settings need attention before you can publish.
            <span className="mt-3 block">{onOpenCustomize}</span>
          </Notice>
        </div>
      ) : null}
      {!hasErrors ? (
        status === "published" && !hasChangesSincePublish ? (
          <p className="mt-5 flex items-center gap-2 text-sm text-[#17352b]">
            <CheckCircleIcon aria-hidden="true" size={18} weight="fill" />
            Your published profile is up to date.
          </p>
        ) : (
          <p className="mt-5 flex items-center gap-2 text-sm text-[#17352b]">
            <CheckCircleIcon aria-hidden="true" size={18} weight="fill" />
            {status === "published"
              ? "Your saved changes are ready to publish."
              : "Ready to publish. The required name and one valid enabled link are present."}
          </p>
        )
      ) : null}
    </Panel>
  );
}
