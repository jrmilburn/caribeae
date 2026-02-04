"use client";

import * as React from "react";
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

const DRAFT_KEY = "caribeae:onboarding:draft";
const SUBMITTED_KEY = "caribeae:onboarding:submitted";

const steps = [
  { title: "Contact", description: "Family basics" },
  { title: "Students", description: "Add swimmers" },
  { title: "Availability", description: "Preferred times" },
  { title: "Review", description: "Confirm details" },
];

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
  const [step, setStep] = React.useState(0);
  const [contact, setContact] = React.useState<ContactState>(defaultContact);
  const [students, setStudents] = React.useState<StudentState[]>([createStudent()]);
  const [availability, setAvailability] = React.useState<AvailabilityState>(defaultAvailability);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  const [honeypot, setHoneypot] = React.useState("");

  const progressPercent = Math.round(((step + 1) / steps.length) * 100);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(DRAFT_KEY);
    const submittedId = window.localStorage.getItem(SUBMITTED_KEY);
    if (submittedId) {
      setSubmitted(true);
    }
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
    if (!hydrated || submitted) return;
    const timeout = window.setTimeout(() => {
      const payload: OnboardingRequestInput = { contact, students, availability };
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [availability, contact, hydrated, students, submitted]);

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
      window.localStorage.removeItem(DRAFT_KEY);
      window.localStorage.setItem(SUBMITTED_KEY, result.id ?? "submitted");
      setSubmitted(true);
      toast.success("Request submitted. We'll be in touch soon.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStudent = (id: string, updates: Partial<StudentState>) => {
    setStudents((prev) => prev.map((student) => (student.id === id ? { ...student, ...updates } : student)));
  };

  if (submitted) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">You&apos;re all set</CardTitle>
            <CardDescription>We received your onboarding request.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Thanks for sharing your family&apos;s details. Our team will review availability and reach out shortly.</p>
            <p>If anything changes, just reply to our email or give us a call.</p>
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
          <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
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
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/90 px-4 py-4 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" onClick={handleBack} disabled={step === 0}>
            Back
          </Button>
          {step < steps.length - 1 ? (
            <Button type="button" onClick={handleNext}>
              Continue
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit request"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
