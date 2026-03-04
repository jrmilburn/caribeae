"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { PayAheadCard } from "@/components/admin/PayAheadCard";
import { getFamilyBillingSummary, type FamilyBillingSummary } from "@/server/billing/getFamilyBillingSummary";

export type PayAheadSheetProps = {
  familyId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  onUpdated?: () => void;
};

export function PayAheadSheet({ familyId, open, onOpenChange, trigger, onUpdated }: PayAheadSheetProps) {
  const router = useRouter();
  const [summary, setSummary] = React.useState<FamilyBillingSummary | null>(null);
  const [internalOpen, setInternalOpen] = React.useState(false);
  const sheetOpen = open ?? internalOpen;
  const setSheetOpen = onOpenChange ?? setInternalOpen;
  const [isLoading, startLoading] = React.useTransition();

  const loadSummary = React.useCallback(async () => {
    try {
      const data = await getFamilyBillingSummary(familyId);
      setSummary(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load billing summary.";
      toast.error(message);
      setSummary(null);
    }
  }, [familyId]);

  React.useEffect(() => {
    if (!sheetOpen) return;
    startLoading(async () => {
      await loadSummary();
    });
  }, [sheetOpen, loadSummary, startLoading]);

  const handleRefresh = React.useCallback(async () => {
    await loadSummary();
    router.refresh();
    await onUpdated?.();
  }, [loadSummary, onUpdated, router]);

  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      {trigger === null ? null : (
        <SheetTrigger asChild>
          {trigger ?? (
            <Button variant="outline" size="sm">
              Pay next block
            </Button>
          )}
        </SheetTrigger>
      )}
      <SheetContent side="right" className="w-full p-6 sm:max-w-xl sm:px-8">
        <SheetHeader>
          <SheetTitle>Pay next block</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {isLoading && !summary ? (
            <div className="space-y-4" aria-busy="true" aria-live="polite" role="status">
              <span className="sr-only">Loading pay-ahead details</span>
              <div className="rounded-lg border p-4">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          ) : (
            <PayAheadCard summary={summary} onRefresh={handleRefresh} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
