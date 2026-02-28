"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrencyFromCents } from "@/lib/currency";
import {
  ENROLMENT_STATUS_VALUES,
  areEnrolmentFormValuesEqual,
  buildEnrolmentDiff,
  buildFormValuesFromSnapshot,
  normalizeEnrolmentFormValues,
  normalizeTemplateIds,
  type EnrolmentEditContextSource,
  type EnrolmentEditFieldErrors,
  type EnrolmentEditFormValues,
  type EnrolmentEditSheetData,
  type EnrolmentEditSnapshot,
  validateEnrolmentFormValues,
} from "@/lib/enrolment/editEnrolmentModel";
import { getEnrolmentForEdit, updateEnrolmentForEdit } from "@/server/enrolment/editEnrolment";

type EditEnrolmentSheetProps = {
  enrolmentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: {
    source: EnrolmentEditContextSource;
    sourceId?: string;
  };
  onSaved?: (updated: EnrolmentEditSnapshot) => void;
};

function formatMinutes(value: number | null) {
  if (typeof value !== "number") return "";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const meridiem = hours >= 12 ? "PM" : "AM";
  const baseHour = hours % 12 || 12;
  return `${baseHour}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function formatDay(value: number | null) {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  if (typeof value !== "number") return "Day";
  return names[value] ?? "Day";
}

function templateLabel(template: EnrolmentEditSheetData["options"]["classTemplates"][number]) {
  const day = formatDay(template.dayOfWeek);
  const start = formatMinutes(template.startTime);
  const end = formatMinutes(template.endTime);
  const time = start && end ? `${start}-${end}` : start || end;
  const base = template.name ?? "Unnamed class";
  return `${base} (${day}${time ? ` ${time}` : ""})`;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 py-2">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 space-y-6 border-y border-border/60 py-5 sm:space-y-0 sm:divide-y sm:divide-border/60 sm:py-0">
        {children}
      </div>
    </section>
  );
}

function FormRow({
  label,
  hint,
  error,
  align = "start",
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  align?: "start" | "center";
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "sm:grid sm:grid-cols-3 sm:gap-4 sm:py-5",
        align === "center" ? "sm:items-center" : "sm:items-start",
      ].join(" ")}
    >
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground sm:pt-1.5">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="mt-2 space-y-2 sm:col-span-2 sm:mt-0">
        {children}
        <FieldError message={error} />
      </div>
    </div>
  );
}

export function EditEnrolmentSheet({
  enrolmentId,
  open,
  onOpenChange,
  context,
  onSaved,
}: EditEnrolmentSheetProps) {
  const [data, setData] = React.useState<EnrolmentEditSheetData | null>(null);
  const [initialValues, setInitialValues] = React.useState<EnrolmentEditFormValues | null>(null);
  const [values, setValues] = React.useState<EnrolmentEditFormValues | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<EnrolmentEditFieldErrors>({});
  const [loading, setLoading] = React.useState(false);
  const [loadingError, setLoadingError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [retrySignature, setRetrySignature] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [discardOpen, setDiscardOpen] = React.useState(false);

  const normalizedValues = React.useMemo(
    () => (values ? normalizeEnrolmentFormValues(values) : null),
    [values]
  );

  const formSignature = React.useMemo(
    () => (normalizedValues ? JSON.stringify(normalizedValues) : null),
    [normalizedValues]
  );

  const localValidation = React.useMemo(
    () => (values ? validateEnrolmentFormValues(values) : {}),
    [values]
  );

  const hasBlockingValidation = Object.keys(localValidation).length > 0;
  const isDirty = Boolean(
    values && initialValues && !areEnrolmentFormValuesEqual(values, initialValues)
  );
  const canSubmit = Boolean(values && initialValues && isDirty && !hasBlockingValidation && !loading && !saving);

  const changedFields = React.useMemo(() => {
    if (!data || !initialValues || !values) return [];
    return buildEnrolmentDiff({
      initialValues,
      nextValues: values,
      plans: data.options.plans,
      classTemplates: data.options.classTemplates,
    });
  }, [data, initialValues, values]);

  const clearForClose = React.useCallback(() => {
    setConfirmOpen(false);
    setDiscardOpen(false);
    setSaveError(null);
    setRetrySignature(null);
    setFieldErrors({});
  }, []);

  const requestClose = React.useCallback(() => {
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    clearForClose();
    onOpenChange(false);
  }, [clearForClose, isDirty, onOpenChange]);

  const handleSheetOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) {
        onOpenChange(true);
        return;
      }
      requestClose();
    },
    [onOpenChange, requestClose]
  );

  const loadEnrolment = React.useCallback(async () => {
    if (!enrolmentId) return;

    setLoading(true);
    setLoadingError(null);
    setSaveError(null);
    setRetrySignature(null);
    setFieldErrors({});

    let result: Awaited<ReturnType<typeof getEnrolmentForEdit>>;
    try {
      result = await getEnrolmentForEdit(enrolmentId);
    } catch (error) {
      console.error(error);
      setLoadingError("Unable to load enrolment details.");
      setData(null);
      setValues(null);
      setInitialValues(null);
      setLoading(false);
      return;
    }

    if (!result.ok) {
      setLoadingError(result.error.message);
      setData(null);
      setValues(null);
      setInitialValues(null);
      setLoading(false);
      return;
    }

    const nextData = result.data;
    const nextValues = buildFormValuesFromSnapshot(nextData.enrolment);
    setData(nextData);
    setInitialValues(nextValues);
    setValues(nextValues);
    setLoading(false);
  }, [enrolmentId]);

  React.useEffect(() => {
    if (!open || !enrolmentId) return;
    void loadEnrolment();
  }, [open, enrolmentId, loadEnrolment]);

  React.useEffect(() => {
    if (!retrySignature || !formSignature) return;
    if (retrySignature !== formSignature) {
      setRetrySignature(null);
      setSaveError(null);
    }
  }, [formSignature, retrySignature]);

  const setFieldValue = React.useCallback(
    <K extends keyof EnrolmentEditFormValues>(field: K, value: EnrolmentEditFormValues[K]) => {
      setValues((prev) => {
        if (!prev) return prev;
        return { ...prev, [field]: value };
      });
      setFieldErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    []
  );

  const handleTemplateToggle = React.useCallback(
    (templateId: string, checked: boolean) => {
      setValues((prev) => {
        if (!prev) return prev;
        if (checked) {
          return {
            ...prev,
            templateIds: normalizeTemplateIds([...prev.templateIds, templateId]),
          };
        }
        return {
          ...prev,
          templateIds: prev.templateIds.filter((id) => id !== templateId),
        };
      });
      setFieldErrors((prev) => {
        if (!prev.templateIds) return prev;
        const next = { ...prev };
        delete next.templateIds;
        return next;
      });
    },
    []
  );

  const persist = React.useCallback(
    async (fromRetry?: boolean) => {
      if (!enrolmentId || !data || !values) return;

      const mergedErrors = {
        ...validateEnrolmentFormValues(values),
      };

      if (Object.keys(mergedErrors).length > 0) {
        setFieldErrors(mergedErrors);
        return;
      }

      setSaving(true);
      setSaveError(null);

      let result: Awaited<ReturnType<typeof updateEnrolmentForEdit>>;
      try {
        result = await updateEnrolmentForEdit({
          enrolmentId,
          expectedUpdatedAt: data.enrolment.updatedAt,
          values,
          context,
        });
      } catch (error) {
        console.error(error);
        setSaveError("We couldn’t save these changes. Please try again.");
        if (!fromRetry && formSignature) {
          setRetrySignature(formSignature);
        }
        setSaving(false);
        return;
      }

      if (!result.ok) {
        if (result.error.fieldErrors) {
          setFieldErrors((prev) => ({ ...prev, ...result.error.fieldErrors }));
        }

        if (result.error.code === "CONFLICT" && result.error.latest) {
          const latestValues = buildFormValuesFromSnapshot(result.error.latest.enrolment);
          setData(result.error.latest);
          setInitialValues(latestValues);
          setValues(latestValues);
          setFieldErrors({});
          setConfirmOpen(false);
        }

        setSaveError(result.error.message || "We couldn’t save these changes. Please try again.");
        if (!fromRetry && formSignature) {
          setRetrySignature(formSignature);
        }

        setSaving(false);
        return;
      }

      const updated = result.data.enrolment;
      const nextValues = buildFormValuesFromSnapshot(updated);

      setData((prev) =>
        prev
          ? {
              ...prev,
              enrolment: updated,
            }
          : null
      );
      setInitialValues(nextValues);
      setValues(nextValues);
      setFieldErrors({});
      setRetrySignature(null);
      setSaveError(null);
      setConfirmOpen(false);
      setSaving(false);

      toast.success("Enrolment updated.");
      onSaved?.(updated);
      clearForClose();
      onOpenChange(false);
    },
    [clearForClose, context, data, enrolmentId, formSignature, onOpenChange, onSaved, values]
  );

  const openConfirm = React.useCallback(() => {
    if (!values) return;
    const errors = validateEnrolmentFormValues(values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...errors }));
      return;
    }
    setSaveError(null);
    setRetrySignature(null);
    setConfirmOpen(true);
  }, [values]);

  const selectedTemplateSet = React.useMemo(
    () => new Set(values?.templateIds ?? []),
    [values?.templateIds]
  );

  return (
    <>
      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl">
          <SheetHeader className="border-b px-6 py-5">
            <SheetTitle>Edit enrolment</SheetTitle>
            <SheetDescription>
              Changes here affect billing and attendance. Please double-check before saving.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-6 py-5">
            <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <p>Changes here affect billing and attendance. Please double-check before saving.</p>
            </div>

            {loading ? <LoadingSkeleton /> : null}

            {!loading && loadingError ? (
              <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm text-destructive">{loadingError}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadEnrolment()}>
                  Retry loading
                </Button>
              </div>
            ) : null}

            {!loading && data && values ? (
              <>
                <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="font-medium">{data.enrolment.studentName}</div>
                  <Badge variant="outline">ID {data.enrolment.id.slice(-6)}</Badge>
                  {data.enrolment.plan ? (
                    <Badge variant="secondary">
                      {data.enrolment.plan.billingType === "PER_WEEK" ? "Per week" : "Per class"}
                    </Badge>
                  ) : null}
                </div>

                <div className="space-y-10">
                  <FormSection
                    title="Enrolment details"
                    description="Update the core enrolment status, dates, and plan configuration."
                  >
                    <FormRow label="Status" error={fieldErrors.status}>
                      <Select
                        value={values.status}
                        onValueChange={(value) =>
                          setFieldValue("status", value as EnrolmentEditFormValues["status"])
                        }
                      >
                        <SelectTrigger id="edit-enrolment-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ENROLMENT_STATUS_VALUES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormRow>

                    <FormRow
                      label="Plan"
                      hint="Changing plan can affect billing cadence and coverage."
                      error={fieldErrors.planId}
                    >
                      <Select value={values.planId} onValueChange={(value) => setFieldValue("planId", value)}>
                        <SelectTrigger id="edit-enrolment-plan">
                          <SelectValue placeholder="Select plan" />
                        </SelectTrigger>
                        <SelectContent>
                          {data.options.plans.map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name} · {plan.billingType === "PER_WEEK" ? "Per week" : "Per class"} ·{" "}
                              {formatCurrencyFromCents(plan.priceCents)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormRow>

                    <FormRow label="Start date" error={fieldErrors.startDate}>
                      <Input
                        id="edit-enrolment-start"
                        type="date"
                        value={values.startDate}
                        onChange={(event) => setFieldValue("startDate", event.target.value)}
                        className="max-w-sm"
                      />
                    </FormRow>

                    <FormRow label="End date" hint="Leave blank for open-ended enrolments." error={fieldErrors.endDate}>
                      <Input
                        id="edit-enrolment-end"
                        type="date"
                        value={values.endDate}
                        onChange={(event) => setFieldValue("endDate", event.target.value)}
                        className="max-w-sm"
                      />
                    </FormRow>

                    <FormRow
                      label="Paid-through date"
                      hint="Inclusive coverage date used by billing and attendance."
                      error={fieldErrors.paidThroughDate}
                    >
                      <Input
                        id="edit-enrolment-paid-through"
                        type="date"
                        value={values.paidThroughDate}
                        onChange={(event) => setFieldValue("paidThroughDate", event.target.value)}
                        className="max-w-sm"
                      />
                    </FormRow>

                    <FormRow label="Cancelled at" error={fieldErrors.cancelledAt}>
                      <Input
                        id="edit-enrolment-cancelled-at"
                        type="date"
                        value={values.cancelledAt}
                        onChange={(event) => setFieldValue("cancelledAt", event.target.value)}
                        className="max-w-sm"
                      />
                    </FormRow>
                  </FormSection>

                  <FormSection
                    title="Class assignments"
                    description="Select all classes this enrolment should be attached to."
                  >
                    <FormRow
                      label="Assigned classes"
                      hint={`${values.templateIds.length} selected`}
                      error={fieldErrors.templateIds}
                    >
                      <div className="max-h-56 divide-y overflow-y-auto rounded-md border">
                        {data.options.classTemplates.map((template) => (
                          <label
                            key={template.id}
                            className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm hover:bg-muted/30"
                          >
                            <Checkbox
                              checked={selectedTemplateSet.has(template.id)}
                              onCheckedChange={(checked) => handleTemplateToggle(template.id, Boolean(checked))}
                            />
                            <span className="space-y-0.5">
                              <span className="block font-medium">{templateLabel(template)}</span>
                              <span className="block text-xs text-muted-foreground">
                                {template.levelName ?? "No level"} · {template.active ? "Active" : "Inactive"}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </FormRow>
                  </FormSection>

                  <FormSection
                    title="Billing settings"
                    description="These settings impact grouping and account calculations."
                  >
                    <FormRow
                      label="Billing primary"
                      hint="Marks this enrolment as the billing anchor in its group."
                      align="center"
                      error={fieldErrors.isBillingPrimary}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="edit-enrolment-billing-primary"
                          checked={values.isBillingPrimary}
                          onCheckedChange={(checked) =>
                            setFieldValue("isBillingPrimary", Boolean(checked))
                          }
                        />
                        <Label htmlFor="edit-enrolment-billing-primary">Use as billing primary</Label>
                      </div>
                    </FormRow>

                    <FormRow label="Billing group ID" error={fieldErrors.billingGroupId}>
                      <Input
                        id="edit-enrolment-billing-group"
                        value={values.billingGroupId}
                        onChange={(event) => setFieldValue("billingGroupId", event.target.value)}
                        placeholder="Optional"
                        className="max-w-md"
                      />
                    </FormRow>

                    <FormRow label="Billing primary ID" error={fieldErrors.billingPrimaryId}>
                      <Input
                        id="edit-enrolment-billing-primary-id"
                        value={values.billingPrimaryId}
                        onChange={(event) => setFieldValue("billingPrimaryId", event.target.value)}
                        placeholder="Optional"
                        className="max-w-md"
                      />
                    </FormRow>

                    <FormRow
                      label="Computed values"
                      hint="Read-only values derived from billing calculations."
                    >
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div>
                          Computed paid-through:{" "}
                          <span className="font-medium text-foreground">
                            {data.enrolment.paidThroughDateComputed || "—"}
                          </span>
                        </div>
                        <div>
                          Next due:{" "}
                          <span className="font-medium text-foreground">
                            {data.enrolment.nextDueDateComputed || "—"}
                          </span>
                        </div>
                        <div>
                          Credits remaining:{" "}
                          <span className="font-medium text-foreground">
                            {data.enrolment.creditsRemaining ?? "—"}
                          </span>
                        </div>
                      </div>
                    </FormRow>
                  </FormSection>
                </div>

                {saveError ? (
                  <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-sm text-destructive">{saveError || "We couldn’t save these changes."}</p>
                    {retrySignature && formSignature && retrySignature === formSignature ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void persist(true)}
                        disabled={saving}
                      >
                        {saving ? "Retrying..." : "Retry save"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <Separator />
          <SheetFooter className="px-6 py-4">
            <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={openConfirm} disabled={!canSubmit}>
              Save changes
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={confirmOpen} onOpenChange={(next) => (!saving ? setConfirmOpen(next) : null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>You’re about to update this enrolment.</DialogTitle>
            <DialogDescription>
              Review the changed fields before confirming.
            </DialogDescription>
          </DialogHeader>

          {saving ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-2">
              {changedFields.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted-foreground">No changes detected.</p>
              ) : (
                changedFields.map((field) => (
                  <div
                    key={field.field}
                    className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2 rounded border px-2 py-1.5 text-sm"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {field.label}
                    </span>
                    <span className="truncate">
                      <span className="text-muted-foreground">{field.before}</span>
                      <span className="px-2">→</span>
                      <span className="font-medium">{field.after}</span>
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>
              Back
            </Button>
            <Button type="button" onClick={() => void persist()} disabled={saving || changedFields.length === 0}>
              {saving ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={discardOpen} onOpenChange={(next) => setDiscardOpen(next)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>
              You have unsaved enrolment edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDiscardOpen(false)}>
              Keep editing
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDiscardOpen(false);
                clearForClose();
                onOpenChange(false);
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
