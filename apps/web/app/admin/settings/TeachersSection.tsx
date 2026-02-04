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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teachers found.</p>
          ) : (
            <div className="">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/5 text-left">Name</TableHead>
                    <TableHead className="w-1/5 text-center">Position</TableHead>
                    <TableHead className="w-1/5 text-center">Phone</TableHead>
                    <TableHead className="w-1/5 text-center">Email</TableHead>
                    <TableHead className="w-1/5 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtered.map((teacher) => (
                    <TableRow key={teacher.id}>
                      <TableCell className="w-1/5 text-left font-medium">
                        {teacher.name}
                      </TableCell>

                      <TableCell className="w-1/5 text-center">
                        {teacher.position ?? "—"}
                      </TableCell>

                      <TableCell className="w-1/5 text-center">
                        {teacher.phone ?? "—"}
                      </TableCell>

                      <TableCell className="w-1/5 text-center">
                        {teacher.email ?? "—"}
                      </TableCell>

                      <TableCell className="w-1/5 text-right">
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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
