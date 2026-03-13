"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type PaidThroughDateUpdateMode = "recalculate" | "keep";

export function HolidayPaidThroughDateChoice({
  mutation,
  value,
  onValueChange,
}: {
  mutation: "create" | "delete";
  value: PaidThroughDateUpdateMode;
  onValueChange: (value: PaidThroughDateUpdateMode) => void;
}) {
  const contextLabel = mutation === "create" ? "added" : "removed";
  const keepDescription =
    mutation === "create"
      ? "Save the holiday but keep current paid-through dates exactly as they are."
      : "Remove the holiday but keep current paid-through dates exactly as they are.";

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">Paid-through dates</p>
        <p className="text-sm text-muted-foreground">
          Choose what happens to existing enrolment coverage after this holiday is {contextLabel}.
        </p>
      </div>

      <div className="grid gap-3" role="radiogroup" aria-label="Paid-through date handling">
        <ChoiceCard
          checked={value === "recalculate"}
          title="Recalculate now"
          description="Run the current holiday coverage logic for affected active enrolments."
          onClick={() => onValueChange("recalculate")}
        />
        <ChoiceCard
          checked={value === "keep"}
          title="Leave unchanged"
          description={keepDescription}
          onClick={() => onValueChange("keep")}
        />
      </div>
    </div>
  );
}

function ChoiceCard({
  checked,
  title,
  description,
  onClick,
}: {
  checked: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "rounded-2xl border px-4 py-4 text-left transition-colors focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
        checked ? "border-primary bg-primary/8 shadow-sm" : "border-border bg-card hover:bg-accent/30"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <div
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
            checked ? "border-primary bg-primary" : "border-muted-foreground/40 bg-background"
          )}
        >
          <div className={cn("h-2 w-2 rounded-full", checked ? "bg-primary-foreground" : "bg-transparent")} />
        </div>
      </div>
    </button>
  );
}
