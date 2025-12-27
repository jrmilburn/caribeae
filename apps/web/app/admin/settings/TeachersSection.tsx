"use client";

import * as React from "react";
import type { Teacher } from "@prisma/client";
import { Edit, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      await deleteTeacher(teacher.id);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete teacher.";
      window.alert(message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Teachers</h2>
          <p className="text-sm text-muted-foreground">
            Add the teachers that can be assigned to class templates or schedules.
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
          Add teacher
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Teacher directory</CardTitle>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teachers"
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teachers found.</p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((teacher) => (
                    <TableRow key={teacher.id}>
                      <TableCell className="font-medium">{teacher.name}</TableCell>
                      <TableCell>{teacher.position ?? "—"}</TableCell>
                      <TableCell>{teacher.phone ?? "—"}</TableCell>
                      <TableCell>{teacher.email ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditing(teacher);
                              setOpen(true);
                            }}
                            aria-label={`Edit ${teacher.name}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(teacher)}
                            disabled={deletingId === teacher.id}
                            aria-label={`Delete ${teacher.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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
