"use client";

import type { Family } from "@prisma/client";
import * as React from "react";
import { useMemo, useState } from "react";
import { Search, X, MoreVerticalIcon } from "lucide-react";

import FamilyListItem from "./FamilyListItem";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { FamilyModal } from "./FamilyModal"

import { createFamily } from "@/server/family/createFamily";
import { updateFamily } from "@/server/family/updateFamily";
import { deleteFamily } from "@/server/family/deleteFamily";

import type { ClientFamily } from "@/server/family/types";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import { useRouter } from "next/navigation";

export default function FamilyList({ families }: { families: Family[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [newFamilyModal, setNewFamilyModal] = useState(false);
  const [selected, setSelected] = React.useState<Family | null>(null);

  const router = useRouter()

  const filteredFamilies = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return families;

    return families.filter((f) => {
      // Start simple: name only (recommended)
      if (f.name?.toLowerCase().includes(q)) return true;

      return false;
    });
  }, [families, searchTerm]);

  const openEdit = (family: Family) => {
    setSelected(family);
    setNewFamilyModal(true);
  };

  const handleSave = async (payload: ClientFamily) => {
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

  const handleDelete = async (family: Family) => {
    const ok = window.confirm(`Delete "${family.name}"?`);
    if (!ok) return;
    await deleteFamily(family.id)
    router.refresh();
  };

  return (
    <div className="w-full">
      <ListHeader
        title="Families"
        totalCount={families.length}
        filteredCount={filteredFamilies.length}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        setNewFamilyModal={setNewFamilyModal}
      />


      <FamilyModal
        open={newFamilyModal}
        onOpenChange={setNewFamilyModal}
        family={selected}
        onSave={handleSave}
      />

      <div className="">
        {filteredFamilies.map((family) => (
          <FamilyListItem key={family.id} family={family} onEdit={openEdit} onDelete={handleDelete} />
        ))}

        {filteredFamilies.length === 0 && (
          <div className="">
            No families found{searchTerm.trim() ? ` for “${searchTerm.trim()}”` : ""}.
          </div>
        )}
      </div>
    </div>
  );
}

function ListHeader({
  title,
  totalCount,
  filteredCount,
  searchTerm,
  setSearchTerm,
  setNewFamilyModal
}: {
  title: string;
  totalCount: number;
  filteredCount: number;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  setNewFamilyModal: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const hasQuery = searchTerm.trim().length > 0;

  return (
    <>
    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4">
      {/* Left: Title + count */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          <span className="text-xs text-muted-foreground">
            {hasQuery ? `${filteredCount} / ${totalCount}` : totalCount}
          </span>
        </div>
      </div>

      {/* Right: Search */}
      <div className="relative w-full sm:w-[340px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSearchTerm("");
          }}
          placeholder="Search families…"
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
      <Button
        onClick={() => setNewFamilyModal(true)}
      >
        New
      </Button>
    </div>
    <div className=" w-full flex h-14 w-full items-center justify-between border-t border-b border-border bg-card px-4 bg-gray-50">
    <div className="truncate text-sm font-medium flex-1">
        Family Name
      </div>
    <div className="truncate text-sm font-medium flex-1">
        Primary Contact
      </div>
        <div className="truncate text-sm font-medium flex-1">
        Email
      </div>
    <div className="truncate text-sm font-medium flex-1">
        Phone
      </div>
              <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open family actions"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVerticalIcon className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
        
          <DropdownMenuContent
            align="end"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem
              onSelect={() => {
              }}
            >
              View
            </DropdownMenuItem>
          
            <DropdownMenuItem
              onSelect={() => {
              }}
            >
              Edit
            </DropdownMenuItem>
          
            <DropdownMenuSeparator />
          
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => {
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
    </div>
    </>
  );
}
