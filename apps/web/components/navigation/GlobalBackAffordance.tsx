"use client";

import { cn } from "@/lib/utils";
import { BackButton } from "./BackButton";

type GlobalBackAffordanceProps = {
  disabled?: boolean;
  className?: string;
  fallbackHref?: string;
  label?: string;
};

export function GlobalBackAffordance({
  disabled,
  className,
  fallbackHref,
  label,
}: GlobalBackAffordanceProps) {
  if (disabled) return null;

  return (
    <div
      className={cn(
        "fixed z-40",
        "left-[calc(env(safe-area-inset-left)+12px)] top-[calc(env(safe-area-inset-top)+12px)]",
        className
      )}
    >
      <BackButton
        variant="floating"
        fallbackHref={fallbackHref}
        label={label}
        className="shadow-lg"
      />
    </div>
  );
}
