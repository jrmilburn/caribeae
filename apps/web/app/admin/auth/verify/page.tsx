"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useClerk, useSignIn } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthShell } from "@/components/auth/AuthShell";
import { maskIdentifier, type IdentifierType } from "@/lib/auth/identity";

type PendingAuth = {
  identifier: string;
  type: IdentifierType;
  masked?: string;
  startedAt?: number;
};

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function AdminVerifyPage() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();

  const [pending, setPending] = React.useState<PendingAuth | null>(null);
  const [digits, setDigits] = React.useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = React.useState(RESEND_SECONDS);
  const [isResending, setIsResending] = React.useState(false);

  const inputRefs = React.useRef<Array<HTMLInputElement | null>>([]);

  React.useEffect(() => {
    const raw = sessionStorage.getItem("caribeae.admin.auth.pending");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as PendingAuth;
      setPending(parsed);
    } catch (caught) {
      // ignore parsing errors
    }
  }, []);

  React.useEffect(() => {
    if (!pending) return;
    const firstInput = inputRefs.current[0];
    firstInput?.focus();
    if (pending.startedAt) {
      const elapsed = Math.floor((Date.now() - pending.startedAt) / 1000);
      setResendCountdown(Math.max(0, RESEND_SECONDS - elapsed));
    }
  }, [pending]);

  React.useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  const code = digits.join("");

  const updateDigit = (index: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleInputChange = (index: number) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.replace(/\D/g, "");
    if (!value) {
      updateDigit(index, "");
      setError(null);
      return;
    }

    const digit = value.slice(-1);
    updateDigit(index, digit);
    setError(null);

    if (index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number) => (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleVerify();
      return;
    }
    if (event.key === "Backspace") {
      if (digits[index]) {
        updateDigit(index, "");
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
    setError(null);

    const nextDigits = Array(OTP_LENGTH)
      .fill("")
      .map((_, idx) => text[idx] ?? "");

    setDigits(nextDigits);

    const lastIndex = Math.min(text.length, OTP_LENGTH) - 1;
    if (lastIndex >= 0) {
      inputRefs.current[lastIndex]?.focus();
    }
  };

  const clearPending = () => {
    sessionStorage.removeItem("caribeae.admin.auth.pending");
  };

  const handleVerify = React.useCallback(async () => {
    if (!pending) return;
    if (isSubmitting) return;

    if (code.length !== OTP_LENGTH) {
      setError("Enter the 6-digit code.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (!signInLoaded || !signIn) throw new Error("Sign-in not ready");
      const result = await signIn.attemptFirstFactor({
        strategy: pending.type === "email" ? "email_code" : "phone_code",
        code,
      });
      if (result.status !== "complete") {
        setError("That code didn't work. Try again.");
        setIsSubmitting(false);
        return;
      }
      await setActive({ session: result.createdSessionId });

      const verifyRes = await fetch("/api/admin-auth/complete", { method: "POST" });
      const verify = await verifyRes.json().catch(() => null);
      if (!verify?.ok) {
        clearPending();
        await signOut(() => router.replace("/admin/auth/error"));
        return;
      }

      clearPending();
      router.replace("/admin/schedule");
    } catch (caught) {
      setError("We couldn't verify that code. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [code, isSubmitting, pending, router, setActive, signIn, signInLoaded, signOut]);

  React.useEffect(() => {
    if (pending && code.length === OTP_LENGTH && !isSubmitting) {
      handleVerify();
    }
  }, [code, handleVerify, isSubmitting, pending]);

  const handleResend = async () => {
    if (!pending || isResending || resendCountdown > 0 || isSubmitting) return;
    setIsResending(true);
    setError(null);

    try {
      if (!signInLoaded || !signIn) throw new Error("Sign-in not ready");
      const factors = signIn.supportedFirstFactors ?? [];

      if (pending.type === "email") {
        const emailFactor = factors.find((factor) => factor.strategy === "email_code");
        if (!emailFactor || !("emailAddressId" in emailFactor)) {
          throw new Error("Email factor not available");
        }
        await signIn.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: emailFactor.emailAddressId,
        });
      } else {
        const phoneFactor = factors.find((factor) => factor.strategy === "phone_code");
        if (!phoneFactor || !("phoneNumberId" in phoneFactor)) {
          throw new Error("Phone factor not available");
        }
        await signIn.prepareFirstFactor({
          strategy: "phone_code",
          phoneNumberId: phoneFactor.phoneNumberId,
        });
      }

      setResendCountdown(RESEND_SECONDS);
    } catch (caught) {
      setError("Unable to resend the code. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  if (!pending) {
    return (
      <AuthShell mode="admin">
        <Card className="w-full rounded-2xl border border-border/60 shadow-md sm:border-border">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Verification needed</CardTitle>
            <p className="text-sm text-muted-foreground">
              Your verification session has expired. Start again to get a new code.
            </p>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => router.push("/admin/auth")}>
              Back to admin sign in
            </Button>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  const masked = pending.masked || maskIdentifier(pending.identifier, pending.type);

  return (
    <AuthShell mode="admin">
      <Card className="w-full rounded-2xl border border-border/60 shadow-md sm:border-border">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Enter your code</CardTitle>
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code to <span className="font-medium text-foreground">{masked}</span>.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3" onPaste={handlePaste}>
            <div className="flex justify-between gap-2">
              {digits.map((digit, index) => (
                <input
                  key={`otp-${index}`}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  value={digit}
                  onChange={handleInputChange(index)}
                  onKeyDown={handleKeyDown(index)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  className="h-12 w-12 rounded-xl border border-input text-center text-lg font-semibold shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  maxLength={1}
                  disabled={isSubmitting}
                  aria-label={`Digit ${index + 1}`}
                  aria-invalid={Boolean(error)}
                />
              ))}
            </div>
            <div
              className="min-h-[20px] text-xs text-destructive transition-opacity"
              aria-live="polite"
            >
              {error ? error : null}
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleVerify}
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>{isSubmitting ? "Verifying" : "Verify"}</span>
          </Button>

          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCountdown > 0 || isResending || isSubmitting}
              className="text-sm font-medium text-primary disabled:cursor-not-allowed disabled:text-muted-foreground"
            >
              {resendCountdown > 0
                ? `Resend code in ${resendCountdown}s`
                : isResending
                  ? "Resending..."
                  : "Resend code"}
            </button>
            <button
              type="button"
              onClick={() => {
                clearPending();
                router.push("/admin/auth");
              }}
              disabled={isSubmitting}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              Change email or phone
            </button>
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
