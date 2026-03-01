"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { useClerk } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/billing", label: "Billing" },
  { href: "/portal/makeups", label: "Makeups" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/portal") return pathname === "/portal";
  return pathname.startsWith(href);
}

export function PortalTopBar() {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/portal" className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 ring-1 ring-gray-200">
                <Image
                  src="/logo.png"
                  alt="Caribeae logo"
                  width={48}
                  height={48}
                  className="h-6 w-auto"
                />
              </span>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-gray-900">Caribeae</div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-gray-500">
                  Client Portal
                </div>
              </div>
            </Link>

            <nav className="hidden sm:flex sm:space-x-8" aria-label="Portal">
              {NAV_ITEMS.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium transition",
                      active
                        ? "border-teal-600 text-gray-900"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="hidden gap-2 text-gray-700 hover:text-gray-900 sm:inline-flex"
              onClick={() => signOut()}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="border-gray-200 text-gray-700 sm:hidden"
              aria-label={mobileOpen ? "Close portal menu" : "Open portal menu"}
              aria-controls="portal-mobile-nav"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {mobileOpen ? (
        <div id="portal-mobile-nav" className="border-t border-gray-200 bg-white sm:hidden">
          <div className="space-y-1 px-2 py-3">
            {NAV_ITEMS.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-2 text-base font-medium",
                    active
                      ? "bg-teal-50 text-teal-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="border-t border-gray-200 px-4 py-3">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 px-3 text-gray-700"
              onClick={() => signOut()}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
