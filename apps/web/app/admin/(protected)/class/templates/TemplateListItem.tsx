"use client";

import { ExternalLink, MoreVertical, Pencil, Trash2, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useRouter } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

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

  const schedule = formatSchedule(template.dayOfWeek, template.startTime, template.endTime);
  const level = template.level?.name ?? "—";
  const teacherName = template.teacher?.name?.trim() || "Teacher TBD";
  const studentLabel = `${template.studentCount} ${template.studentCount === 1 ? "student" : "students"}`;

  const capacity =
    template.capacity !== null && template.capacity !== undefined
      ? String(template.capacity)
      : template.level?.defaultCapacity !== null && template.level?.defaultCapacity !== undefined
      ? `${template.level.defaultCapacity} (default)`
      : "—";

  return (
    <li className="col-span-1 divide-y divide-border rounded-lg bg-card shadow-sm">
      <button
        type="button"
        onClick={() => onEdit(template)}
        className="flex w-full items-center justify-between gap-4 rounded-t-lg p-6 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{name}</h3>
            {!template.active ? (
              <span className="inline-flex shrink-0 items-center rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                Inactive
              </span>
            ) : null}
          </div>

          <p className="mt-1 truncate text-sm text-muted-foreground">{schedule}</p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Level</dt>
              <dd className="truncate text-sm font-medium text-foreground">{level}</dd>
            </div>

            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Capacity</dt>
              <dd className="truncate text-sm font-medium text-foreground">{capacity}</dd>
            </div>

            <div className="col-span-2 min-w-0">
              <dt className="text-xs text-muted-foreground">Students</dt>
              <dd className="truncate text-sm font-medium text-foreground">{studentLabel}</dd>
            </div>
          </dl>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted ring-1 ring-border">
            <UserRound className="size-6 text-muted-foreground" />
          </div>
          <span className="max-w-24 truncate text-[11px] font-medium text-muted-foreground">{teacherName}</span>
        </div>
      </button>

      <div className="flex items-center justify-end px-2 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label="Template actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onClick={() => {
                router.push(`/admin/class/${template.id}`);
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                onEdit(template);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => {
                onDelete(template);
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function formatSchedule(
  dayOfWeek?: number | null,
  startMin?: number | null,
  endMin?: number | null
) {
  const day = formatDay(dayOfWeek) ?? "—";
  const start = typeof startMin === "number" ? minTo12h(startMin) : "—";
  const end = typeof endMin === "number" ? minTo12h(endMin) : "—";

  if (day === "—" && start === "—" && end === "—") return "—";
  return `${day} ${start}–${end}`;
}

function formatDay(dayOfWeek?: number | null) {
  if (dayOfWeek === null || dayOfWeek === undefined) return null;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days[dayOfWeek] ?? null;
}

function minTo12h(totalMin: number) {
  const h24 = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12raw = h24 % 12;
  const h12 = h12raw === 0 ? 12 : h12raw;

  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
