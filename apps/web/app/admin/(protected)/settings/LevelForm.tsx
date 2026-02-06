"use client";

import * as React from "react";
import type { Level } from "@prisma/client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createLevel } from "@/server/level/createLevel";
import { updateLevel } from "@/server/level/updateLevel";
import { runMutationWithToast } from "@/lib/toast/mutationToast";

type LevelFormState = {
  name: string;
  levelOrder: string;
  defaultLengthMin: string;
  defaultCapacity: string;
};

export function LevelForm({
  open,
  onOpenChange,
  level,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level: Level | null;
  onSaved: () => void;
}) {
  const mode: "create" | "edit" = level ? "edit" : "create";
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<LevelFormState>({
    name: "",
    levelOrder: "0",
    defaultLengthMin: "30",
    defaultCapacity: "",
  });

  React.useEffect(() => {
    if (!open) return;

    if (level) {
      setForm({
        name: level.name,
        levelOrder: String(level.levelOrder),
        defaultLengthMin: String(level.defaultLengthMin),
        defaultCapacity: String(level.defaultCapacity ?? ""),
      });
    } else {
      setForm({
        name: "",
        levelOrder: "0",
        defaultLengthMin: "30",
        defaultCapacity: "",
      });
    }
    setError(null);
    setSubmitting(false);
  }, [open, level]);

  const canSubmit =
    form.name.trim().length > 0 &&
    form.levelOrder.trim() !== "" &&
    form.defaultLengthMin.trim() !== "" &&
    Number.isFinite(Number(form.levelOrder)) &&
    Number.isFinite(Number(form.defaultLengthMin)) &&
    Number(form.defaultLengthMin) > 0 &&
    (form.defaultCapacity.trim() === "" ||
      (Number.isFinite(Number(form.defaultCapacity)) && Number(form.defaultCapacity) > 0));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      levelOrder: Number(form.levelOrder),
      defaultLengthMin: Number(form.defaultLengthMin),
      defaultCapacity: form.defaultCapacity.trim() === "" ? null : Number(form.defaultCapacity),
    };

    try {
      const result = await runMutationWithToast(
        () => (mode === "edit" && level ? updateLevel(level.id, payload) : createLevel(payload)),
        {
          pending: { title: mode === "edit" ? "Saving level..." : "Creating level..." },
          success: { title: mode === "edit" ? "Level updated" : "Level created" },
          error: (message) => ({
            title: mode === "edit" ? "Unable to update level" : "Unable to create level",
            description: message,
          }),
          onSuccess: () => {
            onSaved();
            onOpenChange(false);
          },
          onError: (message) => setError(message),
        }
      );

      if (!result) return;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New level" : "Edit level"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="level-name">Name</Label>
            <Input
              id="level-name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Beginner"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="level-order">Order</Label>
              <Input
                id="level-order"
                inputMode="numeric"
                value={form.levelOrder}
                onChange={(e) => setForm((prev) => ({ ...prev, levelOrder: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Used to sort levels from lowest to highest.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="level-length">Default length (minutes)</Label>
              <Input
                id="level-length"
                inputMode="numeric"
                value={form.defaultLengthMin}
                onChange={(e) => setForm((prev) => ({ ...prev, defaultLengthMin: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="level-capacity">Default capacity</Label>
            <Input
              id="level-capacity"
              inputMode="numeric"
              value={form.defaultCapacity}
              onChange={(e) => setForm((prev) => ({ ...prev, defaultCapacity: e.target.value }))}
              placeholder="Optional"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank if capacity varies by class.
            </p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Saving..." : mode === "create" ? "Create level" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
