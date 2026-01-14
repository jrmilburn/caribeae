"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClientFamilyWithStudents, FamilyActionResult, FamilyStudentPayload } from "@/server/family/types";
import type { Level } from "@prisma/client";
import type { FamilyListEntry } from "@/server/family/listFamilies";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { SmartPhoneInput } from "@/components/SmartPhoneInput";
import { normalizeAuMobileToE164 } from "@/server/phone/auMobile";

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3 sm:items-center">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

type FamilyModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  family?: FamilyListEntry | null;
  levels: Level[];

  onSave: (payload: ClientFamilyWithStudents) => Promise<FamilyActionResult>;
};

type DraftStudent = FamilyStudentPayload & { id: string };

const EMPTY_FAMILY: ClientFamilyWithStudents = {
  name: "",
  primaryContactName: "",
  primaryEmail: "",
  primaryPhone: "",
  secondaryContactName: "",
  secondaryEmail: "",
  secondaryPhone: "",
  medicalContactName: "",
  medicalContactPhone: "",
  address: "",
};

export function FamilyModal({ open, onOpenChange, family, levels, onSave }: FamilyModalProps) {
  const mode: "create" | "edit" = family ? "edit" : "create";
  const isCreate = mode === "create";
  const totalSteps = isCreate ? 2 : 1;

  const defaultLevelId = React.useMemo(() => levels?.[0]?.id ?? "", [levels]);

  const [step, setStep] = React.useState<1 | 2>(1);
  const [form, setForm] = React.useState<ClientFamilyWithStudents>(EMPTY_FAMILY);
  const [students, setStudents] = React.useState<DraftStudent[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [touched, setTouched] = React.useState<{ name?: boolean }>({});
  const [studentTouched, setStudentTouched] = React.useState<Record<string, { name?: boolean; levelId?: boolean }>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [phoneErrors, setPhoneErrors] = React.useState<{ primaryPhone?: string; secondaryPhone?: string }>({});
  const dialogContentRef = React.useRef<HTMLDivElement>(null);

  // Prefill when opening in edit mode
  React.useEffect(() => {
    if (!open) return;

    if (family) {
      setForm({
        name: family.name ?? "",
        primaryContactName: family.primaryContactName ?? "",
        primaryEmail: family.primaryEmail ?? "",
        primaryPhone: family.primaryPhone ?? "",
        secondaryContactName: family.secondaryContactName ?? "",
        secondaryEmail: family.secondaryEmail ?? "",
        secondaryPhone: family.secondaryPhone ?? "",
        medicalContactName: family.medicalContactName ?? "",
        medicalContactPhone: family.medicalContactPhone ?? "",
        address: family.address ?? "",
      });
    } else {
      setForm({ ...EMPTY_FAMILY });
    }

    setStudents([]);
    setTouched({});
    setStudentTouched({});
    setSubmitting(false);
    setServerError(null);
    setPhoneErrors({});
    setStep(1);
  }, [open, family]);

  const close = () => onOpenChange(false);

  const setField = <K extends keyof ClientFamilyWithStudents>(key: K, value: ClientFamilyWithStudents[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setPhoneError = (key: "primaryPhone" | "secondaryPhone", message?: string) => {
    setPhoneErrors((prev) => ({ ...prev, [key]: message }));
  };

  const validatePhoneField = (key: "primaryPhone" | "secondaryPhone") => {
    const raw = form[key] ?? "";
    const trimmed = raw.trim();

    if (!trimmed) {
      setPhoneError(key, undefined);
      return true;
    }

    const normalized = normalizeAuMobileToE164(trimmed);
    if (!normalized) {
      setPhoneError(key, "Enter an AU mobile like 0412 345 678");
      return false;
    }

    setPhoneError(key, undefined);
    if (normalized !== raw) {
      setField(key, normalized);
    }
    return true;
  };

  const validatePhones = () => {
    const primaryOk = validatePhoneField("primaryPhone");
    const secondaryOk = validatePhoneField("secondaryPhone");
    return primaryOk && secondaryOk;
  };

  const applyServerPhoneError = (message: string) => {
    if (message.includes("Primary contact phone")) {
      setPhoneError("primaryPhone", message);
      return true;
    }
    if (message.includes("Secondary contact phone")) {
      setPhoneError("secondaryPhone", message);
      return true;
    }
    return false;
  };

  const nameError = touched.name && !form.name.trim() ? "Family name is required." : "";

  const buildPayload = (): ClientFamilyWithStudents => {
    const cleaned: ClientFamilyWithStudents = { name: form.name.trim() };

    const optKeys: Array<keyof Omit<ClientFamilyWithStudents, "name" | "students">> = [
      "primaryContactName",
      "primaryEmail",
      "primaryPhone",
      "secondaryContactName",
      "secondaryEmail",
      "secondaryPhone",
      "medicalContactName",
      "medicalContactPhone",
      "address",
    ];

    for (const k of optKeys) {
      const val = form[k];
      if (typeof val === "string" && val.trim().length > 0) {
        (cleaned)[k] = val.trim();
      }
    }

    return cleaned;
  };

  const buildStudentPayload = (): FamilyStudentPayload[] => {
    return students.map((student) => ({
      name: student.name.trim(),
      levelId: student.levelId,
      dateOfBirth: student.dateOfBirth?.trim() ? student.dateOfBirth.trim() : undefined,
      medicalNotes: student.medicalNotes?.trim() ? student.medicalNotes.trim() : undefined,
    }));
  };

  const createBlankStudent = (): DraftStudent => ({
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    name: "",
    dateOfBirth: "",
    levelId: defaultLevelId,
    medicalNotes: "",
  });

  const addStudent = () => {
    setStudents((prev) => [...prev, createBlankStudent()]);
  };

  const updateStudent = <K extends keyof FamilyStudentPayload>(id: string, key: K, value: FamilyStudentPayload[K]) => {
    setStudents((prev) =>
      prev.map((student) => (student.id === id ? { ...student, [key]: value ?? "" } : student))
    );
  };

  const removeStudent = (id: string) => {
    setStudents((prev) => prev.filter((student) => student.id !== id));
    setStudentTouched((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const markStudentsTouched = () => {
    setStudentTouched((prev) => {
      const next = { ...prev };
      students.forEach((student) => {
        next[student.id] = { name: true, levelId: true };
      });
      return next;
    });
  };

  const validateStudents = () => {
    if (!students.length) return true;
    markStudentsTouched();
    return students.every((student) => student.name.trim() && student.levelId.trim());
  };

  const handleNextStep = () => {
    setTouched({ name: true });
    setServerError(null);
    if (!form.name.trim()) return;
    setStep(2);
  };

  const handleSaveFamilyOnly = async () => {
    setTouched({ name: true });
    setServerError(null);
    if (!form.name.trim()) return;
    if (!validatePhones()) return;

    try {
      setSubmitting(true);
      const res = await onSave(buildPayload());
      if (res?.success) {
        toast.success("Family updated.");
        close();
      } else {
        const message = res?.error ?? "Unable to save family.";
        if (!applyServerPhoneError(message)) {
          setServerError(message);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateFamily = async () => {
    setTouched({ name: true });
    setServerError(null);
    if (!form.name.trim()) {
      setStep(1);
      return;
    }
    if (!validatePhones()) return;

    const studentsOk = validateStudents();
    if (!studentsOk) return;

    try {
      setSubmitting(true);
      const payload: ClientFamilyWithStudents = {
        ...buildPayload(),
        students: buildStudentPayload(),
      };

      const res = await onSave(payload);
      if (res?.success) {
        toast.success("Family created.");
        close();
      } else {
        const message = res?.error ?? "Unable to create family.";
        if (!applyServerPhoneError(message)) {
          setServerError(message);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (isCreate) {
      if (step === 1) {
        handleNextStep();
        return;
      }
      await handleCreateFamily();
      return;
    }

    await handleSaveFamilyOnly();
  };

  const handleBack = () => {
    setServerError(null);
    setStep(1);
  };

  const primaryLabel =
    isCreate && step === 1
      ? "Next"
      : submitting
        ? mode === "create"
          ? "Creating…"
          : "Saving…"
        : mode === "create"
          ? "Create family"
          : "Save changes";

  React.useEffect(() => {
    if (!isCreate) return;
    const node = dialogContentRef.current;
    if (!node) return;

    // Reset scroll to top when moving between steps so users don't land mid-way through the form.
    requestAnimationFrame(() => {
      node.scrollTo({ top: 0 });
    });
  }, [step, isCreate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto" ref={dialogContentRef}>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New family" : "Edit family"}</DialogTitle>
        </DialogHeader>

        {isCreate && (
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
            <div className="font-medium">Step {step} of {totalSteps}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {step === 1 ? "Family details" : "Students (optional)"}
            </div>
          </div>
        )}

        <div className={cn("relative", isCreate && "min-h-[520px]")}>
          <div
            className={cn(
              "space-y-6",
              isCreate && "absolute inset-0 transition-all duration-300",
              isCreate && step !== 1 && "-translate-x-6 opacity-0 pointer-events-none",
              isCreate && step === 1 && "translate-x-0 opacity-100"
            )}
          >
            <div className="space-y-3">
              <SectionTitle>Family</SectionTitle>
              <FieldRow label="Family name">
                <div className="space-y-1">
                  <Input
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                    placeholder="e.g. Smith Family"
                    className={cn(nameError && "border-destructive focus-visible:ring-destructive")}
                  />
                  {nameError ? (
                    <p className="text-xs text-destructive">{nameError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      This is what appears in the family list.
                    </p>
                  )}
                </div>
              </FieldRow>
            </div>

            <div className="space-y-3">
              <SectionTitle>Primary contact (optional)</SectionTitle>
              <FieldRow label="Name">
                <Input
                  value={form.primaryContactName ?? ""}
                  onChange={(e) => setField("primaryContactName", e.target.value)}
                />
              </FieldRow>
              <FieldRow label="Email">
                <Input
                  value={form.primaryEmail ?? ""}
                  onChange={(e) => setField("primaryEmail", e.target.value)}
                />
              </FieldRow>
              <FieldRow label="Phone">
                <SmartPhoneInput
                  label="Phone"
                  hideLabel
                  value={form.primaryPhone ?? ""}
                  onChange={(next) => {
                    setField("primaryPhone", next);
                    setPhoneError("primaryPhone", undefined);
                  }}
                  onBlur={() => validatePhoneField("primaryPhone")}
                  error={phoneErrors.primaryPhone}
                />
              </FieldRow>
            </div>

            <div className="space-y-3">
              <SectionTitle>Secondary contact (optional)</SectionTitle>
              <FieldRow label="Name">
                <Input
                  value={form.secondaryContactName ?? ""}
                  onChange={(e) => setField("secondaryContactName", e.target.value)}
                />
              </FieldRow>
              <FieldRow label="Email">
                <Input
                  value={form.secondaryEmail ?? ""}
                  onChange={(e) => setField("secondaryEmail", e.target.value)}
                />
              </FieldRow>
              <FieldRow label="Phone">
                <SmartPhoneInput
                  label="Phone"
                  hideLabel
                  value={form.secondaryPhone ?? ""}
                  onChange={(next) => {
                    setField("secondaryPhone", next);
                    setPhoneError("secondaryPhone", undefined);
                  }}
                  onBlur={() => validatePhoneField("secondaryPhone")}
                  error={phoneErrors.secondaryPhone}
                />
              </FieldRow>
            </div>

            <div className="space-y-3">
              <SectionTitle>Address</SectionTitle>
              <FieldRow label="Address">
                <Input
                  value={form.address ?? ""}
                  onChange={(e) => setField("address", e.target.value)}
                  placeholder="Street, suburb, state"
                />
              </FieldRow>
            </div>

            <div className="space-y-3">
              <SectionTitle>Medical contact (optional)</SectionTitle>
              <FieldRow label="Name">
                <Input
                  value={form.medicalContactName ?? ""}
                  onChange={(e) => setField("medicalContactName", e.target.value)}
                />
              </FieldRow>
              <FieldRow label="Phone">
                <Input
                  value={form.medicalContactPhone ?? ""}
                  onChange={(e) => setField("medicalContactPhone", e.target.value)}
                />
              </FieldRow>
            </div>

                {serverError && !isCreate && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {serverError}
                  </div>
                )}

            {isCreate && step === 1 && (
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <div className="flex w-full justify-end gap-2 sm:w-auto">
                  <Button type="button" variant="outline" onClick={close} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handlePrimaryAction}
                    disabled={submitting || !form.name.trim()}
                  >
                    {primaryLabel}
                  </Button>
                </div>
              </div>
            )}

            {!isCreate && (
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={close} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handlePrimaryAction}
                  disabled={submitting || !form.name.trim()}
                >
                  {primaryLabel}
                </Button>
              </DialogFooter>
            )}
          </div>

          {isCreate && (
            <div
              className={cn(
                "space-y-4",
                "absolute inset-0 transition-all duration-300",
                step === 2 ? "translate-x-0 opacity-100" : "translate-x-6 opacity-0 pointer-events-none"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <SectionTitle>Students (optional)</SectionTitle>
                  <p className="text-sm text-muted-foreground">Add students now or skip and add them later.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addStudent} disabled={submitting || levels.length === 0}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add student
                </Button>
              </div>

              {levels.length === 0 && (
                <p className="text-xs text-destructive">Add at least one level before creating students.</p>
              )}

              <div className="space-y-3">
                {students.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No students added. Click &ldquo;Add student&rdquo; to include them now or continue without students.
                  </div>
                ) : (
                  students.map((student, index) => {
                    const nameTouched = studentTouched[student.id]?.name;
                    const levelTouched = studentTouched[student.id]?.levelId;
                    const nameError = nameTouched && !student.name.trim();
                    const levelError = levelTouched && !student.levelId.trim();

                    return (
                      <div key={student.id} className="space-y-4 rounded-lg border bg-card/30 p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium">Student {index + 1}</div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeStudent(student.id)}
                            disabled={submitting}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Name</label>
                            <Input
                              value={student.name}
                              onChange={(e) => updateStudent(student.id, "name", e.target.value)}
                              onBlur={() =>
                                setStudentTouched((prev) => ({
                                  ...prev,
                                  [student.id]: { ...(prev[student.id] ?? {}), name: true },
                                }))
                              }
                              placeholder="e.g. Olivia Smith"
                              className={cn(nameError && "border-destructive focus-visible:ring-destructive")}
                            />
                            {nameError && <p className="text-xs text-destructive">Student name is required.</p>}
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Level</label>
                            <Select
                              value={student.levelId}
                              onValueChange={(v) => {
                                updateStudent(student.id, "levelId", v);
                                setStudentTouched((prev) => ({
                                  ...prev,
                                  [student.id]: { ...(prev[student.id] ?? {}), levelId: true },
                                }));
                              }}
                            >
                              <SelectTrigger className={cn(levelError && "border-destructive focus-visible:ring-destructive")}>
                                <SelectValue placeholder="Select level" />
                              </SelectTrigger>
                              <SelectContent>
                                {levels.map((lvl) => (
                                  <SelectItem key={lvl.id} value={lvl.id}>
                                    {lvl.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {levelError && <p className="text-xs text-destructive">Level is required.</p>}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm text-muted-foreground">Date of birth (optional)</label>
                          <Input
                            type="date"
                            value={student.dateOfBirth ?? ""}
                            onChange={(e) => updateStudent(student.id, "dateOfBirth", e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm text-muted-foreground">Medical notes (optional)</label>
                          <Input
                            value={student.medicalNotes ?? ""}
                            onChange={(e) => updateStudent(student.id, "medicalNotes", e.target.value)}
                            placeholder="Allergies, conditions, important info…"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {serverError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {serverError}
                </div>
              )}

              {isCreate && step === 2 && (
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex w-full justify-start sm:w-auto">
                    <Button type="button" variant="ghost" onClick={handleBack} disabled={submitting}>
                      Back
                    </Button>
                  </div>
                  <div className="flex w-full justify-end gap-2 sm:w-auto">
                    <Button type="button" variant="outline" onClick={close} disabled={submitting}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handlePrimaryAction}
                      disabled={submitting || !form.name.trim()}
                    >
                      {primaryLabel}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
