"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type AdminTabConfig = {
  value: string;
  label: string;
};

type AdminTabsProps = {
  tabs: AdminTabConfig[];
  defaultTab: string;
  hrefBase: string;
  paramKey?: string;
  className?: string;
};

export function AdminTabs({
  tabs,
  defaultTab,
  hrefBase,
  paramKey = "tab",
  className,
}: AdminTabsProps) {
  const search = useSearchParams();
  const current = search.get(paramKey) || defaultTab;

  return (
    <div className={cn("flex flex-col gap-3 max-w-36 w-full", className)}>
      {tabs.map((tab) => {
        const isActive = tab.value === current;

        const href = `${hrefBase}?${paramKey}=${tab.value}`;

        return (
          <Link
            key={tab.value}
            href={href}
            className={cn(
              "text-sm transition-colors",
              "hover:text-foreground",
              isActive
                ? "text-foreground font-semibold"
                : "text-muted-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
