"use client";

import { MoreVertical, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

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

  const schedule = formatSchedule(template.dayOfWeek, template.startTime, template.endTime);
  const level = template.level?.name ?? "—";

  const capacity =
    template.capacity !== null && template.capacity !== undefined
      ? String(template.capacity)
      : template.level?.defaultCapacity !== null && template.level?.defaultCapacity !== undefined
      ? `${template.level.defaultCapacity} (default)`
      : "—";

  return (
    <button
      type="button"
      onClick={() => onEdit(template)}
      className="w-full border-b px-4 py-3 text-left transition hover:bg-muted/40"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="truncate text-sm font-medium flex-[1.2]">
          <div className="flex items-center gap-2">
            <span className="truncate">{name}</span>
            {!template.active ? (
              <span className="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                Inactive
              </span>
            ) : null}
          </div>
        </div>

        <div className="truncate text-sm text-muted-foreground flex-1">{schedule}</div>
        <div className="truncate text-sm text-muted-foreground flex-1">{level}</div>
        <div className="truncate text-sm text-muted-foreground flex-1">{capacity}</div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
              aria-label="Template actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEdit(template);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete(template);
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4 text-red" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </button>
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
