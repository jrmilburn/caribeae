"use client";

import * as React from "react";
import type { ClassTemplate, Holiday, Level } from "@prisma/client";
import { MoreVertical, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { HolidayForm } from "../holidays/HolidayForm";
import { deleteHoliday } from "@/server/holiday/deleteHoliday";

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

  const levelMap = React.useMemo(() => new Map(levels.map((level) => [level.id, level])), [levels]);
  const templateMap = React.useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates]
  );

  const onDelete = async (holiday: Holiday) => {
    const ok = window.confirm(`Delete holiday "${holiday.name}"?`);
    if (!ok) return;
    await deleteHoliday(holiday.id);
    router.refresh();
  };

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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Holidays</h2>
          <p className="text-sm text-muted-foreground">
            Manage days off that extend enrolment paid-through dates.
          </p>
        </div>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Holiday list</CardTitle>
        </CardHeader>
        <CardContent>
          {holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground">No holidays yet.</p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Start date</TableHead>
                    <TableHead>End date</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holidays.map((holiday) => (
                    <TableRow key={holiday.id}>
                      <TableCell className="font-medium">{holiday.name}</TableCell>
                      <TableCell>{scopeLabel(holiday)}</TableCell>
                      <TableCell>{fmtDate(holiday.startDate)}</TableCell>
                      <TableCell>{fmtDate(holiday.endDate)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {holiday.note ? holiday.note : "—"}
                      </TableCell>
                      <TableCell className="text-right">
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
                              onClick={() => onDelete(holiday)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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
    </div>
  );
}
