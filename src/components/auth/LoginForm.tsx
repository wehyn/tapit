"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";

import { AuthShell, type AuthMode } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { hashDemoPassword, verifyDemoPassword } from "@/lib/demo/password";
import {
  createDemoSelfServiceAccount,
  setDemoSession,
  useDemoSession,
  useDemoState,
} from "@/lib/demo/store";
import { normalizeProfileSlug, validateProfileSlug } from "@/lib/domain";
import { validateSignupInput, type SignupFormValues } from "@/lib/auth/signup";
import { api } from "../../../convex/_generated/api";

export function sanitizeReturnPath(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string" || value.length === 0 || !value.startsWith("/")) return undefined;
  if (
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    /%(?![0-9a-fA-F]{2})/.test(value)
  )
    return undefined;
  try {
    const parsed = new URL(value, "https://tapit.invalid");
    return parsed.origin === "https://tapit.invalid" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function LoginForm({
  nextPath,
  initialMode = "signin",
}: {
  nextPath?: string;
  initialMode?: AuthMode;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  return process.env.NEXT_PUBLIC_DEMO_MODE !== "false" ? (
    <DemoLoginForm mode={mode} onModeChange={setMode} nextPath={nextPath} />
  ) : (
    <LiveLoginForm mode={mode} onModeChange={setMode} nextPath={nextPath} />
  );
}

function DemoLoginForm({
  mode,
  onModeChange,
  nextPath,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  nextPath?: string;
}) {
  const router = useRouter();
  const state = useDemoState();
  const session = useDemoSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof SignupFormValues, string>>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const safeNextPath = sanitizeReturnPath(nextPath);
  useEffect(() => {
    if (mode === "signin" && session)
      router.replace(
        safeNextPath || (session.role === "admin" ? "/admin/customers" : "/app/profile"),
      );
  }, [mode, router, safeNextPath, session]);
  const availability = useMemo(() => {
    if (!slug.trim()) return null;
    const normalized = normalizeProfileSlug(slug);
    const validation = validateProfileSlug(normalized);
    if (validation) return validation;
    return state.profiles.some((profile) => profile.draft.slug === normalized)
      ? "That profile slug is already in use."
      : "Available";
  }, [slug, state.profiles]);
  function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@"))
      return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setSubmitting(true);
    const account = state.customers.find(
      (candidate) =>
        candidate.email === normalizedEmail &&
        candidate.status === "active" &&
        candidate.deletionStatus === "active",
    );
    void (async () => {
      try {
        if (!account || !(await verifyDemoPassword(password, account.passwordHash)))
          throw new Error();
        setDemoSession({ email: account.email, role: account.role });
        router.replace(
          safeNextPath || (account.role === "admin" ? "/admin/customers" : "/app/profile"),
        );
      } catch {
        setError("The email or password is not correct.");
        setSubmitting(false);
      }
    })();
  }
  function signUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const result = validateSignupInput({ email, password, confirmation, name, slug });
    setErrors(result.errors);
    if (!result.payload) return;
    setSubmitting(true);
    void (async () => {
      try {
        await createDemoSelfServiceAccount({
          email: result.payload!.email,
          name: result.payload!.name,
          slug: result.payload!.slug,
          passwordHash: await hashDemoPassword(result.payload!.password),
        });
        setDemoSession({ email: result.payload!.email, role: "customer" });
        router.replace(safeNextPath || "/app/profile");
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "The signup service is unavailable. Try again.",
        );
        setSubmitting(false);
      }
    })();
  }
  return (
    <AuthShell demoHint mode={mode} onModeChange={onModeChange} supportUrl={state.supportUrl}>
      {mode === "signup" ? (
        <form className="grid gap-5" onSubmit={signUp}>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Field
            id="signup-name"
            label="Display name"
            onChange={(e) => setName(e.target.value)}
            value={name}
            error={errors.name}
          />
          <Field
            id="signup-slug"
            label="Profile link"
            onChange={(e) => setSlug(e.target.value)}
            value={slug}
            error={errors.slug}
            help={
              availability === "Available"
                ? "Available"
                : (availability ?? "Choose the link people will share.")
            }
          />
          <Field
            autoComplete="email"
            id="signup-email"
            label="Email"
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            value={email}
            error={errors.email}
          />
          <Field
            autoComplete="new-password"
            id="signup-password"
            label="Password"
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            value={password}
            error={errors.password}
          />
          <Field
            autoComplete="new-password"
            id="signup-confirmation"
            label="Confirm password"
            onChange={(e) => setConfirmation(e.target.value)}
            type="password"
            value={confirmation}
            error={errors.confirmation}
          />
          <Button disabled={submitting} type="submit">
            {submitting ? "Creating profile" : "Create your profile"}
          </Button>
        </form>
      ) : (
        <form className="grid gap-5" onSubmit={signIn}>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Field
            autoComplete="email"
            id="email"
            label="Email"
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            value={email}
          />
          <Field
            autoComplete="current-password"
            id="password"
            label="Password"
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            value={password}
          />
          <Button disabled={submitting} type="submit">
            {submitting ? "Signing in" : "Sign in"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

function LiveLoginForm({
  mode,
  onModeChange,
  nextPath,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  nextPath?: string;
}) {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess);
  const createAccount = useMutation(api.customers.createSelfServiceAccount);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof SignupFormValues, string>>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [awaitingAuth, setAwaitingAuth] = useState(false);
  const safeNextPath = sanitizeReturnPath(nextPath);
  useEffect(() => {
    if (mode === "signin" && !authLoading && access?.authenticated)
      router.replace(
        safeNextPath || (access.role === "admin" ? "/admin/customers" : "/app/profile"),
      );
  }, [access, authLoading, mode, router, safeNextPath]);
  useEffect(() => {
    if (!awaitingAuth || !isAuthenticated) return;
    void createAccount({ name: name.trim(), slug: normalizeProfileSlug(slug) })
      .then(() => router.replace(safeNextPath || "/app/profile"))
      .catch((cause) => {
        setError(
          cause instanceof Error ? cause.message : "Your profile could not be created. Try again.",
        );
        setSubmitting(false);
        setAwaitingAuth(false);
      });
  }, [awaitingAuth, createAccount, isAuthenticated, name, router, safeNextPath, slug]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (mode === "signin") {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes("@"))
        return setError("Enter a valid email address.");
      if (password.length < 8) return setError("Password must be at least 8 characters.");
      setSubmitting(true);
      try {
        await signIn("password", { flow: "signIn", email: normalizedEmail, password });
      } catch {
        setError("The email or password is not correct.");
        setSubmitting(false);
      }
      return;
    }
    const result = validateSignupInput({ email, password, confirmation, name, slug });
    setErrors(result.errors);
    if (!result.payload) return;
    setSubmitting(true);
    try {
      setName(result.payload.name);
      setSlug(result.payload.slug);
      if (isAuthenticated && !access?.authenticated) {
        await createAccount({ name: result.payload.name, slug: result.payload.slug });
        router.replace(safeNextPath || "/app/profile");
      } else {
        await signIn("password", {
          flow: "signUp",
          email: result.payload.email,
          password: result.payload.password,
        });
        setAwaitingAuth(true);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The signup service is unavailable. Try again.",
      );
      setSubmitting(false);
    }
  }
  const loading = authLoading || access === undefined;
  const availability = useQuery(
    api.profiles.checkSlugAvailability,
    mode === "signup" && slug ? { slug } : "skip",
  );
  return (
    <AuthShell mode={mode} onModeChange={onModeChange}>
      {loading && mode === "signin" ? (
        <p className="text-sm text-tapit-muted">Checking your session…</p>
      ) : (
        <form className="grid gap-5" onSubmit={submit}>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {mode === "signup" ? (
            <>
              <Field
                id="signup-name"
                label="Display name"
                onChange={(e) => setName(e.target.value)}
                value={name}
                error={errors.name}
              />
              <Field
                id="signup-slug"
                label="Profile link"
                onChange={(e) => setSlug(e.target.value)}
                value={slug}
                error={errors.slug}
                help={
                  availability === undefined
                    ? "Checking availability…"
                    : availability.available
                      ? "Available"
                      : (availability.error ?? "That profile slug is already in use.")
                }
              />
              <Field
                autoComplete="email"
                id="signup-email"
                label="Email"
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                value={email}
                error={errors.email}
              />
              <Field
                autoComplete="new-password"
                id="signup-password"
                label="Password"
                minLength={8}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                value={password}
                error={errors.password}
              />
              <Field
                autoComplete="new-password"
                id="signup-confirmation"
                label="Confirm password"
                onChange={(e) => setConfirmation(e.target.value)}
                type="password"
                value={confirmation}
                error={errors.confirmation}
              />
              <Button disabled={submitting} type="submit">
                {submitting ? "Creating profile" : "Create your profile"}
              </Button>
            </>
          ) : (
            <>
              <Field
                autoComplete="email"
                id="live-email"
                label="Email"
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                value={email}
              />
              <Field
                autoComplete="current-password"
                id="live-password"
                label="Password"
                minLength={8}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                value={password}
              />
              <Button disabled={submitting} type="submit">
                {submitting ? "Signing in" : "Sign in"}
              </Button>
            </>
          )}
        </form>
      )}
    </AuthShell>
  );
}
