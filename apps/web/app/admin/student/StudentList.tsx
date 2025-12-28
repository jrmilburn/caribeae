"use client";

import type { Student } from "@prisma/client";
import { format } from "date-fns";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function StudentList({ students }: { students: Student[] }) {
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return students;

    return students.filter((student) => student.name.toLowerCase().includes(q));
  }, [searchTerm, students]);

  const hasQuery = searchTerm.trim().length > 0;

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold">Students</h2>
            <span className="text-xs text-muted-foreground">
              {hasQuery ? `${filtered.length} / ${students.length}` : students.length}
            </span>
          </div>
        </div>

        <div className="relative w-full sm:w-[340px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchTerm("");
            }}
            placeholder="Search students…"
            className={cn("pl-9 pr-10")}
          />

          {hasQuery && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSearchTerm("")}
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Student</TableHead>
              <TableHead className="w-[30%]">Date of birth</TableHead>
              <TableHead className="w-[30%]">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((student) => (
              <TableRow key={student.id} className="cursor-pointer hover:bg-muted/50">
                <TableCell>
                  <Link href={`/admin/student/${student.id}`} className="font-medium hover:underline">
                    {student.name}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(student.dateOfBirth, "dd MMM yyyy")}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(student.createdAt, "dd MMM yyyy")}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-sm text-muted-foreground">
                  No students found{hasQuery ? ` for “${searchTerm.trim()}”` : ""}.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
