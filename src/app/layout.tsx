import type { Metadata } from "next";

import { DemoProviders } from "@/components/providers/DemoProviders";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tapit",
    template: "%s · Tapit",
  },
  description: "A calm, updateable digital profile for professional introductions.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

  return (
    <html lang="en">
      <body>{isDemoMode ? <DemoProviders>{children}</DemoProviders> : children}</body>
    </html>
  );
}
