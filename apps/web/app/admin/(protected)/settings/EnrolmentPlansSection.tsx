"use client";

import * as React from "react";
import type { EnrolmentPlan, Level } from "@prisma/client";
import { MoreVertical, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

import { deleteEnrolmentPlan } from "@/server/enrolmentPlan/deleteEnrolmentPlan";
import { runMutationWithToast } from "@/lib/toast/mutationToast";

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
    await runMutationWithToast(
      () => deleteEnrolmentPlan(plan.id),
      {
        pending: { title: "Deleting enrolment plan..." },
        success: { title: "Enrolment plan deleted" },
        error: (message) => ({
          title: "Unable to delete enrolment plan",
          description: message,
        }),
        onSuccess: () => router.refresh(),
      }
    );
  };

  return (
    <div className="">
      <div className="p-4 sm:flex sm:items-start sm:justify-between">
        <div className="sm:flex-auto">
          <h2 className="text-lg font-semibold">Enrolment plans</h2>
        </div>
        <div className="mt-4 flex w-full items-center gap-3 sm:mt-0 sm:ml-16 sm:w-auto sm:flex-none">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plans"
            className="w-full sm:w-64"
          />
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
      </div>

      <Card className="border-x-0! pb-0 shadow-none">
        <CardContent className="px-2 py-0">
          <div className="flow-root">
            <div className="-mx-4 -my-2 overflow-x-auto sm:mx-0 sm:overflow-x-visible">
              <div className="inline-block min-w-full py-2 align-middle sm:px-0">
                <table className="relative min-w-full table-fixed divide-y divide-border">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="w-[24%] py-3 pr-3 pl-4 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Name
                      </th>
                      <th
                        scope="col"
                        className="w-[16%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Level
                      </th>
                      <th
                        scope="col"
                        className="w-[12%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Billing
                      </th>
                      <th
                        scope="col"
                        className="w-[26%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Entitlement
                      </th>
                      <th
                        scope="col"
                        className="w-[12%] px-3 py-3 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                      >
                        Price
                      </th>
                      <th
                        scope="col"
                        className="w-[10%] py-3 pr-4 pl-3 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase sm:pr-0"
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border bg-card">
                    {filteredPlans.map((plan) => {
                      const entitlement = plan.billingType === "PER_WEEK"
                        ? `${plan.durationWeeks ?? "—"} week${(plan.durationWeeks ?? 0) === 1 ? "" : "s"}${plan.sessionsPerWeek && plan.sessionsPerWeek > 1 ? ` · ${plan.sessionsPerWeek}/week` : ""}`
                        : `${plan.blockClassCount ?? 1} classes per purchase${plan.sessionsPerWeek && plan.sessionsPerWeek > 1 ? ` · ${plan.sessionsPerWeek}/week` : ""}`;

                      return (
                        <tr key={plan.id} className="transition-colors hover:bg-accent/40">
                          <td className="max-w-0 py-4 pr-3 pl-4 text-sm font-medium text-foreground">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="block truncate" title={plan.name}>
                                {plan.name}
                              </span>
                              {plan.isSaturdayOnly ? (
                                <Badge variant="secondary" className="uppercase">
                                  Saturday
                                </Badge>
                              ) : null}
                              {plan.alternatingWeeks ? (
                                <Badge variant="outline">Alt weeks</Badge>
                              ) : null}
                              {plan.earlyPaymentDiscountBps > 0 ? (
                                <Badge variant="outline">{(plan.earlyPaymentDiscountBps / 100).toFixed(2)}% early</Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="max-w-0 px-3 py-4 text-sm text-foreground">
                            <span className="block truncate" title={plan.level.name}>
                              {plan.level.name}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-sm text-foreground capitalize">
                            {plan.billingType === "PER_WEEK" ? "Per week" : "Per class"}
                          </td>
                          <td className="max-w-0 px-3 py-4 text-sm text-foreground">
                            <span className="block truncate" title={entitlement}>
                              {entitlement}
                            </span>
                          </td>
                          <td className="px-3 py-4 text-sm font-medium whitespace-nowrap text-foreground">
                            ${(plan.priceCents / 100).toFixed(2)}
                          </td>
                          <td className="py-4 pr-4 pl-3 text-right text-sm font-medium whitespace-nowrap sm:pr-0">
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
                          </td>
                        </tr>
                      );
                    })}

                    {filteredPlans.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 pr-3 pl-4 text-sm text-muted-foreground">
                          No enrolment plans found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
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
