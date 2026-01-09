"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { SettingsSidebar } from "./SettingsSidebar";

const SETTINGS_SHELL_ROUTES = [
  "/admin/settings",
  "/admin/communications",
  "/admin/payroll",
  "/admin/billing",
  "/admin/reports",
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
    <div className="flex h-full flex-col lg:flex-row">
      <aside className="w-full shrink-0 lg:w-64 h-full">
        <SettingsSidebar />
      </aside>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
