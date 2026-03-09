"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type StudentHeaderStatus = {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
};

type PaidThroughOption = {
  id: string;
  label: string;
  currentPaidThrough: Date | null;
};

type StudentHeaderProps = {
  breadcrumbHref: string;
  breadcrumbLabel: string;
  title: string;
  subtitle?: string | null;
  status: StudentHeaderStatus;
  familyHref: string;
  paidThroughOptions: PaidThroughOption[];
  onOpenPayment: () => void;
  onOpenPayAhead: () => void;
  onEditStudent: () => void;
  onEditPaidThrough: (option: PaidThroughOption) => void;
};

export function StudentHeader({
  breadcrumbHref,
  breadcrumbLabel,
  title,
  subtitle,
  status,
  familyHref,
  paidThroughOptions,
  onOpenPayment,
  onOpenPayAhead,
  onEditStudent,
  onEditPaidThrough,
}: StudentHeaderProps) {
  const singlePaidThroughOption = paidThroughOptions.length === 1 ? paidThroughOptions[0] : null;

  return (
    <header className="border-b border-border/80 pb-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link
              href={breadcrumbHref}
              className="inline-flex items-center rounded-sm py-0.5 underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {breadcrumbLabel}
            </Link>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span className="font-medium text-foreground" aria-current="page">
              {title}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            <Badge variant={status.variant} className="text-[11px]">
              {status.label}
            </Badge>
          </div>

          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onOpenPayment}>Take payment</Button>
          <Button variant="outline" asChild>
            <Link href={familyHref}>Open family</Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">
                More actions
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Student actions</DropdownMenuLabel>
              <DropdownMenuItem onSelect={onOpenPayAhead}>Pay ahead</DropdownMenuItem>
              <DropdownMenuItem onSelect={onEditStudent}>Edit student</DropdownMenuItem>
              {paidThroughOptions.length > 1 ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Edit paid-through</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    {paidThroughOptions.map((option) => (
                      <DropdownMenuItem
                        key={option.id}
                        onSelect={() => onEditPaidThrough(option)}
                        className="whitespace-normal"
                      >
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : (
                <DropdownMenuItem
                  disabled={!singlePaidThroughOption}
                  onSelect={() => {
                    if (singlePaidThroughOption) {
                      onEditPaidThrough(singlePaidThroughOption);
                    }
                  }}
                >
                  Edit paid-through
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
