"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Role = "unknown" | "unauthenticated" | "admin" | "client";
type Variant = "error" | "not-found";

type BrandedErrorProps = {
  variant: Variant;
  error?: (Error & { digest?: string }) | null;
  reset?: () => void;
  className?: string;
};

type CopyBlock = {
  label: string;
  headline: string;
  description: string;
};

const ERROR_COPY: CopyBlock = {
  label: "Something went wrong",
  headline: "We hit a snag",
  description: "We couldn't load that page. Try again or head back to your dashboard.",
};

const NOT_FOUND_COPY: CopyBlock = {
  label: "404",
  headline: "Page not found",
  description: "We couldn't find the page you're looking for.",
};

const UNAUTH_COPY: CopyBlock = {
  label: "404",
  headline: "Page not found",
  description: "We couldn't find that page. Sign in to continue.",
};

function useSessionRole() {
  const { isLoaded, isSignedIn } = useAuth();
  const [role, setRole] = React.useState<Role>("unknown");

  React.useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setRole("unauthenticated");
      return;
    }

    setRole("client");

    let cancelled = false;

    const loadRole = async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!data?.signedIn) {
          setRole("unauthenticated");
          return;
        }
        setRole(data?.admin ? "admin" : "client");
      } catch (error) {
        if (!cancelled) {
          setRole("client");
        }
      }
    };

    void loadRole();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  return role;
}

export function BrandedError({ variant, error, reset, className }: BrandedErrorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const role = useSessionRole();
  const resolvedRole: Role = role === "unknown" ? "unauthenticated" : role;

  const isNotFound = variant === "not-found";
  const isUnauthorizedAdminPath = Boolean(pathname?.startsWith("/admin")) && resolvedRole !== "admin";
  const shouldShowNotFound =
    isNotFound || resolvedRole === "unauthenticated" || isUnauthorizedAdminPath;
  const copy = shouldShowNotFound
    ? resolvedRole === "unauthenticated"
      ? UNAUTH_COPY
      : NOT_FOUND_COPY
    : ERROR_COPY;

  const primaryAction = isUnauthorizedAdminPath && resolvedRole !== "unauthenticated"
    ? { label: "Home", href: "/" }
    : resolvedRole === "admin"
      ? { label: "Go to Admin Dashboard", href: "/admin/dashboard" }
      : resolvedRole === "client"
        ? { label: "Go to Client Portal", href: "/portal" }
        : { label: "Sign in", href: "/auth" };

  const secondaryAction =
    resolvedRole === "unauthenticated"
      ? { label: "Home", href: "/" }
      : null;

  const showTryAgain =
    variant === "error" &&
    resolvedRole !== "unauthenticated" &&
    !isUnauthorizedAdminPath;
  const showDetails =
    variant === "error" &&
    resolvedRole === "admin" &&
    Boolean(error?.digest || error?.message);

  return (
    <div
      className={cn(
        "relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-slate-50 px-6 py-10 text-slate-900 box-border",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(4,78,92,0.08),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,_rgba(4,47,74,0.06),_transparent_45%)]" />
        <div className="absolute -right-24 top-0 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute -left-28 bottom-0 h-72 w-72 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="absolute inset-0 bg-[url('/globe.svg')] bg-[length:520px] bg-right-top bg-no-repeat opacity-[0.05]" />
      </div>

      <div className="relative z-10 w-full max-w-xl text-center">
        <Image
          src="/logo.png"
          alt="Caribeae logo"
          width={120}
          height={120}
          className="mx-auto h-16 w-auto object-contain sm:h-20"
          priority
        />

        <div className="mt-6 space-y-3">
          <span className="inline-flex items-center rounded-full border border-border bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            {copy.label}
          </span>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {copy.headline}
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {copy.description}
          </p>
        </div>

        <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="w-full sm:w-auto">
            <Link href={primaryAction.href}>{primaryAction.label}</Link>
          </Button>
          {secondaryAction ? (
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
            </Button>
          ) : null}
        </div>

        {showTryAgain ? (
          <button
            type="button"
            className="mt-4 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              reset?.();
              router.refresh();
            }}
          >
            Try again
          </button>
        ) : null}

        {showDetails ? (
          <details className="mt-6 rounded-lg border border-border bg-white/70 p-4 text-left text-xs text-muted-foreground shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Details
            </summary>
            <div className="mt-3 max-h-40 space-y-2 overflow-auto font-mono text-[11px] leading-relaxed">
              {error?.digest ? <div>Digest: {error.digest}</div> : null}
              {error?.message ? <div>Message: {error.message}</div> : null}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
