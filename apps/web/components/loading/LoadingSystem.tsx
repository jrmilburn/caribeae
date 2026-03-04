import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type LoadingRegionProps = {
  children: ReactNode;
  className?: string;
  label?: string;
};

export function LoadingRegion({
  children,
  className,
  label = "Loading content",
}: LoadingRegionProps) {
  return (
    <section className={cn("w-full", className)} aria-busy="true" aria-live="polite" role="status">
      <span className="sr-only">{label}</span>
      {children}
    </section>
  );
}

type PageHeaderLoadingProps = {
  className?: string;
  withMeta?: boolean;
  withAction?: boolean;
  compact?: boolean;
};

export function PageHeaderLoading({
  className,
  withMeta = true,
  withAction = true,
  compact = false,
}: PageHeaderLoadingProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 border-b border-border/80 px-4 py-4 sm:px-6",
        compact && "px-0 py-0 sm:px-0",
        compact && "border-0",
        className
      )}
    >
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72 max-w-[92vw]" />
        {withMeta ? <Skeleton className="h-3.5 w-56 max-w-[80vw]" /> : null}
      </div>
      {withAction ? <Skeleton className="h-9 w-32 rounded-md" /> : null}
    </div>
  );
}

type ListHeaderLoadingProps = {
  className?: string;
  withFilters?: boolean;
  withSecondaryAction?: boolean;
  showSearch?: boolean;
};

export function ListHeaderLoading({
  className,
  withFilters = true,
  withSecondaryAction = false,
  showSearch = true,
}: ListHeaderLoadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
        {showSearch ? <Skeleton className="h-9 w-full sm:w-72" /> : null}
        {withFilters ? <Skeleton className="h-9 w-24 rounded-md" /> : null}
        {withSecondaryAction ? <Skeleton className="h-9 w-24 rounded-md" /> : null}
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>
    </div>
  );
}

type PageLoadingProps = {
  children?: ReactNode;
  className?: string;
  header?: ReactNode;
  label?: string;
};

export function PageLoading({
  children,
  className,
  header,
  label = "Loading page",
}: PageLoadingProps) {
  return (
    <LoadingRegion className={cn("flex h-full min-h-0 flex-col", className)} label={label}>
      {header ?? <PageHeaderLoading />}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
        {children ?? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-6">
              <div className="space-y-3">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-4 w-full max-w-2xl" />
                <Skeleton className="h-4 w-3/4 max-w-xl" />
              </div>
            </div>
            <div className="rounded-xl border bg-card p-6">
              <div className="space-y-3">
                <Skeleton className="h-5 w-52" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
          </div>
        )}
      </div>
    </LoadingRegion>
  );
}

type StatsGridLoadingProps = {
  cards?: number;
  className?: string;
};

export function StatsGridLoading({ cards = 4, className }: StatsGridLoadingProps) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="rounded-xl border bg-card p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

type CardGridLoadingProps = {
  cards?: number;
  className?: string;
};

export function CardGridLoading({ cards = 6, className }: CardGridLoadingProps) {
  return (
    <ul role="list" className={cn("grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: cards }).map((_, index) => (
        <li key={index} className="rounded-xl border bg-card p-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-5/6" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </li>
      ))}
    </ul>
  );
}

type TableLoadingProps = {
  className?: string;
  columns?: number;
  rows?: number;
  withToolbar?: boolean;
  withPagination?: boolean;
  showSearch?: boolean;
  showActions?: boolean;
};

export function TableLoading({
  className,
  columns = 5,
  rows = 8,
  withToolbar = true,
  withPagination = true,
  showSearch = true,
  showActions = true,
}: TableLoadingProps) {
  return (
    <LoadingRegion className={cn("flex h-full min-h-0 flex-col", className)} label="Loading table">
      {withToolbar ? (
        <div className="flex flex-col gap-3 border-b bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {showSearch ? <Skeleton className="h-9 w-full sm:w-72" /> : null}
            {showActions ? <Skeleton className="h-9 w-24 rounded-md" /> : null}
            {showActions ? <Skeleton className="h-9 w-20 rounded-md" /> : null}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead>
                <tr>
                  {Array.from({ length: columns }).map((_, columnIndex) => (
                    <th key={columnIndex} className="px-4 py-3 text-left">
                      <Skeleton className="h-3.5 w-16" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {Array.from({ length: rows }).map((_, rowIndex) => (
                  <tr key={rowIndex}>
                    {Array.from({ length: columns }).map((__, columnIndex) => (
                      <td key={`${rowIndex}-${columnIndex}`} className="px-4 py-4">
                        <Skeleton
                          className={cn(
                            "h-3.5",
                            columnIndex === columns - 1 ? "w-10" : "w-[min(100%,12rem)]"
                          )}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {withPagination ? (
        <div className="flex items-center justify-between border-t px-4 py-3 sm:px-6">
          <Skeleton className="h-4 w-36" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </div>
      ) : null}
    </LoadingRegion>
  );
}

type FeedLoadingProps = {
  className?: string;
  items?: number;
  withContainer?: boolean;
  withAvatars?: boolean;
};

export function FeedLoading({
  className,
  items = 6,
  withContainer = true,
  withAvatars = true,
}: FeedLoadingProps) {
  const content = (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="flex items-start gap-3 rounded-lg border border-border/80 px-3 py-3">
          {withAvatars ? <Skeleton className="mt-0.5 h-8 w-8 rounded-full" /> : null}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-4 w-48 max-w-[70%]" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <LoadingRegion className={cn("w-full", className)} label="Loading feed">
      {withContainer ? <div className="rounded-xl border bg-card p-4">{content}</div> : content}
    </LoadingRegion>
  );
}

type FormLoadingProps = {
  className?: string;
  fields?: number;
  withDescription?: boolean;
};

export function FormLoading({ className, fields = 6, withDescription = true }: FormLoadingProps) {
  return (
    <LoadingRegion className={cn("w-full", className)} label="Loading form">
      <div className="rounded-xl border bg-card p-4 sm:p-6">
        <div className="space-y-5">
          {withDescription ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3.5 w-80 max-w-[90%]" />
            </div>
          ) : null}

          {Array.from({ length: fields }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className={cn("h-10 w-full", index % 4 === 3 && "h-20")} />
            </div>
          ))}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
            <Skeleton className="h-10 w-full sm:w-28" />
            <Skeleton className="h-10 w-full sm:w-32" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}

type SideSheetLoadingProps = {
  className?: string;
  sections?: number;
};

export function SideSheetLoading({ className, sections = 4 }: SideSheetLoadingProps) {
  return (
    <LoadingRegion className={cn("flex h-full flex-col", className)} label="Loading panel">
      <div className="border-b px-6 py-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3.5 w-64 max-w-[90%]" />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
        {Array.from({ length: sections }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-10 w-full" />
            {index % 2 === 0 ? <Skeleton className="h-16 w-full" /> : null}
          </div>
        ))}
      </div>
      <div className="border-t px-6 py-4">
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 flex-1" />
        </div>
      </div>
    </LoadingRegion>
  );
}

export function PendingDot({ className }: { className?: string }) {
  return <Skeleton className={cn("h-3.5 w-3.5 rounded-full", className)} />;
}

export function PendingLine({ className }: { className?: string }) {
  return <Skeleton className={cn("h-2.5 w-16 rounded-full", className)} />;
}

type PendingLabelSwapProps = {
  pending: boolean;
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
  lineClassName?: string;
};

export function PendingLabelSwap({
  pending,
  children,
  className,
  pendingLabel = "Loading",
  lineClassName,
}: PendingLabelSwapProps) {
  return (
    <span className={cn("relative inline-flex items-center justify-center", className)} aria-busy={pending}>
      <span className={cn("transition-opacity", pending && "opacity-0")} aria-hidden={pending || undefined}>
        {children}
      </span>
      {pending ? (
        <span className="absolute inset-0 flex items-center justify-center" role="status" aria-live="polite">
          <span className="sr-only">{pendingLabel}</span>
          <PendingLine className={lineClassName} />
        </span>
      ) : null}
    </span>
  );
}
