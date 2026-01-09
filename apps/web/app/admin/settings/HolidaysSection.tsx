"use client";

import * as React from "react";
import type { Holiday } from "@prisma/client";
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

import { deleteHoliday } from "@/server/holiday/deleteHoliday";
import { HolidayForm } from "../holidays/HolidayForm";

export function HolidaysSection({ holidays }: { holidays: Holiday[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Holiday | null>(null);

  const onDelete = async (holiday: Holiday) => {
    const ok = window.confirm(`Delete holiday "${holiday.name}"?`);
    if (!ok) return;
    await deleteHoliday(holiday.id);
    router.refresh();
  };

  const fmtDate = (value: Date) => format(value, "MMM d, yyyy");

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Holidays</h2>
          <p className="text-sm text-muted-foreground">
            Days off that extend enrolment paid-through dates.
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
          Add holiday
        </Button>
      </div>

      <Card className="border-l-0! shadow-none pb-0">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 px-4">
          <CardTitle className="text-base">Holiday list</CardTitle>
        </CardHeader>
        <CardContent className="px-2 py-0">
          {holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground">No holidays yet.</p>
          ) : (
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
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
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
