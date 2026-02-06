"use client";

import * as React from "react";
import type { ClassTemplate, Level, WaitlistRequestStatus } from "@prisma/client";
import { useRouter } from "next/navigation";

import type { WaitlistRequestSummary } from "@/server/waitlist/listWaitlistRequests";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { approveWaitlistRequest } from "@/server/waitlist/approveWaitlistRequest";
import { declineWaitlistRequest } from "@/server/waitlist/declineWaitlistRequest";
import { updateWaitlistRequest } from "@/server/waitlist/updateWaitlistRequest";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { formatDateKey } from "@/lib/dateKey";
import { cn } from "@/lib/utils";
import {
  scheduleAddDays,
  scheduleDateAtMinutes,
  scheduleWeekStart,
  formatScheduleWeekdayTime,
} from "@/packages/schedule";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_OPTIONS: Array<{ value: WaitlistRequestStatus | "ALL"; label: string }> = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "DECLINED", label: "Declined" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ALL", label: "All" },
];

type TemplateOption = ClassTemplate & { level?: Level | null };
type TemplateLabelInput = {
  name: string | null;
  dayOfWeek: number | null;
  startTime: number | null;
};

function statusBadge(status: WaitlistRequestStatus) {
  if (status === "APPROVED") return "secondary" as const;
  if (status === "DECLINED") return "destructive" as const;
  if (status === "CANCELLED") return "outline" as const;
  return "default" as const;
}

function formatTemplateLabel(template: TemplateLabelInput) {
  const name = template.name?.trim() || "Class";
  if (template.startTime != null && template.dayOfWeek != null) {
    const weekStart = scheduleWeekStart(new Date());
    const day = scheduleAddDays(weekStart, template.dayOfWeek);
    const date = scheduleDateAtMinutes(day, template.startTime);
    const time = formatScheduleWeekdayTime(date);
    return `${name} · ${time}`;
  }
  return name;
}

function buildTemplateOptions(templates: TemplateOption[], levelId: string | null | undefined) {
  if (!levelId) return templates;
  return templates.filter((template) => template.levelId === levelId);
}

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

export default function WaitlistPageClient({
  requests,
  totalCount,
  statusFilter,
  templates,
}: {
  requests: WaitlistRequestSummary[];
  totalCount: number;
  statusFilter: WaitlistRequestStatus | "ALL";
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    requestedClassId: "",
    effectiveDate: "",
    adminNotes: "",
  });

  const selected = requests.find((request) => request.id === selectedId) ?? null;

  React.useEffect(() => {
    if (!sheetOpen || !selected) return;
    setForm({
      requestedClassId: selected.requestedClass.id,
      effectiveDate: formatDateKey(asDate(selected.effectiveDate)),
      adminNotes: selected.adminNotes ?? "",
    });
  }, [sheetOpen, selected]);

  const templateOptions = selected
    ? buildTemplateOptions(templates, selected.student.level?.id)
    : templates;

  const canEdit = selected?.status === "PENDING";

  const handleSave = async () => {
    if (!selected) return;
    await runMutationWithToast(
      () =>
        updateWaitlistRequest({
          requestId: selected.id,
          requestedClassId: form.requestedClassId,
          effectiveDate: form.effectiveDate,
          adminNotes: form.adminNotes.trim() || null,
        }),
      {
        pending: { title: "Saving changes..." },
        success: { title: "Request updated" },
        error: (message) => ({ title: "Unable to save", description: message }),
        onSuccess: () => {
          setSheetOpen(false);
          setSelectedId(null);
          router.refresh();
        },
      }
    );
  };

  const handleApprove = async (request: WaitlistRequestSummary, override?: typeof form) => {
    await runMutationWithToast(
      () =>
        approveWaitlistRequest({
          requestId: request.id,
          requestedClassId: override?.requestedClassId,
          effectiveDate: override?.effectiveDate,
          adminNotes: override?.adminNotes?.trim() || null,
        }),
      {
        pending: { title: "Approving request..." },
        success: { title: "Request approved" },
        error: (message) => ({ title: "Unable to approve", description: message }),
        onSuccess: () => {
          setSheetOpen(false);
          setSelectedId(null);
          router.refresh();
        },
      }
    );
  };

  const handleDecline = async (request: WaitlistRequestSummary, adminNotes?: string) => {
    const ok = window.confirm("Decline this request?");
    if (!ok) return;

    await runMutationWithToast(
      () =>
        declineWaitlistRequest({
          requestId: request.id,
          adminNotes: adminNotes?.trim() || null,
        }),
      {
        pending: { title: "Declining request..." },
        success: { title: "Request declined" },
        error: (message) => ({ title: "Unable to decline", description: message }),
        onSuccess: () => {
          setSheetOpen(false);
          setSelectedId(null);
          router.refresh();
        },
      }
    );
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-4">
        <div>
          <div className="text-base font-semibold">Waitlist requests</div>
          <div className="text-xs text-muted-foreground">{totalCount} total requests</div>
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            const params = new URLSearchParams(window.location.search);
            if (value === "ALL") {
              params.delete("status");
            } else {
              params.set("status", value);
            }
            const qs = params.toString();
            window.location.search = qs ? `?${qs}` : "";
          }}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {requests.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No waitlist requests.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Family</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Current class</TableHead>
                  <TableHead>Requested class</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{formatBrisbaneDate(request.createdAt)}</TableCell>
                    <TableCell className="font-medium">{request.family.name}</TableCell>
                    <TableCell>{request.student.name}</TableCell>
                    <TableCell>
                      {request.student.currentClass
                        ? formatTemplateLabel(request.student.currentClass)
                        : "—"}
                    </TableCell>
                    <TableCell>{formatTemplateLabel(request.requestedClass)}</TableCell>
                    <TableCell>{formatBrisbaneDate(request.effectiveDate)}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadge(request.status)}>{request.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedId(request.id);
                            setSheetOpen(true);
                          }}
                        >
                          View/Edit
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleApprove(request)}
                          disabled={request.status !== "PENDING"}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDecline(request)}
                          disabled={request.status !== "PENDING"}
                        >
                          Decline
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg">
          {selected ? (
            <div className="flex h-full flex-col">
              <SheetHeader>
                <SheetTitle>Waitlist request</SheetTitle>
                <SheetDescription>
                  {selected.family.name} · {selected.student.name}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
                <div className="space-y-1 text-sm">
                  <div className="text-muted-foreground">Current class</div>
                  <div className="font-medium">
                    {selected.student.currentClass
                      ? formatTemplateLabel(selected.student.currentClass)
                      : "—"}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Requested class</Label>
                  <Select
                    value={form.requestedClassId}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, requestedClassId: value }))}
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {templateOptions.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {formatTemplateLabel(template)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Effective date</Label>
                  <Input
                    type="date"
                    value={form.effectiveDate}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, effectiveDate: event.target.value }))
                    }
                    disabled={!canEdit}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Client note</Label>
                  <div
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm",
                      selected.notes ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {selected.notes ?? "No note provided."}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Admin notes</Label>
                  <Textarea
                    value={form.adminNotes}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, adminNotes: event.target.value }))
                    }
                    placeholder="Optional internal notes"
                    disabled={!canEdit}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button
                  variant="outline"
                  onClick={() => handleDecline(selected, form.adminNotes)}
                  disabled={!canEdit}
                >
                  Decline
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSave}
                  disabled={!canEdit}
                >
                  Save changes
                </Button>
                <Button
                  onClick={() => handleApprove(selected, form)}
                  disabled={!canEdit}
                >
                  Approve
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
