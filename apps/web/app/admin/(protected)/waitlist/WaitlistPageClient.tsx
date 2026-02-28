"use client";

import * as React from "react";
import type { ClassTemplate, Level, WaitlistRequestStatus } from "@prisma/client";
import { Clock3 } from "lucide-react";
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
import { AdminPagination } from "@/components/admin/AdminPagination";
import { RequestListHeader } from "@/components/admin/RequestListHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  nextCursor,
  pageSize,
  statusFilter,
  templates,
}: {
  requests: WaitlistRequestSummary[];
  totalCount: number;
  nextCursor: string | null;
  pageSize: number;
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <RequestListHeader
        title="Waitlist requests"
        totalCount={totalCount}
        searchPlaceholder="Search by family, student, class, or notes..."
        filterValue={statusFilter}
        filterOptions={STATUS_OPTIONS}
        allFilterValue="ALL"
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {requests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-gradient-to-b from-card to-muted/20 px-6 py-14">
              <div className="mx-auto flex max-w-md flex-col items-center text-center">
                <div className="mb-4 flex size-12 items-center justify-center rounded-full border bg-background shadow-sm">
                  <Clock3 className="size-5 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold text-foreground">No waitlist requests</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  When families request class changes, they will appear here.
                </p>
              </div>
            </div>
          ) : (
            <ul role="list" className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {requests.map((request) => (
                <li key={request.id} className="col-span-1 divide-y divide-border rounded-lg bg-card shadow-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(request.id);
                      setSheetOpen(true);
                    }}
                    className="w-full p-6 text-left transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-foreground">{request.family.name}</h3>
                        <p className="text-xs text-muted-foreground">{request.student.name}</p>
                      </div>
                      <Badge variant={statusBadge(request.status)}>{request.status}</Badge>
                    </div>

                    <dl className="mt-4 space-y-2 text-sm">
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-muted-foreground">Created</dt>
                        <dd className="min-w-0 truncate text-foreground">{formatBrisbaneDate(request.createdAt)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-muted-foreground">Current</dt>
                        <dd className="min-w-0 truncate text-foreground">
                          {request.student.currentClass ? formatTemplateLabel(request.student.currentClass) : "—"}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-muted-foreground">Requested</dt>
                        <dd className="min-w-0 truncate text-foreground">{formatTemplateLabel(request.requestedClass)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-muted-foreground">Effective</dt>
                        <dd className="min-w-0 truncate text-foreground">{formatBrisbaneDate(request.effectiveDate)}</dd>
                      </div>
                    </dl>
                  </button>

                  <div className="flex flex-wrap justify-end gap-2 px-3 py-2">
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <AdminPagination
          totalCount={totalCount}
          pageSize={pageSize}
          currentCount={requests.length}
          nextCursor={nextCursor}
          className="border-t-0 bg-transparent"
        />
      </div>

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
