import type { Metadata } from "next";

import { PublicProfileScreen } from "@/components/profile/PublicProfileScreen";

export const dynamic = "force-dynamic";

export function createProfileMetadata(slug: string, appUrl?: string): Metadata {
  const canonical = `/${encodeURIComponent(slug)}`;
  let metadataBase: URL | undefined;
  try {
    metadataBase = new URL(appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  } catch {
    metadataBase = undefined;
  }
  return {
    ...(metadataBase === undefined ? {} : { metadataBase }),
    title: "Tapit profile",
    description: "A Tapit digital profile.",
    alternates: { canonical },
    openGraph: {
      title: "Tapit profile",
      description: "A Tapit digital profile.",
      url: canonical,
      type: "profile",
    },
    robots: { index: false, follow: false },
  };
}

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
