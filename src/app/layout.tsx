import type { Metadata } from "next";

import { DemoProviders } from "@/components/providers/DemoProviders";
import { LiveProviders } from "@/components/providers/LiveProviders";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

  const content = isDemoMode ? (
    <DemoProviders>{children}</DemoProviders>
  ) : (
    <LiveProviders>{children}</LiveProviders>
  );
  return (
    <html lang="en">
      <body>
        {isDemoMode ? (
          content
        ) : (
          <ConvexAuthNextjsServerProvider>{content}</ConvexAuthNextjsServerProvider>
        )}
      </body>
    </html>
  );
}
