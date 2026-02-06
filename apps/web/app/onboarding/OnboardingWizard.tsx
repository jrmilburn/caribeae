"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  detectIdentifierType,
  isValidE164,
  maskIdentifier,
  normalizeIdentifier,
  type IdentifierType,
} from "@/lib/auth/identity";
import {
  availabilityDayOptions,
  availabilityWindowOptions,
  onboardingAvailabilitySchema,
  onboardingContactSchema,
  onboardingRequestSchema,
  onboardingStudentSchema,
  studentExperienceOptions,
  type OnboardingAvailabilityInput,
  type OnboardingRequestInput,
  type OnboardingStudentInput,
} from "@/lib/onboarding/schema";
import { submitOnboardingRequest } from "@/server/onboarding/submitOnboardingRequest";
import { updateOnboardingContact } from "@/server/onboarding/updateOnboardingContact";

const DRAFT_KEY = "caribeae:onboarding:draft";
const SUBMITTED_KEY = "caribeae:onboarding:submitted";
const ONBOARDING_AUTH_KEY = "caribeae:onboarding:auth";

const steps = [
  { title: "Contact", description: "Family basics" },
  { title: "Students", description: "Add swimmers" },
  { title: "Availability", description: "Preferred times" },
  { title: "Review", description: "Confirm details" },
  { title: "Confirm & access portal", description: "Verify and sign in" },
];

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

/*
Manual test checklist:
- Submit onboarding -> send code -> verify -> redirected to /portal.
- Edit identifier before sending code -> verification succeeds.
- Resend code works with countdown; change email/phone returns to input.
- Ineligible identifier shows the contact message without signing in.
*/

type LevelOption = { id: string; name: string };
type StudentExperience = (typeof studentExperienceOptions)[number];

type ContactState = z.infer<typeof onboardingContactSchema>;

type StudentState = OnboardingStudentInput & { id: string };

type AvailabilityState = OnboardingAvailabilityInput;

type FieldErrors = Record<string, string | undefined>;

type StudentErrors = Record<string, FieldErrors>;

type FormErrors = {
  contact?: FieldErrors;
  students?: StudentErrors;
  availability?: FieldErrors;
};

type PendingAuth = {
  identifier: string;
  type: IdentifierType;
  flow: "signIn" | "signUp";
  masked?: string;
  startedAt?: number;
};

type OnboardingAuthState = {
  requestId: string;
  familyId: string;
  email: string;
  phone: string;
  identifier?: string;
  type?: IdentifierType;
  flow?: "signIn" | "signUp";
  masked?: string;
  startedAt?: number;
};

const defaultContact: ContactState = {
  guardianName: "",
  phone: "",
  email: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  address: "",
};

const defaultAvailability: AvailabilityState = {
  preferredDays: [],
  preferredWindows: [],
  desiredLevelId: null,
  notes: "",
};

function isStudentExperience(value: string): value is StudentExperience {
  return (studentExperienceOptions as readonly string[]).includes(value);
}

function createStudent(): StudentState {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `student-${Date.now()}`,
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    experience: studentExperienceOptions[0],
    notes: "",
  };
}

function formatList(values: string[]) {
  if (!values.length) return "—";
  return values.join(", ");
}

export function OnboardingWizard({ levels }: { levels: LevelOption[] }) {
  const router = useRouter();
  const { signOut } = useClerk();
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp();

  const [step, setStep] = React.useState(0);
  const [contact, setContact] = React.useState<ContactState>(defaultContact);
  const [students, setStudents] = React.useState<StudentState[]>([createStudent()]);
  const [availability, setAvailability] = React.useState<AvailabilityState>(defaultAvailability);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  const [honeypot, setHoneypot] = React.useState("");
  const [authState, setAuthState] = React.useState<OnboardingAuthState | null>(null);
  const [identifier, setIdentifier] = React.useState("");
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [authLoading, setAuthLoading] = React.useState(false);
  const [pending, setPending] = React.useState<PendingAuth | null>(null);
  const [digits, setDigits] = React.useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [resendCountdown, setResendCountdown] = React.useState(RESEND_SECONDS);
  const [isResending, setIsResending] = React.useState(false);

  const identifierInputRef = React.useRef<HTMLInputElement>(null);
  const otpRefs = React.useRef<Array<HTMLInputElement | null>>([]);

  const detectedType = detectIdentifierType(identifier);

  const progressPercent = Math.round(((step + 1) / steps.length) * 100);

  React.useEffect(() => {
    const submittedId = window.localStorage.getItem(SUBMITTED_KEY);
    if (submittedId) {
      setSubmitted(true);
      setHydrated(true);
      return;
    }

    const authStored = window.localStorage.getItem(ONBOARDING_AUTH_KEY);
    if (authStored) {
      try {
        const parsed = JSON.parse(authStored) as OnboardingAuthState;
        if (parsed.requestId && parsed.familyId) {
          setAuthState(parsed);
          setIdentifier(parsed.identifier ?? parsed.email ?? "");
          setStep(steps.length - 1);
          if (parsed.identifier && parsed.type && parsed.flow) {
            setPending({
              identifier: parsed.identifier,
              type: parsed.type,
              flow: parsed.flow,
              masked: parsed.masked,
              startedAt: parsed.startedAt,
            });
          }
          if (parsed.startedAt) {
            const elapsed = Math.floor((Date.now() - parsed.startedAt) / 1000);
            setResendCountdown(Math.max(0, RESEND_SECONDS - elapsed));
          }
        }
      } catch {
        window.localStorage.removeItem(ONBOARDING_AUTH_KEY);
      }
    }

    const stored = window.localStorage.getItem(DRAFT_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as OnboardingRequestInput;
        const validated = onboardingRequestSchema.safeParse(parsed);
        if (validated.success) {
          setContact(validated.data.contact);
          setStudents(
            validated.data.students.map((student) => ({
              ...student,
              id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `student-${Date.now()}`,
            }))
          );
          setAvailability(validated.data.availability);
        }
      } catch {
        window.localStorage.removeItem(DRAFT_KEY);
      }
    }
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated || submitted || authState) return;
    const timeout = window.setTimeout(() => {
      const payload: OnboardingRequestInput = { contact, students, availability };
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [availability, contact, hydrated, students, submitted]);

  React.useEffect(() => {
    if (step !== steps.length - 1 || pending) return;
    identifierInputRef.current?.focus();
  }, [pending, step]);

  React.useEffect(() => {
    if (!pending) return;
    const firstInput = otpRefs.current[0];
    firstInput?.focus();
    if (pending.startedAt) {
      const elapsed = Math.floor((Date.now() - pending.startedAt) / 1000);
      setResendCountdown(Math.max(0, RESEND_SECONDS - elapsed));
    }
  }, [pending]);

  React.useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCountdown]);

  const validateContact = () => {
    const result = onboardingContactSchema.safeParse(contact);
    if (result.success) {
      setErrors((prev) => ({ ...prev, contact: {} }));
      return true;
    }
    const fieldErrors: FieldErrors = {};
    result.error.issues.forEach((issue) => {
      const key = issue.path.join(".");
      fieldErrors[key] = issue.message;
    });
    setErrors((prev) => ({ ...prev, contact: fieldErrors }));
    return false;
  };

  const validateStudents = () => {
    const studentErrors: StudentErrors = {};
    let hasError = false;

    if (students.length === 0) {
      setErrors((prev) => ({
        ...prev,
        students: { general: { message: "Add at least one student." } as FieldErrors },
      }));
      return false;
    }

    students.forEach((student) => {
      const result = onboardingStudentSchema.safeParse(student);
      if (!result.success) {
        hasError = true;
        const fieldErrors: FieldErrors = {};
        result.error.issues.forEach((issue) => {
          const key = issue.path.join(".");
          fieldErrors[key] = issue.message;
        });
        studentErrors[student.id] = fieldErrors;
      }
    });

    setErrors((prev) => ({ ...prev, students: studentErrors }));
    return !hasError;
  };

  const validateAvailability = () => {
    const result = onboardingAvailabilitySchema.safeParse(availability);
    if (result.success) {
      setErrors((prev) => ({ ...prev, availability: {} }));
      return true;
    }
    const fieldErrors: FieldErrors = {};
    result.error.issues.forEach((issue) => {
      const key = issue.path.join(".");
      fieldErrors[key] = issue.message;
    });
    setErrors((prev) => ({ ...prev, availability: fieldErrors }));
    return false;
  };

  const validateStep = () => {
    if (step === 0) return validateContact();
    if (step === 1) return validateStudents();
    if (step === 2) return validateAvailability();
    return true;
  };

  const persistAuthState = (next: OnboardingAuthState | null) => {
    setAuthState(next);
    if (next) {
      window.localStorage.setItem(ONBOARDING_AUTH_KEY, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(ONBOARDING_AUTH_KEY);
    }
  };

  const updateDigit = (index: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleOtpChange = (index: number) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.replace(/\D/g, "");
    if (!value) {
      updateDigit(index, "");
      setAuthError(null);
      return;
    }

    const digit = value.slice(-1);
    updateDigit(index, digit);
    setAuthError(null);

    if (index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!text) return;
    event.preventDefault();
    setAuthError(null);

    const nextDigits = Array(OTP_LENGTH)
      .fill("")
      .map((_, idx) => text[idx] ?? "");

    setDigits(nextDigits);

    const lastIndex = Math.min(text.length, OTP_LENGTH) - 1;
    if (lastIndex >= 0) {
      otpRefs.current[lastIndex]?.focus();
    }
  };

  const handleStartAuth = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (authLoading || isVerifying) return;

    const trimmed = identifier.trim();
    if (!trimmed) {
      setAuthError("Enter your email or mobile number.");
      return;
    }

    const type: IdentifierType = detectIdentifierType(trimmed);
    const normalized = normalizeIdentifier(trimmed, type);

    if (type === "phone" && !isValidE164(normalized)) {
      setAuthError("Use +61 412 345 678 or 0412 345 678.");
      return;
    }

    if (!authState) {
      setAuthError("Unable to start verification. Please try again.");
      return;
    }

    setAuthLoading(true);
    setAuthError(null);

    try {
      const update = await updateOnboardingContact({
        requestId: authState.requestId,
        familyId: authState.familyId,
        identifier: normalized,
        type,
      });

      if (!update.ok) {
        setAuthError(update.error ?? "Unable to update contact details.");
        setAuthLoading(false);
        return;
      }

      const startRes = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: normalized, type }),
      });
      const start = await startRes.json().catch(() => null);

      if (!start?.ok) {
        setAuthError(start?.error ?? "Unable to start verification.");
        setAuthLoading(false);
        return;
      }

      if (!signInLoaded || !signUpLoaded || !signIn || !signUp) {
        setAuthError("Auth is still loading. Please try again.");
        setAuthLoading(false);
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

      const startedAt = Date.now();
      const masked = maskIdentifier(normalized, type);
      const nextPending: PendingAuth = {
        identifier: normalized,
        type,
        flow: start.flow,
        masked,
        startedAt,
      };

      setPending(nextPending);
      setDigits(Array(OTP_LENGTH).fill(""));
      setResendCountdown(RESEND_SECONDS);
      setIsResending(false);

      persistAuthState({
        ...authState,
        identifier: normalized,
        type,
        flow: start.flow,
        masked,
        startedAt,
        email: type === "email" ? normalized : authState.email,
        phone: type === "phone" ? normalized : authState.phone,
      });
    } catch (caught) {
      setAuthError("Something went wrong. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const code = digits.join("");

  const handleVerify = React.useCallback(async () => {
    if (!pending) return;
    if (isVerifying) return;

    if (code.length !== OTP_LENGTH) {
      setAuthError("Enter the 6-digit code.");
      return;
    }

    setIsVerifying(true);
    setAuthError(null);

    try {
      if (pending.flow === "signIn") {
        if (!signInLoaded || !signIn) throw new Error("Sign-in not ready");
        const result = await signIn.attemptFirstFactor({
          strategy: pending.type === "email" ? "email_code" : "phone_code",
          code,
        });
        if (result.status !== "complete") {
          setAuthError("That code didn't work. Try again.");
          setIsVerifying(false);
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
          setAuthError("That code didn't work. Try again.");
          setIsVerifying(false);
          return;
        }
        await setActiveSignUp({ session: result.createdSessionId });
      }

      const mapRes = await fetch("/api/auth/complete", { method: "POST" });
      const map = await mapRes.json().catch(() => null);
      if (!map?.ok) {
        await signOut();
        setAuthError("Please contact Caribeae.");
        return;
      }

      const requestId = authState?.requestId ?? "submitted";
      window.localStorage.setItem(SUBMITTED_KEY, requestId);
      window.localStorage.removeItem(DRAFT_KEY);
      persistAuthState(null);
      setPending(null);
      router.replace("/portal");
    } catch (caught) {
      setAuthError("We couldn't verify that code. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  }, [
    authState?.requestId,
    code,
    isVerifying,
    pending,
    persistAuthState,
    router,
    setActiveSignIn,
    setActiveSignUp,
    signIn,
    signInLoaded,
    signOut,
    signUp,
    signUpLoaded,
  ]);

  React.useEffect(() => {
    if (pending && code.length === OTP_LENGTH && !isVerifying) {
      handleVerify();
    }
  }, [code, handleVerify, isVerifying, pending]);

  const handleOtpKeyDown = (index: number) => (event: React.KeyboardEvent<HTMLInputElement>) => {
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
        otpRefs.current[index - 1]?.focus();
      }
    }
  };

  const handleResend = async () => {
    if (!pending || isResending || resendCountdown > 0 || isVerifying) return;
    setIsResending(true);
    setAuthError(null);

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
      const startedAt = Date.now();
      setResendCountdown(RESEND_SECONDS);
      setPending((current) => (current ? { ...current, startedAt } : current));
      if (authState) {
        persistAuthState({ ...authState, startedAt });
      }
    } catch (caught) {
      setAuthError("Unable to resend the code. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    if (!validateContact() || !validateStudents() || !validateAvailability()) {
      toast.error("Please fix the highlighted fields.");
      return;
    }

    setSubmitting(true);
    const payload: OnboardingRequestInput = {
      contact,
      students: students.map(({ id, ...rest }) => rest),
      availability,
    };

    try {
      const result = await submitOnboardingRequest({ ...payload, honeypot });
      if (!result.ok) {
        toast.error(result.error ?? "Unable to submit.");
        return;
      }
      if (!result.familyId || !result.id) {
        toast.error("Unable to start verification. Please contact Caribeae.");
        return;
      }
      const nextAuth: OnboardingAuthState = {
        requestId: result.id,
        familyId: result.familyId,
        email: contact.email.trim(),
        phone: contact.phone.trim(),
      };
      persistAuthState(nextAuth);
      setIdentifier(contact.email.trim());
      setPending(null);
      setAuthError(null);
      setStep(steps.length - 1);
      window.localStorage.removeItem(DRAFT_KEY);
      toast.success("Request submitted. Verify to access your portal.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStudent = (id: string, updates: Partial<StudentState>) => {
    setStudents((prev) => prev.map((student) => (student.id === id ? { ...student, ...updates } : student)));
  };

  const authHelperText =
    detectedType === "phone" && identifier.trim().length > 0
      ? "Email or mobile number. Use +61 412 345 678 or 0412 345 678."
      : "Email or mobile number.";

  const maskedDestination =
    pending && pending.identifier ? pending.masked || maskIdentifier(pending.identifier, pending.type) : "";

  const isFinalStep = step === steps.length - 1;
  const isReviewStep = step === steps.length - 2;

  if (submitted) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">You&apos;re all set</CardTitle>
            <CardDescription>We received your onboarding request.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>Thanks for sharing your family&apos;s details. Our team will review availability and reach out shortly.</p>
            <p>If anything changes, just reply to our email or give us a call.</p>
            <Button className="w-full" onClick={() => router.push("/portal")}>
              Go to portal
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Swim school onboarding</p>
          <h1 className="text-2xl font-semibold">Let&apos;s get your swimmers started</h1>
          <p className="text-sm text-muted-foreground">
            Four quick steps, built for mobile. We&apos;ll save your progress automatically.
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Step {step + 1} of {steps.length}
            </span>
            <span>{steps[step]?.title}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="grid grid-cols-5 gap-2 text-xs text-muted-foreground">
            {steps.map((item, index) => (
              <span
                key={item.title}
                className={cn(index === step ? "text-foreground" : "text-muted-foreground")}
              >
                {item.title}
              </span>
            ))}
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{steps[step]?.title}</CardTitle>
          <CardDescription>{steps[step]?.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 0 ? (
            <div className="space-y-4">
              <div className="grid gap-3">
                <Label htmlFor="guardianName">Primary guardian name</Label>
                <Input
                  id="guardianName"
                  value={contact.guardianName}
                  autoComplete="name"
                  onChange={(event) =>
                    setContact((prev) => ({ ...prev, guardianName: event.target.value }))
                  }
                />
                {errors.contact?.guardianName ? (
                  <p className="text-xs text-destructive">{errors.contact.guardianName}</p>
                ) : null}
              </div>
              <div className="grid gap-3">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={contact.phone}
                  autoComplete="tel"
                  onChange={(event) => setContact((prev) => ({ ...prev, phone: event.target.value }))}
                />
                {errors.contact?.phone ? (
                  <p className="text-xs text-destructive">{errors.contact.phone}</p>
                ) : null}
              </div>
              <div className="grid gap-3">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={contact.email}
                  autoComplete="email"
                  onChange={(event) => setContact((prev) => ({ ...prev, email: event.target.value }))}
                />
                {errors.contact?.email ? (
                  <p className="text-xs text-destructive">{errors.contact.email}</p>
                ) : null}
              </div>
              <div className="grid gap-3">
                <Label htmlFor="emergencyContactName">Emergency contact (optional)</Label>
                <Input
                  id="emergencyContactName"
                  value={contact.emergencyContactName ?? "none"}
                  onChange={(event) =>
                    setContact((prev) => ({ ...prev, emergencyContactName: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-3">
                <Label htmlFor="emergencyContactPhone">Emergency contact phone (optional)</Label>
                <Input
                  id="emergencyContactPhone"
                  type="tel"
                  value={contact.emergencyContactPhone ?? "none"}
                  onChange={(event) =>
                    setContact((prev) => ({ ...prev, emergencyContactPhone: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-3">
                <Label htmlFor="address">Address (optional)</Label>
                <Textarea
                  id="address"
                  rows={3}
                  value={contact.address ?? "none"}
                  autoComplete="street-address"
                  onChange={(event) => setContact((prev) => ({ ...prev, address: event.target.value }))}
                />
              </div>
              <div className="hidden">
                <Label htmlFor="company">Company</Label>
                <Input id="company" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              {students.map((student, index) => {
                const studentErrors = errors.students?.[student.id] ?? {};
                return (
                  <Card key={student.id} className="border-dashed">
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-base">Student {index + 1}</CardTitle>
                        <CardDescription>Tell us about this swimmer.</CardDescription>
                      </div>
                      {students.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setStudents((prev) => prev.filter((s) => s.id !== student.id))}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor={`firstName-${student.id}`}>First name</Label>
                          <Input
                            id={`firstName-${student.id}`}
                            value={student.firstName}
                            autoComplete="given-name"
                            onChange={(event) => updateStudent(student.id, { firstName: event.target.value })}
                          />
                          {studentErrors.firstName ? (
                            <p className="text-xs text-destructive">{studentErrors.firstName}</p>
                          ) : null}
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor={`lastName-${student.id}`}>Last name</Label>
                          <Input
                            id={`lastName-${student.id}`}
                            value={student.lastName}
                            autoComplete="family-name"
                            onChange={(event) => updateStudent(student.id, { lastName: event.target.value })}
                          />
                          {studentErrors.lastName ? (
                            <p className="text-xs text-destructive">{studentErrors.lastName}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor={`dob-${student.id}`}>Date of birth</Label>
                          <Input
                            id={`dob-${student.id}`}
                            type="date"
                            value={student.dateOfBirth ?? "none"}
                            onChange={(event) => updateStudent(student.id, { dateOfBirth: event.target.value })}
                          />
                          {studentErrors.dateOfBirth ? (
                            <p className="text-xs text-destructive">{studentErrors.dateOfBirth}</p>
                          ) : null}
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor={`experience-${student.id}`}>Current level</Label>
                          <Select
                            value={student.experience}
                            onValueChange={(value) => {
                              if (isStudentExperience(value)) {
                                updateStudent(student.id, { experience: value });
                              }
                            }}
                          >
                            <SelectTrigger id={`experience-${student.id}`}>
                              <SelectValue placeholder="Select level" />
                            </SelectTrigger>
                            <SelectContent>
                              {studentExperienceOptions.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor={`notes-${student.id}`}>Notes (optional)</Label>
                        <Textarea
                          id={`notes-${student.id}`}
                          rows={3}
                          value={student.notes ?? "none"}
                          onChange={(event) => updateStudent(student.id, { notes: event.target.value })}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              <Button type="button" variant="outline" onClick={() => setStudents((prev) => [...prev, createStudent()])}>
                Add another student
              </Button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label>Preferred days</Label>
                <div className="flex flex-wrap gap-2">
                  {availabilityDayOptions.map((day) => {
                    const active = availability.preferredDays.includes(day);
                    return (
                      <Button
                        key={day}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        onClick={() =>
                          setAvailability((prev) => ({
                            ...prev,
                            preferredDays: active
                              ? prev.preferredDays.filter((value) => value !== day)
                              : [...prev.preferredDays, day],
                          }))
                        }
                        className="rounded-full"
                        aria-pressed={active}
                      >
                        {day}
                      </Button>
                    );
                  })}
                </div>
                {errors.availability?.preferredDays ? (
                  <p className="text-xs text-destructive">{errors.availability.preferredDays}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label>Preferred time windows</Label>
                <div className="flex flex-wrap gap-2">
                  {availabilityWindowOptions.map((window) => {
                    const active = availability.preferredWindows.includes(window);
                    return (
                      <Button
                        key={window}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        onClick={() =>
                          setAvailability((prev) => ({
                            ...prev,
                            preferredWindows: active
                              ? prev.preferredWindows.filter((value) => value !== window)
                              : [...prev.preferredWindows, window],
                          }))
                        }
                        className="rounded-full"
                        aria-pressed={active}
                      >
                        {window}
                      </Button>
                    );
                  })}
                </div>
                {errors.availability?.preferredWindows ? (
                  <p className="text-xs text-destructive">{errors.availability.preferredWindows}</p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label>Desired level (optional)</Label>
                <Select
                  value={availability.desiredLevelId ?? "none"}
                  onValueChange={(value) =>
                    setAvailability((prev) => ({ ...prev, desiredLevelId: value || null }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No preference</SelectItem>
                    {levels.map((level) => (
                      <SelectItem key={level.id} value={level.id}>
                        {level.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="availability-notes">Constraints or notes (optional)</Label>
                <Textarea
                  id="availability-notes"
                  rows={3}
                  value={availability.notes ?? "none"}
                  onChange={(event) => setAvailability((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5 text-sm">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="font-medium">{contact.guardianName}</p>
                  <p>{contact.phone}</p>
                  <p>{contact.email}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Students</p>
                <div className="space-y-2">
                  {students.map((student) => (
                    <div key={student.id} className="rounded-md border bg-muted/40 p-3">
                      <p className="font-medium">
                        {student.firstName} {student.lastName}
                      </p>
                      <p className="text-muted-foreground">
                        {student.dateOfBirth ? `DOB ${student.dateOfBirth}` : "DOB not provided"} · {student.experience}
                      </p>
                      {student.notes ? <p className="text-muted-foreground">{student.notes}</p> : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Availability</p>
                <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                  <p>Days: {formatList(availability.preferredDays)}</p>
                  <p>Times: {formatList(availability.preferredWindows)}</p>
                  <p>
                    Desired level:{" "}
                    {availability.desiredLevelId
                      ? levels.find((level) => level.id === availability.desiredLevelId)?.name ?? "—"
                      : "No preference"}
                  </p>
                  {availability.notes ? <p className="text-muted-foreground">{availability.notes}</p> : null}
                </div>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-6">
              <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                Verify your email or mobile number to access your family portal right away.
              </div>

              {!authState ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Submit your onboarding details to continue.
                </div>
              ) : pending ? (
                <div className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    We sent a 6-digit code to{" "}
                    <span className="font-medium text-foreground">{maskedDestination}</span>.
                  </p>

                  <div className="space-y-3" onPaste={handleOtpPaste}>
                    <div className="flex justify-between gap-2">
                      {digits.map((digit, index) => (
                        <input
                          key={`otp-${index}`}
                          ref={(el) => {
                            otpRefs.current[index] = el;
                          }}
                          value={digit}
                          onChange={handleOtpChange(index)}
                          onKeyDown={handleOtpKeyDown(index)}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="one-time-code"
                          className="h-12 w-12 rounded-xl border border-input text-center text-lg font-semibold shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                          maxLength={1}
                          disabled={isVerifying}
                          aria-label={`Digit ${index + 1}`}
                          aria-invalid={Boolean(authError)}
                        />
                      ))}
                    </div>
                    <div
                      className="min-h-[20px] text-xs text-destructive transition-opacity"
                      aria-live="polite"
                    >
                      {authError ? authError : null}
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleVerify}
                    disabled={isVerifying}
                    aria-busy={isVerifying}
                  >
                    {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    <span>{isVerifying ? "Verifying" : "Verify"}</span>
                  </Button>

                  <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resendCountdown > 0 || isResending || isVerifying}
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
                        setPending(null);
                        setDigits(Array(OTP_LENGTH).fill(""));
                        setAuthError(null);
                        setResendCountdown(RESEND_SECONDS);
                        if (authState) {
                          persistAuthState({
                            ...authState,
                            identifier: undefined,
                            type: undefined,
                            flow: undefined,
                            masked: undefined,
                            startedAt: undefined,
                          });
                        }
                      }}
                      disabled={isVerifying}
                      className="text-sm text-muted-foreground underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Change email or phone
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleStartAuth} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="verify-identifier">Email or mobile number</Label>
                    <Input
                      id="verify-identifier"
                      name="verify-identifier"
                      ref={identifierInputRef}
                      value={identifier}
                      onChange={(event) => {
                        setIdentifier(event.target.value);
                        if (authError) setAuthError(null);
                      }}
                      type={detectedType === "email" ? "email" : "tel"}
                      inputMode={detectedType === "email" ? "email" : "tel"}
                      autoComplete={detectedType === "email" ? "email" : "tel"}
                      autoCorrect="off"
                      autoCapitalize="none"
                      enterKeyHint="send"
                      placeholder="name@example.com or 0412 345 678"
                      disabled={authLoading}
                      aria-invalid={Boolean(authError)}
                    />
                    <p className="text-xs text-muted-foreground">{authHelperText}</p>
                    <div
                      className="min-h-[20px] text-xs text-destructive transition-opacity"
                      aria-live="polite"
                    >
                      {authError ? authError : null}
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={authLoading}
                    aria-busy={authLoading}
                  >
                    {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    <span>{authLoading ? "Sending code" : "Send code"}</span>
                  </Button>
                </form>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/90 px-4 py-4 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" onClick={handleBack} disabled={step === 0 || isFinalStep}>
            Back
          </Button>
          {!isFinalStep ? (
            isReviewStep ? (
              <Button type="button" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit request"}
              </Button>
            ) : (
              <Button type="button" onClick={handleNext}>
                Continue
              </Button>
            )
          ) : (
            <div className="h-10 w-24" aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
}
