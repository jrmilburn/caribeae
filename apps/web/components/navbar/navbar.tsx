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
  Inbox,
  Settings,
  CreditCard,
  Menu,
  ChevronDown,
  LogIn,
  LogOut,
  LucideIcon,
  ClipboardList,
  Clock,
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
  { label: "Onboarding", href: "/admin/onboarding", icon: ClipboardList },
  { label: "Waitlist", href: "/admin/waitlist", icon: Clock },
  { label: "Payments", href: "/admin/settings/payments", icon: CreditCard },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];


type AppNavbarProps = {
  children?: React.ReactNode;
  brandName?: string;
};

export function AppNavbar({ children, brandName = "Caribeae" }: AppNavbarProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-[100dvh] w-full bg-background">
      <aside className="hidden w-72 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="relative flex grow flex-col gap-y-5 overflow-y-auto px-6 py-4">
          <div className="relative flex h-16 shrink-0 items-center gap-3">
            <BackButton aria-label="Back" />
            <div className="grid h-9 w-9 place-items-center">
              <Image alt="Caribeae logo" src="/logo.png" width={36} height={36} className="h-9 w-9 object-contain" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{brandName}</div>
              <div className="truncate text-xs text-muted-foreground">Swim school management</div>
            </div>
          </div>

          <nav className="relative flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-6">
              <li>
                <SidebarNav pathname={pathname} />
              </li>
              <li className="-mx-2 mt-auto pt-2">
                <div className="px-2">
                  <UserBlock />
                </div>
              </li>
            </ul>
          </nav>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-end border-b border-border bg-background/80 px-3 backdrop-blur md:hidden">
          <div className="mr-auto md:hidden">
            <MobileNavSheet brandName={brandName} pathname={pathname} />
          </div>

          <AccountMenu />
        </header>

        <main className="min-w-0 flex-1 overflow-hidden">
          <div className="flex h-full min-h-0 w-full flex-col">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarNav({
  pathname,
  className,
}: {
  pathname: string;
  className?: string;
}) {
  return (
    <ul role="list" className={cn("-mx-2 space-y-1", className)}>
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
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
                  active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
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
        <div className="flex h-full flex-col bg-card">
          <div className="border-b border-border px-4 py-4">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-muted">
                  <Image alt="Caribeae logo" src="/logo.png" width={30} height={30} className="h-7 w-7 object-contain" />
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

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <SidebarNav pathname={pathname} />
          </nav>

          <div className="border-t border-border p-3">
            <UserBlock />
          </div>
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
