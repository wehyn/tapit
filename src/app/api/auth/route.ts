import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";

const authHandler = convexAuthNextjsMiddleware(undefined, {
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
});

export async function POST(request: NextRequest) {
  const response = await authHandler(request, {} as NextFetchEvent);
  return response ?? new Response(null, { status: 204 });
}
