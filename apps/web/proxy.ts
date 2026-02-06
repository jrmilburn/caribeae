import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPortalRoute = createRouteMatcher(["/portal(.*)"]);
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isAdminAuthRoute = createRouteMatcher(["/admin/auth(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isAdminRoute(request) && !isAdminAuthRoute(request)) {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.redirect(new URL("/admin/auth", request.url));
    }
    return;
  }

  if (isPortalRoute(request)) {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.redirect(new URL("/auth", request.url));
    }
  }
});

export const config = {
  matcher: [
    // Run Clerk middleware for all non-static routes.
    "/((?!_next|.*\\..*).*)",
  ],
};
