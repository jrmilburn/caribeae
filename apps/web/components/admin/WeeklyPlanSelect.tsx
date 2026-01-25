"use client";

import * as React from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrencyFromCents } from "@/lib/currency";

export type WeeklyPlanOption = {
  id: string;
  name: string;
  priceCents: number;
  durationWeeks: number | null;
};

type WeeklyPlanSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: WeeklyPlanOption[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
};

function formatWeeks(weeks: number | null) {
  if (!weeks || weeks <= 0) return "Custom";
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}

export function WeeklyPlanSelect({
  value,
  onValueChange,
  options,
  label = "Plan",
  placeholder = "Select plan",
  disabled,
}: WeeklyPlanSelectProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name} · {formatWeeks(option.durationWeeks)} · {formatCurrencyFromCents(option.priceCents)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
