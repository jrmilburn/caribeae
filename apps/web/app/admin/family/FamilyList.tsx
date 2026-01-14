"use client";

import type { Level } from "@prisma/client";
import { useEffect, useState } from "react";
import { MoreVerticalIcon } from "lucide-react";

import FamilyListItem from "./FamilyListItem";
import { Button } from "@/components/ui/button";

import { FamilyModal } from "./FamilyModal"

import { createFamily } from "@/server/family/createFamily";
import { updateFamily } from "@/server/family/updateFamily";
import { deleteFamily } from "@/server/family/deleteFamily";

import type { ClientFamilyWithStudents } from "@/server/family/types";
import type { FamilyListEntry } from "@/server/family/listFamilies";

import { AdminListHeader } from "@/components/admin/AdminListHeader";
import { AdminPagination } from "@/components/admin/AdminPagination";

import { useRouter } from "next/navigation";

export default function FamilyList({
  families,
  levels,
  totalCount,
  nextCursor,
  pageSize,
}: {
  families: FamilyListEntry[];
  levels: Level[];
  totalCount: number;
  nextCursor: string | null;
  pageSize: number;
}) {
  const [newFamilyModal, setNewFamilyModal] = useState(false);
  const [selected, setSelected] = useState<FamilyListEntry | null>(null);

  const router = useRouter()

  const openEdit = (family: FamilyListEntry) => {
    setSelected(family);
    setNewFamilyModal(true);
  };

  useEffect(() => {
    if (!newFamilyModal) {
      setSelected(null);
    }
  }, [newFamilyModal]);

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
    await deleteFamily(family.id)
    router.refresh();
  };

  return (
    <div className="w-full">
      <AdminListHeader
        title="Families"
        totalCount={totalCount}
        searchPlaceholder="Search families…"
        onNew={() => {
          setSelected(null);
          setNewFamilyModal(true);
        }}
        showFilters
        sticky
      />


      <FamilyModal
        open={newFamilyModal}
        onOpenChange={setNewFamilyModal}
        family={selected}
        onSave={handleSave}
        levels={levels}
      />

      <div className="">
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
          <FamilyListItem key={family.id} family={family} onEdit={openEdit} onDelete={handleDelete} />
        ))}

        {families.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">
            No families found.
          </div>
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
