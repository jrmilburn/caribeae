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
  href: string;
};

const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "levels", label: "Levels", href: "/admin/settings/levels" },
  { id: "plans", label: "Enrolment plans", href: "/admin/settings/plans" },
  { id: "teachers", label: "Teachers", href: "/admin/settings/teachers" },
  { id: "holidays", label: "Holidays", href: "/admin/settings/holidays" },
  { id: "products", label: "Products", href: "/admin/settings/products" },
];

const SETTINGS_LINKS = [
  { href: "/admin/billing", label: "Billing" },
];

type SettingsSidebarProps = {
  sections?: SettingsSection[];
};

export function SettingsSidebar({ sections = SETTINGS_SECTIONS }: SettingsSidebarProps) {
  const pathname = usePathname();

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
        {sections.map((section) => {
          const isActive =
            pathname === section.href || pathname.startsWith(`${section.href}/`);

          return (
            <Link
              key={section.id}
              href={section.href}
              className={cn(
                buttonVariants({
                  variant: isActive ? "secondary" : "ghost",
                  size: "sm",
                }),
                "w-full justify-start"
              )}
            >
              <div className="flex flex-col items-start text-left">
                <span className="text-sm font-medium">{section.label}</span>
              </div>
            </Link>
          );
        })}
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
