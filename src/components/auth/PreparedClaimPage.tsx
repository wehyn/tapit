"use client";

import { useEffect, useReducer, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";

import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { Brand } from "@/components/layout/Brand";
import { ButtonLink } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import {
  firstName,
  initialClaimState,
  transitionClaimState,
  type SetupPreview,
} from "@/components/auth/setup-claim-state";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { claimSetup, getDemoSession, setDemoSession } from "@/lib/demo/store";
import { api } from "../../../convex/_generated/api";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function PreparedClaimPage({
  preview,
  token,
  tokenHash,
}: {
  preview: SetupPreview;
  token: string;
  tokenHash: string;
}) {
  return isLocalDemoMode() ? (
    <DemoPreparedClaimPage preview={preview} token={token} />
  ) : (
    <ConvexPreparedClaimPage preview={preview} token={token} tokenHash={tokenHash} />
  );
}

function useClaimState(preview: SetupPreview) {
  const [state, dispatch] = useReducer(transitionClaimState, initialClaimState);
  useEffect(() => {
    dispatch({ type: "PREVIEW_VALID", preview });
  }, [dispatch, preview]);
  return [state, dispatch] as const;
}

function useClaimRedirect(state: ReturnType<typeof useClaimState>[0]) {
  const router = useRouter();
  useEffect(() => {
    if (state.status !== "claimed") return;
    const timer = window.setTimeout(() => router.replace("/app/profile"), 2500);
    return () => window.clearTimeout(timer);
  }, [router, state.status]);
}

function DemoPreparedClaimPage({ preview, token }: { preview: SetupPreview; token: string }) {
  const [state, dispatch] = useClaimState(preview);
  const attempted = useRef(false);
  useClaimRedirect(state);

  useEffect(() => {
    if (attempted.current || state.status !== "valid" || getDemoSession()?.role !== "customer")
      return;
    attempted.current = true;
    dispatch({ type: "SIGN_IN_RETURNED" });
    void claimSetup(token).then(
      (claimed) => dispatch({ type: claimed ? "CLAIM_SUCCEEDED" : "CLAIM_FAILED" }),
      () => dispatch({ type: "CLAIM_FAILED" }),
    );
  }, [dispatch, state.status, token]);

  async function continueWithGoogle() {
    if (state.status !== "valid") return;
    attempted.current = true;
    dispatch({ type: "SIGN_IN" });
    setDemoSession({ email: `google-user-${preview.slug}@tapit.local`, role: "customer" });
    dispatch({ type: "SIGN_IN_RETURNED" });
    try {
      const claimed = await claimSetup(token);
      dispatch({ type: claimed ? "CLAIM_SUCCEEDED" : "CLAIM_FAILED" });
    } catch {
      dispatch({ type: "CLAIM_FAILED" });
    }
  }

  return (
    <PreparedClaimView
      onContinue={() => void continueWithGoogle()}
      preview={preview}
      state={state}
    />
  );
}

function ConvexPreparedClaimPage({
  preview,
  token,
  tokenHash,
}: {
  preview: SetupPreview;
  token: string;
  tokenHash: string;
}) {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const claimMutation = useMutation(api.invitations.claim);
  const [state, dispatch] = useClaimState(preview);
  const attempted = useRef(false);
  useClaimRedirect(state);

  useEffect(() => {
    if (authLoading || !isAuthenticated || attempted.current || state.status !== "valid") return;
    attempted.current = true;
    dispatch({ type: "SIGN_IN_RETURNED" });
    void claimMutation({ tokenHash }).then(
      (result) => {
        if (result.ok) dispatch({ type: "CLAIM_SUCCEEDED" });
        else dispatch({ type: "CLAIM_FAILED" });
      },
      () => dispatch({ type: "CLAIM_FAILED" }),
    );
  }, [authLoading, claimMutation, dispatch, isAuthenticated, state.status, tokenHash]);

  async function continueWithGoogle() {
    if (state.status !== "valid") return;
    dispatch({ type: "SIGN_IN" });
    try {
      await signIn("google", { redirectTo: `/setup/${token}` });
    } catch {
      dispatch({ type: "SIGN_IN_RETURNED" });
      dispatch({ type: "CLAIM_FAILED" });
    }
  }

  return (
    <PreparedClaimView
      onContinue={() => void continueWithGoogle()}
      preview={preview}
      state={state}
    />
  );
}

function PreparedClaimView({
  onContinue,
  preview,
  state,
}: {
  onContinue: () => void;
  preview: SetupPreview;
  state: ReturnType<typeof useClaimState>[0];
}) {
  if (state.status === "invalid") return <InvalidClaim />;
  if (state.status === "loading") return <LoadingClaim />;
  if (state.status === "claimed") {
    return (
      <ClaimShell>
        <div aria-live="polite" className="grid gap-4 text-center" role="status">
          <Chip tone="ok">Profile linked</Chip>
          <h1 className="text-xl font-semibold tracking-tight text-tapit-ink">
            You&apos;re all set, {firstName(preview.name)}
          </h1>
          <p className="text-sm text-tapit-muted">Your Google account is linked to this profile.</p>
          <ButtonLink className="w-full" href="/app/profile">
            Go to my profile
          </ButtonLink>
        </div>
      </ClaimShell>
    );
  }

  const busy = state.status === "signing-in" || state.status === "claiming";
  return (
    <ClaimShell>
      <div className="flex flex-col gap-2">
        <Chip tone="accent">You&apos;ve been invited</Chip>
        <h1 className="text-xl font-semibold tracking-tight text-tapit-ink">
          Finish setting up your profile
        </h1>
        <p className="text-sm text-tapit-muted">Sign in with Google to make this profile yours.</p>
      </div>
      <section
        aria-label="Profile summary"
        className="flex flex-col gap-3 rounded-control bg-tapit-soft-surface p-4"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-full bg-tapit-accent text-sm font-semibold text-white"
          >
            {initials(preview.name)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-tapit-ink">{preview.name}</h2>
            {preview.bio ? <p className="text-sm text-tapit-muted">{preview.bio}</p> : null}
          </div>
        </div>
        {preview.links.length ? (
          <ul aria-label="Profile links" className="flex flex-wrap gap-2">
            {preview.links.map((link) => (
              <li key={`${link.label}-${link.url}`}>
                <Chip>{link.label}</Chip>
              </li>
            ))}
          </ul>
        ) : preview.contactEmail ? (
          <p className="break-all text-sm text-tapit-muted">{preview.contactEmail}</p>
        ) : null}
      </section>
      {busy ? (
        <p aria-live="polite" className="text-sm text-tapit-muted">
          {state.status === "claiming" ? "Finishing your setup…" : "Connecting to Google…"}
        </p>
      ) : null}
      <GoogleSignInButton pending={busy} onClick={onContinue} />
      <p className="text-center text-xs text-tapit-muted">
        By continuing you agree to the{" "}
        <Link className="font-semibold text-tapit-accent-strong underline" href="/terms">
          Terms
        </Link>{" "}
        and{" "}
        <Link className="font-semibold text-tapit-accent-strong underline" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </ClaimShell>
  );
}

function ClaimShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-tapit-paper px-4 py-8 sm:py-12">
      <Brand showMark={false} />
      <div className="flex w-full max-w-md flex-col gap-6 rounded-card bg-tapit-surface p-6 shadow-card">
        {children}
      </div>
    </main>
  );
}

export function InvalidClaim() {
  return (
    <ClaimShell>
      <div
        className="flex flex-col items-center gap-3 py-3 text-center"
        role="alert"
        aria-live="polite"
      >
        <span className="grid size-12 place-items-center rounded-full bg-tapit-warning-soft text-tapit-warning-ink">
          <Icon name="warning" size={24} />
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-tapit-ink">
          This link is no longer valid
        </h1>
        <p className="text-sm text-tapit-muted">Ask the person who sent it for a new one.</p>
      </div>
    </ClaimShell>
  );
}

export function LoadingClaim() {
  return (
    <ClaimShell>
      <div aria-label="Loading setup link" aria-live="polite" className="grid gap-4" role="status">
        <span className="h-7 w-32 animate-pulse rounded-full bg-tapit-soft-surface" />
        <span className="h-7 w-3/4 animate-pulse rounded-control bg-tapit-soft-surface" />
        <span className="h-20 animate-pulse rounded-control bg-tapit-soft-surface" />
      </div>
    </ClaimShell>
  );
}
