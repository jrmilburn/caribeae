"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import { z } from "zod";

import { AuthShell, InlineErrorSlot, LoadingButton, OtpInput } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isValidE164, maskIdentifier, normalizeIdentifier, type IdentifierType } from "@/lib/auth/identity";
import {
  availabilityDayOptions,
  availabilityWindowOptions,
  onboardingContactSchema,
  onboardingRequestSchema,
  onboardingStudentSchema,
  studentExperienceOptions,
  type OnboardingAvailabilityInput,
  type OnboardingRequestInput,
  type OnboardingStudentInput,
} from "@/lib/onboarding/schema";
import { submitOnboardingRequest } from "@/server/onboarding/submitOnboardingRequest";

const DRAFT_KEY = "caribeae:onboarding:draft";
const SUBMITTED_KEY = "caribeae:onboarding:submitted";
const ONBOARDING_AUTH_KEY = "caribeae:onboarding:auth";

const steps = [
  { key: "primary", title: "Primary guardian", description: "Primary contact" },
  { key: "secondary", title: "Secondary guardian", description: "Optional backup" },
  { key: "emergency", title: "Emergency contact", description: "Optional emergency" },
  { key: "students", title: "Students", description: "Swimmer details" },
  { key: "days", title: "Preferred days", description: "Pick days" },
  { key: "times", title: "Preferred times", description: "Pick time windows" },
  { key: "review", title: "Confirm & access portal", description: "Review and send code" },
  { key: "verify", title: "Verify code", description: "Enter your code" },
];

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

/*
Manual test checklist:
- Primary guardian email -> auto code -> verify -> redirected to /portal.
- Primary phone only -> auto SMS -> verify -> redirected to /portal.
- Secondary guardian fallback -> auto code -> verify -> redirected to /portal.
- No guardian email/phone -> shows contact message, no auth attempt.
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

type IdentifierSource = "primaryEmail" | "primaryPhone" | "secondaryEmail" | "secondaryPhone";

type OnboardingAuthState = {
  requestId: string;
  familyId: string;
  identifier?: string;
  type?: IdentifierType;
  flow?: "signIn" | "signUp";
  masked?: string;
  startedAt?: number;
  source?: IdentifierSource;
};

const defaultContact: ContactState = {
  guardianName: "",
  email: "",
  phone: "",
  secondaryContactName: "",
  secondaryEmail: "",
  secondaryPhone: "",
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
  const [activeStudentIndex, setActiveStudentIndex] = React.useState(0);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<PendingAuth | null>(null);
  const [digits, setDigits] = React.useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [resendCountdown, setResendCountdown] = React.useState(RESEND_SECONDS);
  const [isResending, setIsResending] = React.useState(false);
  const [isStartingOtp, setIsStartingOtp] = React.useState(false);
  const [verificationBlocked, setVerificationBlocked] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const progressPercent = Math.round(((step + 1) / steps.length) * 100);
  const stepMeta = steps[step] ?? steps[0];

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
  }, [availability, authState, contact, hydrated, students, submitted]);

  React.useEffect(() => {
    if (!pending) return;
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
    const fieldErrors: FieldErrors = {};

    if (!result.success) {
      result.error.issues.forEach((issue) => {
        const key = issue.path.join(".");
        fieldErrors[key] = issue.message;
      });
    }

    const primaryPhone = contact.phone?.trim();
    if (primaryPhone && !fieldErrors.phone) {
      const normalized = normalizeIdentifier(primaryPhone, "phone");
      if (!isValidE164(normalized)) {
        fieldErrors.phone = "Use +61 412 345 678 or 0412 345 678.";
      }
    }

    const secondaryPhone = contact.secondaryPhone?.trim();
    if (secondaryPhone && !fieldErrors.secondaryPhone) {
      const normalized = normalizeIdentifier(secondaryPhone, "phone");
      if (!isValidE164(normalized)) {
        fieldErrors.secondaryPhone = "Use +61 412 345 678 or 0412 345 678.";
      }
    }

    setErrors((prev) => ({ ...prev, contact: fieldErrors }));
    return Object.keys(fieldErrors).length === 0;
  };

  const validateStudentAt = (index: number) => {
    if (students.length === 0) {
      setErrors((prev) => ({
        ...prev,
        students: { general: { message: "Add at least one student." } as FieldErrors },
      }));
      return false;
    }

    const student = students[index];
    if (!student) return false;

    const result = onboardingStudentSchema.safeParse(student);
    if (result.success) {
      setErrors((prev) => ({
        ...prev,
        students: { ...prev.students, [student.id]: {} },
      }));
      return true;
    }

    const fieldErrors: FieldErrors = {};
    result.error.issues.forEach((issue) => {
      const key = issue.path.join(".");
      fieldErrors[key] = issue.message;
    });

    setErrors((prev) => ({
      ...prev,
      students: { ...prev.students, [student.id]: fieldErrors },
    }));

    return false;
  };

  const validateAllStudents = () => {
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

  const validatePreferredDays = () => {
    if (availability.preferredDays.length > 0) {
      setErrors((prev) => ({ ...prev, availability: { ...prev.availability, preferredDays: undefined } }));
      return true;
    }
    setErrors((prev) => ({
      ...prev,
      availability: { ...prev.availability, preferredDays: "Select at least one day." },
    }));
    return false;
  };

  const validatePreferredWindows = () => {
    if (availability.preferredWindows.length > 0) {
      setErrors((prev) => ({ ...prev, availability: { ...prev.availability, preferredWindows: undefined } }));
      return true;
    }
    setErrors((prev) => ({
      ...prev,
      availability: { ...prev.availability, preferredWindows: "Select at least one time window." },
    }));
    return false;
  };

  const studentStepIndex = steps.findIndex((item) => item.key === "students");
  const daysStepIndex = steps.findIndex((item) => item.key === "days");
  const timesStepIndex = steps.findIndex((item) => item.key === "times");
  const reviewStepIndex = steps.findIndex((item) => item.key === "review");
  const verifyStepIndex = steps.findIndex((item) => item.key === "verify");

  const validateStep = () => {
    if (step <= 2) return validateContact();
    if (step === studentStepIndex) return validateStudentAt(activeStudentIndex);
    if (step === daysStepIndex) return validatePreferredDays();
    if (step === timesStepIndex) return validatePreferredWindows();
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

  const selectIdentifier = React.useCallback((): { value: string; type: IdentifierType; source: IdentifierSource } | null => {
    const primaryEmail = contact.email?.trim();
    if (primaryEmail) {
      return { value: primaryEmail, type: "email", source: "primaryEmail" };
    }
    const primaryPhone = contact.phone?.trim();
    if (primaryPhone) {
      return { value: primaryPhone, type: "phone", source: "primaryPhone" };
    }
    const secondaryEmail = contact.secondaryEmail?.trim();
    if (secondaryEmail) {
      return { value: secondaryEmail, type: "email", source: "secondaryEmail" };
    }
    const secondaryPhone = contact.secondaryPhone?.trim();
    if (secondaryPhone) {
      return { value: secondaryPhone, type: "phone", source: "secondaryPhone" };
    }
    return null;
  }, [contact.email, contact.phone, contact.secondaryEmail, contact.secondaryPhone]);

  const startOtpFlow = React.useCallback(
    async (
      selection: { value: string; type: IdentifierType; source: IdentifierSource },
      baseAuth?: OnboardingAuthState
    ) => {
      const currentAuth = baseAuth ?? authState;
      if (!currentAuth) {
        setAuthError("Unable to start verification. Please try again.");
        return;
      }

      const normalized = normalizeIdentifier(selection.value, selection.type);
      if (selection.type === "phone" && !isValidE164(normalized)) {
        setAuthError("Use +61 412 345 678 or 0412 345 678.");
        return;
      }

      setIsStartingOtp(true);
      setAuthError(null);
      setVerificationBlocked(false);

      try {
        const startRes = await fetch("/api/auth/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: normalized, type: selection.type }),
        });
        const start = await startRes.json().catch(() => null);

        if (!start?.ok) {
          setAuthError(start?.error ?? "Unable to start verification.");
          return;
        }

        if (!signInLoaded || !signUpLoaded || !signIn || !signUp) {
          setAuthError("Auth is still loading. Please try again.");
          return;
        }

        if (start.flow === "signIn") {
          const signInAttempt = await signIn.create({ identifier: normalized });
          const factors = signInAttempt.supportedFirstFactors ?? [];

          if (selection.type === "email") {
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
          if (selection.type === "email") {
            const signUpAttempt = await signUp.create({ emailAddress: normalized });
            await signUpAttempt.prepareEmailAddressVerification({ strategy: "email_code" });
          } else {
            const signUpAttempt = await signUp.create({ phoneNumber: normalized });
            await signUpAttempt.preparePhoneNumberVerification({ strategy: "phone_code" });
          }
        }

        const startedAt = Date.now();
        const masked = maskIdentifier(normalized, selection.type);
        const nextPending: PendingAuth = {
          identifier: normalized,
          type: selection.type,
          flow: start.flow,
          masked,
          startedAt,
        };

        setPending(nextPending);
        setDigits(Array(OTP_LENGTH).fill(""));
        setResendCountdown(RESEND_SECONDS);
        setIsResending(false);

        persistAuthState({
          ...currentAuth,
          identifier: normalized,
          type: selection.type,
          flow: start.flow,
          masked,
          startedAt,
          source: selection.source,
        });
      } catch (caught) {
        setAuthError("Something went wrong. Please try again.");
      } finally {
        setIsStartingOtp(false);
      }
    },
    [authState, persistAuthState, signIn, signInLoaded, signUp, signUpLoaded]
  );

  React.useEffect(() => {
    if (step !== verifyStepIndex) return;
    if (pending || isStartingOtp || verificationBlocked) return;
    if (!authState?.identifier || !authState.type || !authState.source) return;
    startOtpFlow({ value: authState.identifier, type: authState.type, source: authState.source });
  }, [authState, isStartingOtp, pending, startOtpFlow, step, verificationBlocked, verifyStepIndex]);

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
        setPending(null);
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
    if (step === studentStepIndex && activeStudentIndex < students.length - 1) {
      setActiveStudentIndex((prev) => Math.min(prev + 1, students.length - 1));
      return;
    }
    setStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    if (step === studentStepIndex && activeStudentIndex > 0) {
      setActiveStudentIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const handleFinish = async () => {
    setSubmitError(null);

    const contactOk = validateContact();
    const studentsOk = validateAllStudents();
    const daysOk = validatePreferredDays();
    const timesOk = validatePreferredWindows();

    if (!contactOk || !studentsOk || !daysOk || !timesOk) {
      setSubmitError("Please review the highlighted fields.");
      return;
    }

    setSubmitting(true);
    const payload: OnboardingRequestInput = {
      contact,
      students: students.map(({ id, ...rest }) => rest),
      availability,
    };

    try {
      const result = await submitOnboardingRequest({
        ...payload,
        honeypot,
        requestId: authState?.requestId ?? undefined,
        familyId: authState?.familyId ?? undefined,
      });
      if (!result.ok) {
        setSubmitError(result.error ?? "Unable to submit.");
        return;
      }
      if (!result.familyId || !result.id) {
        setSubmitError("Please contact Caribeae to finish setup.");
        return;
      }

      const selection = selectIdentifier();
      const nextAuth: OnboardingAuthState = { requestId: result.id, familyId: result.familyId };
      persistAuthState(nextAuth);

      if (!selection) {
        setVerificationBlocked(true);
        setStep(verifyStepIndex);
        return;
      }

      setPending(null);
      setAuthError(null);
      setVerificationBlocked(false);
      setStep(verifyStepIndex);
      window.localStorage.removeItem(DRAFT_KEY);
      await startOtpFlow(selection, nextAuth);
    } catch (caught) {
      setSubmitError("Unable to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStudent = (id: string, updates: Partial<StudentState>) => {
    setStudents((prev) => prev.map((student) => (student.id === id ? { ...student, ...updates } : student)));
  };

  const addStudent = () => {
    setStudents((prev) => {
      const next = [...prev, createStudent()];
      setActiveStudentIndex(next.length - 1);
      return next;
    });
  };

  const removeCurrentStudent = () => {
    if (students.length <= 1) return;
    setStudents((prev) => {
      const next = prev.filter((student) => student.id !== currentStudent.id);
      const nextIndex = Math.max(0, Math.min(activeStudentIndex, next.length - 1));
      setActiveStudentIndex(nextIndex);
      return next;
    });
  };

  const currentStudent = students[activeStudentIndex] ?? students[0]!;
  const currentStudentErrors = errors.students?.[currentStudent.id] ?? {};
  const studentGeneralError = (errors.students?.general as FieldErrors | undefined)?.message;

  const maskedDestination =
    pending?.masked ||
    (authState?.identifier && authState?.type ? maskIdentifier(authState.identifier, authState.type) : "");

  const isReviewStep = step === reviewStepIndex;
  const isVerifyStep = step === verifyStepIndex;

  const canChangeIdentifier = Boolean(
    contact.email?.trim() ||
      contact.phone?.trim() ||
      contact.secondaryEmail?.trim() ||
      contact.secondaryPhone?.trim()
  );

  const resolveContactStepForSource = (source?: IdentifierSource) => {
    if (source === "secondaryEmail" || source === "secondaryPhone") {
      return steps.findIndex((item) => item.key === "secondary");
    }
    return steps.findIndex((item) => item.key === "primary");
  };

  const handleChangeIdentifier = (source?: IdentifierSource) => {
    setPending(null);
    setDigits(Array(OTP_LENGTH).fill(""));
    setAuthError(null);
    setVerificationBlocked(false);
    setResendCountdown(RESEND_SECONDS);
    if (authState) {
      persistAuthState({ requestId: authState.requestId, familyId: authState.familyId });
    }
    setStep(resolveContactStepForSource(source));
  };

  if (submitted) {
    return (
      <AuthShell>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Onboarding received
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">You&apos;re all set</h1>
            <p className="text-sm text-muted-foreground">
              We&apos;ve received your details. We&apos;ll reach out shortly with next steps.
            </p>
          </div>
          <Button className="w-full" onClick={() => router.push("/portal")}>Go to portal</Button>
        </div>
      </AuthShell>
    );
  }

  const selection = selectIdentifier();
  const maskedSelection = selection ? maskIdentifier(selection.value, selection.type) : "";
  const finishLabel = selection ? "Confirm & send code" : "Submit request";

  const isBusy = submitting || isStartingOtp || isVerifying;
  const verificationIsBlocked =
    verificationBlocked || (!!authState && !pending && !selection && isVerifyStep);
  const primaryAction = isVerifyStep ? (
    <LoadingButton
      type="button"
      isLoading={isVerifying}
      loadingText="Verifying"
      disabled={!pending || verificationIsBlocked || isStartingOtp}
      onClick={handleVerify}
    >
      Verify
    </LoadingButton>
  ) : isReviewStep ? (
    <LoadingButton type="button" isLoading={submitting} loadingText="Submitting" onClick={handleFinish}>
      {finishLabel}
    </LoadingButton>
  ) : (
    <Button type="button" className="h-11 w-full" onClick={handleNext} disabled={isBusy}>
      Continue
    </Button>
  );

  const header = (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">Onboarding</p>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Step {step + 1} of {steps.length}
        </span>
        <span>{stepMeta.title}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-slate-900/80 transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );

  const footer = (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-full"
          onClick={handleBack}
          disabled={step === 0 || isBusy}
        >
          Back
        </Button>
        {primaryAction}
      </div>
      <p className="text-xs text-muted-foreground">
        Need help?{" "}
        <a className="text-slate-900 underline-offset-4 hover:underline" href="mailto:rachele@caribeae.com.au">
          rachele@caribeae.com.au
        </a>
      </p>
    </div>
  );

  const renderStep = () => {
    switch (stepMeta.key) {
      case "primary":
        return (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="guardianName">Primary guardian name</Label>
              <Input
                id="guardianName"
                value={contact.guardianName}
                autoComplete="name"
                onChange={(event) =>
                  setContact((prev) => ({ ...prev, guardianName: event.target.value }))
                }
              />
              <InlineErrorSlot message={errors.contact?.guardianName} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="email">Email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={contact.email ?? ""}
                  autoComplete="email"
                  onChange={(event) => setContact((prev) => ({ ...prev, email: event.target.value }))}
                />
                <InlineErrorSlot message={errors.contact?.email} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Mobile number (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={contact.phone ?? ""}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="0412 345 678"
                  onChange={(event) => setContact((prev) => ({ ...prev, phone: event.target.value }))}
                />
                <InlineErrorSlot message={errors.contact?.phone} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Add at least one email or mobile number to access the portal.
            </p>
            <div className="hidden">
              <Label htmlFor="company">Company</Label>
              <Input id="company" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
            </div>
          </div>
        );

      case "secondary":
        return (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="secondaryContactName">Secondary guardian name (optional)</Label>
              <Input
                id="secondaryContactName"
                value={contact.secondaryContactName ?? ""}
                autoComplete="name"
                onChange={(event) =>
                  setContact((prev) => ({ ...prev, secondaryContactName: event.target.value }))
                }
              />
              <InlineErrorSlot message={errors.contact?.secondaryContactName} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="secondaryEmail">Secondary email (optional)</Label>
                <Input
                  id="secondaryEmail"
                  type="email"
                  value={contact.secondaryEmail ?? ""}
                  autoComplete="email"
                  onChange={(event) =>
                    setContact((prev) => ({ ...prev, secondaryEmail: event.target.value }))
                  }
                />
                <InlineErrorSlot message={errors.contact?.secondaryEmail} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="secondaryPhone">Secondary mobile (optional)</Label>
                <Input
                  id="secondaryPhone"
                  type="tel"
                  value={contact.secondaryPhone ?? ""}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="0412 345 678"
                  onChange={(event) =>
                    setContact((prev) => ({ ...prev, secondaryPhone: event.target.value }))
                  }
                />
                <InlineErrorSlot message={errors.contact?.secondaryPhone} />
              </div>
            </div>
          </div>
        );

      case "emergency":
        return (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="emergencyContactName">Emergency contact name (optional)</Label>
                <Input
                  id="emergencyContactName"
                  value={contact.emergencyContactName ?? ""}
                  onChange={(event) =>
                    setContact((prev) => ({ ...prev, emergencyContactName: event.target.value }))
                  }
                />
                <InlineErrorSlot message={errors.contact?.emergencyContactName} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="emergencyContactPhone">Emergency contact phone (optional)</Label>
                <Input
                  id="emergencyContactPhone"
                  type="tel"
                  value={contact.emergencyContactPhone ?? ""}
                  inputMode="tel"
                  onChange={(event) =>
                    setContact((prev) => ({ ...prev, emergencyContactPhone: event.target.value }))
                  }
                />
                <InlineErrorSlot message={errors.contact?.emergencyContactPhone} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Address (optional)</Label>
              <Textarea
                id="address"
                rows={2}
                value={contact.address ?? ""}
                autoComplete="street-address"
                onChange={(event) => setContact((prev) => ({ ...prev, address: event.target.value }))}
              />
              <InlineErrorSlot message={errors.contact?.address} />
            </div>
          </div>
        );

      case "students":
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Student {activeStudentIndex + 1} of {students.length}
                </p>
                <p className="text-xs text-muted-foreground">Add details for each swimmer.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={addStudent}>
                  Add student
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={removeCurrentStudent}
                  disabled={students.length <= 1}
                >
                  Remove
                </Button>
              </div>
            </div>

            <InlineErrorSlot message={studentGeneralError} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`firstName-${currentStudent?.id}`}>First name</Label>
                <Input
                  id={`firstName-${currentStudent?.id}`}
                  value={currentStudent?.firstName ?? ""}
                  autoComplete="given-name"
                  onChange={(event) => updateStudent(currentStudent.id, { firstName: event.target.value })}
                />
                <InlineErrorSlot message={currentStudentErrors.firstName} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`lastName-${currentStudent?.id}`}>Last name</Label>
                <Input
                  id={`lastName-${currentStudent?.id}`}
                  value={currentStudent?.lastName ?? ""}
                  autoComplete="family-name"
                  onChange={(event) => updateStudent(currentStudent.id, { lastName: event.target.value })}
                />
                <InlineErrorSlot message={currentStudentErrors.lastName} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`dob-${currentStudent?.id}`}>Date of birth</Label>
                <Input
                  id={`dob-${currentStudent?.id}`}
                  type="date"
                  value={currentStudent?.dateOfBirth ?? ""}
                  onChange={(event) => updateStudent(currentStudent.id, { dateOfBirth: event.target.value })}
                />
                <InlineErrorSlot message={currentStudentErrors.dateOfBirth} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`experience-${currentStudent?.id}`}>Current level</Label>
                <Select
                  value={currentStudent?.experience ?? studentExperienceOptions[0]}
                  onValueChange={(value) => {
                    if (isStudentExperience(value)) {
                      updateStudent(currentStudent.id, { experience: value });
                    }
                  }}
                >
                  <SelectTrigger id={`experience-${currentStudent?.id}`}>
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
                <InlineErrorSlot message={currentStudentErrors.experience} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`notes-${currentStudent?.id}`}>Notes (optional)</Label>
              <Textarea
                id={`notes-${currentStudent?.id}`}
                rows={2}
                value={currentStudent?.notes ?? ""}
                onChange={(event) => updateStudent(currentStudent.id, { notes: event.target.value })}
              />
            </div>
          </div>
        );

      case "days":
        return (
          <div className="space-y-4">
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
              <InlineErrorSlot message={errors.availability?.preferredDays} />
            </div>
          </div>
        );

      case "times":
        return (
          <div className="space-y-4">
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
              <InlineErrorSlot message={errors.availability?.preferredWindows} />
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
                rows={2}
                value={availability.notes ?? ""}
                onChange={(event) => setAvailability((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>
        );

      case "review": {
        const previewStudents = students.slice(0, 3);
        const extraStudents = students.length - previewStudents.length;

        return (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contacts</p>
              <div className="space-y-1">
                <p className="font-medium">{contact.guardianName || "Primary guardian"}</p>
                {contact.email ? <p>{contact.email}</p> : null}
                {contact.phone ? <p>{contact.phone}</p> : null}
                {contact.secondaryContactName || contact.secondaryEmail || contact.secondaryPhone ? (
                  <p className="text-xs text-muted-foreground">
                    Secondary: {contact.secondaryContactName || "Guardian"}
                    {contact.secondaryEmail ? ` · ${contact.secondaryEmail}` : ""}
                    {contact.secondaryPhone ? ` · ${contact.secondaryPhone}` : ""}
                  </p>
                ) : null}
                {contact.emergencyContactName || contact.emergencyContactPhone ? (
                  <p className="text-xs text-muted-foreground">
                    Emergency: {contact.emergencyContactName || "Contact"}
                    {contact.emergencyContactPhone ? ` · ${contact.emergencyContactPhone}` : ""}
                  </p>
                ) : null}
                {contact.address ? (
                  <p className="text-xs text-muted-foreground">{contact.address}</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-md border bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Students</p>
              <div className="space-y-1">
                {previewStudents.map((student) => (
                  <p key={student.id}>
                    {student.firstName} {student.lastName}
                    {student.experience ? ` · ${student.experience}` : ""}
                  </p>
                ))}
                {extraStudents > 0 ? (
                  <p className="text-xs text-muted-foreground">+{extraStudents} more</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-md border bg-muted/40 p-3 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Availability</p>
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

            <div
              className={
                selection
                  ? "rounded-md border bg-muted/40 p-3 space-y-2"
                  : "rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2"
              }
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Portal access</p>
              {selection ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    We&apos;ll send a 6-digit code to{" "}
                    <span className="font-medium text-foreground">{maskedSelection}</span>.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleChangeIdentifier(selection.source)}
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <p className="text-sm text-destructive">
                  Add an email or mobile number to verify. Please contact Caribeae.
                </p>
              )}
            </div>

            <InlineErrorSlot message={submitError} />
          </div>
        );
      }

      case "verify":
        if (verificationIsBlocked) {
          return (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="font-medium text-destructive">We need an email or mobile number to verify.</p>
                <p className="text-muted-foreground">Please contact Caribeae to finish setup.</p>
              </div>
              {canChangeIdentifier ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleChangeIdentifier(authState?.source)}
                >
                  Update contact details
                </Button>
              ) : null}
            </div>
          );
        }

        if (!pending) {
          return (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                {isStartingOtp ? "Sending your code..." : "We couldn't start verification."}
              </p>
              <InlineErrorSlot message={authError} />
              {canChangeIdentifier ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleChangeIdentifier(authState?.source)}
                >
                  Change email or phone
                </Button>
              ) : null}
            </div>
          );
        }

        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We sent a 6-digit code to{" "}
              <span className="font-medium text-foreground">{maskedDestination}</span>.
            </p>
            <form
              id="onboarding-otp-form"
              onSubmit={(event) => {
                event.preventDefault();
                handleVerify();
              }}
              className="space-y-3"
            >
              <OtpInput
                value={digits}
                onChange={(next) => {
                  setDigits(next);
                  if (authError) setAuthError(null);
                }}
                length={OTP_LENGTH}
                disabled={isVerifying}
                error={Boolean(authError)}
                autoFocus
                onComplete={() => {
                  if (!isVerifying) {
                    handleVerify();
                  }
                }}
              />
              <InlineErrorSlot message={authError} />
            </form>

            <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
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
              {canChangeIdentifier ? (
                <button
                  type="button"
                  onClick={() => handleChangeIdentifier(authState?.source)}
                  disabled={isVerifying}
                  className="text-sm text-muted-foreground underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Change email or phone
                </button>
              ) : null}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <AuthShell
      header={header}
      footer={footer}
      contentMaxWidthClassName="max-w-lg"
      headerClassName="px-6 pt-5 sm:px-10 lg:px-12"
      mainClassName="px-6 py-4 sm:px-10 sm:py-6 lg:px-12 lg:py-8"
      footerClassName="px-6 pb-5 sm:px-10 lg:px-12"
    >
      <div
        key={stepMeta.key}
        className="space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
      >
        {renderStep()}
      </div>
    </AuthShell>
  );
}
