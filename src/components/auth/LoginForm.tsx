"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";

import { AuthShell, type AuthMode } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { hashDemoPassword, verifyDemoPassword } from "@/lib/demo/password";
import { isHostedDemoMode, isLocalDemoMode } from "@/lib/demo/mode";
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
  resetEmail,
}: {
  nextPath?: string;
  initialMode?: AuthMode;
  resetEmail?: string;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  return isLocalDemoMode() ? (
    <DemoLoginForm mode={mode} onModeChange={setMode} nextPath={nextPath} />
  ) : (
    <LiveLoginForm mode={mode} onModeChange={setMode} nextPath={nextPath} resetEmail={resetEmail} />
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
    <AuthShell
      demoHint
      mode={mode}
      modeChangeDisabled={submitting}
      onModeChange={onModeChange}
      supportUrl={state.supportUrl}
    >
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
  resetEmail,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  nextPath?: string;
  resetEmail?: string;
}) {
  const router = useRouter();
  const hostedDemo = isHostedDemoMode();
  const { signIn, signOut } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess);
  const createAccount = useMutation(api.customers.createSelfServiceAccount);
  const [email, setEmail] = useState(resetEmail ?? "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof SignupFormValues, string>>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [awaitingAuth, setAwaitingAuth] = useState(false);
  const [pendingAuth, setPendingAuth] = useState<
    | { kind: "signup"; email: string; name: string; slug: string }
    | { kind: "signin"; email: string }
    | { kind: "reset"; email: string }
    | null
  >(resetEmail ? { kind: "reset", email: resetEmail } : null);
  const [authStep, setAuthStep] = useState<
    "form" | "reset-request" | "signup-verification" | "signin-verification" | "reset-verification"
  >(resetEmail ? "reset-request" : "form");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [creationFailed, setCreationFailed] = useState(false);
  const createStarted = useRef(false);
  const safeNextPath = sanitizeReturnPath(nextPath);
  useEffect(() => {
    if (
      mode === "signin" &&
      authStep === "form" &&
      !resetEmail &&
      !authLoading &&
      access?.authenticated
    )
      router.replace(
        safeNextPath || (access.role === "admin" ? "/admin/customers" : "/app/profile"),
      );
  }, [access, authLoading, authStep, mode, resetEmail, router, safeNextPath]);
  useEffect(() => {
    if (!awaitingAuth || !isAuthenticated) return;
    const pending = pendingAuth?.kind === "signup" ? pendingAuth : undefined;
    if (!pending) return;
    if (createStarted.current) return;
    createStarted.current = true;
    void createAccount({ name: pending.name, slug: pending.slug })
      .then(() => router.replace(safeNextPath || "/app/profile"))
      .catch((cause) => {
        createStarted.current = false;
        setError(
          cause instanceof Error ? cause.message : "Your profile could not be created. Try again.",
        );
        setSubmitting(false);
        setAwaitingAuth(false);
        setCreationFailed(true);
      });
  }, [awaitingAuth, createAccount, isAuthenticated, pendingAuth, router, safeNextPath]);
  function backToSignIn() {
    setSubmitting(false);
    setAuthStep("form");
    setPendingAuth(null);
    setEmail("");
    setPassword("");
    setCode("");
    setNewPassword("");
    setResetConfirmation("");
    setCreationFailed(false);
    setError("");
    onModeChange("signin");
  }
  function changeMode(nextMode: AuthMode) {
    setSubmitting(false);
    setAwaitingAuth(false);
    setPendingAuth(null);
    setAuthStep("form");
    setEmail("");
    setPassword("");
    setName("");
    setSlug("");
    setConfirmation("");
    setCode("");
    setNewPassword("");
    setResetConfirmation("");
    setErrors({});
    setCreationFailed(false);
    setError("");
    createStarted.current = false;
    onModeChange(nextMode);
  }
  async function requestReset() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await signIn("password", { flow: "reset", email: normalizedEmail });
    } catch {
      // Keep reset requests generic even when the provider declines the request.
    }
    setPendingAuth({ kind: "reset", email: normalizedEmail });
    setAuthStep("reset-verification");
    setSubmitting(false);
  }
  async function verifyCode() {
    if (!pendingAuth || !code.trim()) {
      setError("Enter the verification code from your email.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (pendingAuth.kind === "signup" || pendingAuth.kind === "signin") {
        const authResult = await signIn("password", {
          flow: "email-verification",
          email: pendingAuth.email,
          code: code.trim(),
        });
        if (!authResult.signingIn) throw new Error("Email verification did not complete.");
        if (pendingAuth.kind === "signup") {
          setAwaitingAuth(true);
        } else {
          setPassword("");
          setCode("");
          setPendingAuth(null);
          setAuthStep("form");
          setSubmitting(false);
        }
      } else {
        const authResult = await signIn("password", {
          flow: "reset-verification",
          email: pendingAuth.email,
          code: code.trim(),
          newPassword,
        });
        if (!authResult.signingIn) throw new Error("Password reset did not complete.");
        await signOut();
        backToSignIn();
        router.replace("/login");
      }
    } catch (cause) {
      setError(
        pendingAuth.kind === "reset" || pendingAuth.kind === "signin"
          ? "That code is invalid or expired. Try again."
          : cause instanceof Error
            ? cause.message
            : "That code is invalid or expired. Try again.",
      );
      setSubmitting(false);
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (authStep === "reset-request") {
      await requestReset();
      return;
    }
    if (
      authStep === "signup-verification" ||
      authStep === "signin-verification" ||
      authStep === "reset-verification"
    ) {
      if (authStep === "reset-verification" && newPassword !== resetConfirmation) {
        setError("New passwords do not match.");
        return;
      }
      if (authStep === "reset-verification" && newPassword.length < 8) {
        setError("New password must be at least 8 characters.");
        return;
      }
      await verifyCode();
      return;
    }
    if (mode === "signin") {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes("@"))
        return setError("Enter a valid email address.");
      if (password.length < 8) return setError("Password must be at least 8 characters.");
      setSubmitting(true);
      try {
        const authResult = await signIn("password", {
          flow: "signIn",
          email: normalizedEmail,
          password,
        });
        if (!authResult.signingIn) {
          setPendingAuth({ kind: "signin", email: normalizedEmail });
          setAuthStep("signin-verification");
          setPassword("");
          setSubmitting(false);
        }
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
      setPendingAuth({
        kind: "signup",
        email: result.payload.email,
        name: result.payload.name,
        slug: result.payload.slug,
      });
      setCreationFailed(false);
      if (isAuthenticated && !access?.authenticated) {
        await createAccount({ name: result.payload.name, slug: result.payload.slug });
        router.replace(safeNextPath || "/app/profile");
      } else {
        const authResult = await signIn("password", {
          flow: "signUp",
          email: result.payload.email,
          password: result.payload.password,
        });
        setPassword("");
        setConfirmation("");
        if (authResult.signingIn) setAwaitingAuth(true);
        else {
          setAuthStep("signup-verification");
          setSubmitting(false);
        }
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The signup service is unavailable. Try again.",
      );
      setSubmitting(false);
    }
  }
  function retryProfileCreation() {
    const pending = pendingAuth?.kind === "signup" ? pendingAuth : undefined;
    if (!pending || createStarted.current) return;
    createStarted.current = true;
    setCreationFailed(false);
    setSubmitting(true);
    setError("");
    void createAccount({ name: pending.name, slug: pending.slug })
      .then(() => router.replace(safeNextPath || "/app/profile"))
      .catch((cause) => {
        createStarted.current = false;
        setError(
          cause instanceof Error ? cause.message : "Your profile could not be created. Try again.",
        );
        setSubmitting(false);
        setCreationFailed(true);
      });
  }
  const loading = authLoading || access === undefined;
  const availability = useQuery(
    api.profiles.checkSlugAvailability,
    mode === "signup" && slug ? { slug } : "skip",
  );
  return (
    <AuthShell mode={mode} modeChangeDisabled={submitting} onModeChange={changeMode}>
      {loading && mode === "signin" && authStep === "form" ? (
        <p className="text-sm text-tapit-muted">Checking your session…</p>
      ) : hostedDemo && (authStep === "reset-request" || authStep === "reset-verification") ? (
        <div className="grid gap-5">
          <Notice>
            Password reset email delivery is disabled in hosted demo mode. Use the password you
            chose through your setup link.
          </Notice>
          <Button onClick={backToSignIn} type="button" variant="quiet">
            Back to sign in
          </Button>
        </div>
      ) : authStep === "reset-request" ? (
        <form className="grid gap-5" onSubmit={submit}>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <p className="text-sm leading-6 text-tapit-muted">
            Enter your email and we’ll send reset instructions if an account matches.
          </p>
          <Field
            autoComplete="email"
            id="reset-email"
            label="Email"
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            value={email}
          />
          <Button disabled={submitting} type="submit">
            {submitting ? "Sending reset instructions" : "Send reset instructions"}
          </Button>
          <Button onClick={backToSignIn} type="button" variant="quiet">
            Back to sign in
          </Button>
        </form>
      ) : authStep === "signup-verification" ||
        authStep === "signin-verification" ||
        authStep === "reset-verification" ? (
        <form className="grid gap-5" onSubmit={submit}>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {pendingAuth?.kind === "reset" ? (
            <div
              aria-live="polite"
              className="rounded-tapit border border-[#b9d1c0] bg-[#e8f1eb] px-4 py-3 text-sm leading-6 text-[#17352b]"
              role="status"
            >
              If an account matches that email, reset instructions are on the way.
            </div>
          ) : null}
          {creationFailed && pendingAuth?.kind === "signup" ? (
            <>
              <p className="text-sm leading-6 text-tapit-muted">
                Your email is verified, but the profile could not be created yet.
              </p>
              <Button disabled={submitting} onClick={retryProfileCreation} type="button">
                {submitting ? "Creating profile" : "Retry profile creation"}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm leading-6 text-tapit-muted">
                Check your email for a verification code.
              </p>
              <Field
                autoComplete="one-time-code"
                autoFocus
                id="verification-code"
                inputMode="text"
                label="Verification code"
                onChange={(e) => setCode(e.target.value)}
                value={code}
              />
              {authStep === "reset-verification" ? (
                <>
                  <Field
                    autoComplete="new-password"
                    id="new-password"
                    label="New password"
                    minLength={8}
                    onChange={(e) => setNewPassword(e.target.value)}
                    type="password"
                    value={newPassword}
                  />
                  <Field
                    autoComplete="new-password"
                    id="reset-confirmation"
                    label="Confirm new password"
                    minLength={8}
                    onChange={(e) => setResetConfirmation(e.target.value)}
                    type="password"
                    value={resetConfirmation}
                  />
                </>
              ) : null}
              <Button disabled={submitting} type="submit">
                {submitting
                  ? "Verifying code"
                  : authStep === "reset-verification"
                    ? "Reset password"
                    : "Verify email"}
              </Button>
              <Button
                disabled={submitting}
                onClick={() => {
                  if (pendingAuth) {
                    setSubmitting(true);
                    void signIn("password", {
                      flow: pendingAuth.kind === "reset" ? "reset" : "email-verification",
                      email: pendingAuth.email,
                    })
                      .catch(() => setError("The email service is unavailable. Try again."))
                      .finally(() => setSubmitting(false));
                  }
                }}
                type="button"
                variant="quiet"
              >
                {submitting ? "Sending code" : "Resend code"}
              </Button>
            </>
          )}
        </form>
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
              {hostedDemo ? (
                <Notice>
                  Password reset email delivery is disabled in hosted demo mode. Use your setup link
                  password.
                </Notice>
              ) : (
                <Button
                  onClick={() => {
                    setError("");
                    setAuthStep("reset-request");
                  }}
                  type="button"
                  variant="quiet"
                >
                  Forgot password?
                </Button>
              )}
            </>
          )}
        </form>
      )}
    </AuthShell>
  );
}
