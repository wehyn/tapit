import type { Metadata } from "next";

import { PublicProfileScreen } from "@/components/profile/PublicProfileScreen";
import { createProfileMetadata } from "@/lib/profile-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return createProfileMetadata(slug);
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ source?: string | string[] | undefined }>;
}) {
  const [{ slug }, { source }] = await Promise.all([params, searchParams]);
  const attributionSource = source === "nfc" || source === "qr" ? source : "direct";
  return <PublicProfileScreen slug={slug} source={attributionSource} />;
}
