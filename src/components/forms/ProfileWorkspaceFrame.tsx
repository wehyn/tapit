import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { PublicProfileProjection } from "@/lib/domain";
import type { ProfileCustomizationCategory } from "@/lib/profile-workspace";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Segmented } from "@/components/ui/Segmented";
import { WorkspacePreview } from "@/components/workspace/WorkspacePreview";
import { useDraftSaveLink, type DraftDepartureState } from "@/components/layout/DraftSaveContext";

export type PublishRequirement =
  | {
      id: string;
      kind: "profile";
      message: string;
      href: "/app/profile";
      actionLabel: "Open Profile";
    }
  | {
      id: string;
      kind: "links";
      message: string;
      href: "/app/links";
      actionLabel: "Open Links";
    }
  | {
      id: string;
      kind: "customization";
      section: ProfileCustomizationCategory;
      message: string;
      href: string;
      actionLabel: "Open Customize";
    };

function hasSeenPublishRequirements(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey) === "shown";
  } catch {
    return false;
  }
}

function rememberPublishRequirements(storageKey: string) {
  try {
    window.localStorage.setItem(storageKey, "shown");
  } catch {
    return;
  }
}

export type ProfileWorkspaceFrameProps = {
  title: string;
  controls: ReactNode;
  message?: ReactNode;
  preview: PublicProfileProjection | null;
  profileUrl: string;
  hasPublishedProfile: boolean;
  hasDraftChanges: boolean;
  saveDisabled: boolean;
  saveLoading?: boolean;
  onSave: () => void;
  publishDisabled: boolean;
  publishLoading?: boolean;
  onPublish: () => void;
  publishLabel: string;
  publishRequirements?: readonly PublishRequirement[];
  firstVisitRequirementKey?: string;
  cropDialog?: ReactNode;
  departureState?: DraftDepartureState;
  onSaveAndContinue?: () => void;
  onStayHere?: () => void;
  onRequirementAction?: (requirement: PublishRequirement) => void;
};

export function ProfileWorkspaceFrame({
  title,
  controls,
  message,
  preview,
  profileUrl,
  hasPublishedProfile,
  hasDraftChanges,
  saveDisabled,
  saveLoading = false,
  onSave,
  publishDisabled,
  publishLoading = false,
  onPublish,
  publishLabel,
  publishRequirements = [],
  firstVisitRequirementKey,
  cropDialog,
  departureState,
  onSaveAndContinue,
  onStayHere,
  onRequirementAction,
}: ProfileWorkspaceFrameProps) {
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [requirementsDialogOpen, setRequirementsDialogOpen] = useState(false);
  const [resolvedRequirementKey, setResolvedRequirementKey] = useState<string | undefined>();
  const editorRef = useRef<HTMLElement>(null);
  const focusEditorOnDialogCloseRef = useRef(false);
  const isBusy = saveLoading || publishLoading;
  const shouldShowActions = hasDraftChanges || isBusy;
  const actionBarVisibility = mobileView === "preview" ? "hidden xl:block" : "";
  // Below xl the draft actions are fixed to the bottom, so the editor needs room to scroll past them.
  const bottomPadding = shouldShowActions && mobileView === "edit" ? "pb-16 xl:pb-8" : "pb-8";
  const closeRequirementsDialog = useCallback(() => {
    setRequirementsDialogOpen(false);
    setResolvedRequirementKey(firstVisitRequirementKey);
  }, [firstVisitRequirementKey]);
  const handleRequirementAction = useCallback(
    (requirement: PublishRequirement) => {
      focusEditorOnDialogCloseRef.current = requirement.kind !== "customization";
      onRequirementAction?.(requirement);
      closeRequirementsDialog();
      setMobileView("edit");
    },
    [closeRequirementsDialog, onRequirementAction],
  );

  useEffect(() => {
    if (requirementsDialogOpen || !focusEditorOnDialogCloseRef.current) return;
    focusEditorOnDialogCloseRef.current = false;
    const focusFrame = window.requestAnimationFrame(() => editorRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, [requirementsDialogOpen]);

  useEffect(() => {
    if (firstVisitRequirementKey === undefined || publishRequirements.length === 0) {
      const readyFrame = window.requestAnimationFrame(() => {
        setResolvedRequirementKey(firstVisitRequirementKey);
      });
      return () => window.cancelAnimationFrame(readyFrame);
    }
    const storageKey = `tapit:publish-requirements:${firstVisitRequirementKey}`;
    if (hasSeenPublishRequirements(storageKey)) {
      const readyFrame = window.requestAnimationFrame(() => {
        setResolvedRequirementKey(firstVisitRequirementKey);
      });
      return () => window.cancelAnimationFrame(readyFrame);
    }
    const openFrame = window.requestAnimationFrame(() => {
      rememberPublishRequirements(storageKey);
      setRequirementsDialogOpen(true);
    });
    return () => window.cancelAnimationFrame(openFrame);
  }, [firstVisitRequirementKey, publishRequirements.length]);

  function handlePublish() {
    if (publishRequirements.length > 0) {
      setRequirementsDialogOpen(true);
      return;
    }
    onPublish();
  }

  return (
    <div
      className={`mx-auto grid w-full min-w-0 max-w-[1480px] gap-4 pt-4 lg:gap-8 lg:pt-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-x-6 ${bottomPadding}`}
      data-navigation-tour-ready={
        firstVisitRequirementKey === undefined ||
        publishRequirements.length === 0 ||
        resolvedRequirementKey === firstVisitRequirementKey
          ? "true"
          : undefined
      }
    >
      <div className="col-span-full flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="tapit-display text-xl font-semibold text-tapit-ink">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="xl:hidden">
            <Segmented
              label={`${title} view`}
              onChange={setMobileView}
              options={[
                { label: "Edit", value: "edit" },
                {
                  icon: <Icon className="size-4" name="eye" />,
                  label: "Preview",
                  value: "preview",
                },
              ]}
              value={mobileView}
            />
          </div>
          {shouldShowActions ? (
            <div
              className={`fixed inset-x-0 bottom-0 z-20 px-4 pb-2 sm:px-8 lg:pb-4 xl:static xl:p-0 ${actionBarVisibility}`}
            >
              <section
                aria-label="Draft actions"
                className="mx-auto flex max-w-md flex-wrap gap-2"
                role="region"
              >
                <Button
                  className="min-w-0 flex-1 basis-0"
                  disabled={saveDisabled}
                  loading={saveLoading}
                  onClick={onSave}
                  type="button"
                  variant="secondary"
                >
                  Save draft
                </Button>
                <Button
                  aria-haspopup="dialog"
                  className="min-w-0 flex-1 basis-0"
                  disabled={publishDisabled}
                  loading={publishLoading}
                  onClick={handlePublish}
                  type="button"
                >
                  {publishLabel}
                </Button>
              </section>
            </div>
          ) : null}
        </div>
      </div>
      <section
        aria-label={`${title} editor`}
        className={`min-w-0 gap-4 self-start ${mobileView === "edit" ? "grid" : "hidden xl:grid"}`}
        ref={editorRef}
        tabIndex={-1}
      >
        {departureState?.kind === "saving" ? (
          <Notice>
            <p aria-live="polite" role="status">
              Saving your draft before opening {destinationLabel(departureState.href)}.
            </p>
          </Notice>
        ) : departureState?.kind === "repair" ? (
          <DepartureRecovery
            departure={departureState}
            onSaveAndContinue={onSaveAndContinue}
            onStayHere={onStayHere}
          />
        ) : null}
        {message}
        {controls}
      </section>
      <div
        className={`h-fit min-w-0 scroll-mt-24 xl:sticky xl:top-20 ${mobileView === "preview" ? "" : "hidden xl:block"}`}
        id="workspace-preview"
      >
        {preview ? (
          <WorkspacePreview
            preview={preview}
            profileUrl={profileUrl}
            showProfileUrl={hasPublishedProfile}
          />
        ) : (
          <Notice tone="error">Add a name and one valid link to see a preview.</Notice>
        )}
      </div>
      {cropDialog}
      {requirementsDialogOpen ? (
        <PublishRequirementsDialog
          onClose={closeRequirementsDialog}
          onRequirementAction={handleRequirementAction}
          requirements={publishRequirements}
        />
      ) : null}
    </div>
  );
}

function destinationLabel(href: string): string {
  if (href.startsWith("/app/customize")) return "Customize";
  if (href === "/app/links") return "Links";
  if (href === "/app/profile") return "Profile";
  return "the requested page";
}

function DepartureRecovery({
  departure,
  onSaveAndContinue,
  onStayHere,
}: {
  departure: Extract<DraftDepartureState, { kind: "repair" }>;
  onSaveAndContinue?: () => void;
  onStayHere?: () => void;
}) {
  const { outcome, href } = departure;
  const isError = outcome.kind === "blocked" || outcome.kind === "failed";

  return (
    <Notice tone={isError ? "error" : "neutral"}>
      <div className="grid gap-3">
        {outcome.kind === "blocked" ? (
          <ul className="grid gap-1">
            {outcome.blocker.messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : outcome.kind === "deferred" ? (
          <p>
            {outcome.reason === "crop-open"
              ? "Finish or cancel the open crop before continuing."
              : outcome.reason === "pending-media"
                ? "Media work is still in progress. Retry after it finishes."
                : "A draft save is still in progress. Retry after it finishes."}
          </p>
        ) : outcome.kind === "failed" ? (
          <p>{outcome.message}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onSaveAndContinue} type="button">
            Save and continue to {destinationLabel(href)}
          </Button>
          <Button onClick={onStayHere} type="button" variant="quiet">
            Stay here
          </Button>
        </div>
      </div>
    </Notice>
  );
}

function PublishRequirementAction({
  requirement,
  onInterceptedClick,
}: {
  requirement: PublishRequirement;
  onInterceptedClick: (requirement: PublishRequirement) => void;
}) {
  const onClick = useDraftSaveLink(requirement.href, () => onInterceptedClick(requirement));

  return (
    <ButtonLink href={requirement.href} onClick={onClick} variant="secondary">
      {requirement.actionLabel}
    </ButtonLink>
  );
}

function PublishRequirementsDialog({
  onClose,
  onRequirementAction,
  requirements,
}: {
  onClose: () => void;
  onRequirementAction: (requirement: PublishRequirement) => void;
  requirements: readonly PublishRequirement[];
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const trigger = document.activeElement;
    const getTabbableElements = (container: HTMLElement) =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          "a[href], button, input, select, textarea, [tabindex]",
        ),
      ).filter((element) => {
        const style = window.getComputedStyle(element);
        return (
          element.tabIndex >= 0 &&
          !element.matches(":disabled") &&
          element.getAttribute("aria-disabled") !== "true" &&
          element.closest('[aria-hidden="true"]') === null &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          element.getClientRects().length > 0
        );
      });
    const initialFocusTarget = getTabbableElements(dialog)[0] ?? dialog;
    initialFocusTarget.focus();

    function trapFocus(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const currentDialog = dialogRef.current;
      if (currentDialog === null) return;
      const focusable = getTabbableElements(currentDialog);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) {
        event.preventDefault();
        currentDialog.focus();
        return;
      }
      const activeElement = document.activeElement;
      const isOutsideDialog = activeElement === null || !currentDialog.contains(activeElement);
      if (
        event.shiftKey &&
        (activeElement === first || activeElement === currentDialog || isOutsideDialog)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === last || activeElement === currentDialog || isOutsideDialog)
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tapit-ink/45 px-4 py-8 backdrop-blur-[2px]">
      <div
        aria-describedby="publish-requirements-description"
        aria-labelledby="publish-requirements-title"
        aria-modal="true"
        className="max-h-[calc(100dvh-4rem)] w-full max-w-lg overflow-y-auto rounded-card bg-tapit-surface p-6 shadow-card"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2
          className="text-lg font-semibold tracking-tight text-tapit-ink"
          id="publish-requirements-title"
        >
          Before you publish
        </h2>
        <p
          className="mt-3 text-sm leading-6 text-tapit-muted"
          id="publish-requirements-description"
        >
          Your profile needs attention before it can be published. Choose an action to go straight
          to the right editor.
        </p>
        <ul className="mt-4 grid gap-4">
          {requirements.map((requirement) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-tapit-soft-surface p-4"
              key={requirement.id}
            >
              <span className="min-w-0 flex-1 text-sm font-medium leading-6 text-tapit-ink">
                {requirement.message}
              </span>
              <PublishRequirementAction
                requirement={requirement}
                onInterceptedClick={onRequirementAction}
              />
            </li>
          ))}
        </ul>
        <div className="mt-6 flex justify-end">
          <Button onClick={onClose} type="button" variant="quiet">
            Maybe later
          </Button>
        </div>
      </div>
    </div>
  );
}
