"use client";

import * as React from "react";
import type { Family } from "@prisma/client";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SmartPhoneInput } from "@/components/SmartPhoneInput";
import { normalizeAuMobileToE164 } from "@/server/phone/auMobile";
import { updateFamily } from "@/server/family/updateFamily";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { cn } from "@/lib/utils";

type Props = {
  family: Family;
  layout?: "section" | "plain";
  onSaved?: () => void;
  className?: string;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </div>
  );
}

function FieldGroup({
  label,
  description,
  children,
  className,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

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
    (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: event.target.value }));

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

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

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
      const result = await runMutationWithToast(() => updateFamily(payload, family.id), {
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
      });

      if (!result) return;
    } finally {
      setSaving(false);
    }
  };

  const wrapperClass = cn(layout === "plain" ? "space-y-6" : "space-y-6", className);

  return (
    <section className={wrapperClass}>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Family details</h2>
        <p className="text-sm text-muted-foreground">
          Update family account information, contacts, and emergency details.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-xl border border-border/80 bg-background p-4">
          <div className="space-y-4">
            <SectionTitle>Family information</SectionTitle>
            <FieldGroup label="Family name" description="Used throughout billing and student records.">
              <Input value={form.name} onChange={onChange("name")} />
            </FieldGroup>
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-background p-4">
          <div className="space-y-4">
            <SectionTitle>Primary contact</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldGroup label="Primary contact" description="Main contact for the family account.">
                <Input
                  value={form.primaryContactName}
                  onChange={onChange("primaryContactName")}
                  placeholder="Full name"
                />
              </FieldGroup>
              <FieldGroup label="Primary phone" description="AU mobile preferred.">
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
              </FieldGroup>
              <FieldGroup label="Primary email" className="md:col-span-2">
                <Input
                  value={form.primaryEmail}
                  onChange={onChange("primaryEmail")}
                  placeholder="name@email.com"
                />
              </FieldGroup>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-background p-4">
          <div className="space-y-4">
            <SectionTitle>Address</SectionTitle>
            <FieldGroup label="Address" description="Street, suburb, state, and postcode if needed.">
              <Textarea
                value={form.address}
                onChange={onChange("address")}
                placeholder="Street, suburb, state"
                className="min-h-24 resize-y"
              />
            </FieldGroup>
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-background p-4">
          <div className="space-y-4">
            <SectionTitle>Secondary contact</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldGroup label="Secondary contact">
                <Input value={form.secondaryContactName} onChange={onChange("secondaryContactName")} />
              </FieldGroup>
              <FieldGroup label="Secondary phone" description="AU mobile preferred.">
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
              </FieldGroup>
              <FieldGroup label="Secondary email" className="md:col-span-2">
                <Input value={form.secondaryEmail} onChange={onChange("secondaryEmail")} />
              </FieldGroup>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-background p-4">
          <div className="space-y-4">
            <SectionTitle>Medical contact</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldGroup label="Medical contact" description="Used for emergencies or urgent health follow-up.">
                <Input value={form.medicalContactName} onChange={onChange("medicalContactName")} />
              </FieldGroup>
              <FieldGroup label="Medical phone">
                <Input value={form.medicalContactPhone} onChange={onChange("medicalContactPhone")} />
              </FieldGroup>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </section>
  );
}
