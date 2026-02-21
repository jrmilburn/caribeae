"use client";

import * as React from "react";
import { MakeupCreditStatus } from "@prisma/client";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import {
  bookMakeupSession,
  cancelMakeupBookingAsFamily,
  listAvailableMakeupSessionsForCredit,
} from "@/server/makeup/actions";
import type { FamilyMakeupSummary } from "@/server/makeup/getFamilyMakeups";

type MakeupSummary = FamilyMakeupSummary;
type AvailableSession = Awaited<ReturnType<typeof listAvailableMakeupSessionsForCredit>>[number];

function badgeVariantForStatus(status: MakeupCreditStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === MakeupCreditStatus.AVAILABLE) return "secondary";
  if (status === MakeupCreditStatus.USED) return "default";
  if (status === MakeupCreditStatus.EXPIRED) return "outline";
  return "outline";
}

export default function PortalMakeupsClient({ summary }: { summary: MakeupSummary }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loadingSessions, setLoadingSessions] = React.useState(false);
  const [selectedCreditId, setSelectedCreditId] = React.useState<string>("");
  const [sessions, setSessions] = React.useState<AvailableSession[]>([]);
  const [selectedSessionKey, setSelectedSessionKey] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  const availableCredits = React.useMemo(
    () => summary.credits.filter((credit) => credit.status === MakeupCreditStatus.AVAILABLE),
    [summary.credits]
  );

  const selectedCredit = React.useMemo(
    () => availableCredits.find((credit) => credit.id === selectedCreditId) ?? null,
    [availableCredits, selectedCreditId]
  );

  React.useEffect(() => {
    if (!open) return;
    if (!selectedCreditId && availableCredits[0]?.id) {
      setSelectedCreditId(availableCredits[0].id);
    }
  }, [open, selectedCreditId, availableCredits]);

  React.useEffect(() => {
    if (!open || !selectedCreditId) return;

    let active = true;
    setLoadingSessions(true);

    void listAvailableMakeupSessionsForCredit({ makeupCreditId: selectedCreditId })
      .then((nextSessions) => {
        if (!active) return;
        setSessions(nextSessions);
        setSelectedSessionKey(
          nextSessions.length
            ? `${nextSessions[0].classId}:${nextSessions[0].sessionDateKey}`
            : ""
        );
      })
      .catch((error) => {
        if (!active) return;
        setSessions([]);
        setSelectedSessionKey("");
        console.error(error);
      })
      .finally(() => {
        if (active) setLoadingSessions(false);
      });

    return () => {
      active = false;
    };
  }, [open, selectedCreditId]);

  const selectedSession = React.useMemo(
    () => sessions.find((session) => `${session.classId}:${session.sessionDateKey}` === selectedSessionKey) ?? null,
    [sessions, selectedSessionKey]
  );

  const canBook = Boolean(selectedCredit && selectedSession) && !saving;

  const handleBook = async () => {
    if (!selectedCredit || !selectedSession) return;
    setSaving(true);
    try {
      await runMutationWithToast(
        () =>
          bookMakeupSession({
            makeupCreditId: selectedCredit.id,
            targetClassId: selectedSession.classId,
            targetSessionDate: selectedSession.sessionDateKey,
          }),
        {
          pending: { title: "Booking makeup..." },
          success: { title: "Makeup booked" },
          error: (message) => ({
            title: "Unable to book makeup",
            description: message,
          }),
          onSuccess: () => {
            router.refresh();
            setOpen(false);
          },
        }
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancelBooking = async (makeupBookingId: string) => {
    await runMutationWithToast(
      () => cancelMakeupBookingAsFamily({ makeupBookingId }),
      {
        pending: { title: "Cancelling booking..." },
        success: { title: "Booking cancelled" },
        error: (message) => ({
          title: "Unable to cancel booking",
          description: message,
        }),
        onSuccess: () => {
          router.refresh();
        },
      }
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Makeups</CardTitle>
            <p className="text-sm text-muted-foreground">Use available credits before they expire.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Available: {summary.availableCount}</Badge>
            <Button onClick={() => setOpen(true)} disabled={!availableCredits.length}>
              Book makeup
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {summary.credits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No makeup credits yet.</p>
          ) : (
            summary.credits.map((credit) => (
              <div key={credit.id} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">{credit.student.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {credit.reason} · Expires {formatBrisbaneDate(credit.expiresAt)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Missed {credit.earnedFromClass?.name ?? "Class"} on {formatBrisbaneDate(credit.earnedFromSessionDate)}
                    </div>
                    {credit.booking ? (
                      <div className="text-xs text-muted-foreground">
                        Booked into {credit.booking.targetClass?.name ?? "Class"} on {formatBrisbaneDate(credit.booking.targetSessionDate)}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={badgeVariantForStatus(credit.status)}>{credit.status}</Badge>
                    {credit.booking && credit.booking.status === "BOOKED" ? (
                      <Button size="sm" variant="outline" onClick={() => handleCancelBooking(credit.booking!.id)}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Book makeup</DialogTitle>
            <DialogDescription>
              Select a credit, then choose a class session with available makeup spots.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Credit</Label>
              <Select value={selectedCreditId} onValueChange={setSelectedCreditId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a credit" />
                </SelectTrigger>
                <SelectContent>
                  {availableCredits.map((credit) => (
                    <SelectItem key={credit.id} value={credit.id}>
                      {credit.student.name} · Expires {formatBrisbaneDate(credit.expiresAt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Session</Label>
              <Select
                value={selectedSessionKey}
                onValueChange={setSelectedSessionKey}
                disabled={loadingSessions || sessions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={loadingSessions ? "Loading sessions..." : "Select a session"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((session) => (
                    <SelectItem key={`${session.classId}:${session.sessionDateKey}`} value={`${session.classId}:${session.sessionDateKey}`}>
                      {session.className} · {formatBrisbaneDate(session.sessionDate)} · {session.spotsAvailable} spots
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!loadingSessions && sessions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No eligible sessions are currently available for this credit.</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Close
            </Button>
            <Button onClick={handleBook} disabled={!canBook}>
              {saving ? "Booking..." : "Confirm booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
