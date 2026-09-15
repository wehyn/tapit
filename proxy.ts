import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

function demoProxy(request: NextRequest) {
  return NextResponse.next({ request });
}

const authProxy = convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    const pathname = request.nextUrl.pathname;
    const protectedRoute = pathname.startsWith("/app") || pathname.startsWith("/admin");
    if (protectedRoute && !(await convexAuth.isAuthenticated())) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  },
  { convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL },
);

export function proxy(request: NextRequest, event: NextFetchEvent) {
  return isDemoMode ? demoProxy(request) : authProxy(request, event);
}

export const config = {
  matcher: ["/api/auth", "/api/auth/:path*", "/app/:path*", "/admin/:path*"],
};
