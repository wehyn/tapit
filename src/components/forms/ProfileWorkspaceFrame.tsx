import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircleIcon, EyeIcon, FloppyDiskIcon, UploadSimpleIcon } from "@phosphor-icons/react";

import type { PublicProfileProjection } from "@/lib/domain";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { WorkspacePreview } from "@/components/workspace/WorkspacePreview";
import { useDraftSaveLink, type DraftDepartureState } from "@/components/layout/DraftSaveContext";

export type PublishRequirement = {
  id: string;
  message: string;
  href: "/app/profile" | "/app/links" | "/app/customize";
  actionLabel: string;
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
  draftStatus?: ReactNode;
  cropDialog?: ReactNode;
  departureState?: DraftDepartureState;
  onSaveAndContinue?: () => void;
  onStayHere?: () => void;
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
  draftStatus,
  cropDialog,
  departureState,
  onSaveAndContinue,
  onStayHere,
}: ProfileWorkspaceFrameProps) {
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [requirementsDialogOpen, setRequirementsDialogOpen] = useState(false);
  const editorRef = useRef<HTMLElement>(null);
  const focusEditorOnDialogCloseRef = useRef(false);
  const isBusy = saveLoading || publishLoading;
  const shouldShowActions = hasDraftChanges || isBusy;
  const actionBarVisibility = mobileView === "preview" ? "hidden min-[1280px]:block" : "";
  const bottomPadding = shouldShowActions
    ? mobileView === "preview"
      ? "pb-8 min-[1280px]:pb-28"
      : "pb-44 sm:pb-28"
    : "pb-8";
  const selectedViewClass = "block min-[1280px]:block";
  const hiddenViewClass = "hidden min-[1280px]:block";
  const closeRequirementsDialog = useCallback(() => {
    setRequirementsDialogOpen(false);
  }, []);
  const handleRequirementAction = useCallback(() => {
    focusEditorOnDialogCloseRef.current = true;
    setRequirementsDialogOpen(false);
    setMobileView("edit");
  }, []);

  useEffect(() => {
    if (requirementsDialogOpen || !focusEditorOnDialogCloseRef.current) return;
    focusEditorOnDialogCloseRef.current = false;
    const focusFrame = window.requestAnimationFrame(() => editorRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, [requirementsDialogOpen]);

  useEffect(() => {
    if (firstVisitRequirementKey === undefined || publishRequirements.length === 0) return;
    const storageKey = `tapit:publish-requirements:${firstVisitRequirementKey}`;
    if (hasSeenPublishRequirements(storageKey)) return;
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
      className={`mx-auto grid min-w-0 w-full max-w-[1480px] gap-6 px-4 pt-6 sm:gap-8 sm:px-8 sm:pt-7 min-[1280px]:grid-cols-[minmax(32rem,1.12fr)_minmax(25rem,0.88fr)] min-[1280px]:gap-10 min-[1280px]:pt-8 ${bottomPadding}`}
    >
      <div className="col-span-full flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="tapit-display text-2xl font-semibold tracking-tight text-tapit-ink sm:text-3xl">
            {title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${hasPublishedProfile ? "bg-tapit-accent-soft text-tapit-accent-strong" : "bg-tapit-paper text-tapit-muted"}`}
            >
              {hasPublishedProfile ? "Published" : "Draft"}
            </span>
            {draftStatus != null ? (
              <span aria-live="polite" className="text-sm text-tapit-muted" role="status">
                {draftStatus}
              </span>
            ) : null}
          </div>
        </div>
        <div className="min-[1280px]:hidden">
          <div
            aria-label={`${title} view`}
            className="inline-flex rounded-tapit border border-tapit-line bg-tapit-surface p-1"
            role="group"
          >
            {(["edit", "preview"] as const).map((view) => (
              <button
                aria-pressed={mobileView === view}
                className={`min-h-9 rounded-[10px] px-3 text-sm font-semibold capitalize transition ${mobileView === view ? "bg-tapit-accent text-white" : "text-tapit-muted hover:bg-tapit-paper hover:text-tapit-ink"}`}
                key={view}
                onClick={() => setMobileView(view)}
                type="button"
              >
                {view === "edit" ? (
                  "Edit"
                ) : (
                  <>
                    <EyeIcon aria-hidden="true" className="mr-1.5 inline" size={16} />
                    Preview
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <section
        aria-label={`${title} editor`}
        className={`grid min-w-0 self-start gap-6 ${mobileView === "edit" ? selectedViewClass : hiddenViewClass}`}
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
        className={`h-fit min-w-0 scroll-mt-24 min-[1280px]:sticky min-[1280px]:top-6 ${mobileView === "preview" ? selectedViewClass : hiddenViewClass}`}
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
      {shouldShowActions ? (
        <div
          className={`fixed inset-x-0 bottom-0 z-20 border-t border-tapit-line bg-tapit-surface/95 px-4 py-3 shadow-[0_-12px_35px_rgba(27,36,51,0.08)] backdrop-blur sm:px-8 xl:right-auto xl:w-[min(calc(50vw_-_122px),48rem)] ${actionBarVisibility}`}
        >
          <section aria-label="Draft actions" className="mx-auto max-w-[1440px]" role="region">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <CheckCircleIcon
                  aria-hidden="true"
                  className="shrink-0 text-tapit-accent"
                  size={21}
                  weight="fill"
                />
                <span className="font-semibold text-tapit-ink">Draft changes</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={saveDisabled}
                  loading={saveLoading}
                  onClick={onSave}
                  type="button"
                  variant="secondary"
                >
                  <FloppyDiskIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
                  Save draft
                </Button>
                <Button
                  aria-haspopup="dialog"
                  disabled={publishDisabled}
                  loading={publishLoading}
                  onClick={handlePublish}
                  type="button"
                >
                  <UploadSimpleIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
                  {publishLabel}
                </Button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
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
  if (href === "/app/customize") return "Customize";
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
  href,
  label,
  onInterceptedClick,
}: {
  href: PublishRequirement["href"];
  label: string;
  onInterceptedClick: () => void;
}) {
  const onClick = useDraftSaveLink(href, onInterceptedClick);

  return (
    <ButtonLink href={href} onClick={onClick} variant="secondary">
      {label}
    </ButtonLink>
  );
}

function PublishRequirementsDialog({
  onClose,
  onRequirementAction,
  requirements,
}: {
  onClose: () => void;
  onRequirementAction: () => void;
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-tapit-ink/45 px-5 py-8 backdrop-blur-[2px]">
      <div
        aria-describedby="publish-requirements-description"
        aria-labelledby="publish-requirements-title"
        aria-modal="true"
        className="max-h-[calc(100dvh-4rem)] w-full max-w-lg overflow-y-auto rounded-tapit border border-tapit-line bg-tapit-surface p-6 shadow-[0_20px_56px_rgba(27,36,51,0.14)] sm:p-8"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2
          className="text-xl font-semibold tracking-tight text-tapit-ink"
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
        <ul className="mt-5 grid gap-4">
          {requirements.map((requirement) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 rounded-tapit border border-tapit-line bg-tapit-paper p-4"
              key={requirement.id}
            >
              <span className="min-w-0 flex-1 text-sm font-medium leading-6 text-tapit-ink">
                {requirement.message}
              </span>
              <PublishRequirementAction
                href={requirement.href}
                label={requirement.actionLabel}
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
