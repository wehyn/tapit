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

export default async function PublicProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicProfileScreen slug={slug} />;
}
