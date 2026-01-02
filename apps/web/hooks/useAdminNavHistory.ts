"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export const ADMIN_LAST_ROUTE_KEY = "admin:lastRoute";
const CURRENT_ROUTE_KEY = "admin:currentRoute";
const EXCLUDED_PATHS = ["/admin/sign-in", "/admin/sign-up"];

// Lightweight tracker to remember the last meaningful admin route in sessionStorage.
export function useAdminNavHistory() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastRecordedPath = useRef<string | null>(null);

  const search = searchParams?.toString();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pathname || !pathname.startsWith("/admin")) return;
    if (EXCLUDED_PATHS.some((route) => pathname.startsWith(route))) return;

    const fullPath = search ? `${pathname}?${search}` : pathname;

    // Preserve the previously seen route so the back fallback has somewhere useful to go without endlessly repeating the same URL.
    const previousPath = lastRecordedPath.current ?? sessionStorage.getItem(CURRENT_ROUTE_KEY);
    if (previousPath && previousPath !== fullPath) {
      sessionStorage.setItem(ADMIN_LAST_ROUTE_KEY, previousPath);
    } else if (!sessionStorage.getItem(ADMIN_LAST_ROUTE_KEY)) {
      sessionStorage.setItem(ADMIN_LAST_ROUTE_KEY, fullPath);
    }

    sessionStorage.setItem(CURRENT_ROUTE_KEY, fullPath);
    lastRecordedPath.current = fullPath;
  }, [pathname, search]);
}
