import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // Protect all routes except public ones
    "/((?!_next|.*\\..*|sign-in|sign-up).*)",
  ],
};
