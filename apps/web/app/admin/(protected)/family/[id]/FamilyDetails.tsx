"use client";

import * as React from "react";
import type { Family } from "@prisma/client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateFamily } from "@/server/family/updateFamily";
import { cn } from "@/lib/utils";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { useRouter } from "next/navigation";
import { SmartPhoneInput } from "@/components/SmartPhoneInput";
import { normalizeAuMobileToE164 } from "@/server/phone/auMobile";


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
    address: family.address ?? "",
  });

  const [saving, setSaving] = React.useState(false);
  const [phoneErrors, setPhoneErrors] = React.useState<{ primaryPhone?: string; secondaryPhone?: string }>({});

  const onChange =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const setPhoneError = (key: "primaryPhone" | "secondaryPhone", message?: string) => {
    setPhoneErrors((prev) => ({ ...prev, [key]: message }));
  };

  const normalizePhoneField = (key: "primaryPhone" | "secondaryPhone") => {
    const raw = form[key];
    const trimmed = raw.trim();

    if (!trimmed) {
      setPhoneError(key, undefined);
      return { ok: true, value: "" };
    }

    const normalized = normalizeAuMobileToE164(trimmed);
    if (!normalized) {
      setPhoneError(key, "Enter an AU mobile like 0412 345 678");
      return { ok: false, value: raw };
    }

    setPhoneError(key, undefined);
    if (normalized !== raw) {
      setForm((prev) => ({ ...prev, [key]: normalized }));
    }
    return { ok: true, value: normalized };
  };

  const applyServerPhoneError = (message: string) => {
    if (message.includes("Primary contact phone")) {
      setPhoneError("primaryPhone", message);
      return true;
    }
    if (message.includes("Secondary contact phone")) {
      setPhoneError("secondaryPhone", message);
      return true;
    }
    return false;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const primary = normalizePhoneField("primaryPhone");
    const secondary = normalizePhoneField("secondaryPhone");

    if (!primary.ok || !secondary.ok) return;

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      primaryContactName: form.primaryContactName.trim() || undefined,
      primaryEmail: form.primaryEmail.trim() || undefined,
      primaryPhone: primary.value.trim() || undefined,
      secondaryContactName: form.secondaryContactName.trim() || undefined,
      secondaryEmail: form.secondaryEmail.trim() || undefined,
      secondaryPhone: secondary.value.trim() || undefined,
      medicalContactName: form.medicalContactName.trim() || undefined,
      medicalContactPhone: form.medicalContactPhone.trim() || undefined,
      address: form.address.trim() || undefined,
    };

    try {
      const result = await runMutationWithToast(
        () => updateFamily(payload, family.id),
        {
          pending: { title: "Saving family..." },
          success: { title: "Family updated" },
          error: (message) => ({
            title: "Unable to update family",
            description: message,
          }),
          onSuccess: () => {
            router.refresh();
            onSaved?.();
          },
          onError: (message) => {
            applyServerPhoneError(message);
          },
        }
      );

      if (!result) return;
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
            <SmartPhoneInput
              label="Primary phone"
              hideLabel
              value={form.primaryPhone}
              onChange={(next) => {
                setForm((prev) => ({ ...prev, primaryPhone: next }));
                setPhoneError("primaryPhone", undefined);
              }}
              onBlur={() => normalizePhoneField("primaryPhone")}
              error={phoneErrors.primaryPhone}
            />
          </Field>
          <Field label="Primary email" className="sm:col-span-2">
            <Input value={form.primaryEmail} onChange={onChange("primaryEmail")} placeholder="name@email.com" />
          </Field>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Address</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Street address" className="sm:col-span-2">
              <Input value={form.address} onChange={onChange("address")} placeholder="Street, suburb, state" />
            </Field>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Secondary contact</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={form.secondaryContactName} onChange={onChange("secondaryContactName")} />
            </Field>
            <Field label="Phone">
              <SmartPhoneInput
                label="Secondary phone"
                hideLabel
                value={form.secondaryPhone}
                onChange={(next) => {
                  setForm((prev) => ({ ...prev, secondaryPhone: next }));
                  setPhoneError("secondaryPhone", undefined);
                }}
                onBlur={() => normalizePhoneField("secondaryPhone")}
                error={phoneErrors.secondaryPhone}
              />
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
