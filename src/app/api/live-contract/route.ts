export function GET() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    return Response.json({ mode: "demo" });
  }

  return Response.json({
    mode: "live",
    appEnvironment: process.env.TAPIT_APP_ENV ?? null,
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL ?? null,
  });
}
