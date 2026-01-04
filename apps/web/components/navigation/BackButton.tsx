"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ADMIN_LAST_ROUTE_KEY, useAdminNavHistory } from "@/hooks/useAdminNavHistory";

type BaseButtonProps = React.ComponentPropsWithoutRef<typeof Button>;

type BackButtonProps = {
  fallbackHref?: string;
  label?: string;
  className?: string;
} & Omit<BaseButtonProps, "variant" | "size">;

export function BackButton({
  fallbackHref = "/admin/dashboard",
  label = "Back",
  className,
  ...buttonProps
}: BackButtonProps) {
  useAdminNavHistory();

  const router = useRouter();
  const pathname = usePathname();
  const [isDisabled, setIsDisabled] = useState(false);
  const resetTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
    }
  }, []);

  const handleNavigateBack = React.useCallback(() => {
    if (isDisabled) return;

    setIsDisabled(true);
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
    }
    resetTimer.current = setTimeout(() => setIsDisabled(false), 500);

    const historyLength = window.history.length;
    const lastRoute = sessionStorage.getItem(ADMIN_LAST_ROUTE_KEY);

    // If there is nowhere meaningful to go back (e.g., direct entry), use the stored admin route or a static fallback.
    const shouldFallback =
      historyLength <= 1 ||
      (lastRoute && pathname === lastRoute) ||
      (historyLength === 2 && document.referrer === "");

    const target = lastRoute && lastRoute !== pathname ? lastRoute : fallbackHref;

    if (shouldFallback) {
      router.push(target || fallbackHref);
    } else {
      router.back();
    }
  }, [fallbackHref, isDisabled, pathname, router]);

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={label}
      className={cn(
        "h-9 w-9 rounded-xl",
        className
      )}
      disabled={isDisabled}
      onClick={handleNavigateBack}
      {...buttonProps}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </Button>
  );
}
