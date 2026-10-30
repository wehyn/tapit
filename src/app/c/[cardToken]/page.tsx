import { CardResolverClient } from "@/components/profile/CardResolverClient";

export default async function CardResolverPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardToken: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { cardToken } = await params;
  const query = await searchParams;
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value])
      values.append(key, item);
  }
  const search = values.toString();
  return (
    <CardResolverClient
      cardToken={cardToken}
      source={typeof query.source === "string" ? query.source : undefined}
      returnHref={`/c/${encodeURIComponent(cardToken)}${search ? `?${search}` : ""}`}
    />
  );
}
