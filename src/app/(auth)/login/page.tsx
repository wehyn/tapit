import { LoginForm } from "@/components/auth/LoginForm";
import type { AuthMode } from "@/components/auth/AuthShell";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    mode?: string | string[];
    reset?: string | string[];
    email?: string | string[];
  }>;
}) {
  const { next, mode, reset, email } = await searchParams;
  const initialMode: AuthMode = mode === "signup" ? "signup" : "signin";
  return (
    <LoginForm
      initialMode={initialMode}
      nextPath={typeof next === "string" ? next : undefined}
      resetEmail={reset === "1" && typeof email === "string" ? email : undefined}
    />
  );
}
