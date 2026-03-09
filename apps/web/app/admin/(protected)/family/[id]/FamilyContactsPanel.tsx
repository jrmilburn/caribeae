"use client";

import { Button } from "@/components/ui/button";

type FamilyContactsPanelProps = {
  contacts: {
    primaryContactName?: string | null;
    primaryPhone?: string | null;
    primaryEmail?: string | null;
    secondaryContactName?: string | null;
    secondaryPhone?: string | null;
    secondaryEmail?: string | null;
    medicalContactName?: string | null;
    medicalContactPhone?: string | null;
    address?: string | null;
  };
  onEdit: () => void;
};

function valueOrFallback(value?: string | null) {
  return value?.trim() ? value.trim() : "Not provided";
}

function ContactGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <section className="rounded-xl border border-border/80 bg-background p-4">
      <div className="mb-4 text-sm font-semibold text-foreground">{title}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className={item.label === "Address" ? "sm:col-span-2" : undefined}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {item.label}
            </div>
            <div className="mt-1 text-sm text-foreground">{item.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FamilyContactsPanel({ contacts, onEdit }: FamilyContactsPanelProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Contacts</h2>
          <p className="text-sm text-muted-foreground">
            Family contact details and emergency information.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onEdit}>
          Edit contacts
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ContactGroup
          title="Primary contact"
          items={[
            { label: "Contact", value: valueOrFallback(contacts.primaryContactName) },
            { label: "Phone", value: valueOrFallback(contacts.primaryPhone) },
            { label: "Email", value: valueOrFallback(contacts.primaryEmail) },
          ]}
        />
        <ContactGroup
          title="Secondary contact"
          items={[
            { label: "Contact", value: valueOrFallback(contacts.secondaryContactName) },
            { label: "Phone", value: valueOrFallback(contacts.secondaryPhone) },
            { label: "Email", value: valueOrFallback(contacts.secondaryEmail) },
          ]}
        />
        <ContactGroup
          title="Medical contact"
          items={[
            { label: "Contact", value: valueOrFallback(contacts.medicalContactName) },
            { label: "Phone", value: valueOrFallback(contacts.medicalContactPhone) },
          ]}
        />
        <ContactGroup
          title="Address"
          items={[{ label: "Address", value: valueOrFallback(contacts.address) }]}
        />
      </div>
    </section>
  );
}
