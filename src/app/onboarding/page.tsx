import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { isDemoMode } from "@/lib/demo/mode";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { DemoOnboardingForm } from "@/components/auth/DemoOnboardingForm";

export default function OnboardingPage() {
  if (isLocalDemoMode()) return <DemoOnboardingForm />;
  if (isDemoMode()) redirect("/login");
  return <OnboardingForm />;
}
