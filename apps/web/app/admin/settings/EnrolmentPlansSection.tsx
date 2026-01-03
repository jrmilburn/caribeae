"use client";

import * as React from "react";
import type { EnrolmentPlan, Level } from "@prisma/client";
import { MoreVertical, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { deleteEnrolmentPlan } from "@/server/enrolmentPlan/deleteEnrolmentPlan";

import { EnrolmentPlanForm } from "../enrolment-plans/EnrolmentPlanForm";

type PlanWithLevel = EnrolmentPlan & { level: Level };

export function EnrolmentPlansSection({ plans, levels }: { plans: PlanWithLevel[]; levels: Level[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PlanWithLevel | null>(null);
  const [search, setSearch] = React.useState("");

  const filteredPlans = React.useMemo(() => {
    const query = search.toLowerCase();
    return plans.filter(
      (plan) =>
        plan.name.toLowerCase().includes(query) ||
        plan.level.name.toLowerCase().includes(query),
    );
  }, [plans, search]);

  const onDelete = async (plan: PlanWithLevel) => {
    const ok = window.confirm(`Delete enrolment plan "${plan.name}"?`);
    if (!ok) return;
    try {
      await deleteEnrolmentPlan(plan.id);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete plan.";
      window.alert(message);
    }
  };

  return (
    <div className="">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center p-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Enrolment plans</h2>

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

      <Card className="border-l-0! pb-0 shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 px-4">
          <CardTitle className="text-base">Plans</CardTitle>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plans"
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent className="px-2 py-0">
          {filteredPlans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No enrolment plans found.</p>
          ) : (
            <div className="">
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
                  {filteredPlans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-medium">{plan.name}</TableCell>
                      <TableCell>{plan.level.name}</TableCell>
                      <TableCell className="capitalize">
                        {plan.billingType === "PER_WEEK" ? "Per week" : "Per class"}
                      </TableCell>
                      <TableCell>
                        {plan.billingType === "PER_WEEK"
                          ? `${plan.durationWeeks ?? "—"} week${(plan.durationWeeks ?? 0) === 1 ? "" : "s"}${plan.sessionsPerWeek && plan.sessionsPerWeek > 1 ? ` · ${plan.sessionsPerWeek}/week` : ""}`
                          : `${plan.blockClassCount ?? 1} classes per purchase${plan.sessionsPerWeek && plan.sessionsPerWeek > 1 ? ` · ${plan.sessionsPerWeek}/week` : ""}`}
                      </TableCell>
                      <TableCell>${(plan.priceCents / 100).toFixed(2)}</TableCell>
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
