"use client";

import * as React from "react";
import type { Level, Skill } from "@prisma/client";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { createSkill } from "@/server/skill/createSkill";
import { updateSkill } from "@/server/skill/updateSkill";
import { runMutationWithToast } from "@/lib/toast/mutationToast";

type SkillWithLevel = Skill & {
  level: Pick<Level, "id" | "name" | "levelOrder">;
};

type SkillFormState = {
  name: string;
  levelId: string;
  description: string;
  sortOrder: string;
  active: boolean;
};

export function SkillForm({
  open,
  onOpenChange,
  skill,
  levels,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: SkillWithLevel | null;
  levels: Level[];
  onSaved: () => void;
}) {
  const mode: "create" | "edit" = skill ? "edit" : "create";
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<SkillFormState>({
    name: "",
    levelId: levels[0]?.id ?? "",
    description: "",
    sortOrder: "0",
    active: true,
  });

  React.useEffect(() => {
    if (!open) return;

    if (skill) {
      setForm({
        name: skill.name,
        levelId: skill.levelId,
        description: skill.description ?? "",
        sortOrder: String(skill.sortOrder),
        active: skill.active,
      });
    } else {
      setForm({
        name: "",
        levelId: levels[0]?.id ?? "",
        description: "",
        sortOrder: "0",
        active: true,
      });
    }

    setError(null);
    setSubmitting(false);
  }, [open, skill, levels]);

  const canSubmit =
    form.name.trim().length > 0 &&
    form.levelId.trim().length > 0 &&
    Number.isFinite(Number(form.sortOrder));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      levelId: form.levelId,
      description: form.description.trim() || null,
      sortOrder: Number(form.sortOrder),
      active: form.active,
    };

    try {
      await runMutationWithToast(
        () => (mode === "edit" && skill ? updateSkill(skill.id, payload) : createSkill(payload)),
        {
          pending: { title: mode === "edit" ? "Saving skill..." : "Creating skill..." },
          success: { title: mode === "edit" ? "Skill updated" : "Skill created" },
          error: (message) => ({
            title: mode === "edit" ? "Unable to update skill" : "Unable to create skill",
            description: message,
          }),
          onSuccess: () => {
            onSaved();
            onOpenChange(false);
          },
          onError: (message) => setError(message),
        }
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New skill" : "Edit skill"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="skill-name">Name</Label>
            <Input
              id="skill-name"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  name: event.target.value,
                }))
              }
              placeholder="e.g. Streamline kick"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="skill-level">Level</Label>
              <select
                id="skill-level"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.levelId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    levelId: event.target.value,
                  }))
                }
              >
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="skill-order">Sort order</Label>
              <Input
                id="skill-order"
                inputMode="numeric"
                value={form.sortOrder}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    sortOrder: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="skill-description">Description</Label>
            <Textarea
              id="skill-description"
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
              placeholder="Optional note for teachers"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Only active skills appear in teacher checklists.</p>
            </div>
            <Switch
              checked={form.active}
              onCheckedChange={(checked) =>
                setForm((prev) => ({
                  ...prev,
                  active: checked,
                }))
              }
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Saving..." : mode === "create" ? "Create skill" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
