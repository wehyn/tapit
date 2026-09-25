import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { isDemoMode } from "@/lib/demo/mode";

export default function OnboardingPage() {
  if (isDemoMode()) redirect("/login");
  return <OnboardingForm />;
}
