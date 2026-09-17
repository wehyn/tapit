import type { Metadata } from "next";

import { DemoProviders } from "@/components/providers/DemoProviders";
import { LiveProviders } from "@/components/providers/LiveProviders";
import { isHostedDemoMode, isLocalDemoMode } from "@/lib/demo/mode";
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
  const isLocalDemo = isLocalDemoMode();
  const isHostedDemo = isHostedDemoMode();

  const content = isLocalDemo ? (
    <DemoProviders>{children}</DemoProviders>
  ) : (
    <LiveProviders>{children}</LiveProviders>
  );
  return (
    <html lang="en">
      <body>
        {isLocalDemo || isHostedDemo ? (
          content
        ) : (
          <ConvexAuthNextjsServerProvider>{content}</ConvexAuthNextjsServerProvider>
        )}
      </body>
    </html>
  );
}
