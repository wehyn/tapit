import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { isDemoMode } from "@/lib/demo/mode";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { DemoOnboardingForm } from "@/components/auth/DemoOnboardingForm";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  if (isLocalDemoMode()) return <DemoOnboardingForm nextPath={nextPath} />;
  if (isDemoMode()) redirect("/login");
  return <OnboardingForm nextPath={nextPath} />;
}
