import { SetupForm } from "@/components/auth/SetupForm";

export default async function SetupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SetupForm token={token} />;
}
