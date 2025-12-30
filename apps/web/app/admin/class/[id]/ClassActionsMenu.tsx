"use client";

import Link from "next/link";
import { MoreHorizontal, NotebookText, Users2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ClassActionsMenuProps = {
  templateId: string;
  dateKey: string | null;
  onSubstituteClick: () => void;
};

export function ClassActionsMenu({ templateId, dateKey, onSubstituteClick }: ClassActionsMenuProps) {
  const viewHref = buildHref(templateId, dateKey, null);
  const attendanceHref = buildHref(templateId, dateKey, "attendance");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Class actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {viewHref ? (
          <DropdownMenuItem asChild>
            <Link href={viewHref} className="flex items-center gap-2">
              <NotebookText className="h-4 w-4" />
              View class
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled className="flex items-center gap-2">
            <NotebookText className="h-4 w-4" />
            View class
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSubstituteClick} disabled={!dateKey}>
          <Users2 className="h-4 w-4" />
          Substitute teacher
        </DropdownMenuItem>
        {attendanceHref ? (
          <DropdownMenuItem asChild>
            <Link href={attendanceHref} className="flex items-center gap-2">
              <NotebookText className="h-4 w-4" />
              Take attendance
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled className="flex items-center gap-2">
            <NotebookText className="h-4 w-4" />
            Take attendance
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function buildHref(templateId: string, dateKey: string | null, tab: string | null) {
  if (!dateKey) {
    return tab ? null : `/admin/class/${templateId}`;
  }
  const params = new URLSearchParams();
  params.set("date", dateKey);
  if (tab) params.set("tab", tab);
  return `/admin/class/${templateId}?${params.toString()}`;
}
