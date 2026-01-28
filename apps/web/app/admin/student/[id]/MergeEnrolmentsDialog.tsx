"use client";

import * as React from "react";
import type { EnrolmentPlan } from "@prisma/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSelectionRequirement, normalizePlan } from "@/server/enrolment/planRules";
import { mergeEnrolments } from "@/server/enrolment/mergeEnrolments";

import type { ClientStudentWithRelations } from "./types";

type Enrolment = ClientStudentWithRelations["enrolments"][number];

function resolveTemplates(enrolment: Enrolment) {
  if (enrolment.classAssignments?.length) {
    return enrolment.classAssignments
      .map((assignment) => assignment.template)
      .filter(Boolean);
  }
  return enrolment.template ? [enrolment.template] : [];
}

function resolveDayType(templates: Array<{ dayOfWeek: number | null }>) {
  if (!templates.length) return null;
  const hasSaturday = templates.some((template) => template.dayOfWeek === 5);
  const hasWeekday = templates.some((template) => template.dayOfWeek !== 5);
  if (hasSaturday && hasWeekday) return "mixed";
  if (hasSaturday) return "saturday";
  return "weekday";
}

export function MergeEnrolmentsDialog({
  open,
  onOpenChange,
  enrolments,
  enrolmentPlans,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrolments: Enrolment[];
  enrolmentPlans: EnrolmentPlan[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [planId, setPlanId] = React.useState<string>("");
  const [startDate, setStartDate] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = React.useState(false);

  const activeEnrolments = React.useMemo(
    () => enrolments.filter((enrolment) => enrolment.status === "ACTIVE"),
    [enrolments]
  );

  const selectedEnrolments = React.useMemo(
    () => activeEnrolments.filter((enrolment) => selectedIds.includes(enrolment.id)),
    [activeEnrolments, selectedIds]
  );

  const mergeTemplates = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof resolveTemplates>[number]>();
    selectedEnrolments.forEach((enrolment) => {
      resolveTemplates(enrolment).forEach((template) => {
        if (template?.id) {
          map.set(template.id, template);
        }
      });
    });
    return Array.from(map.values());
  }, [selectedEnrolments]);

  const selectedBillingType = selectedEnrolments[0]?.plan?.billingType ?? null;
  const billingMismatch = selectedEnrolments.some(
    (enrolment) => enrolment.plan?.billingType !== selectedBillingType
  );
  const dayType = resolveDayType(mergeTemplates);
  const levelId = mergeTemplates[0]?.levelId ?? null;
  const levelMismatch = Boolean(levelId && mergeTemplates.some((template) => template.levelId !== levelId));
  const totalClasses = mergeTemplates.length;

  const eligiblePlans = React.useMemo(() => {
    if (!selectedBillingType || !levelId || dayType === "mixed") return [];
    return enrolmentPlans.filter((plan) => {
      if (plan.levelId !== levelId) return false;
      if (plan.billingType !== selectedBillingType) return false;
      if (dayType === "saturday" && !(plan.isSaturdayOnly || plan.billingType === "PER_WEEK")) {
        return false;
      }
      if (dayType === "weekday" && plan.isSaturdayOnly && plan.billingType !== "PER_WEEK") {
        return false;
      }
      if (plan.billingType === "PER_WEEK") {
        const normalized = normalizePlan(plan);
        return totalClasses === normalized.sessionsPerWeek;
      }
      const requirement = getSelectionRequirement(plan);
      if (requirement.requiredCount > 0) {
        return totalClasses === requirement.requiredCount;
      }
      return totalClasses <= requirement.maxCount;
    });
  }, [dayType, enrolmentPlans, levelId, selectedBillingType, totalClasses]);

  const mergeBlockedReason = React.useMemo(() => {
    if (selectedEnrolments.length < 2) return "Select at least two enrolments to merge.";
    if (!selectedBillingType) return "Selected enrolments must have a billing plan.";
    if (billingMismatch) return "Selected enrolments must share the same billing type.";
    if (!levelId) return "Selected enrolments must have assigned classes.";
    if (levelMismatch) return "Selected enrolments must be within the same level.";
    if (dayType === "mixed") return "Selected enrolments must be either all Saturday or all weekday classes.";
    if (!eligiblePlans.length) return "No matching enrolment plan can cover the merged classes.";
    return null;
  }, [billingMismatch, dayType, eligiblePlans.length, levelId, levelMismatch, selectedBillingType, selectedEnrolments.length]);

  React.useEffect(() => {
    if (!open) {
      setSelectedIds([]);
      setPlanId("");
      setStartDate(new Date().toISOString().slice(0, 10));
      setSaving(false);
      return;
    }
    if (!eligiblePlans.find((plan) => plan.id === planId)) {
      setPlanId(eligiblePlans[0]?.id ?? "");
    }
  }, [eligiblePlans, open, planId]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  };

  const handleMerge = async () => {
    if (mergeBlockedReason) {
      toast.error(mergeBlockedReason);
      return;
    }
    if (!planId) {
      toast.error("Select a target enrolment plan.");
      return;
    }

    setSaving(true);
    try {
      const result = await mergeEnrolments({
        enrolmentIds: selectedIds,
        planId,
        startDate: startDate ? `${startDate}T00:00:00` : undefined,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Enrolments merged.");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Unable to merge enrolments.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-3rem)] max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge enrolments</DialogTitle>
          <DialogDescription>
            Combine multiple enrolments into a single enrolment plan. The merge start date ends the existing enrolments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Select enrolments</div>
            <div className="space-y-2">
              {activeEnrolments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active enrolments available.</p>
              ) : (
                activeEnrolments.map((enrolment) => {
                  const templates = resolveTemplates(enrolment);
                  return (
                    <label
                      key={enrolment.id}
                      className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-muted-foreground/50"
                        checked={selectedIds.includes(enrolment.id)}
                        onChange={() => toggleSelection(enrolment.id)}
                      />
                      <div className="space-y-1">
                        <div className="font-medium">{enrolment.plan?.name ?? "Plan"}</div>
                        <div className="text-xs text-muted-foreground">
                          {templates.length} class{templates.length === 1 ? "" : "es"} ·{" "}
                          {enrolment.plan?.billingType === "PER_WEEK" ? "Per week" : "Per class"}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target plan</div>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className="min-w-[220px]">
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  {eligiblePlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mergeBlockedReason ? (
                <p className="text-xs text-destructive">{mergeBlockedReason}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Merge date</div>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleMerge()} disabled={Boolean(mergeBlockedReason) || saving}>
              {saving ? "Merging..." : "Merge enrolments"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
