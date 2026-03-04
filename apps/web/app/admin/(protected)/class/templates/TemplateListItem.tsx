"use client";

import { Pencil, Trash2, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useRouter } from "next/navigation";

import type { TemplateWithLevel } from "./TemplateList";

export default function TemplateListItem({
  template,
  onEdit,
  onDelete,
}: {
  template: TemplateWithLevel;
  onEdit: (template: TemplateWithLevel) => void;
  onDelete: (template: TemplateWithLevel) => void;
}) {
  const name = template.name?.trim() || "Untitled";

  const router = useRouter();

  const level = template.level?.name ?? "—";
  const teacherName = template.teacher?.name?.trim() || "Teacher TBD";

  return (
    <li className="col-span-1 divide-y divide-border rounded-lg bg-card shadow-sm">
      <button
        type="button"
        onClick={() => {
          router.push(`/admin/class/${template.id}`);
        }}
        className="flex w-full items-center justify-between gap-4 rounded-t-lg p-6 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{name}</h3>

          <p className="mt-1 truncate text-sm text-muted-foreground">{level}</p>
          <p className="mt-1 truncate text-sm text-muted-foreground">{teacherName}</p>
          {!template.active ? <p className="mt-2 text-xs font-medium text-muted-foreground">Inactive</p> : null}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted ring-1 ring-border">
            <UserRound className="size-6 text-muted-foreground" />
          </div>
        </div>
      </button>

      <div>
        <div className="-mt-px flex divide-x divide-border">
          <div className="flex w-0 flex-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onEdit(template)}
              className="relative -mr-px inline-flex h-auto w-full flex-1 items-center justify-center gap-x-2 rounded-none rounded-bl-lg border border-transparent py-4 text-sm font-semibold text-foreground"
            >
              <Pencil className="size-4 text-muted-foreground" />
              Edit
            </Button>
          </div>
          <div className="-ml-px flex w-0 flex-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onDelete(template)}
              className="relative inline-flex h-auto w-full flex-1 items-center justify-center gap-x-2 rounded-none rounded-br-lg border border-transparent py-4 text-sm font-semibold text-destructive"
            >
              <Trash2 className="size-4 text-destructive/80" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
