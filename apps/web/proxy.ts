import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // Protect all routes except public ones (proxy middleware)
    "/((?!_next|.*\\..*|sign-in|sign-up).*)",
  ],
};
