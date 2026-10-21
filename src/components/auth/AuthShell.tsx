import type { ReactNode } from "react";

import { Brand } from "@/components/layout/Brand";
import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export type AuthMode = "signin" | "signup";
export type AuthVariant = "demo" | "hosted-demo" | "google";

function authDescription(variant: AuthVariant, mode: AuthMode) {
  if (variant === "google")
    return mode === "signup"
      ? "Use your Google account to create a shareable profile for your bio, portfolio, socials, and contact links."
      : "Use your Google account to manage your profile, links, and publication state.";
  return mode === "signup"
    ? "Create a shareable profile for your bio, portfolio, socials, and contact links."
    : "Sign in to edit your profile and see who is tapping.";
}

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
  const modeItemClass = (active: boolean) =>
    `inline-flex min-h-11 items-center justify-center rounded-control px-3 text-center text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
      active
        ? "bg-tapit-accent-soft text-tapit-accent-strong"
        : "text-tapit-muted hover:text-tapit-ink"
    }`;

  return (
    <div className="flex min-h-dvh flex-col gap-4 bg-tapit-paper p-4 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-6 px-2 py-2 sm:px-6 lg:px-8">
        <div className="flex">
          <Brand />
        </div>
        <main className="flex flex-1 items-center justify-center py-6">
          <div className="flex w-full max-w-md flex-col gap-6 rounded-card bg-tapit-surface p-6 shadow-card sm:p-8">
            <div className="flex flex-col gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-tapit-ink">
                {mode === "signup" ? "Create your Tapit profile" : "Welcome back"}
              </h1>
              <p className="text-sm text-tapit-muted">{authDescription(variant, mode)}</p>
            </div>
            {variant === "google" ? null : (
              <div className="grid grid-cols-2 gap-1 rounded-control bg-tapit-soft-surface p-1">
                <button
                  className={modeItemClass(mode === "signup")}
                  disabled={modeChangeDisabled}
                  onClick={() => onModeChange("signup")}
                  type="button"
                >
                  New to Tapit? Create your profile
                </button>
                <button
                  className={modeItemClass(mode === "signin")}
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
              <p className="text-center text-sm text-tapit-muted">
                Need help?{" "}
                <a
                  className="font-semibold text-tapit-accent-strong hover:underline"
                  href={supportUrl}
                >
                  Contact support
                </a>
              </p>
            ) : null}
            {demoHint ? (
              <Notice>
                Local demo: use <strong>mara@example.test</strong> or{" "}
                <strong>admin@tapit.local</strong> with password <strong>tapit-demo</strong>.
              </Notice>
            ) : null}
          </div>
        </main>
        <footer className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
          <ButtonLink href="/privacy" variant="quiet">
            Privacy
          </ButtonLink>
          <ButtonLink href="/terms" variant="quiet">
            Terms
          </ButtonLink>
        </footer>
      </div>
      <div
        aria-hidden="true"
        className="flex flex-1 flex-col items-center justify-center gap-8 rounded-card bg-tapit-accent p-6 text-center text-white sm:p-12"
      >
        <div className="flex w-full max-w-72 flex-col items-center gap-4 rounded-card bg-tapit-surface p-3 shadow-card">
          <div className="flex w-full flex-col items-center gap-4 rounded-card bg-tapit-paper px-4 pt-6 pb-4">
            <span className="grid size-22 place-items-center rounded-full bg-tapit-accent text-xl font-semibold text-white">
              MV
            </span>
            <div className="flex flex-col items-center gap-1">
              <p className="text-lg font-semibold text-tapit-ink">Mara Velasquez</p>
              <p className="text-sm text-tapit-muted">Brand systems for independent teams.</p>
            </div>
            <span className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-tapit-accent px-4 text-sm font-semibold text-white">
              Save contact
            </span>
            <span className="flex min-h-11 w-full items-center rounded-control bg-tapit-surface px-4 text-sm font-semibold text-tapit-ink shadow-card">
              Portfolio
            </span>
          </div>
        </div>
        <p className="text-xs text-tapit-accent-soft">Illustrative example</p>
        <div className="flex max-w-sm flex-col gap-2">
          <p className="text-lg font-semibold">One profile for every introduction</p>
          <p className="text-sm text-tapit-accent-soft">
            Your card, your QR code and your link all open the same page.
          </p>
        </div>
      </div>
    </div>
  );
}
