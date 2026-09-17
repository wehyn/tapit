import { isDemoMode } from "@/lib/demo/mode";

export function GET() {
  if (isDemoMode()) {
    return Response.json({ mode: "demo" });
  }

  return Response.json({
    mode: "live",
    appEnvironment: process.env.TAPIT_APP_ENV ?? null,
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL ?? null,
  });
}
