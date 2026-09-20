"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../../../convex/_generated/api";
import { CardPreviewDialog } from "@/components/card-builder/CardPreviewDialog";
import { Brand } from "@/components/layout/Brand";
import { Notice } from "@/components/ui/Notice";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CARD_DESIGN_ACCEPT, validateCardDesignFile } from "@/lib/card-design";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { useDemoSession } from "@/lib/demo/store";
import type { CardDesignPreview } from "@/lib/card-design";

export const BUILD_CARD_CANVA_URL = "https://canva.link/tapit-templates";

export function BuildCardExperience() {
  if (isLocalDemoMode()) return <LocalDemoBuildCardExperience />;
  return <LiveBuildCardExperience />;
}

function LocalDemoBuildCardExperience() {
  const session = useDemoSession();
  return <BuildCardWorkspace authLoading={false} isAuthenticated={session?.role === "customer"} />;
}

function LiveBuildCardExperience() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess, isAuthenticated ? {} : "skip");
  const authLoading = isLoading || (isAuthenticated && access === undefined);

  return (
    <BuildCardWorkspace
      authLoading={authLoading}
      isAuthenticated={access?.authenticated === true && access.role === "customer"}
    />
  );
}

export function BuildCardWorkspace({
  authLoading,
  isAuthenticated,
}: {
  authLoading: boolean;
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<CardDesignPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderingComingSoon, setOrderingComingSoon] = useState(false);

  const revokePreviewUrl = useCallback(() => {
    if (objectUrlRef.current === null) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  const clearSelection = useCallback(() => {
    revokePreviewUrl();
    setPreview(null);
    setError(null);
    setOrderingComingSoon(false);
    if (inputRef.current !== null) inputRef.current.value = "";
  }, [revokePreviewUrl]);

  useEffect(() => () => revokePreviewUrl(), [revokePreviewUrl]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const validationError = validateCardDesignFile(file);
    if (validationError !== null) {
      revokePreviewUrl();
      setPreview(null);
      setOrderingComingSoon(false);
      setError(validationError);
      event.target.value = "";
      return;
    }

    if (file === null) return;
    revokePreviewUrl();
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setError(null);
    setOrderingComingSoon(false);
    setPreview({ name: file.name, size: file.size, url });
  }

  function handleOrder() {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/login?next=%2Fbuild-card");
      return;
    }
    setOrderingComingSoon(true);
  }

  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-tapit-paper text-tapit-ink">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col px-5 sm:px-10">
        <header className="flex items-center justify-between border-b border-tapit-line py-5 sm:py-7">
          <Brand />
          <Link
            className="inline-flex min-h-11 items-center text-base font-medium text-tapit-muted transition hover:text-tapit-ink"
            href="/login"
          >
            Sign in
          </Link>
        </header>

        <section className="flex flex-1 items-center py-14 sm:py-20">
          <div className="grid w-full gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
            <div className="max-w-xl">
              <StatusBadge status="Coming soon" />
              <h1 className="mt-5 text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">
                Bring your card to life
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-tapit-muted sm:text-lg sm:leading-8">
                Start with a template in Canva, or upload a design you already love. We&apos;ll take
                it from there when custom card ordering opens.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <a
                aria-label="Build your own with Canva"
                className="group flex min-h-56 flex-col justify-between rounded-tapit border border-tapit-line bg-tapit-surface p-6 shadow-[0_12px_40px_rgba(21,25,24,0.04)] transition hover:-translate-y-1 hover:border-tapit-accent sm:p-7"
                href={BUILD_CARD_CANVA_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
                  Start fresh
                </span>
                <span>
                  <span className="block text-xl font-semibold tracking-tight">
                    Build your own with Canva
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-tapit-muted">
                    Open our templates and create a design that feels like you.
                  </span>
                </span>
              </a>

              <label
                className="flex min-h-56 cursor-pointer flex-col justify-between rounded-tapit border border-tapit-line bg-tapit-surface p-6 shadow-[0_12px_40px_rgba(21,25,24,0.04)] transition hover:-translate-y-1 hover:border-tapit-accent sm:p-7"
                htmlFor="card-design-upload"
              >
                <span className="text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
                  Already got your design?
                </span>
                <span>
                  <span className="block text-xl font-semibold tracking-tight">
                    Upload your design
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-tapit-muted">
                    PNG or JPG, up to 10 MB.
                  </span>
                </span>
                <input
                  accept={CARD_DESIGN_ACCEPT}
                  aria-label="Upload your design"
                  className="sr-only"
                  id="card-design-upload"
                  onChange={handleFileChange}
                  ref={inputRef}
                  type="file"
                />
              </label>
            </div>
          </div>
        </section>

        {error !== null ? <Notice tone="error">{error}</Notice> : null}
        <footer className="border-t border-tapit-line py-5 text-xs text-tapit-muted sm:py-6">
          A focused workspace for a more memorable introduction.
        </footer>
      </div>

      {preview !== null ? (
        <CardPreviewDialog
          file={preview}
          onChooseAnother={clearSelection}
          onClose={clearSelection}
          onOrder={handleOrder}
          orderingComingSoon={orderingComingSoon}
        />
      ) : null}
    </main>
  );
}
