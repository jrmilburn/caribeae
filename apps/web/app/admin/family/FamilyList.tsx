"use client";

import type { Level } from "@prisma/client";
import { useEffect, useMemo, useState } from "react";
import { MoreVerticalIcon } from "lucide-react";

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

import { createFamily } from "@/server/family/createFamily";
import { updateFamily } from "@/server/family/updateFamily";
import { deleteFamily } from "@/server/family/deleteFamily";
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
  const [newFamilyModal, setNewFamilyModal] = useState(false);
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
    setSelected(family);
    setNewFamilyModal(true);
  };

  useEffect(() => {
    if (!newFamilyModal) {
      setSelected(null);
    }
  }, [newFamilyModal]);

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
    const ok = window.confirm(`Delete "${family.name}"?`);
    if (!ok) return;
    await runMutationWithToast(
      () => deleteFamily(family.id),
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
          setSelected(null);
          setNewFamilyModal(true);
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
        <FamilyModal
          open={newFamilyModal}
          onOpenChange={setNewFamilyModal}
          family={selected}
          onSave={handleSave}
          levels={levels}
        />
      ) : null}

      <div className="">
        {isStudentView ? (
          <>
            <div className="flex h-14 w-full items-center justify-between border-t border-b border-border bg-card px-4 text-sm font-medium text-muted-foreground">
              <div className="truncate flex-1">Student</div>
              <div className="truncate flex-1">Family</div>
              <div className="truncate flex-1">Level</div>
              <div className="truncate flex-1">Created</div>
            </div>

            {students.map((student) => {
              const studentUrl = buildReturnUrl(`/admin/student/${student.id}`, listUrl);
              return (
                <div
                  key={student.id}
                  className="group flex h-14 w-full items-center justify-between border-b border-border bg-card px-4 text-sm transition-colors hover:bg-accent/40"
                >
                  <div className="truncate font-medium flex-1">
                    <Link href={studentUrl} className="hover:underline">
                      {student.name}
                    </Link>
                  </div>
                  <div className="truncate flex-1">{student.family.name ?? "—"}</div>
                  <div className="truncate flex-1">{student.level?.name ?? "—"}</div>
                  <div className="truncate flex-1 text-muted-foreground">
                    {format(student.createdAt, "dd MMM yyyy")}
                  </div>
                </div>
              );
            })}

            {students.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">
                No students found.
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex h-14 w-full items-center justify-between border-t border-b border-border bg-card px-4 text-sm font-medium text-muted-foreground">
              <div className="truncate flex-1">Family Name</div>
              <div className="truncate flex-1">Primary Contact</div>
              <div className="truncate flex-1">Email</div>
              <div className="truncate flex-1">Phone</div>
              <div className="w-10 text-right">
                <Button variant="ghost" size="icon" aria-label="Family actions" disabled>
                  <MoreVerticalIcon className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>

            {families.map((family) => (
              <FamilyListItem
                key={family.id}
                family={family}
                onEdit={openEdit}
                onDelete={handleDelete}
                returnTo={listUrl}
              />
            ))}

            {families.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">
                No families found.
              </div>
            )}
          </>
        )}
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
