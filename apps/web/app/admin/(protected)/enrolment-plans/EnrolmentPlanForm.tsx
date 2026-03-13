"use client";

import * as React from "react";
import type { BillingType, EnrolmentPlan, EnrolmentType, Level } from "@prisma/client";

import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

import { createEnrolmentPlan } from "@/server/enrolmentPlan/createEnrolmentPlan";
import { updateEnrolmentPlan } from "@/server/enrolmentPlan/updateEnrolmentPlan";
import { runMutationWithToast } from "@/lib/toast/mutationToast";

type PlanFormState = {
  name: string;
  priceCents: string;
  earlyPaymentDiscountBps: string;
  levelId: string;
  billingType: BillingType;
  enrolmentType: EnrolmentType;
  durationWeeks: string;
  blockClassCount: string;
  sessionsPerWeek: string;
  isSaturdayOnly: boolean;
  alternatingWeeks: boolean;
};

const BILLING_OPTIONS: BillingType[] = ["PER_CLASS", "PER_WEEK"];
const ENROLMENT_OPTIONS: EnrolmentType[] = ["BLOCK", "CLASS"];

export function EnrolmentPlanForm({
  open,
  onOpenChange,
  plan,
  levels,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: (EnrolmentPlan & { level: Level }) | null;
  levels: Level[];
  onSaved?: () => void;
}) {
  const mode: "create" | "edit" = plan ? "edit" : "create";
  const [submitting, setSubmitting] = React.useState(false);
  const saturdayOnlyFieldId = React.useId();
  const alternatingWeeksFieldId = React.useId();
  const [form, setForm] = React.useState<PlanFormState>(() => ({
    name: "",
    priceCents: "0",
    earlyPaymentDiscountBps: "0",
    levelId: levels[0]?.id ?? "",
    billingType: "PER_CLASS",
    enrolmentType: "BLOCK",
    durationWeeks: "4",
    blockClassCount: "1",
    sessionsPerWeek: "",
    isSaturdayOnly: false,
    alternatingWeeks: false,
  }));

  React.useEffect(() => {
    if (!open) return;
    if (plan) {
      setForm({
        name: plan.name,
        priceCents: String(plan.priceCents),
        earlyPaymentDiscountBps: String(plan.earlyPaymentDiscountBps ?? 0),
        levelId: plan.levelId,
        billingType: plan.billingType,
        enrolmentType: plan.enrolmentType,
        durationWeeks: String(plan.durationWeeks ?? ""),
        blockClassCount: String(plan.blockClassCount ?? 1),
        sessionsPerWeek: String(plan.sessionsPerWeek ?? ""),
        isSaturdayOnly: Boolean(plan.isSaturdayOnly),
        alternatingWeeks: Boolean(plan.alternatingWeeks),
      });
    } else {
      setForm({
        name: "",
        priceCents: "0",
        earlyPaymentDiscountBps: "0",
        levelId: levels[0]?.id ?? "",
        billingType: "PER_CLASS",
        enrolmentType: "BLOCK",
        durationWeeks: "4",
        blockClassCount: "1",
        sessionsPerWeek: "",
        isSaturdayOnly: false,
        alternatingWeeks: false,
      });
    }
    setSubmitting(false);
  }, [open, plan, levels]);

  const requiresDuration = form.billingType === "PER_WEEK";
  const requiresBlockCount = form.billingType === "PER_CLASS";
  const parsedPrice = Number(form.priceCents);
  const parsedEarlyPaymentDiscountBps = Number(form.earlyPaymentDiscountBps);
  const parsedDuration = Number(form.durationWeeks);
  const parsedBlockCount = Number(form.blockClassCount);
  const parsedSessionsPerWeek = Number(form.sessionsPerWeek);
  const hasSessionsInput = form.sessionsPerWeek.trim().length > 0;

  const canSubmit =
    form.name.trim().length > 0 &&
    form.levelId &&
    parsedPrice > 0 &&
    Number.isFinite(parsedPrice) &&
    Number.isFinite(parsedEarlyPaymentDiscountBps) &&
    parsedEarlyPaymentDiscountBps >= 0 &&
    parsedEarlyPaymentDiscountBps <= 10000 &&
    (!requiresDuration || (Number.isFinite(parsedDuration) && parsedDuration > 0)) &&
    (!requiresBlockCount || (Number.isFinite(parsedBlockCount) && parsedBlockCount > 0)) &&
    (!hasSessionsInput || (Number.isFinite(parsedSessionsPerWeek) && parsedSessionsPerWeek > 0));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    const payload = {
      name: form.name.trim(),
      priceCents: Number(form.priceCents),
      earlyPaymentDiscountBps: parsedEarlyPaymentDiscountBps,
      levelId: form.levelId,
      billingType: form.billingType,
      enrolmentType: form.enrolmentType,
      durationWeeks: requiresDuration ? parsedDuration : null,
      sessionsPerWeek: hasSessionsInput && parsedSessionsPerWeek > 0 ? parsedSessionsPerWeek : null,
      blockClassCount: form.billingType === "PER_CLASS" ? parsedBlockCount || 1 : null,
      isSaturdayOnly: form.isSaturdayOnly,
      alternatingWeeks: form.alternatingWeeks,
    };

    try {
      const result = await runMutationWithToast(
        () => (mode === "edit" && plan ? updateEnrolmentPlan(plan.id, payload) : createEnrolmentPlan(payload)),
        {
          pending: { title: mode === "edit" ? "Saving enrolment plan..." : "Creating enrolment plan..." },
          success: { title: mode === "edit" ? "Enrolment plan updated" : "Enrolment plan created" },
          error: (message) => ({
            title: mode === "edit" ? "Unable to update enrolment plan" : "Unable to create enrolment plan",
            description: message,
          }),
          onSuccess: () => {
            onSaved?.();
            onOpenChange(false);
          },
        }
      );
      if (!result) return;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>{mode === "create" ? "New enrolment plan" : "Edit enrolment plan"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Weekly 1x lesson"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Level</Label>
              <Select
                value={form.levelId}
                onValueChange={(v) => setForm((p) => ({ ...p, levelId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((level) => (
                    <SelectItem key={level.id} value={level.id}>
                      {level.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Price (cents)</Label>
              <Input
                inputMode="numeric"
                value={form.priceCents}
                onChange={(e) => setForm((p) => ({ ...p, priceCents: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Early payment discount (basis points)</Label>
            <Input
              inputMode="numeric"
              min="0"
              max="10000"
              value={form.earlyPaymentDiscountBps}
              onChange={(e) => setForm((p) => ({ ...p, earlyPaymentDiscountBps: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">0 to 10000. Example: 500 = 5%, 1000 = 10%.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Billing type</Label>
              <Select
                value={form.billingType}
                onValueChange={(v) => setForm((p) => ({ ...p, billingType: v as BillingType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "PER_CLASS"
                        ? "Per class"
                        : option === "PER_WEEK"
                          ? "Per week"
                          : "Block"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Enrolment type</Label>
              <Select
                value={form.enrolmentType}
                onValueChange={(v) => setForm((p) => ({ ...p, enrolmentType: v as EnrolmentType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENROLMENT_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "BLOCK" ? "Block" : "Single"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.billingType === "PER_WEEK" ? (
            <div className="space-y-2">
              <Label>Duration (weeks)</Label>
              <Input
                inputMode="numeric"
                value={form.durationWeeks}
                onChange={(e) => setForm((p) => ({ ...p, durationWeeks: e.target.value }))}
              />
            </div>
          ) : null}

          {form.billingType === "PER_CLASS" ? (
            <div className="space-y-2">
              <Label>Classes per purchase</Label>
              <Input
                inputMode="numeric"
                value={form.blockClassCount}
                onChange={(e) => setForm((p) => ({ ...p, blockClassCount: e.target.value }))}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Sessions per week (optional)</Label>
            <Input
              inputMode="numeric"
              value={form.sessionsPerWeek}
              onChange={(e) => setForm((p) => ({ ...p, sessionsPerWeek: e.target.value }))}
              placeholder="Leave blank for single-session plans"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-md border px-3 py-3">
              <Checkbox
                id={saturdayOnlyFieldId}
                className="mt-0.5"
                checked={form.isSaturdayOnly}
                onCheckedChange={(checked) =>
                  setForm((p) => ({ ...p, isSaturdayOnly: Boolean(checked) }))
                }
              />
              <Label htmlFor={saturdayOnlyFieldId} className="leading-5">
                Saturday-only plan
              </Label>
            </div>

            <div className="flex items-start gap-3 rounded-md border px-3 py-3">
              <Checkbox
                id={alternatingWeeksFieldId}
                className="mt-0.5"
                checked={form.alternatingWeeks}
                onCheckedChange={(checked) =>
                  setForm((p) => ({ ...p, alternatingWeeks: Boolean(checked) }))
                }
              />
              <Label htmlFor={alternatingWeeksFieldId} className="leading-5">
                Alternating weeks
              </Label>
            </div>
          </div>
        </div>

        <SheetFooter className="border-t px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Saving..." : mode === "create" ? "Create plan" : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
