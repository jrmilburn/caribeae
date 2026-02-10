"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import Image from "next/image";

import {
  LayoutDashboard,
  CalendarDays,
  Users,
  BookOpen,
  Inbox,        // ✅ better for Messages (inbox)
  Settings,
  Menu,
  ChevronDown,
  LogIn,
  LogOut,
  LucideIcon,
  ClipboardList,
  CreditCard
} from "lucide-react";


import { useClerk, useUser } from "@clerk/nextjs";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/navigation/BackButton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Schedule", href: "/admin/schedule", icon: CalendarDays },
  { label: "Families", href: "/admin/family", icon: Users },
  { label: "Classes", href: "/admin/class", icon: BookOpen },

  { label: "Messages", href: "/admin/messages", icon: Inbox },
  { label: "Billing", href: "/admin/billing", icon: CreditCard },
  { label: "Onboarding", href: "/admin/onboarding", icon: ClipboardList },
  { label: "Waitlist", href: "/admin/waitlist", icon: ClipboardList },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];


type AppNavbarProps = {
  children?: React.ReactNode;
  brandName?: string;
};

export function AppNavbar({ children, brandName = "Caribeae" }: AppNavbarProps) {
  const pathname = usePathname();

  return (
    <div className="flex max-h-screen h-full w-full bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="flex h-14 items-center gap-3 px-0">
            <BackButton aria-label="Back" />
          <div className="grid h-9 w-9 place-items-center">
            <span className="text-sm font-semibold"><Image 
              alt="logo"
              src="/logo.png"
              width={64}
              height={64}
            /></span>
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{brandName}</div>
          </div>
        </div>

        <div className="flex-1 p-2">
          <SidebarNav pathname={pathname} />
        </div>

        <div className="p-3">
          <UserBlock />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-end border-b border-border bg-background/80 px-3 backdrop-blur md:hidden">
          <div className="mr-auto md:hidden">
            <MobileNavSheet brandName={brandName} pathname={pathname} />
          </div>

          <AccountMenu />
        </header>

        {/* Content */}
        <main className="min-w-0 flex-1 h-full">{children}</main>
      </div>
    </div>
  );
}

function SidebarNav({ pathname }: { pathname: string }) {
  return (
    <div className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "" : "opacity-80")} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function MobileNavSheet({
  brandName,
  pathname,
}: {
  brandName: string;
  pathname: string;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Open menu">
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-80 p-0">
        <div className="p-4">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-muted">
                <span className="text-sm font-semibold">CS</span>
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{brandName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  Swim school management
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
        </div>

        <div className="px-3 pb-3">
          <SidebarNav pathname={pathname} />
        </div>

        <div className="mt-auto p-3">
          <UserBlock />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AccountMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const authEntry = pathname.startsWith("/admin") ? "/admin/auth" : "/auth";

  // Avoid flicker / incorrect initials while Clerk loads
  if (!isLoaded) {
    return (
      <Button variant="ghost" className="h-10 w-10 rounded-full" aria-label="Account">
        <span className="h-8 w-8 rounded-full bg-muted" />
      </Button>
    );
  }

  if (!isSignedIn) {
    return (
      <Button asChild variant="outline" className="gap-2">
        <Link href={authEntry}>
          <LogIn className="h-4 w-4" />
          Sign in
        </Link>
      </Button>
    );
  }

  const name = user?.fullName ?? user?.firstName ?? "User";
  const email = user?.primaryEmailAddress?.emailAddress ?? "—";
  const imageUrl = user?.imageUrl ?? undefined;
  const initials = getInitials(name ?? email);

  const handleSignOut = async () => {
    // Send them somewhere public after sign out
    await signOut(() => router.push(authEntry));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-2 px-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={imageUrl} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <div className="px-3 py-2">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{email}</div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/profile">Profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/billing">Billing</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/admin/reception">Reception</Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleSignOut} className="gap-2">
          <LogOut className="h-4 w-4 opacity-80" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserBlock() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const authEntry = pathname.startsWith("/admin") ? "/admin/auth" : "/auth";

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
        <div className="h-9 w-9 rounded-full bg-muted" />
        <div className="min-w-0 space-y-2">
          <div className="h-3 w-28 rounded bg-muted" />
          <div className="h-3 w-40 rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">Not signed in</div>
          <div className="truncate text-xs text-muted-foreground">
            Sign in to manage your school
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={authEntry}>Sign in</Link>
        </Button>
      </div>
    );
  }

  const name = user?.fullName ?? user?.firstName ?? "Signed in";
  const email = user?.primaryEmailAddress?.emailAddress ?? "—";
  const imageUrl = user?.imageUrl ?? undefined;
  const initials = getInitials(name ?? email);

  const handleSignOut = async () => {
    await signOut(() => router.push(authEntry));
  };

  return (
    <DropdownMenu>
      {/* Whole block is the trigger */}
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "group w-full text-left",
            "rounded-lg border border-border bg-background p-3",
            "transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={imageUrl} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{name}</div>
              <div className="truncate text-xs text-muted-foreground">{email}</div>
            </div>

            <ChevronDown className="h-4 w-4 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
          </div>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/admin/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/admin/billing">Billing</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/admin/reception">Reception</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="gap-2">
          <LogOut className="h-4 w-4 opacity-80" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


function isActive(pathname: string, href: string) {
  if (href === "/admin/settings") {
    // Settings stays active for routes moved into the settings menu.
    const settingsRoutes = [
      "/admin/settings",
      "/admin/communications",
      "/admin/billing",
      "/admin/reports",
    ];
    return settingsRoutes.some(
      (route) => pathname === route || pathname.startsWith(route + "/")
    );
  }
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "U";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + b).toUpperCase();
}
