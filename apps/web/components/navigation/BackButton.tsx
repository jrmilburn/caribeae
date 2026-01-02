"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ADMIN_LAST_ROUTE_KEY, useAdminNavHistory } from "@/hooks/useAdminNavHistory";

type BackButtonProps = {
  fallbackHref?: string;
  label?: string;
  variant?: "floating" | "inline";
  className?: string;
} & Omit<ButtonProps, "variant">;

export function BackButton({
  fallbackHref = "/admin/dashboard",
  label = "Back",
  variant = "floating",
  className,
  ...buttonProps
}: BackButtonProps) {
  useAdminNavHistory();

  const router = useRouter();
  const pathname = usePathname();
  const [isDisabled, setIsDisabled] = useState(false);
  const resetTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    };
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.altKey)) return;
      if (event.key !== "ArrowLeft") return;

      const active = document.activeElement as HTMLElement | null;
      if (active?.isContentEditable) return;
      if (
        active &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)
      ) {
        return;
      }

      event.preventDefault();
      handleNavigateBack();
    };

    // Honor the OS-level shortcut (Alt/Option + Left) without interrupting text entry.
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleNavigateBack]);

  const labelClasses = variant === "floating" ? "hidden md:inline" : "inline";

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-label={label}
      className={cn(
        "h-9 gap-2 px-2 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        variant === "floating"
          ? "rounded-full bg-background/80 shadow-sm backdrop-blur transition-colors hover:bg-accent/70"
          : "",
        className
      )}
      disabled={isDisabled}
      onClick={handleNavigateBack}
      {...buttonProps}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      <span className={labelClasses}>{label}</span>
    </Button>
  );
}
