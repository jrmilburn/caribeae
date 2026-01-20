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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import { getTeacherPayRates } from "@/server/payRates/getTeacherPayRates";
import { saveTeacherPayRate } from "@/server/payRates/saveTeacherPayRate";
import { deleteTeacherPayRate } from "@/server/payRates/deleteTeacherPayRate";
import { formatCurrencyFromCents } from "@/lib/currency";
import { TeacherForm } from "./TeacherForm";

export function TeachersSection({ teachers }: { teachers: Teacher[] }) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Teacher | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [ratesTeacher, setRatesTeacher] = React.useState<Teacher | null>(null);
  const [ratesOpen, setRatesOpen] = React.useState(false);

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
                              onClick={() => {
                                setRatesTeacher(teacher);
                                setRatesOpen(true);
                              }}
                            >
                              Pay rates
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

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

      <TeacherPayRatesDialog
        teacher={ratesTeacher}
        open={ratesOpen}
        onClose={() => {
          setRatesOpen(false);
          setRatesTeacher(null);
        }}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

type PayRate = Awaited<ReturnType<typeof getTeacherPayRates>>[number];

function TeacherPayRatesDialog({
  teacher,
  open,
  onClose,
  onSaved,
}: {
  teacher: Teacher | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rates, setRates] = React.useState<PayRate[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState({
    effectiveFrom: "",
    effectiveTo: "",
    hourlyRateCents: 0,
  });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!teacher || !open) return;
    setLoading(true);
    getTeacherPayRates({ teacherId: teacher.id })
      .then(setRates)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load rates"))
      .finally(() => setLoading(false));
  }, [teacher, open]);

  const handleSave = async () => {
    if (!teacher) return;
    setLoading(true);
    try {
      await saveTeacherPayRate({
        teacherId: teacher.id,
        hourlyRateCents: Number(form.hourlyRateCents),
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || null,
      });
      const updated = await getTeacherPayRates({ teacherId: teacher.id });
      setRates(updated);
      onSaved();
      setForm({ effectiveFrom: "", effectiveTo: "", hourlyRateCents: 0 });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save rate.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!teacher) return;
    if (!window.confirm("Delete this pay rate?")) return;
    setLoading(true);
    try {
      await deleteTeacherPayRate({ id });
      const updated = await getTeacherPayRates({ teacherId: teacher.id });
      setRates(updated);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete rate.");
    } finally {
      setLoading(false);
    }
  };

  if (!teacher) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pay rates • {teacher.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Hourly rate (cents)</Label>
            <Input
              type="number"
              value={form.hourlyRateCents}
              onChange={(e) => setForm((p) => ({ ...p, hourlyRateCents: Number(e.target.value) }))}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Effective from</Label>
              <Input type="date" value={form.effectiveFrom} onChange={(e) => setForm((p) => ({ ...p, effectiveFrom: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Effective to (optional)</Label>
              <Input type="date" value={form.effectiveTo} onChange={(e) => setForm((p) => ({ ...p, effectiveTo: e.target.value }))} />
            </div>
          </div>
          <Button onClick={handleSave} disabled={loading || !form.effectiveFrom}>
            {loading ? "Saving..." : "Add rate"}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective from</TableHead>
                  <TableHead>Effective to</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No pay rates yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  rates.map((rate) => (
                    <TableRow key={rate.id}>
                      <TableCell>{new Date(rate.effectiveFrom).toLocaleDateString()}</TableCell>
                      <TableCell>{rate.effectiveTo ? new Date(rate.effectiveTo).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrencyFromCents(rate.hourlyRateCents)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(rate.id)} disabled={loading}>
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
