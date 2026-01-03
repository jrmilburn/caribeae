"use client";

import * as React from "react";
import type { Family } from "@prisma/client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateFamily } from "@/server/family/updateFamily";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRouter } from "next/navigation";


type Props = {
  family: Family;
  layout?: "section" | "plain";
  onSaved?: () => void;
  className?: string;
};

export default function FamilyDetails({ family, layout = "section", onSaved, className }: Props) {
  const router = useRouter();

  const [form, setForm] = React.useState({
    name: family.name,
    primaryContactName: family.primaryContactName ?? "",
    primaryEmail: family.primaryEmail ?? "",
    primaryPhone: family.primaryPhone ?? "",
    secondaryContactName: family.secondaryContactName ?? "",
    secondaryEmail: family.secondaryEmail ?? "",
    secondaryPhone: family.secondaryPhone ?? "",
    medicalContactName: family.medicalContactName ?? "",
    medicalContactPhone: family.medicalContactPhone ?? "",
  });

  const [saving, setSaving] = React.useState(false);

  const onChange =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        primaryContactName: form.primaryContactName.trim() || undefined,
        primaryEmail: form.primaryEmail.trim() || undefined,
        primaryPhone: form.primaryPhone.trim() || undefined,
        secondaryContactName: form.secondaryContactName.trim() || undefined,
        secondaryEmail: form.secondaryEmail.trim() || undefined,
        secondaryPhone: form.secondaryPhone.trim() || undefined,
        medicalContactName: form.medicalContactName.trim() || undefined,
        medicalContactPhone: form.medicalContactPhone.trim() || undefined,
      };

      await updateFamily(payload, family.id);
      toast.success("Family updated.");
      router.refresh();
      onSaved?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update family.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const Wrapper: React.ElementType = layout === "section" ? "section" : "div";
  const wrapperClass = cn(
    layout === "section"
      ? "md:col-span-3 border-t border-b bg-background p-5"
      : "space-y-6 rounded-lg border bg-muted/30 p-4",
    className
  );

  return (
    <Wrapper className={wrapperClass}>
      <div className="mb-4">
        <h2 className="text-base font-semibold">Family information</h2>
        <p className="text-sm text-muted-foreground">Update contacts and emergency info.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Field label="Family name">
          <Input value={form.name} onChange={onChange("name")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary contact">
            <Input
              value={form.primaryContactName}
              onChange={onChange("primaryContactName")}
              placeholder="Full name"
            />
          </Field>
          <Field label="Primary phone">
            <Input value={form.primaryPhone} onChange={onChange("primaryPhone")} placeholder="04xx xxx xxx" />
          </Field>
          <Field label="Primary email" className="sm:col-span-2">
            <Input value={form.primaryEmail} onChange={onChange("primaryEmail")} placeholder="name@email.com" />
          </Field>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Secondary contact</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={form.secondaryContactName} onChange={onChange("secondaryContactName")} />
            </Field>
            <Field label="Phone">
              <Input value={form.secondaryPhone} onChange={onChange("secondaryPhone")} />
            </Field>
            <Field label="Email" className="sm:col-span-2">
              <Input value={form.secondaryEmail} onChange={onChange("secondaryEmail")} />
            </Field>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Medical contact</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={form.medicalContactName} onChange={onChange("medicalContactName")} />
            </Field>
            <Field label="Phone">
              <Input value={form.medicalContactPhone} onChange={onChange("medicalContactPhone")} />
            </Field>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </Wrapper>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
