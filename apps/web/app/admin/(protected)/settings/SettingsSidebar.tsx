"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  CreditCard,
  Layers,
  Package,
  Receipt,
  Settings,
  UserRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type SettingsSection = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "levels", label: "Levels", href: "/admin/settings/levels", icon: Layers },
  { id: "skills", label: "Skills", href: "/admin/settings/skills", icon: ClipboardList },
  { id: "plans", label: "Enrolment plans", href: "/admin/settings/plans", icon: WalletCards },
  { id: "teachers", label: "Teachers", href: "/admin/settings/teachers", icon: UserRound },
  { id: "holidays", label: "Holidays", href: "/admin/settings/holidays", icon: CalendarDays },
  { id: "products", label: "Products", href: "/admin/settings/products", icon: Package },
  { id: "payments", label: "Payments", href: "/admin/settings/payments", icon: CreditCard },
];

export const SETTINGS_LINKS: SettingsSection[] = [
  { id: "billing", href: "/admin/billing", label: "Billing", icon: Receipt },
];

type SettingsSidebarProps = {
  sections?: SettingsSection[];
  links?: SettingsSection[];
  className?: string;
  onNavigate?: () => void;
  showHeader?: boolean;
};

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SettingsNavList({
  items,
  pathname,
  onNavigate,
}: {
  items: SettingsSection[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <ul role="list" className="-mx-2 space-y-1">
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;

        return (
          <li key={item.id}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-x-3 rounded-md p-2 text-sm/6 font-semibold transition-colors",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "size-5 shrink-0",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground group-hover:text-foreground"
                )}
                aria-hidden="true"
              />
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SettingsSidebar({
  sections = SETTINGS_SECTIONS,
  links = SETTINGS_LINKS,
  className,
  onNavigate,
  showHeader = true,
}: SettingsSidebarProps) {
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 grow flex-col gap-y-5 overflow-y-auto px-4 py-4 sm:px-6",
        className
      )}
    >
      {showHeader ? (
        <div className="relative flex h-16 shrink-0 items-center gap-3 border-b border-border pb-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-muted/40">
            <Settings className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide text-foreground">Settings</p>
            <p className="text-xs text-muted-foreground">Admin configuration</p>
          </div>
        </div>
      ) : null}

      <nav className="relative flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-6">
          <li>
            <SettingsNavList items={sections} pathname={pathname} onNavigate={onNavigate} />
          </li>

          {links.length ? (
            <li>
              <div className="px-2 text-xs/6 font-semibold uppercase tracking-wide text-muted-foreground/80">
                Workspace
              </div>
              <div className="mt-2">
                <SettingsNavList items={links} pathname={pathname} onNavigate={onNavigate} />
              </div>
            </li>
          ) : null}
        </ul>
      </nav>
    </div>
  );
}

export function isSettingsNavActive(pathname: string, href: string) {
  if (href === "/admin/settings") {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return isActivePath(pathname, href);
}

export function useSettingsNavItems() {
  return React.useMemo(() => [...SETTINGS_SECTIONS, ...SETTINGS_LINKS], []);
}

export function SettingsTopNav({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = useSettingsNavItems();

  return (
    <nav className={cn("flex overflow-x-auto py-4", className)} aria-label="Settings sections">
      <ul className="flex min-w-full flex-none gap-x-6 px-4 text-sm/6 font-semibold text-muted-foreground sm:px-6 lg:px-8">
        {items.map((item) => {
          const active = isSettingsNavActive(pathname, item.href);

          return (
            <li key={item.id}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "whitespace-nowrap transition-colors hover:text-foreground",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
