import { LoginForm } from "@/components/auth/LoginForm";
import type { AuthMode } from "@/components/auth/AuthShell";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; mode?: string | string[] }>;
}) {
  const { next, mode } = await searchParams;
  const initialMode: AuthMode = mode === "signup" ? "signup" : "signin";
  return (
    <LoginForm initialMode={initialMode} nextPath={typeof next === "string" ? next : undefined} />
  );
}
