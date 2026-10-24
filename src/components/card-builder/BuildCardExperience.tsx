"use client";

import { useRouter } from "next/navigation";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../../../convex/_generated/api";
import { CardPreviewDialog } from "@/components/card-builder/CardPreviewDialog";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Chip } from "@/components/ui/Chip";
import { CARD_DESIGN_ACCEPT, validateCardDesignFile } from "@/lib/card-design";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { useDemoSession } from "@/lib/demo/store";
import type { CardDesignPreview } from "@/lib/card-design";

export const BUILD_CARD_CANVA_URL = "https://canva.link/tapit-templates";
const CARD_DESIGN_UPLOAD_ERROR_ID = "card-design-upload-error";

export function BuildCardExperience({ embedded = false }: { embedded?: boolean } = {}) {
  const showPublicHeader = !embedded;

  if (isLocalDemoMode()) {
    return <LocalDemoBuildCardExperience showPublicHeader={showPublicHeader} />;
  }
  return <LiveBuildCardExperience showPublicHeader={showPublicHeader} />;
}

function LocalDemoBuildCardExperience({ showPublicHeader }: { showPublicHeader: boolean }) {
  const session = useDemoSession();
  return (
    <BuildCardWorkspace
      authLoading={false}
      isAuthenticated={session !== null}
      showPublicHeader={showPublicHeader}
    />
  );
}

function LiveBuildCardExperience({ showPublicHeader }: { showPublicHeader: boolean }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess, isAuthenticated ? {} : "skip");
  const authLoading = isLoading || (isAuthenticated && access === undefined);

  return (
    <BuildCardWorkspace
      authLoading={authLoading}
      isAuthenticated={access?.authenticated === true}
      showPublicHeader={showPublicHeader}
    />
  );
}

function DesignOptions({
  inputRef,
  onFileChange,
  tone,
  uploadError,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  tone: "card" | "tile";
  uploadError: boolean;
}) {
  const option =
    tone === "card"
      ? "bg-tapit-surface shadow-card hover:bg-tapit-accent-soft"
      : "bg-tapit-soft-surface hover:bg-tapit-accent-soft";
  const iconBox = tone === "card" ? "bg-tapit-accent-soft" : "bg-tapit-surface";
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <a
        aria-label="Build your own with Canva"
        className={`group flex min-h-14 items-center gap-4 rounded-control p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus ${option}`}
        href={BUILD_CARD_CANVA_URL}
        rel="noopener noreferrer"
        target="_blank"
      >
        <span
          aria-hidden="true"
          className={`grid size-11 shrink-0 place-items-center rounded-control text-tapit-accent ${iconBox}`}
        >
          <Icon name="paintBrush" size={21} weight="bold" />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-semibold tracking-widest text-tapit-accent uppercase">
            Start fresh
          </span>
          <span className="text-sm font-semibold text-tapit-ink">Build your own with Canva</span>
          <span className="text-xs text-tapit-muted">
            Open our templates and create a design that feels like you.
          </span>
        </span>
      </a>

      <label
        className={`group flex min-h-14 cursor-pointer items-center gap-4 rounded-control p-4 transition-colors focus-within:ring-2 focus-within:ring-tapit-focus ${option}`}
        htmlFor="card-design-upload"
      >
        <span
          aria-hidden="true"
          className={`grid size-11 shrink-0 place-items-center rounded-control text-tapit-accent ${iconBox}`}
        >
          <Icon name="upload" size={21} weight="bold" />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-semibold tracking-widest text-tapit-accent uppercase">
            Already got your design?
          </span>
          <span className="text-sm font-semibold text-tapit-ink">Upload your design</span>
          <span className="text-xs text-tapit-muted">PNG or JPG, up to 10 MB.</span>
        </span>
        <input
          accept={CARD_DESIGN_ACCEPT}
          aria-label="Upload your design"
          aria-describedby={uploadError ? CARD_DESIGN_UPLOAD_ERROR_ID : undefined}
          aria-invalid={uploadError ? true : undefined}
          className="sr-only"
          id="card-design-upload"
          onChange={onFileChange}
          ref={inputRef}
          type="file"
        />
      </label>
    </div>
  );
}

export function BuildCardWorkspace({
  authLoading,
  isAuthenticated,
  showPublicHeader = true,
}: {
  authLoading: boolean;
  isAuthenticated: boolean;
  showPublicHeader?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<CardDesignPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revokePreviewUrl = useCallback(() => {
    if (objectUrlRef.current === null) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  const clearSelection = useCallback(() => {
    revokePreviewUrl();
    setPreview(null);
    setError(null);
    if (inputRef.current !== null) inputRef.current.value = "";
  }, [revokePreviewUrl]);

  useEffect(() => () => revokePreviewUrl(), [revokePreviewUrl]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const validationError = validateCardDesignFile(file);
    if (validationError !== null) {
      revokePreviewUrl();
      setPreview(null);
      setError(validationError);
      event.target.value = "";
      return;
    }

    if (file === null) return;
    revokePreviewUrl();
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setError(null);
    setPreview({ name: file.name, size: file.size, url });
  }

  function handleOrder() {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent("/app/account/order-card")}`);
      return;
    }
    router.push("/app/account/order-card");
  }

  const Root = showPublicHeader ? "main" : "div";
  const uploadError = error !== null;
  const errorNotice =
    error !== null ? (
      <div id={CARD_DESIGN_UPLOAD_ERROR_ID}>
        <Notice tone="error">{error}</Notice>
      </div>
    ) : null;
  const designOptions = (tone: "card" | "tile") => (
    <DesignOptions
      inputRef={inputRef}
      onFileChange={handleFileChange}
      tone={tone}
      uploadError={uploadError}
    />
  );

  return (
    <Root className={showPublicHeader ? "min-h-dvh bg-tapit-paper text-tapit-ink" : undefined}>
      {showPublicHeader ? <PublicHeader activeHref="/build-card" /> : null}
      {showPublicHeader ? (
        <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 sm:px-8">
          <section className="flex flex-1 items-center py-12">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
              <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
                <Chip tone="accent">Design your physical card</Chip>
                <h1 className="tapit-display text-2xl font-medium tracking-tight sm:text-2xl">
                  Bring your card to life
                </h1>
                <p className="max-w-xl text-base text-tapit-muted sm:text-lg">
                  Create or upload a design, preview it here, then continue to the order form.
                </p>
              </div>
              {designOptions("card")}
              {errorNotice}
            </div>
          </section>
          <footer className="py-4 text-xs text-tapit-muted">
            A focused workspace for a more memorable introduction.
          </footer>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="tapit-display text-xl font-semibold text-tapit-ink">
              Bring your card to life
            </h1>
            <p className="text-base text-tapit-muted">
              Create or upload a design, preview it here, then continue to the order form.
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2" title="Card design">
              {designOptions("tile")}
              {errorNotice}
            </Card>
            <Card
              description="Choose a design, add delivery details, and arrange payment on the order form."
              title="Order printed cards"
            >
              <Chip tone="accent">Choose a design first</Chip>
            </Card>
          </div>
        </div>
      )}

      {preview !== null ? (
        <CardPreviewDialog
          file={preview}
          onChooseAnother={clearSelection}
          onClose={clearSelection}
          onOrder={handleOrder}
        />
      ) : null}
    </Root>
  );
}
