"use client";

import type { Student } from "@prisma/client";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MoreVerticalIcon, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function StudentList({ students }: { students: Student[] }) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return students;

    return students.filter((student) => student.name.toLowerCase().includes(q));
  }, [searchTerm, students]);

  const hasQuery = searchTerm.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto mt-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-semibold">Students</h2>
                <span className="text-xs text-muted-foreground">
                  {hasQuery ? `${filtered.length} / ${students.length}` : students.length}
                </span>
              </div>
            </div>

            <div className="relative w-full sm:w-[340px]">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

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
                  className="absolute top-1/2 right-1 h-8 w-8 -translate-y-1/2"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:mx-0 sm:overflow-x-visible">
              <div className="inline-block min-w-full py-2 align-middle sm:px-0">
                <table className="relative min-w-full table-fixed divide-y divide-border">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="w-[36%] py-3 pr-3 pl-4 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Student
                      </th>
                      <th
                        scope="col"
                        className="w-[28%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Date of birth
                      </th>
                      <th
                        scope="col"
                        className="w-[28%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Created
                      </th>
                      <th scope="col" className="w-[8%] py-3 pr-4 pl-3 text-right sm:pr-0">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border bg-card">
                    {filtered.map((student) => {
                      const studentUrl = `/admin/student/${student.id}`;
                      const familyUrl = `/admin/family/${student.familyId}`;
                      return (
                        <tr
                          key={student.id}
                          role="link"
                          tabIndex={0}
                          onClick={() => router.push(studentUrl)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              router.push(studentUrl);
                            }
                          }}
                          className="group cursor-pointer transition-colors hover:bg-accent/40"
                        >
                          <td className="max-w-0 py-4 pr-3 pl-4 text-sm font-medium text-foreground">
                            <span className="block truncate" title={student.name}>
                              {student.name}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-sm text-muted-foreground">
                            {student.dateOfBirth ? format(student.dateOfBirth, "dd MMM yyyy") : "—"}
                          </td>
                          <td className="px-3 py-4 text-sm text-muted-foreground">
                            {format(student.createdAt, "dd MMM yyyy")}
                          </td>
                          <td className="py-4 pr-4 pl-3 text-right text-sm font-medium whitespace-nowrap sm:pr-0">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Open student actions"
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <MoreVerticalIcon className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <DropdownMenuItem
                                  onSelect={() => {
                                    router.push(studentUrl);
                                  }}
                                >
                                  View student
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => {
                                    router.push(familyUrl);
                                  }}
                                >
                                  Open family
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}

                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 pr-3 pl-4 text-sm text-muted-foreground">
                          No students found{hasQuery ? ` for “${searchTerm.trim()}”` : ""}.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
