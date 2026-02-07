"use client";

import * as React from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type AuthShellMode = "client" | "admin";
const SUPPORT_EMAIL = "rachele@caribeae.com.au";

const COPY: Record<AuthShellMode, {
  brandEyebrow: string;
  brandHeading: string;
}> = {
  client: {
    brandEyebrow: "Client Portal",
    brandHeading: "Caribeae",
  },
  admin: {
    brandEyebrow: "Admin Portal",
    brandHeading: "Caribeae",
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
      <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-[45%_55%]">
        <BrandPanel className="order-1" mode={mode} />
        <AuthPanel className="order-2">
          <div className="flex min-h-screen flex-col">
            <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10 lg:px-12">
              <div className="w-full max-w-md">
                <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
                  {children}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center px-6 pb-10 text-xs text-muted-foreground sm:px-10 lg:px-12">
              <div className="w-full max-w-md">
                <span>Need help? </span>
                <a className="text-slate-900 underline-offset-4 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </div>
          </div>
        </AuthPanel>
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
        "relative flex w-full items-stretch overflow-hidden bg-slate-950 text-white",
        className
      )}
    >
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(4,47,74,0.96),rgba(4,78,92,0.92))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_55%)]" />
      <div className="absolute inset-0 bg-[url('/globe.svg')] bg-[length:420px] bg-right-top bg-no-repeat opacity-12" />
      <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" />

      <div className="relative z-10 flex w-full flex-col px-8 py-10 sm:px-10 lg:min-h-screen lg:px-12 lg:py-14">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Image
              src="/logo.png"
              alt="Caribeae logo"
              width={140}
              height={140}
              className="h-16 w-auto object-contain sm:h-20"
              priority
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-200/80">
              {copy.brandEyebrow}
            </p>
            <h2 className="text-2xl font-semibold leading-tight text-white sm:text-3xl">
              {copy.brandHeading}
            </h2>
          </div>
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
        "flex justify-center w-full flex-1 bg-white/80 backdrop-blur-sm lg:border-l lg:border-slate-200",
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
