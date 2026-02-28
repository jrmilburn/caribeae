"use client";

import * as React from "react";
import type { Teacher } from "@prisma/client";
import { MoreVertical, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

import { deleteTeacher } from "@/server/teacher/deleteTeacher";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { TeacherForm } from "./TeacherForm";

export function TeachersSection({ teachers }: { teachers: Teacher[] }) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Teacher | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const query = search.toLowerCase();
    return teachers.filter((teacher) =>
      [teacher.name, teacher.position ?? "", teacher.email ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [teachers, search]);

  const handleDelete = async (teacher: Teacher) => {
    const ok = window.confirm(`Delete teacher "${teacher.name}"?`);
    if (!ok) return;

    setDeletingId(teacher.id);
    try {
      await runMutationWithToast(
        () => deleteTeacher(teacher.id),
        {
          pending: { title: "Deleting teacher..." },
          success: { title: "Teacher deleted" },
          error: (message) => ({
            title: "Unable to delete teacher",
            description: message,
          }),
          onSuccess: () => router.refresh(),
        }
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="">
      <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Teachers</h2>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add teacher
        </Button>
      </div>

      <Card className="border-l-0! pb-0 shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 px-4">
          <CardTitle className="text-base">Teacher directory</CardTitle>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teachers"
            className="max-w-xs"
          />
        </CardHeader>

        <CardContent className="px-2 py-0">
          <div className="flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:mx-0 sm:overflow-x-visible">
              <div className="inline-block min-w-full py-2 align-middle sm:px-0">
                <table className="relative min-w-full table-fixed divide-y divide-border">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="w-[20%] py-3 pr-3 pl-4 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Name
                      </th>
                      <th
                        scope="col"
                        className="w-[20%] px-3 py-3 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Position
                      </th>
                      <th
                        scope="col"
                        className="w-[20%] px-3 py-3 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Phone
                      </th>
                      <th
                        scope="col"
                        className="w-[20%] px-3 py-3 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Email
                      </th>
                      <th
                        scope="col"
                        className="w-[20%] py-3 pr-4 pl-3 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase sm:pr-0"
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border bg-card">
                    {filtered.map((teacher) => (
                      <tr key={teacher.id} className="transition-colors hover:bg-accent/40">
                        <td className="max-w-0 py-4 pr-3 pl-4 text-left text-sm font-medium text-foreground">
                          <span className="block truncate" title={teacher.name}>
                            {teacher.name}
                          </span>
                        </td>

                        <td className="max-w-0 px-3 py-4 text-center text-sm text-foreground">
                          <span className="block truncate" title={teacher.position ?? "—"}>
                            {teacher.position ?? "—"}
                          </span>
                        </td>

                        <td className="max-w-0 px-3 py-4 text-center text-sm text-foreground">
                          <span className="block truncate" title={teacher.phone ?? "—"}>
                            {teacher.phone ?? "—"}
                          </span>
                        </td>

                        <td className="max-w-0 px-3 py-4 text-center text-sm text-foreground">
                          <span className="block truncate" title={teacher.email ?? "—"}>
                            {teacher.email ?? "—"}
                          </span>
                        </td>

                        <td className="py-4 pr-4 pl-3 text-right text-sm font-medium sm:pr-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditing(teacher);
                                  setOpen(true);
                                }}
                              >
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(teacher)}
                                disabled={deletingId === teacher.id}
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

                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 pr-3 pl-4 text-sm text-muted-foreground">
                          No teachers found.
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

      <TeacherForm
        open={open}
        teacher={editing}
        onSaved={() => router.refresh()}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
      />
    </div>
  );
}
