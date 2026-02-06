"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSignIn, useSignUp } from "@clerk/nextjs";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell, InlineErrorSlot, LoadingButton } from "@/components/auth/AuthShell";
import {
  detectIdentifierType,
  isValidE164,
  maskIdentifier,
  normalizeIdentifier,
  type IdentifierType,
} from "@/lib/auth/identity";

const NOT_ELIGIBLE_MESSAGE = "No family account found. Please contact Caribeae.";

/*
Manual test checklist:
- Eligible email -> receives code -> verify -> redirected to /portal.
- Eligible phone -> receives SMS code -> verify -> redirected to /portal.
- Ineligible identifier -> inline error with contact message (no Clerk call).
- Resend code works with countdown, change identifier returns to /auth.
*/

export default function AuthPage() {
  const router = useRouter();
  const { isLoaded: signInLoaded, signIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp } = useSignUp();

  const [identifier, setIdentifier] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const detectedType = detectIdentifierType(identifier);

  React.useEffect(() => {
    inputRef.current?.focus();
    sessionStorage.removeItem("caribeae.auth.pending");
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;

    const trimmed = identifier.trim();
    if (!trimmed) {
      setError("Enter your email or mobile number.");
      return;
    }

    const type: IdentifierType = detectIdentifierType(trimmed);
    const normalized = normalizeIdentifier(trimmed, type);

    if (type === "phone" && !isValidE164(normalized)) {
      setError("Use +61 412 345 678 or 0412 345 678.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const eligibilityRes = await fetch("/api/auth/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: normalized, type }),
      });
      const eligibility = await eligibilityRes.json().catch(() => null);

      if (!eligibility?.ok) {
        setError(eligibility?.error ?? NOT_ELIGIBLE_MESSAGE);
        setIsLoading(false);
        return;
      }

      const startRes = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: normalized, type }),
      });
      const start = await startRes.json().catch(() => null);

      if (!start?.ok) {
        setError(start?.error ?? "Unable to start verification.");
        setIsLoading(false);
        return;
      }

      if (!signInLoaded || !signUpLoaded || !signIn || !signUp) {
        setError("Auth is still loading. Please try again.");
        setIsLoading(false);
        return;
      }

      if (start.flow === "signIn") {
        const signInAttempt = await signIn.create({ identifier: normalized });
        const factors = signInAttempt.supportedFirstFactors ?? [];

        if (type === "email") {
          const emailFactor = factors.find((factor) => factor.strategy === "email_code");
          if (!emailFactor || !("emailAddressId" in emailFactor)) {
            throw new Error("Email factor not available");
          }
          await signInAttempt.prepareFirstFactor({
            strategy: "email_code",
            emailAddressId: emailFactor.emailAddressId,
          });
        } else {
          const phoneFactor = factors.find((factor) => factor.strategy === "phone_code");
          if (!phoneFactor || !("phoneNumberId" in phoneFactor)) {
            throw new Error("Phone factor not available");
          }
          await signInAttempt.prepareFirstFactor({
            strategy: "phone_code",
            phoneNumberId: phoneFactor.phoneNumberId,
          });
        }
      } else {
        if (type === "email") {
          const signUpAttempt = await signUp.create({ emailAddress: normalized });
          await signUpAttempt.prepareEmailAddressVerification({ strategy: "email_code" });
        } else {
          const signUpAttempt = await signUp.create({ phoneNumber: normalized });
          await signUpAttempt.preparePhoneNumberVerification({ strategy: "phone_code" });
        }
      }

      sessionStorage.setItem(
        "caribeae.auth.pending",
        JSON.stringify({
          identifier: normalized,
          type,
          flow: start.flow,
          masked: maskIdentifier(normalized, type),
          startedAt: Date.now(),
        })
      );

      router.push("/auth/verify");
    } catch (caught) {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const helperText =
    detectedType === "phone" && identifier.trim().length > 0
      ? "Email or mobile number. Use +61 412 345 678 or 0412 345 678."
      : "Email or mobile number.";

  return (
    <AuthShell>
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Welcome back
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Sign in securely</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email or mobile number and we&apos;ll send a one-time code.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
        >
          <div className="space-y-2">
            <Label htmlFor="identifier">Email or mobile number</Label>
            <Input
              id="identifier"
              name="identifier"
              ref={inputRef}
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
                if (error) setError(null);
              }}
              type={detectedType === "email" ? "email" : "tel"}
              inputMode={detectedType === "email" ? "email" : "tel"}
              autoComplete={detectedType === "email" ? "email" : "tel"}
              autoCorrect="off"
              autoCapitalize="none"
              enterKeyHint="send"
              placeholder="name@example.com or 0412 345 678"
              disabled={isLoading}
              aria-invalid={Boolean(error)}
            />
            <p className="text-xs text-muted-foreground">{helperText}</p>
            <InlineErrorSlot message={error} />
          </div>

          <LoadingButton type="submit" isLoading={isLoading} loadingText="Sending code">
            Send code
          </LoadingButton>
        </form>
      </div>
    </AuthShell>
  );
}
