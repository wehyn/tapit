import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

function demoMiddleware(request: NextRequest) {
  return NextResponse.next({ request });
}

const authMiddleware = convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    const pathname = request.nextUrl.pathname;
    const protectedRoute = pathname.startsWith("/app") || pathname.startsWith("/admin");
    if (protectedRoute && !(await convexAuth.isAuthenticated())) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  },
  { convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL },
);

export default isDemoMode ? demoMiddleware : authMiddleware;

export const config = {
  matcher: ["/api/auth/:path*", "/app/:path*", "/admin/:path*"],
};
