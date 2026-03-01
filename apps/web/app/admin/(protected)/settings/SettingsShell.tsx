"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

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
