"use client";

import { Printer } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PrintReceiptButtonProps = {
  href: string;
  label?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
  asChild?: boolean;
};

export function PrintReceiptButton({
  href,
  label = "Print receipt",
  size = "sm",
  variant = "outline",
  className,
  asChild = false,
}: PrintReceiptButtonProps) {
  const content = (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn("inline-flex items-center gap-2", className)}
    >
      <Printer className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );

  if (asChild) {
    return content;
  }

  return (
    <Button asChild size={size} variant={variant} className={className}>
      {content}
    </Button>
  );
}
