import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/portal(.*)", "/admin(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (!isProtectedRoute(request)) return;

  const session = await auth();
  if (!session.userId) {
    return session.redirectToSignIn({ returnBackUrl: request.url });
  }
});

export const config = {
  matcher: [
    // Run Clerk middleware for all non-static routes.
    "/((?!_next|.*\\..*).*)",
  ],
};
