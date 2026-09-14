import type { Metadata } from "next";

import { PublicProfileScreen } from "@/components/profile/PublicProfileScreen";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug.replaceAll("-", " ")} profile`,
    description: "A Tapit digital profile.",
    robots: { index: false, follow: false },
  };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicProfileScreen slug={slug} />;
}
