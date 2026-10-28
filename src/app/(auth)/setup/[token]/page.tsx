import { SetupRoute } from "@/components/auth/SetupRoute";

export default async function SetupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SetupRoute token={token} />;
}
