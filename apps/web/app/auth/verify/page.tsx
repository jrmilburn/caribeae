"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { AuthShell, InlineErrorSlot, LoadingButton, OtpInput } from "@/components/auth/AuthShell";
import { maskIdentifier, type IdentifierType } from "@/lib/auth/identity";

type PendingAuth = {
  identifier: string;
  type: IdentifierType;
  flow: "signIn" | "signUp";
  masked?: string;
  startedAt?: number;
};

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function VerifyPage() {
  const router = useRouter();
  const { signOut } = useClerk();
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp();

  const [pending, setPending] = React.useState<PendingAuth | null>(null);
  const [digits, setDigits] = React.useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = React.useState(RESEND_SECONDS);
  const [isResending, setIsResending] = React.useState(false);

  React.useEffect(() => {
    const raw = sessionStorage.getItem("caribeae.auth.pending");
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

  const clearPending = () => {
    sessionStorage.removeItem("caribeae.auth.pending");
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
      if (pending.flow === "signIn") {
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
        await setActiveSignIn({ session: result.createdSessionId });
      } else {
        if (!signUpLoaded || !signUp) throw new Error("Sign-up not ready");
        const result =
          pending.type === "email"
            ? await signUp.attemptEmailAddressVerification({ code })
            : await signUp.attemptPhoneNumberVerification({ code });
        if (result.status !== "complete") {
          setError("That code didn't work. Try again.");
          setIsSubmitting(false);
          return;
        }
        await setActiveSignUp({ session: result.createdSessionId });
      }

      const mapRes = await fetch("/api/auth/complete", { method: "POST" });
      const map = await mapRes.json().catch(() => null);
      if (!map?.ok) {
        clearPending();
        await signOut(() => router.replace("/auth/error"));
        return;
      }

      clearPending();
      router.replace("/portal");
    } catch (caught) {
      setError("We couldn't verify that code. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    code,
    isSubmitting,
    pending,
    router,
    setActiveSignIn,
    setActiveSignUp,
    signIn,
    signInLoaded,
    signOut,
    signUp,
    signUpLoaded,
  ]);

  const handleResend = async () => {
    if (!pending || isResending || resendCountdown > 0 || isSubmitting) return;
    setIsResending(true);
    setError(null);

    try {
      if (pending.flow === "signIn") {
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
      } else {
        if (!signUpLoaded || !signUp) throw new Error("Sign-up not ready");
        if (pending.type === "email") {
          await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        } else {
          await signUp.preparePhoneNumberVerification({ strategy: "phone_code" });
        }
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
      <AuthShell>
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Verification needed
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Start again</h1>
            <p className="text-sm text-muted-foreground">
              Your verification session has expired. Request a new code to continue.
            </p>
          </div>
          <Button className="w-full sm:w-auto" onClick={() => router.push("/auth")}>
            Back to sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  const masked = pending.masked || maskIdentifier(pending.identifier, pending.type);

  return (
    <AuthShell>
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Verification
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Enter your code</h1>
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code to <span className="font-medium text-foreground">{masked}</span>.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleVerify();
          }}
          className="space-y-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
        >
          <OtpInput
            value={digits}
            onChange={(next) => {
              setDigits(next);
              if (error) setError(null);
            }}
            length={OTP_LENGTH}
            disabled={isSubmitting}
            error={Boolean(error)}
            autoFocus
            onComplete={() => {
              if (!isSubmitting) {
                handleVerify();
              }
            }}
          />
          <InlineErrorSlot message={error} />

          <LoadingButton type="submit" isLoading={isSubmitting} loadingText="Verifying">
            Verify
          </LoadingButton>
        </form>

        <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
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
              router.push("/auth");
            }}
            disabled={isSubmitting}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            Change email or phone
          </button>
        </div>
      </div>
    </AuthShell>
  );
}
