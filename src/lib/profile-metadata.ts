import type { Metadata } from "next";

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
