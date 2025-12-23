"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { generateClassInstances } from "@/server/classInstance/generateClassInstances";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  templateIds: string[];
  label: string; // for UI, e.g. "Untitled" or "3 templates"

  onSuccess?: () => void;
};

const WEEK_PRESETS = [4, 8, 12] as const;

export function GenerateInstancesModal({
  open,
  onOpenChange,
  templateIds,
  label,
  onSuccess,
}: Props) {
  const [weeks, setWeeks] = React.useState<(typeof WEEK_PRESETS)[number]>(12);
  const [startDate, setStartDate] = React.useState<string>(() => toDateInputValue(new Date()));
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setWeeks(12);
    setStartDate(toDateInputValue(new Date()));
    setSubmitting(false);
    setError("");
  }, [open]);

  const close = () => onOpenChange(false);

  const handleGenerate = async () => {
    setSubmitting(true);
    setError("");

    try {
      const res = await generateClassInstances({
        templateIds,
        startDateIso: new Date(startDate).toISOString(),
        weeks,
      });

      if (!res?.success) {
        setError(res?.message || "Unable to generate instances.");
        return;
      }

      onSuccess?.();
      close();
    } catch (e) {
      console.error(e);
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = templateIds.length === 0 || submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate instances</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-xl border bg-muted/20 p-3 text-sm">
            Generating for <span className="font-semibold">{label}</span>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Range</p>
            <div className="flex flex-wrap gap-2">
              {WEEK_PRESETS.map((w) => (
                <Button
                  key={w}
                  type="button"
                  variant={weeks === w ? "default" : "outline"}
                  onClick={() => setWeeks(w)}
                >
                  Next {w} weeks
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Start date</p>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Instances will be created for matching weekdays within the range.
            </p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleGenerate} disabled={disabled}>
            {submitting ? "Generating..." : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
