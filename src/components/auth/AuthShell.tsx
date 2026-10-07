import { ArrowUpRight, Fingerprint } from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PublicHeader } from "@/components/layout/PublicHeader";

export type AuthMode = "signin" | "signup";
export type AuthVariant = "demo" | "hosted-demo" | "google";

export function AuthShell({
  variant,
  mode,
  onModeChange,
  children,
  supportUrl,
  demoHint,
  modeChangeDisabled = false,
}: {
  variant: AuthVariant;
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  children: ReactNode;
  supportUrl?: string;
  demoHint?: boolean;
  modeChangeDisabled?: boolean;
}): ReactNode {
  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(ellipse_at_86%_0%,#e8edf9_0%,transparent_42%),#f4f6fa]">
      <PublicHeader />
      <main className="px-4 py-6 sm:px-10 sm:py-9">
        <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-6xl flex-col">
          <section className="grid flex-1 items-center gap-8 py-8 sm:gap-12 sm:py-12 lg:grid-cols-[1fr_0.82fr] lg:gap-20">
            <div className="max-w-lg">
              <Fingerprint
                aria-hidden="true"
                className="text-tapit-accent"
                size={48}
                weight="light"
              />
              <p className="tapit-eyebrow mt-6">
                {variant === "google"
                  ? "Welcome back"
                  : mode === "signup"
                    ? "Make it yours"
                    : "Welcome back"}
              </p>
              <h1 className="tapit-display mt-3 text-3xl font-semibold leading-[1.08] tracking-[-0.045em] text-tapit-ink sm:text-5xl">
                {variant === "google"
                  ? "Sign in to Tapit"
                  : mode === "signup"
                    ? "Create your Tapit profile"
                    : "Sign in to Tapit"}
              </h1>
              <p className="mt-4 max-w-sm text-base leading-7 text-tapit-muted">
                {variant === "google"
                  ? "Use your Google account to manage your profile, links, and publication state."
                  : mode === "signup"
                    ? "Create a shareable profile for your bio, portfolio, socials, and contact links."
                    : "Manage your profile, links, and publication state from one calm workspace."}
              </p>
            </div>
            <div className="rounded-tapit border border-tapit-line bg-tapit-surface p-5 shadow-[0_16px_44px_rgba(27,36,51,0.06)] sm:p-8 lg:p-9">
              {variant === "google" ? null : (
                <div className="mb-6 grid gap-2 sm:grid-cols-2">
                  <button
                    className={`min-h-12 rounded-tapit px-3 text-sm font-semibold ${mode === "signup" ? "bg-tapit-accent text-white" : "border border-tapit-line text-tapit-muted"}`}
                    disabled={modeChangeDisabled}
                    onClick={() => onModeChange("signup")}
                    type="button"
                  >
                    New to Tapit? Create your profile
                  </button>
                  <button
                    className={`min-h-12 rounded-tapit px-3 text-sm font-semibold ${mode === "signin" ? "bg-tapit-accent text-white" : "border border-tapit-line text-tapit-muted"}`}
                    disabled={modeChangeDisabled}
                    onClick={() => onModeChange("signin")}
                    type="button"
                  >
                    Already have an account? Sign in
                  </button>
                </div>
              )}
              {children}
              {supportUrl ? (
                <p className="mt-6 text-center text-xs leading-5 text-tapit-muted">
                  Need help?{" "}
                  <a className="font-semibold text-tapit-accent hover:underline" href={supportUrl}>
                    Contact support{" "}
                    <ArrowUpRight aria-hidden="true" className="ml-1 inline" size={14} />
                  </a>
                </p>
              ) : null}
              {demoHint ? (
                <p className="mt-6 rounded-tapit bg-tapit-paper px-4 py-3 text-xs leading-5 text-tapit-muted">
                  Local demo: use <strong>mara@example.test</strong> or{" "}
                  <strong>admin@tapit.local</strong> with password <strong>tapit-demo</strong>.
                </p>
              ) : null}
            </div>
          </section>
          <footer className="border-t border-tapit-line pt-4 text-xs text-tapit-muted">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>A focused workspace for a more memorable introduction.</span>
              <span className="flex gap-4">
                <Link className="underline" href="/privacy">
                  Privacy
                </Link>
                <Link className="underline" href="/terms">
                  Terms
                </Link>
              </span>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
