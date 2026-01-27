// /app/admin/class/[id]/components/CreateEnrolmentDialog.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Student, EnrolmentStatus, EnrolmentPlan } from "@prisma/client";
import { ChevronDown } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CapacityOverloadDialog } from "@/components/admin/CapacityOverloadDialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { createEnrolmentsFromSelection } from "@/server/enrolment/createEnrolmentsFromSelection";
import { getSelectionRequirement } from "@/server/enrolment/planRules";
import { toast } from "sonner";
import { calculateBlockPricing, resolveBlockLength } from "@/lib/billing/blockPricing";
import { formatCurrencyFromCents } from "@/lib/currency";
import { parseCapacityError, type CapacityExceededDetails } from "@/lib/capacityError";

function fromDateInputValue(v: string) {
  if (!v) return null;
  return new Date(`${v}T00:00:00`);
}

export function CreateEnrolmentDialog({
  open,
  onOpenChange,
  templateId,
  templateDayOfWeek,
  classLevelId,
  classLevelName,
  defaultStartDate,
  students,
  enrolmentPlans,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  templateDayOfWeek: number | null;
  classLevelId: string | null;
  classLevelName: string | null;
  defaultStartDate?: string | null;
  students: Student[];
  enrolmentPlans: EnrolmentPlan[];
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);

  const [studentId, setStudentId] = React.useState<string>("");
  const [studentOpen, setStudentOpen] = React.useState(false);
  const [studentSearch, setStudentSearch] = React.useState("");
  const [startDate, setStartDate] = React.useState<string>("");
  const [endDate, setEndDate] = React.useState<string>("");
  const [planId, setPlanId] = React.useState<string>("");
  const [status, setStatus] = React.useState<EnrolmentStatus>("ACTIVE");
  const [customBlockEnabled, setCustomBlockEnabled] = React.useState(false);
  const [customBlockLength, setCustomBlockLength] = React.useState("");
  const [capacityWarning, setCapacityWarning] = React.useState<CapacityExceededDetails | null>(null);

  React.useEffect(() => {
    if (!open) {
      setStudentId("");
      setStudentOpen(false);
      setStudentSearch("");
      setStartDate("");
      setEndDate("");
      setPlanId("");
      setStatus("ACTIVE");
      setCustomBlockEnabled(false);
      setCustomBlockLength("");
      setSaving(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    if (defaultStartDate && !startDate) {
      setStartDate(defaultStartDate);
    }
  }, [defaultStartDate, open, startDate]);

  const availablePlans = React.useMemo(() => {
    if (!classLevelId) return [];
    if (templateDayOfWeek === 5) {
      return enrolmentPlans.filter(
        (plan) =>
          plan.levelId === classLevelId && (plan.isSaturdayOnly || plan.billingType === "PER_WEEK")
      );
    }
    if (typeof templateDayOfWeek === "number") {
      return enrolmentPlans.filter(
        (plan) =>
          plan.levelId === classLevelId && (!plan.isSaturdayOnly || plan.billingType === "PER_WEEK")
      );
    }
    return enrolmentPlans.filter((plan) => plan.levelId === classLevelId);
  }, [classLevelId, enrolmentPlans, templateDayOfWeek]);
  const selectedPlan = React.useMemo(
    () => availablePlans.find((p) => p.id === planId) ?? null,
    [availablePlans, planId]
  );
  const planIsBlock = selectedPlan?.billingType === "PER_CLASS";
  const planBlockLength = selectedPlan ? resolveBlockLength(selectedPlan.blockClassCount) : 1;
  const parsedCustomBlockLength = Number(customBlockLength);
  const customBlockValue = Number.isInteger(parsedCustomBlockLength) ? parsedCustomBlockLength : null;
  const blockPricing =
    selectedPlan && planIsBlock
      ? calculateBlockPricing({
          priceCents: selectedPlan.priceCents,
          blockLength: planBlockLength,
          customBlockLength: customBlockEnabled ? customBlockValue ?? undefined : undefined,
        })
      : null;
  const selectionRequirement = React.useMemo(
    () =>
      selectedPlan
        ? getSelectionRequirement(selectedPlan)
        : { requiredCount: 1, maxCount: 1, helper: "Select a plan to continue." },
    [selectedPlan]
  );
  React.useEffect(() => {
    if (!availablePlans.find((p) => p.id === planId)) {
      setPlanId(availablePlans[0]?.id ?? "");
    }
  }, [availablePlans, planId]);
  React.useEffect(() => {
    if (!studentOpen) setStudentSearch("");
  }, [studentOpen]);
  const filteredStudents = React.useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) =>
      (student.name ?? "Unnamed student").toLowerCase().includes(query)
    );
  }, [studentSearch, students]);
  const requiresMultipleTemplates = selectionRequirement.maxCount > 1;
  const canSubmit =
    studentId && startDate && planId && !saving && !requiresMultipleTemplates && Boolean(classLevelId);

  React.useEffect(() => {
    if (!selectedPlan || !planIsBlock) {
      setCustomBlockEnabled(false);
      setCustomBlockLength("");
      return;
    }
    if (!customBlockEnabled) {
      setCustomBlockLength(String(planBlockLength));
    }
  }, [selectedPlan, planIsBlock, planBlockLength, customBlockEnabled]);

  async function submitEnrolment(allowOverload?: boolean) {
    if (!canSubmit) {
      if (requiresMultipleTemplates) {
        toast.error(selectionRequirement.helper);
      }
      return;
    }
    if (customBlockEnabled && planIsBlock && (!customBlockValue || customBlockValue < planBlockLength)) {
      toast.error(`Custom block length must be at least ${planBlockLength} classes.`);
      return;
    }

    setSaving(true);
    try {
      const start = fromDateInputValue(startDate);
      const end = fromDateInputValue(endDate);

      if (!start) return;

      const result = await createEnrolmentsFromSelection({
        studentId,
        planId,
        templateIds: [templateId],
        startDate: start.toISOString(),
        endDate: end?.toISOString() ?? undefined,
        status,
        effectiveLevelId: classLevelId ?? undefined,
        customBlockLength: customBlockEnabled && planIsBlock && customBlockValue ? customBlockValue : undefined,
        allowOverload,
      });

      if (!result.ok) {
        if (result.error.code === "CAPACITY_EXCEEDED") {
          setCapacityWarning(result.error.details);
          return;
        }
        toast.error(result.error.message);
        return;
      }

      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      const details = parseCapacityError(err);
      if (details) {
        setCapacityWarning(details);
        return;
      }
      toast.error(
        err instanceof Error ? err.message : "Unable to create enrolment. Please check the plan."
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitEnrolment();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add enrolment</DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  {availablePlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      <span className="flex items-center gap-2">
                        <span>
                          {plan.name} · {plan.billingType === "PER_WEEK" ? "Per week" : "Per class"}
                        </span>
                        {plan.isSaturdayOnly ? (
                          <Badge variant="secondary" className="uppercase">
                            Saturday
                          </Badge>
                        ) : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availablePlans.length === 0 ? (
                <p className="text-xs text-destructive">
                  {!classLevelId
                    ? "This class needs a level before enrolments can be added."
                    : templateDayOfWeek === 5
                      ? "No Saturday plans exist for this level. Create one in Plans."
                      : typeof templateDayOfWeek === "number"
                        ? "No weekday plans exist for this level. Create one in Plans."
                        : "No enrolment plans are available for this class."}
                </p>
              ) : null}
              {requiresMultipleTemplates ? (
                <p className="text-xs text-destructive">
                  {selectionRequirement.helper} Use the student schedule to select multiple classes.
                </p>
              ) : null}
              {planIsBlock && selectedPlan ? (
                <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>
                      {planBlockLength} classes · {formatCurrencyFromCents(selectedPlan.priceCents)}
                    </span>
                    <button
                      type="button"
                      className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
                      onClick={() => {
                        if (!customBlockEnabled) {
                          setCustomBlockLength(String(planBlockLength));
                        }
                        setCustomBlockEnabled((prev) => !prev);
                      }}
                    >
                      {customBlockEnabled ? "Use default" : "Customize"}
                    </button>
                  </div>
                  {customBlockEnabled ? (
                    <div className="mt-3 space-y-2">
                      <div className="space-y-1">
                        <Label htmlFor="custom-block-length-class">Number of classes</Label>
                        <Input
                          id="custom-block-length-class"
                          type="number"
                          min={planBlockLength}
                          value={customBlockLength}
                          onChange={(e) => setCustomBlockLength(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Minimum {planBlockLength} classes.
                        </p>
                      </div>
                      {blockPricing ? (
                        <div className="text-xs text-muted-foreground">
                          <div>Per class: {formatCurrencyFromCents(blockPricing.perClassPriceCents)}</div>
                          <div>Total: {formatCurrencyFromCents(blockPricing.totalCents)}</div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Student</Label>
              <Popover open={studentOpen} onOpenChange={setStudentOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" type="button" className="w-full justify-between">
                    <span className="truncate">
                      {students.find((s) => s.id === studentId)?.name ?? "Select a student"}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search students…"
                      value={studentSearch}
                      onChange={(event) => setStudentSearch(event.target.value)}
                      autoFocus
                    />
                    <CommandList>
                      {filteredStudents.length === 0 ? (
                        <CommandEmpty>No students found.</CommandEmpty>
                      ) : (
                        <CommandGroup>
                          {filteredStudents.map((student) => (
                            <CommandItem
                              key={student.id}
                              onSelect={() => {
                                setStudentId(student.id);
                                setStudentOpen(false);
                              }}
                            >
                              {student.name ?? "Unnamed student"}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {classLevelName ? (
                <p className="text-xs text-muted-foreground">
                  Student level will be updated to {classLevelName}.
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>End date (optional)</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EnrolmentStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="PAUSED">PAUSED</SelectItem>
                  <SelectItem value="CHANGEOVER">CHANGEOVER</SelectItem>
                  <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {saving ? "Creating..." : "Create enrolment"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <CapacityOverloadDialog
        open={Boolean(capacityWarning)}
        details={capacityWarning}
        busy={saving}
        onCancel={() => setCapacityWarning(null)}
        onConfirm={() => {
          setCapacityWarning(null);
          void submitEnrolment(true);
        }}
      />
    </>
  );
}
