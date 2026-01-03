"use client";

import * as React from "react";
import type { BillingType, EnrolmentPlan, EnrolmentType, Level } from "@prisma/client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

import { createEnrolmentPlan } from "@/server/enrolmentPlan/createEnrolmentPlan";
import { updateEnrolmentPlan } from "@/server/enrolmentPlan/updateEnrolmentPlan";

type PlanFormState = {
  name: string;
  priceCents: string;
  levelId: string;
  billingType: BillingType;
  enrolmentType: EnrolmentType;
  durationWeeks: string;
  blockClassCount: string;
  sessionsPerWeek: string;
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
  const [form, setForm] = React.useState<PlanFormState>(() => ({
    name: "",
    priceCents: "0",
    levelId: levels[0]?.id ?? "",
    billingType: "PER_CLASS",
    enrolmentType: "BLOCK",
    durationWeeks: "4",
    blockClassCount: "1",
    sessionsPerWeek: "",
  }));

  React.useEffect(() => {
    if (!open) return;
    if (plan) {
      setForm({
        name: plan.name,
        priceCents: String(plan.priceCents),
        levelId: plan.levelId,
        billingType: plan.billingType,
        enrolmentType: plan.enrolmentType,
        durationWeeks: String(plan.durationWeeks ?? ""),
        blockClassCount: String(plan.blockClassCount ?? 1),
        sessionsPerWeek: String(plan.sessionsPerWeek ?? ""),
      });
    } else {
      setForm({
        name: "",
        priceCents: "0",
        levelId: levels[0]?.id ?? "",
        billingType: "PER_CLASS",
        enrolmentType: "BLOCK",
        durationWeeks: "4",
        blockClassCount: "1",
        sessionsPerWeek: "",
      });
    }
    setSubmitting(false);
  }, [open, plan, levels]);

  const requiresDuration = form.billingType === "PER_WEEK";
  const requiresBlockCount = form.billingType === "PER_CLASS";
  const parsedPrice = Number(form.priceCents);
  const parsedDuration = Number(form.durationWeeks);
  const parsedBlockCount = Number(form.blockClassCount);
  const parsedSessionsPerWeek = Number(form.sessionsPerWeek);
  const hasSessionsInput = form.sessionsPerWeek.trim().length > 0;

  const canSubmit =
    form.name.trim().length > 0 &&
    form.levelId &&
    parsedPrice > 0 &&
    Number.isFinite(parsedPrice) &&
    (!requiresDuration || (Number.isFinite(parsedDuration) && parsedDuration > 0)) &&
    (!requiresBlockCount || (Number.isFinite(parsedBlockCount) && parsedBlockCount > 0)) &&
    (!hasSessionsInput || (Number.isFinite(parsedSessionsPerWeek) && parsedSessionsPerWeek > 0));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    const payload = {
      name: form.name.trim(),
      priceCents: Number(form.priceCents),
      levelId: form.levelId,
      billingType: form.billingType,
      enrolmentType: form.enrolmentType,
      durationWeeks: requiresDuration ? parsedDuration : null,
      sessionsPerWeek: hasSessionsInput && parsedSessionsPerWeek > 0 ? parsedSessionsPerWeek : null,
      blockClassCount: form.billingType === "PER_CLASS" ? parsedBlockCount || 1 : null,
    };

    try {
      if (mode === "edit" && plan) {
        await updateEnrolmentPlan(plan.id, payload);
      } else {
        await createEnrolmentPlan(payload);
      }
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New enrolment plan" : "Edit enrolment plan"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
              <p className="text-xs text-muted-foreground">
                Weekly plans require a fixed number of weeks per invoice period.
              </p>
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
              <p className="text-xs text-muted-foreground">
                Set how many class credits are sold together for each invoice. Defaults to one.
              </p>
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
            <p className="text-xs text-muted-foreground">
              Use this to enforce multi-session plans (e.g. 2/week for 4 weeks or 5/week intensive).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Saving..." : mode === "create" ? "Create plan" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
