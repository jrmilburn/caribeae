"use client";

import type { Level } from "@prisma/client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import FamilyListItem from "./FamilyListItem";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { FamilyModal } from "./FamilyModal";
import { CreateFamilySheet } from "./CreateFamilySheet";

import { createFamily } from "@/server/family/createFamily";
import { updateFamily } from "@/server/family/updateFamily";
import { deleteFamily, getFamilyDeletePreview } from "@/server/family/deleteFamily";
import { runMutationWithToast } from "@/lib/toast/mutationToast";

import type { ClientFamilyWithStudents } from "@/server/family/types";
import type { FamilyListEntry } from "@/server/family/listFamilies";
import type { StudentListEntry } from "@/server/student/listStudents";

import { AdminListHeader } from "@/components/admin/AdminListHeader";
import { AdminPagination } from "@/components/admin/AdminPagination";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { buildReturnUrl } from "@/lib/returnContext";

function formatDeleteCount(label: string, count: number) {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function buildDeleteConfirmationMessage(
  familyName: string,
  counts: { students: number; invoices: number; payments: number }
) {
  const entries: string[] = [];
  if (counts.students > 0) entries.push(formatDeleteCount("student", counts.students));
  if (counts.invoices > 0) entries.push(formatDeleteCount("invoice", counts.invoices));
  if (counts.payments > 0) entries.push(formatDeleteCount("payment", counts.payments));

  if (entries.length === 0) {
    return `Delete "${familyName}"?`;
  }

  return [
    `Delete "${familyName}" and all linked records?`,
    "",
    `This will permanently remove: ${entries.join(", ")}.`,
    "This cannot be undone.",
  ].join("\n");
}

export default function FamilyList({
  view,
  families,
  students,
  levels,
  totalCount,
  nextCursor,
  pageSize,
}: {
  view: "families" | "students";
  families: FamilyListEntry[];
  students: StudentListEntry[];
  levels: Level[];
  totalCount: number;
  nextCursor: string | null;
  pageSize: number;
}) {
  const [createFamilySheetOpen, setCreateFamilySheetOpen] = useState(false);
  const [editFamilyModalOpen, setEditFamilyModalOpen] = useState(false);
  const [selected, setSelected] = useState<FamilyListEntry | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [levelFilter, setLevelFilter] = useState("all");

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listUrl = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  const currentLevelId = searchParams.get("levelId") ?? "all";
  const isStudentView = view === "students";

  const hasActiveFilters = useMemo(() => currentLevelId !== "all", [currentLevelId]);

  const openEdit = (family: FamilyListEntry) => {
    setCreateFamilySheetOpen(false);
    setSelected(family);
    setEditFamilyModalOpen(true);
  };

  useEffect(() => {
    if (!editFamilyModalOpen) {
      setSelected(null);
    }
  }, [editFamilyModalOpen]);

  useEffect(() => {
    setLevelFilter(currentLevelId);
  }, [currentLevelId]);

  const handleSave = async (payload: ClientFamilyWithStudents) => {
    if (selected) {
      const update = await updateFamily(payload, selected.id);
      router.refresh();
      return update;
    } else {
      const family = await createFamily(payload);
      router.refresh();
      return family;
    }
  };

  const handleDelete = async (family: FamilyListEntry) => {
    const preview = await getFamilyDeletePreview(family.id);
    if (!preview.success) {
      toast.error("Unable to delete family", {
        description: preview.error,
      });
      return;
    }

    const ok = window.confirm(buildDeleteConfirmationMessage(family.name, preview.linkedCounts));
    if (!ok) return;

    await runMutationWithToast(
      () => deleteFamily(family.id, { confirmed: true }),
      {
        pending: { title: "Deleting family..." },
        success: { title: "Family deleted" },
        error: (message) => ({
          title: "Unable to delete family",
          description: message,
        }),
        onSuccess: () => router.refresh(),
      }
    );
  };

  const applyFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (levelFilter && levelFilter !== "all") {
      params.set("levelId", levelFilter);
    } else {
      params.delete("levelId");
    }
    params.delete("cursor");
    params.delete("cursors");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setLevelFilter("all");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("levelId");
    params.delete("cursor");
    params.delete("cursors");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    setFiltersOpen(false);
  };

  const toggleView = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (isStudentView) {
      params.delete("view");
    } else {
      params.set("view", "students");
    }
    params.delete("cursor");
    params.delete("cursors");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="w-full">
      <AdminListHeader
        title={isStudentView ? "Students" : "Families"}
        totalCount={totalCount}
        searchPlaceholder={isStudentView ? "Search students…" : "Search families…"}
        onNew={() => {
          setEditFamilyModalOpen(false);
          setSelected(null);
          setCreateFamilySheetOpen(true);
        }}
        showNew={!isStudentView}
        showFilters
        onFiltersClick={() => setFiltersOpen(true)}
        sticky
        extraActions={
          <Button variant="outline" size="sm" type="button" onClick={toggleView}>
            {isStudentView ? "View families" : "View students"}
          </Button>
        }
      />

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isStudentView ? "Filter students" : "Filter families"}</DialogTitle>
            <DialogDescription>Refine the list by student level.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Level</span>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All levels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  {levels.map((level) => (
                    <SelectItem key={level.id} value={level.id}>
                      {level.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" onClick={clearFilters} disabled={!hasActiveFilters}>
              Clear filters
            </Button>
            <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setFiltersOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={applyFilters}>
                Apply filters
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!isStudentView ? (
        <>
          <CreateFamilySheet
            open={createFamilySheetOpen}
            onOpenChange={setCreateFamilySheetOpen}
            levels={levels}
            onSave={handleSave}
          />
          <FamilyModal
            open={editFamilyModalOpen}
            onOpenChange={setEditFamilyModalOpen}
            family={selected}
            onSave={handleSave}
            levels={levels}
          />
        </>
      ) : null}

      <div className="mt-6 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:mx-0 lg:overflow-x-visible">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-0">
            <table className="relative min-w-full table-fixed divide-y divide-border">
              <thead>
                {isStudentView ? (
                  <tr>
                    <th
                      scope="col"
                      className="w-[30%] py-3 pr-3 pl-4 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase sm:pl-0"
                    >
                      Student
                    </th>
                    <th
                      scope="col"
                      className="w-[30%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      Family
                    </th>
                    <th
                      scope="col"
                      className="w-[22%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      Level
                    </th>
                    <th
                      scope="col"
                      className="w-[18%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      Created
                    </th>
                  </tr>
                ) : (
                  <tr>
                    <th
                      scope="col"
                      className="w-[26%] py-3 pr-3 pl-4 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase sm:pl-0"
                    >
                      Family name
                    </th>
                    <th
                      scope="col"
                      className="w-[23%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      Primary contact
                    </th>
                    <th
                      scope="col"
                      className="w-[23%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      Email
                    </th>
                    <th
                      scope="col"
                      className="w-[20%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      Phone
                    </th>
                    <th scope="col" className="w-[8%] py-3 pr-4 pl-3 text-right sm:pr-0">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                )}
              </thead>

              <tbody className="divide-y divide-border bg-card">
                {isStudentView ? (
                  <>
                    {students.map((student) => {
                      const studentUrl = buildReturnUrl(`/admin/student/${student.id}`, listUrl);
                      return (
                        <tr key={student.id} className="transition-colors hover:bg-accent/40">
                          <td className="max-w-0 py-4 pr-3 pl-4 text-sm font-medium text-foreground sm:pl-0">
                            <Link href={studentUrl} className="block truncate hover:underline" title={student.name}>
                              {student.name}
                            </Link>
                          </td>
                          <td className="max-w-0 px-3 py-4 text-sm text-foreground">
                            <span className="block truncate" title={student.family.name ?? "—"}>
                              {student.family.name ?? "—"}
                            </span>
                          </td>
                          <td className="max-w-0 px-3 py-4 text-sm text-foreground">
                            <span className="block truncate" title={student.level?.name ?? "—"}>
                              {student.level?.name ?? "—"}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-sm whitespace-nowrap text-muted-foreground">
                            {format(student.createdAt, "dd MMM yyyy")}
                          </td>
                        </tr>
                      );
                    })}

                    {students.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 pr-3 pl-4 text-sm text-muted-foreground sm:pl-0">
                          No students found.
                        </td>
                      </tr>
                    ) : null}
                  </>
                ) : (
                  <>
                    {families.map((family) => (
                      <FamilyListItem
                        key={family.id}
                        family={family}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        returnTo={listUrl}
                      />
                    ))}

                    {families.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 pr-3 pl-4 text-sm text-muted-foreground sm:pl-0">
                          No families found.
                        </td>
                      </tr>
                    ) : null}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AdminPagination
        totalCount={totalCount}
        pageSize={pageSize}
        currentCount={families.length}
        nextCursor={nextCursor}
      />
    </div>
  );
}
