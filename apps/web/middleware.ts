import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPortalRoute = createRouteMatcher(["/portal(.*)"]);

export default clerkMiddleware((auth, request) => {
  if (isPortalRoute(request)) {
    auth().protect();
  }
});

export const config = {
  matcher: ["/portal(.*)"],
};
