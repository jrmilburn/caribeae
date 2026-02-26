"use client";

import { useRouter } from "next/navigation";
import type { FamilyListEntry } from "@/server/family/listFamilies";
import { MoreVerticalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildReturnUrl } from "@/lib/returnContext";
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
  returnTo,
}: {
  family: FamilyListEntry;
  onEdit: (family: FamilyListEntry) => void;
  onDelete: (family: FamilyListEntry) => void;
  returnTo?: string | null;
}) {
  const router = useRouter();
  const targetUrl = buildReturnUrl(`/admin/family/${family.id}`, returnTo);

  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={() => router.push(targetUrl)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(targetUrl);
        }
      }}
      className="group cursor-pointer transition-colors hover:bg-accent/40"
    >
      <td className="max-w-0 py-4 pr-3 pl-4 text-sm font-medium text-foreground">
        <span className="block truncate" title={family.name}>
          {family.name}
        </span>
      </td>
      <td className="max-w-0 px-3 py-4 text-sm text-foreground">
        <span className="block truncate" title={family.primaryContactName ?? "—"}>
          {family.primaryContactName ?? "—"}
        </span>
      </td>
      <td className="max-w-0 px-3 py-4 text-sm text-foreground">
        <span className="block truncate" title={family.primaryEmail ?? "—"}>
          {family.primaryEmail ?? "—"}
        </span>
      </td>
      <td className="max-w-0 px-3 py-4 text-sm text-foreground">
        <span className="block truncate" title={family.primaryPhone ?? "—"}>
          {family.primaryPhone ?? "—"}
        </span>
      </td>

      <td className="py-4 pr-4 pl-3 text-right text-sm font-medium whitespace-nowrap sm:pr-0">
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
                router.push(targetUrl);
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
      </td>
    </tr>
  );
}
