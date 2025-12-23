"use client";

import * as React from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import type { InstanceWithLevelAndTemplate } from "./ClassList";

export default function ClassListItem({
  instance,
  checked,
  onCheckedChange,
  onEdit,
  onDelete,
}: {
  instance: InstanceWithLevelAndTemplate;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;

  onEdit: (instance: InstanceWithLevelAndTemplate) => void;
  onDelete: (instance: InstanceWithLevelAndTemplate) => void;
}) {
  const name = instance.template?.name?.trim() || "Manual class";
  const when = `${format(instance.startTime, "EEE dd MMM")} • ${format(
    instance.startTime,
    "h:mm a"
  )}–${format(instance.endTime, "h:mm a")}`;

  const level = instance.level?.name ?? "—";

  const capacity = formatCapacityFromInstance(instance);
  const status = instance.status?.trim() || "—";

  return (
    <button
      type="button"
      onClick={() => onEdit(instance)}
      className="w-full border-b px-4 py-3 text-left transition hover:bg-muted/40"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex w-10 items-center justify-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Select ${name}`}
            className="h-4 w-4"
          />
        </div>

        <div className="truncate text-sm font-medium flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate">{name}</span>
            {instance.templateId ? (
              <span className="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                From template
              </span>
            ) : null}
          </div>
        </div>

        <div className="truncate text-sm text-muted-foreground flex-1">{when}</div>
        <div className="truncate text-sm text-muted-foreground flex-1">{level}</div>
        <div className="truncate text-sm text-muted-foreground flex-1">{capacity}</div>

        <div className="truncate text-sm text-muted-foreground w-[120px]">{status}</div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
              aria-label="Class actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEdit(instance);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete(instance);
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </button>
  );
}

function formatCapacityFromInstance(instance: InstanceWithLevelAndTemplate) {
  // Priority: instance.capacity -> template.capacity -> level.defaultCapacity -> "—"
  if (instance.capacity !== null && instance.capacity !== undefined) return String(instance.capacity);

  const tCap = instance.template?.capacity;
  if (tCap !== null && tCap !== undefined) return `${tCap} (template)`;

  const lCap = instance.level?.defaultCapacity;
  if (lCap !== null && lCap !== undefined) return `${lCap} (default)`;

  return "—";
}
