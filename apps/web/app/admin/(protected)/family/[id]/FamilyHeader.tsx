"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type FamilyHeaderProps = {
  title: string;
  subtitle?: string | null;
  onRecordPayment: () => void;
  onAddStudent: () => void;
  onPayAhead: () => void;
  onEditFamily: () => void;
};

export function FamilyHeader({
  title,
  subtitle,
  onRecordPayment,
  onAddStudent,
  onPayAhead,
  onEditFamily,
}: FamilyHeaderProps) {
  return (
    <header className="border-b border-border/80 pb-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link
              href="/admin/family"
              className="inline-flex items-center rounded-sm py-0.5 underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Families
            </Link>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span className="font-medium text-foreground" aria-current="page">
              {title}
            </span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onRecordPayment}>Record payment</Button>
          <Button variant="outline" onClick={onAddStudent}>
            Add student
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">
                More actions
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Family actions</DropdownMenuLabel>
              <DropdownMenuItem onSelect={onPayAhead}>Pay ahead</DropdownMenuItem>
              <DropdownMenuItem onSelect={onEditFamily}>Edit family</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
