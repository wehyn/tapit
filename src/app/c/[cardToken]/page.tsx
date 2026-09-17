import { CardResolverClient } from "@/components/profile/CardResolverClient";

export default async function CardResolverPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardToken: string }>;
  searchParams: Promise<{ source?: string | string[] | undefined }>;
}) {
  const { cardToken } = await params;
  const { source } = await searchParams;
  return (
    <CardResolverClient
      cardToken={cardToken}
      source={typeof source === "string" ? source : undefined}
    />
  );
}
