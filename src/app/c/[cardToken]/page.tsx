import { CardResolverClient } from "@/components/profile/CardResolverClient";

export default async function CardResolverPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardToken: string }>;
  searchParams: Promise<{
    claim?: string | string[] | undefined;
    source?: string | string[] | undefined;
  }>;
}) {
  const { cardToken } = await params;
  const { claim, source } = await searchParams;
  return (
    <CardResolverClient
      cardToken={cardToken}
      claim={claim === "1"}
      source={typeof source === "string" ? source : undefined}
    />
  );
}
