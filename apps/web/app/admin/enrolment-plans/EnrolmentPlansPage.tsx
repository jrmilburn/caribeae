"use client";

import * as React from "react";
import type { EnrolmentPlan, Level } from "@prisma/client";
import { MoreVertical, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { EnrolmentPlanForm } from "./EnrolmentPlanForm";
import { deleteEnrolmentPlan } from "@/server/enrolmentPlan/deleteEnrolmentPlan";

type PlanWithLevel = EnrolmentPlan & { level: Level };

export default function EnrolmentPlansPage({ plans, levels }: { plans: PlanWithLevel[]; levels: Level[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PlanWithLevel | null>(null);


  const onDelete = async (plan: PlanWithLevel) => {
    const ok = window.confirm(`Delete enrolment plan "${plan.name}"?`);
    if (!ok) return;
    await deleteEnrolmentPlan(plan.id);
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Enrolment plans</h1>
          <p className="text-sm text-muted-foreground">
            Manage plans used when creating enrolments. Plans control billing type and block length.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New plan
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plans</CardTitle>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No enrolment plans yet.</p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Billing</TableHead>
                    <TableHead>Entitlement</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{plan.name}</span>
                          {plan.isSaturdayOnly ? (
                            <Badge variant="secondary" className="uppercase">
                              Saturday
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{plan.level.name}</TableCell>
                      <TableCell className="capitalize">
                        {plan.billingType === "PER_WEEK" ? "Per week" : "Per class"}
                      </TableCell>
                      <TableCell>
                        {plan.billingType === "PER_WEEK"
                          ? `${plan.durationWeeks ?? "—"} week${(plan.durationWeeks ?? 0) === 1 ? "" : "s"}${plan.sessionsPerWeek && plan.sessionsPerWeek > 1 ? ` · ${plan.sessionsPerWeek}/week` : ""}`
                          : `${plan.blockClassCount ?? 1} classes per purchase${plan.sessionsPerWeek && plan.sessionsPerWeek > 1 ? ` · ${plan.sessionsPerWeek}/week` : ""}`}
                      </TableCell>
                      <TableCell>
                        ${(plan.priceCents / 100).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(plan);
                                setOpen(true);
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => onDelete(plan)}
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

      <EnrolmentPlanForm
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
        plan={editing}
        levels={levels}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
