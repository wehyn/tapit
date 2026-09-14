import { CardResolverClient } from "@/components/profile/CardResolverClient";

export default async function CardResolverPage({
  params,
}: {
  params: Promise<{ cardToken: string }>;
}) {
  const { cardToken } = await params;
  return <CardResolverClient cardToken={cardToken} />;
}
