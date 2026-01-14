"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AdminPaginationProps = {
  totalCount: number;
  pageSize: number;
  currentCount: number;
  nextCursor: string | null;
  className?: string;
};

export function AdminPagination({
  totalCount,
  pageSize,
  currentCount,
  nextCursor,
  className,
}: AdminPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const cursor = searchParams.get("cursor")?.trim() || "";
  const cursorStack = searchParams
    .getAll("cursors")
    .map((value) => value.trim())
    .filter(Boolean);

  const previousPages = cursorStack.length + (cursor ? 1 : 0);
  const start = totalCount === 0 || currentCount === 0 ? 0 : previousPages * pageSize + 1;
  const end =
    totalCount === 0 || currentCount === 0
      ? 0
      : Math.min(start + currentCount - 1, totalCount);

  const canGoBack = Boolean(cursor) || cursorStack.length > 0;
  const canGoNext = Boolean(nextCursor);

  const buildHref = (params: URLSearchParams) => {
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const handlePrev = () => {
    if (!canGoBack) return;
    const params = new URLSearchParams(searchParams.toString());

    const nextStack = [...cursorStack];
    const prevCursor = nextStack.pop();

    params.delete("cursors");
    nextStack.forEach((value) => params.append("cursors", value));

    if (prevCursor) {
      params.set("cursor", prevCursor);
    } else {
      params.delete("cursor");
    }

    router.replace(buildHref(params));
  };

  const handleNext = () => {
    if (!nextCursor) return;
    const params = new URLSearchParams(searchParams.toString());
    const nextStack = [...cursorStack];
    if (cursor) {
      nextStack.push(cursor);
    }

    params.delete("cursors");
    nextStack.forEach((value) => params.append("cursors", value));
    params.set("cursor", nextCursor);

    router.replace(buildHref(params));
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="text-muted-foreground">
        Showing <span className="font-medium text-foreground">{start}</span>–
        <span className="font-medium text-foreground">{end}</span> of {totalCount}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handlePrev} disabled={!canGoBack}>
          Previous
        </Button>
        <Button variant="outline" size="sm" onClick={handleNext} disabled={!canGoNext}>
          Next
        </Button>
      </div>
    </div>
  );
}
