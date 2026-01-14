"use client";

import { useRouter } from "next/navigation";
import type { FamilyListEntry } from "@/server/family/listFamilies";
import { MoreVerticalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export default function FamilyListItem({
  family,
  onEdit,
  onDelete,
}: {
  family: FamilyListEntry;
  onEdit: (family: FamilyListEntry) => void;
  onDelete: (family: FamilyListEntry) => void;
}) {
  const router = useRouter();

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/admin/family/${family.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/admin/family/${family.id}`);
        }
      }}
      className={cn(
        "group flex h-14 w-full items-center justify-between",
        " border-b border-border bg-card px-4",
        "cursor-pointer transition-colors hover:bg-accent/40"
      )}
    >
      <div className="truncate text-sm font-medium flex-1">{family.name}</div>
      <div className="truncate text-sm font-medium flex-1">{family.primaryContactName}</div>
      <div className="truncate text-sm font-medium flex-1">{family.primaryEmail}</div>
      <div className="truncate text-sm font-medium flex-1">{family.primaryPhone}</div>

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
                router.push(`/admin/family/${family.id}`);
              }}
            >
              View
            </DropdownMenuItem>
          
            <DropdownMenuItem
              onSelect={() => {
                onEdit(family);
              }}
            >
              Edit
            </DropdownMenuItem>
          
            <DropdownMenuSeparator />
          
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => {
                onDelete(family);
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

    </div>
  );
}
