"use client";

import * as React from "react";
import { CheckCircle2, LifeBuoy, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type AuthShellMode = "client" | "admin";

const COPY: Record<AuthShellMode, {
  headerLabel: string;
  brandEyebrow: string;
  brandHeading: string;
  brandCopy: string;
  bullets: string[];
}> = {
  client: {
    headerLabel: "Client Portal",
    brandEyebrow: "Client Portal",
    brandHeading: "A calm, secure place to manage your swim journey.",
    brandCopy: "Access schedules, enrolments, invoices, and updates with a one-time code.",
    bullets: [
      "OTP-only access keeps your account protected.",
      "Switch devices without resetting passwords.",
      "Instant updates once your family is approved.",
    ],
  },
  admin: {
    headerLabel: "Admin Portal",
    brandEyebrow: "Staff Access",
    brandHeading: "Secure access for staff and operations.",
    brandCopy: "Manage schedules, families, and payments with a one-time code.",
    bullets: [
      "Staff-only OTP access with no passwords.",
      "Fast entry to scheduling and billing tools.",
      "Protected by your Caribeae admin account.",
    ],
  },
};

export function AuthShell({
  children,
  mode = "client",
}: {
  children: React.ReactNode;
  mode?: AuthShellMode;
}) {
  const copy = COPY[mode];
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col lg:flex-row">
        <AuthPanel className="order-1 lg:order-2">
          <div className="flex min-h-screen flex-col px-6 py-8 sm:px-10 lg:px-12 lg:py-12">
            <header className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-sm font-semibold text-white shadow-sm">
                C
              </div>
              <div className="space-y-0.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  Caribeae
                </p>
                <p className="text-base font-semibold">{copy.headerLabel}</p>
              </div>
            </header>

            <main className="mt-10 flex-1">
              <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
                {children}
              </div>
            </main>

            <footer className="mt-10 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <a
                className="rounded-full border border-transparent px-2 py-1 transition hover:border-slate-200 hover:text-slate-900"
                href="https://caribeae.com"
                target="_blank"
                rel="noreferrer"
              >
                caribeae.com
              </a>
              <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />
              <a
                className="rounded-full border border-transparent px-2 py-1 transition hover:border-slate-200 hover:text-slate-900"
                href="mailto:billing@caribeae.com"
              >
                billing@caribeae.com
              </a>
            </footer>
          </div>
        </AuthPanel>

        <BrandPanel className="order-2 lg:order-1" mode={mode} />
      </div>
    </div>
  );
}

export function BrandPanel({
  className,
  mode = "client",
}: {
  className?: string;
  mode?: AuthShellMode;
}) {
  const copy = COPY[mode];
  return (
    <section
      className={cn(
        "relative flex w-full items-stretch overflow-hidden bg-slate-950 text-white lg:w-5/12",
        className
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.14),_transparent_45%)]" />
      <div className="absolute -right-16 -top-10 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" />

      <div className="relative z-10 flex w-full flex-col justify-between px-6 py-8 sm:px-10 lg:min-h-screen lg:px-12 lg:py-12">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-200/80">
            {copy.brandEyebrow}
          </p>
          <h2 className="text-2xl font-semibold leading-tight sm:text-3xl">{copy.brandHeading}</h2>
          <p className="text-sm text-slate-200/80">{copy.brandCopy}</p>
        </div>

        <ul className="mt-8 space-y-3 text-sm text-slate-200/90">
          {copy.bullets.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex items-center gap-2 text-xs text-slate-200/80">
          <LifeBuoy className="h-4 w-4 text-emerald-200/80" />
          <span>Need help?</span>
          <a className="text-white underline-offset-4 hover:underline" href="mailto:billing@caribeae.com">
            billing@caribeae.com
          </a>
        </div>
      </div>
    </section>
  );
}

export function AuthPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex w-full flex-1 bg-white/80 backdrop-blur-sm lg:border-l lg:border-slate-200",
        className
      )}
    >
      {children}
    </section>
  );
}

export function InlineErrorSlot({
  message,
  className,
  id,
}: {
  message?: string | null;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "min-h-[20px] text-xs text-destructive transition-opacity",
        message ? "opacity-100" : "opacity-0",
        className
      )}
      aria-live="polite"
    >
      {message ?? " "}
    </div>
  );
}

type LoadingButtonProps = React.ComponentProps<typeof Button> & {
  isLoading: boolean;
  loadingText: string;
};

export function LoadingButton({
  isLoading,
  loadingText,
  children,
  className,
  disabled,
  ...props
}: LoadingButtonProps) {
  return (
    <Button
      {...props}
      className={cn("h-11 w-full gap-2", className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      <span>{isLoading ? loadingText : children}</span>
    </Button>
  );
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled,
  error,
  autoFocus = false,
  onComplete,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  length?: number;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
  onComplete?: (code: string) => void;
}) {
  const inputRefs = React.useRef<Array<HTMLInputElement | null>>([]);
  const prevComplete = React.useRef(false);

  React.useEffect(() => {
    if (autoFocus) {
      inputRefs.current[0]?.focus();
    }
  }, [autoFocus]);

  React.useEffect(() => {
    if (!onComplete) return;
    const isComplete = value.every((digit) => digit.length === 1);
    if (isComplete && !prevComplete.current) {
      onComplete(value.join(""));
    }
    prevComplete.current = isComplete;
  }, [onComplete, value]);

  const setDigit = (index: number, digit: string) => {
    const next = [...value];
    next[index] = digit;
    onChange(next);
  };

  const handleChange = (index: number) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = event.target.value.replace(/\D/g, "");
    if (!cleaned) {
      setDigit(index, "");
      return;
    }
    const digit = cleaned.slice(-1);
    setDigit(index, digit);

    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") return;
    if (event.key === "Backspace") {
      if (value[index]) {
        setDigit(index, "");
        return;
      }
      if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!text) return;
    event.preventDefault();

    const nextDigits = Array(length)
      .fill("")
      .map((_, idx) => text[idx] ?? "");

    onChange(nextDigits);

    const lastIndex = Math.min(text.length, length) - 1;
    if (lastIndex >= 0) {
      inputRefs.current[lastIndex]?.focus();
    }
  };

  return (
    <div className="space-y-3" onPaste={handlePaste}>
      <div className="flex justify-between gap-2 sm:gap-3">
        {Array.from({ length }).map((_, index) => (
          <input
            key={`otp-${index}`}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            value={value[index] ?? ""}
            onChange={handleChange(index)}
            onKeyDown={handleKeyDown(index)}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            className={cn(
              "h-12 w-12 rounded-xl border border-input text-center text-lg font-semibold shadow-xs transition focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] sm:h-14 sm:w-14",
              error ? "border-destructive" : "border-input"
            )}
            maxLength={1}
            disabled={disabled}
            aria-label={`Digit ${index + 1}`}
            aria-invalid={error}
          />
        ))}
      </div>
    </div>
  );
}
