"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SettingsSection = {
  id: string;
  label: string;
};

const SETTINGS_LINKS = [
  { href: "/admin/communications", label: "Communications" },
  { href: "/admin/reports/teacher-hours", label: "Teacher hours" },
  { href: "/admin/payroll", label: "Payroll" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/reports/audit", label: "Reports" },
];

type SettingsSidebarProps = {
  sections?: SettingsSection[];
  activeSection?: string;
  onSectionChange?: (id: string) => void;
};

export function SettingsSidebar({
  sections = [],
  activeSection,
  onSectionChange,
}: SettingsSidebarProps) {
  const pathname = usePathname();
  const isSettingsPage = pathname === "/admin/settings" || pathname.startsWith("/admin/settings/");

  return (
    <Card className=" border-l-0! border-t-0! h-full py-0! shadow-none">
      <div className="flex items-center gap-2 border-b p-4 h-[65px]">
        <div className="rounded-md bg-muted">
          <Settings className="h-4 w-4" />
        </div>
        <div>
          <p className="text-lg font-semibold">Settings</p>
        </div>
      </div>
      <div className="space-y-2">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => onSectionChange?.(section.id)}
            className={cn(
              buttonVariants({
                variant:
                  isSettingsPage && activeSection === section.id ? "secondary" : "ghost",
                size: "sm",
              }),
              "w-full justify-start"
            )}
          >
            <div className="flex flex-col items-start text-left">
              <span className="text-sm font-medium">{section.label}</span>
            </div>
          </button>
        ))}
        {SETTINGS_LINKS.map((link) => {
          const isActive =
            pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                buttonVariants({
                  variant: isActive ? "secondary" : "ghost",
                  size: "sm",
                }),
                "w-full justify-start"
              )}
            >
              <div className="flex flex-col items-start text-left">
                <span className="text-sm font-medium">{link.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
