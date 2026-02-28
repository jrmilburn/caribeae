"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

import { SettingsTopNav } from "./SettingsSidebar";

const SETTINGS_SHELL_ROUTES = [
  "/admin/settings",
  "/admin/communications",
];

type SettingsShellProps = {
  children: React.ReactNode;
};

export function SettingsShell({ children }: SettingsShellProps) {
  const pathname = usePathname();
  const shouldWrap = SETTINGS_SHELL_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (!shouldWrap) return <>{children}</>;

  return (
    <div className="flex h-full min-h-0 bg-background">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex h-16 shrink-0 items-center border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              name="settings-search"
              placeholder="Search settings"
              aria-label="Search settings"
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground shadow-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
        </div>

        <header className="shrink-0 border-b border-border bg-background">
          <SettingsTopNav />
        </header>

        <section className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
