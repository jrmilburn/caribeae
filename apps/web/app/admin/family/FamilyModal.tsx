"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClientFamily } from "@/server/family/types";
import type { Family } from "@prisma/client";

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3 sm:items-center">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

type FamilyModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  family?: Family | null;

  onSave: (payload: ClientFamily) => Promise<{ success: boolean }>;
};

export function FamilyModal({ open, onOpenChange, family, onSave }: FamilyModalProps) {
  const mode: "create" | "edit" = family ? "edit" : "create";

  const [form, setForm] = React.useState<ClientFamily>({
    name: "",
    primaryContactName: "",
    primaryEmail: "",
    primaryPhone: "",
    secondaryContactName: "",
    secondaryEmail: "",
    secondaryPhone: "",
    medicalContactName: "",
    medicalContactPhone: "",
  });

  const [submitting, setSubmitting] = React.useState(false);
  const [touched, setTouched] = React.useState<{ name?: boolean }>({});

  // Prefill when opening in edit mode
  React.useEffect(() => {
    if (!open) return;

    if (family) {
      setForm({
        name: family.name ?? "",
        primaryContactName: family.primaryContactName ?? "",
        primaryEmail: family.primaryEmail ?? "",
        primaryPhone: family.primaryPhone ?? "",
        secondaryContactName: family.secondaryContactName ?? "",
        secondaryEmail: family.secondaryEmail ?? "",
        secondaryPhone: family.secondaryPhone ?? "",
        medicalContactName: family.medicalContactName ?? "",
        medicalContactPhone: family.medicalContactPhone ?? "",
      });
    } else {
      setForm({
        name: "",
        primaryContactName: "",
        primaryEmail: "",
        primaryPhone: "",
        secondaryContactName: "",
        secondaryEmail: "",
        secondaryPhone: "",
        medicalContactName: "",
        medicalContactPhone: "",
      });
    }

    setTouched({});
    setSubmitting(false);
  }, [open, family]);

  const close = () => onOpenChange(false);

  const setField = <K extends keyof ClientFamily>(key: K, value: ClientFamily[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const nameError = touched.name && !form.name.trim() ? "Family name is required." : "";

  const buildPayload = (): ClientFamily => {
    const cleaned: ClientFamily = { name: form.name.trim() };

    const optKeys: Array<keyof Omit<ClientFamily, "name">> = [
      "primaryContactName",
      "primaryEmail",
      "primaryPhone",
      "secondaryContactName",
      "secondaryEmail",
      "secondaryPhone",
      "medicalContactName",
      "medicalContactPhone",
    ];

    for (const k of optKeys) {
      const val = form[k];
      if (typeof val === "string" && val.trim().length > 0) {
        (cleaned)[k] = val.trim();
      }
    }

    return cleaned;
  };

  const handleSubmit = async () => {
    setTouched({ name: true });
    if (!form.name.trim()) return;

    try {
      setSubmitting(true);
      const res = await onSave(buildPayload());
      if (res?.success) close();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New family" : "Edit family"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-3">
            <SectionTitle>Family</SectionTitle>
            <FieldRow label="Family name">
              <div className="space-y-1">
                <Input
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  placeholder="e.g. Smith Family"
                  className={cn(nameError && "border-destructive focus-visible:ring-destructive")}
                />
                {nameError ? (
                  <p className="text-xs text-destructive">{nameError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This is what appears in the family list.
                  </p>
                )}
              </div>
            </FieldRow>
          </div>

          <div className="space-y-3">
            <SectionTitle>Primary contact (optional)</SectionTitle>
            <FieldRow label="Name">
              <Input
                value={form.primaryContactName ?? ""}
                onChange={(e) => setField("primaryContactName", e.target.value)}
              />
            </FieldRow>
            <FieldRow label="Email">
              <Input
                value={form.primaryEmail ?? ""}
                onChange={(e) => setField("primaryEmail", e.target.value)}
              />
            </FieldRow>
            <FieldRow label="Phone">
              <Input
                value={form.primaryPhone ?? ""}
                onChange={(e) => setField("primaryPhone", e.target.value)}
              />
            </FieldRow>
          </div>

          <div className="space-y-3">
            <SectionTitle>Secondary contact (optional)</SectionTitle>
            <FieldRow label="Name">
              <Input
                value={form.secondaryContactName ?? ""}
                onChange={(e) => setField("secondaryContactName", e.target.value)}
              />
            </FieldRow>
            <FieldRow label="Email">
              <Input
                value={form.secondaryEmail ?? ""}
                onChange={(e) => setField("secondaryEmail", e.target.value)}
              />
            </FieldRow>
            <FieldRow label="Phone">
              <Input
                value={form.secondaryPhone ?? ""}
                onChange={(e) => setField("secondaryPhone", e.target.value)}
              />
            </FieldRow>
          </div>

          <div className="space-y-3">
            <SectionTitle>Medical contact (optional)</SectionTitle>
            <FieldRow label="Name">
              <Input
                value={form.medicalContactName ?? ""}
                onChange={(e) => setField("medicalContactName", e.target.value)}
              />
            </FieldRow>
            <FieldRow label="Phone">
              <Input
                value={form.medicalContactPhone ?? ""}
                onChange={(e) => setField("medicalContactPhone", e.target.value)}
              />
            </FieldRow>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting || !form.name.trim()}>
            {submitting ? (mode === "create" ? "Creating…" : "Saving…") : (mode === "create" ? "Create family" : "Save changes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
