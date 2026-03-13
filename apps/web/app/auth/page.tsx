"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth, useSignIn, useSignUp } from "@clerk/nextjs";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell, InlineErrorSlot, LoadingButton } from "@/components/auth/AuthShell";
import { parseClerkError } from "@/lib/auth/clerkErrors";
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
- Clerk test mode: use a `+clerk_test` email alias and OTP `424242`.
- Warning: Clerk development instances cap Clerk-delivered OTP email/SMS volume, so prefer test mode identifiers for QA.
*/

const CLERK_SIGN_UP_FIELD_LABELS: Record<string, string> = {
  first_name: "first name",
  last_name: "last name",
  email_address: "email address",
  phone_number: "mobile number",
  username: "username",
  password: "password",
  legal_accepted: "terms acceptance",
};

function formatClerkFieldLabel(field: string) {
  return CLERK_SIGN_UP_FIELD_LABELS[field] ?? field.replace(/_/g, " ");
}

function getMissingClerkFields(signUpAttempt: { missingFields?: string[] | null }) {
  return Array.from(new Set((signUpAttempt.missingFields ?? []).filter(Boolean)));
}

export default function AuthPage() {
  const router = useRouter();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { isLoaded: signInLoaded, signIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp } = useSignUp();
  const redirectingRef = React.useRef(false);

  const [identifier, setIdentifier] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [signUpMissingFields, setSignUpMissingFields] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const detectedType = detectIdentifierType(identifier);
  const needsNamePrompt = signUpMissingFields.includes("first_name") || signUpMissingFields.includes("last_name");

  React.useEffect(() => {
    inputRef.current?.focus();
    sessionStorage.removeItem("caribeae.auth.pending");
  }, []);

  React.useEffect(() => {
    if (!authLoaded || !isSignedIn || redirectingRef.current) return;
    redirectingRef.current = true;

    let cancelled = false;

    const redirectIfSignedIn = async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (data?.signedIn) {
          router.replace(data.admin ? "/admin/dashboard" : "/portal");
        } else {
          redirectingRef.current = false;
        }
      } catch {
        redirectingRef.current = false;
      }
    };

    void redirectIfSignedIn();

    return () => {
      cancelled = true;
    };
  }, [authLoaded, isSignedIn, router]);

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
        setSignUpMissingFields([]);
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
        const nextFirstName = firstName.trim();
        const nextLastName = lastName.trim();
        const isSamePendingIdentifier =
          (type === "email" && signUp.emailAddress === normalized) || (type === "phone" && signUp.phoneNumber === normalized);

        if (signUpMissingFields.includes("first_name") && !nextFirstName) {
          setError("Enter a first name.");
          setIsLoading(false);
          return;
        }

        if (signUpMissingFields.includes("last_name") && !nextLastName) {
          setError("Enter a last name.");
          setIsLoading(false);
          return;
        }

        const signUpAttempt =
          needsNamePrompt && isSamePendingIdentifier
            ? await signUp.update({
                ...(nextFirstName ? { firstName: nextFirstName } : {}),
                ...(nextLastName ? { lastName: nextLastName } : {}),
              })
            : await signUp.create({
                ...(type === "email" ? { emailAddress: normalized } : { phoneNumber: normalized }),
                ...(nextFirstName ? { firstName: nextFirstName } : {}),
                ...(nextLastName ? { lastName: nextLastName } : {}),
              });

        const missingFields = getMissingClerkFields(signUpAttempt);
        if (missingFields.length > 0) {
          setSignUpMissingFields(missingFields);
          setError(`We need ${missingFields.map(formatClerkFieldLabel).join(", ")} before we can send your code.`);
          setIsLoading(false);
          return;
        }

        setSignUpMissingFields([]);

        if (type === "email") {
          await signUpAttempt.prepareEmailAddressVerification({ strategy: "email_code" });
        } else {
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
      setError(parseClerkError(caught).message);
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
      <div className="space-y-8 w-full">
        <div className="space-y-3 w-full">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Welcome back
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Sign in</h1>
          {needsNamePrompt ? (
            <p className="text-sm text-muted-foreground">
              We need your name before we can create your login and send the verification code.
            </p>
          ) : null}
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
        >
          <div className="space-y-2">
            <Label htmlFor="identifier">{helperText}</Label>
            <Input
              id="identifier"
              name="identifier"
              ref={inputRef}
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
                if (error) setError(null);
                if (signUpMissingFields.length > 0) {
                  setSignUpMissingFields([]);
                }
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
          </div>

          {signUpMissingFields.length > 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-900">New login details needed</p>
              <p className="mt-1 text-muted-foreground">
                Clerk still requires {signUpMissingFields.map(formatClerkFieldLabel).join(", ")} for this sign-up.
              </p>
            </div>
          ) : null}

          {needsNamePrompt ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  autoComplete="given-name"
                  onChange={(event) => {
                    setFirstName(event.target.value);
                    if (error) setError(null);
                  }}
                  disabled={isLoading}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  autoComplete="family-name"
                  onChange={(event) => {
                    setLastName(event.target.value);
                    if (error) setError(null);
                  }}
                  disabled={isLoading}
                />
              </div>
            </div>
          ) : null}

          <InlineErrorSlot message={error} />

          <LoadingButton
            type="submit"
            isLoading={isLoading}
            loadingText={needsNamePrompt ? "Saving details" : "Sending code"}
          >
            {needsNamePrompt ? "Continue" : "Send code"}
          </LoadingButton>
        </form>
      </div>
    </AuthShell>
  );
}
