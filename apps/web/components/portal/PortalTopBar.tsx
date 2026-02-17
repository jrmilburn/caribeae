"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { useClerk } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/payments", label: "Billing" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/portal") return pathname === "/portal";
  return pathname.startsWith(href);
}

export function PortalTopBar() {
  const pathname = usePathname();
  const { signOut } = useClerk();

  return (
    <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:h-16">
        <div className="flex items-center gap-4">
          <Link href="/portal" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/5 ring-1 ring-slate-200">
              <Image
                src="/logo.png"
                alt="Caribeae logo"
                width={48}
                height={48}
                className="h-6 w-auto"
              />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-900">Caribeae</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-700/70">
                Client Portal
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex" aria-label="Portal">
            {NAV_ITEMS.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition",
                    active
                      ? "bg-slate-900/5 text-slate-900 ring-1 ring-slate-200/80"
                      : "text-slate-600 hover:bg-slate-900/5 hover:text-slate-900"
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
            className="hidden gap-2 text-slate-700 hover:text-slate-900 sm:inline-flex"
            onClick={() => signOut()}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="border-slate-200/70 text-slate-700 sm:hidden"
                aria-label="Open portal menu"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-700/70">
                  Client Portal
                </div>
                <div className="text-sm font-semibold text-slate-900">Caribeae</div>
              </div>
              <DropdownMenuSeparator />
              {NAV_ITEMS.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <DropdownMenuItem
                    key={item.href}
                    asChild
                    className={active ? "bg-slate-900/5 text-slate-900" : undefined}
                  >
                    <Link href={item.href}>{item.label}</Link>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()} className="gap-2">
                <LogOut className="h-4 w-4 opacity-80" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
