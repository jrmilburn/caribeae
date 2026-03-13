"use client";

import * as React from "react";
import type { ClassTemplate, Holiday, Level } from "@prisma/client";
import { MoreVertical, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { HolidayForm } from "../holidays/HolidayForm";
import { DeleteHolidayDialog } from "../holidays/DeleteHolidayDialog";

export function HolidaysSection({
  holidays,
  levels,
  templates,
}: {
  holidays: Holiday[];
  levels: Level[];
  templates: Array<ClassTemplate & { level?: Level | null }>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Holiday | null>(null);
  const [deleting, setDeleting] = React.useState<Holiday | null>(null);

  const levelMap = React.useMemo(() => new Map(levels.map((level) => [level.id, level])), [levels]);
  const templateMap = React.useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates]
  );

  const fmtDate = (value: Date) => format(value, "MMM d, yyyy");
  const scopeLabel = (holiday: Holiday) => {
    if (holiday.templateId) {
      const template = templateMap.get(holiday.templateId);
      return template?.name ? `Class: ${template.name}` : "Specific class";
    }
    if (holiday.levelId) {
      const level = levelMap.get(holiday.levelId);
      return level?.name ? `Level: ${level.name}` : "Specific level";
    }
    return "All business";
  };

  return (
    <div className="">
      <div className="p-4 sm:flex sm:items-start sm:justify-between">
        <div className="sm:flex-auto">
          <h2 className="text-lg font-semibold">Holidays</h2>
          <p className="text-sm text-muted-foreground">
            Manage days off that extend enrolment paid-through dates.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New holiday
          </Button>
        </div>
      </div>

      <Card className="border-x-0! pb-0 shadow-none">
        <CardContent className="px-2 py-0">
          <div className="flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:mx-0 sm:overflow-x-visible">
              <div className="inline-block min-w-full py-2 align-middle sm:px-0">
                <table className="relative min-w-full table-fixed divide-y divide-border">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="w-[18%] py-3 pr-3 pl-4 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Name
                      </th>
                      <th
                        scope="col"
                        className="w-[20%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Scope
                      </th>
                      <th
                        scope="col"
                        className="w-[14%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Start date
                      </th>
                      <th
                        scope="col"
                        className="w-[14%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        End date
                      </th>
                      <th
                        scope="col"
                        className="w-[24%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Note
                      </th>
                      <th
                        scope="col"
                        className="w-[10%] py-3 pr-4 pl-3 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase sm:pr-0"
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border bg-card">
                    {holidays.map((holiday) => (
                      <tr key={holiday.id} className="transition-colors hover:bg-accent/40">
                        <td className="max-w-0 py-4 pr-3 pl-4 text-sm font-medium text-foreground">
                          <span className="block truncate" title={holiday.name}>
                            {holiday.name}
                          </span>
                        </td>
                        <td className="max-w-0 px-3 py-4 text-sm text-foreground">
                          <span className="block truncate" title={scopeLabel(holiday)}>
                            {scopeLabel(holiday)}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-sm whitespace-nowrap text-foreground">
                          {fmtDate(holiday.startDate)}
                        </td>
                        <td className="px-3 py-4 text-sm whitespace-nowrap text-foreground">
                          {fmtDate(holiday.endDate)}
                        </td>
                        <td className="max-w-0 px-3 py-4 text-sm text-muted-foreground">
                          <span className="block truncate" title={holiday.note ? holiday.note : "—"}>
                            {holiday.note ? holiday.note : "—"}
                          </span>
                        </td>
                        <td className="py-4 pr-4 pl-3 text-right text-sm font-medium whitespace-nowrap sm:pr-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditing(holiday);
                                  setOpen(true);
                                }}
                              >
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleting(holiday)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}

                    {holidays.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 pr-3 pl-4 text-sm text-muted-foreground">
                          No holidays yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <HolidayForm
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
        holiday={editing}
        levels={levels}
        templates={templates}
        onSaved={() => router.refresh()}
      />

      <DeleteHolidayDialog
        holiday={deleting}
        open={Boolean(deleting)}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        onDeleted={() => router.refresh()}
      />
    </div>
  );
}
