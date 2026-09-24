import { LoginForm } from "@/components/auth/LoginForm";
import type { AuthMode } from "@/components/auth/AuthShell";
import { isLocalDemoMode } from "@/lib/demo/mode";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    mode?: string | string[];
    error?: string | string[];
    reason?: string | string[];
  }>;
}) {
  const { next, mode, error, reason } = await searchParams;
  const initialMode: AuthMode = isLocalDemoMode() && mode === "signup" ? "signup" : "signin";
  const loginReason =
    reason === "invitation-required" || reason === "account-inactive" ? reason : undefined;
  return (
    <LoginForm
      initialMode={initialMode}
      nextPath={typeof next === "string" ? next : undefined}
      oauthError={typeof error === "string" ? error : undefined}
      reason={loginReason}
    />
  );
}
