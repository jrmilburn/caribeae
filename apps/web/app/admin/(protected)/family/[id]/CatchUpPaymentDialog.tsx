"use client";

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { PendingDot, PendingLabelSwap } from "@/components/loading/LoadingSystem";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrencyFromCents } from "@/lib/currency";
import type { CatchUpPreview } from "@/server/billing/catchUpPayment";
import { createCatchUpPayment, previewCatchUpPayment } from "@/server/billing/catchUpPayment";
import { cn } from "@/lib/utils";

function asDate(value?: Date | string | null) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value?: Date | string | null) {
  const d = asDate(value);
  if (!d) return "—";
  return format(d, "d MMM yyyy");
}

type Props = {
  familyId: string;
  familyName: string;
  trigger?: React.ReactNode;
};

export function CatchUpPaymentDialog({ familyId, familyName, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [payAheadBlocks, setPayAheadBlocks] = React.useState(0);
  const [preview, setPreview] = React.useState<CatchUpPreview | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [method, setMethod] = React.useState("Cash");
  const [note, setNote] = React.useState("");
  const [paidOn, setPaidOn] = React.useState(() => new Date().toISOString().slice(0, 10));

  const loadPreview = React.useCallback(
    async (nextBlocks: number) => {
      setLoading(true);
      try {
        const data = await previewCatchUpPayment(familyId, nextBlocks);
        setPreview(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load catch-up preview.";
        toast.error(message);
        setPreview(null);
      } finally {
        setLoading(false);
      }
    },
    [familyId]
  );

  React.useEffect(() => {
    if (!open) return;
    setPayAheadBlocks(0);
    setMethod("Cash");
    setNote("");
    setPaidOn(new Date().toISOString().slice(0, 10));
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    void loadPreview(payAheadBlocks);
  }, [open, payAheadBlocks, loadPreview]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await createCatchUpPayment({
        familyId,
        payAheadBlocks,
        method: method.trim() || undefined,
        note: note.trim() || undefined,
        paidAt: paidOn ? new Date(paidOn) : undefined,
      });
      toast.success("Catch-up payment recorded.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to process catch-up payment.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const rows = preview?.rows ?? [];
  const totalCents = preview?.totalCents ?? 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger === null ? null : (
        <SheetTrigger asChild>
          {trigger ?? (
            <Button size="sm" variant="secondary">
              Catch up payment
            </Button>
          )}
        </SheetTrigger>
      )}
      <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-[1100px]">
        <SheetHeader className="px-0">
          <SheetTitle>Catch up payment for {familyName}</SheetTitle>
        </SheetHeader>

        <div className="mt-2 space-y-4 overflow-y-auto pr-1">
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <Label>Pay ahead blocks</Label>
              <Select
                value={String(payAheadBlocks)}
                onValueChange={(value) => setPayAheadBlocks(Number(value))}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0 blocks</SelectItem>
                  <SelectItem value="1">1 block</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Bring enrolments current, with optional 1-block pay-ahead.</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 sm:items-end">
              <div>
                <Label htmlFor="catchup-method">Payment method</Label>
                <Input id="catchup-method" value={method} onChange={(e) => setMethod(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="catchup-date">Paid on</Label>
                <Input id="catchup-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="catchup-note">Note</Label>
                <Input id="catchup-note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3" aria-busy="true" aria-live="polite" role="status">
              <span className="sr-only">Loading catch-up preview</span>
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-lg border p-4">
                  <Skeleton className="h-4 w-48" />
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((__, blockIndex) => (
                      <Skeleton key={blockIndex} className="h-10 w-full" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nothing to pay.</div>
          ) : (
            <div className="space-y-3">
              {preview?.warnings?.length ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {preview.warnings.map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
              ) : null}

              {rows.map((row) => {
                const fromState =
                  row.billingType === "PER_WEEK"
                    ? `Paid through ${formatDate(row.fromPaidThroughDate)}`
                    : `Paid through ${formatDate(row.fromPaidThroughDate)} · Credits ${row.fromCreditsRemaining ?? 0}`;
                const toState =
                  row.billingType === "PER_WEEK"
                    ? `Paid through ${formatDate(row.toPaidThroughDate)}`
                    : `Paid through ${formatDate(row.toPaidThroughDate)} · Credits ${row.toCreditsRemaining ?? 0}`;

                return (
                  <div key={row.enrolmentId} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">
                          {row.planName} · {row.billingType === "PER_WEEK" ? "Per week" : "Per class"}
                        </div>
                        <div className="text-xs text-muted-foreground">{row.studentName}</div>
                      </div>
                      <div className="text-sm font-semibold">{formatCurrencyFromCents(row.amountCents)}</div>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <div className="font-medium text-foreground">Current entitlement</div>
                        <div>{fromState}</div>
                      </div>
                      <div>
                        <div className="font-medium text-foreground">Blocks to current</div>
                        <div>{row.requiredBlocksToCurrent}</div>
                      </div>
                      <div>
                        <div className="font-medium text-foreground">Blocks billed</div>
                        <div>
                          {row.blocksBilled}
                          {row.blockClassCount ? ` · Block size ${row.blockClassCount}` : ""}
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-foreground">New entitlement</div>
                        <div>{toState}</div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3 text-sm font-semibold">
                <span>Total catch-up payment</span>
                <span>{formatCurrencyFromCents(totalCents)}</span>
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="px-0 pb-0 gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || loading || rows.length === 0 || totalCents <= 0}
            className={cn(submitting && "opacity-70")}
          >
            {submitting ? <PendingDot className="h-3.5 w-3.5" /> : null}
            <PendingLabelSwap pending={submitting} pendingLabel="Confirming catch-up payment" lineClassName="w-28">
              Confirm catch-up payment
            </PendingLabelSwap>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
