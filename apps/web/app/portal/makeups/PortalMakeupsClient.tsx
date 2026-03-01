"use client";

import * as React from "react";
import { MakeupCreditStatus } from "@prisma/client";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function statusBadgeClass(status: MakeupCreditStatus) {
  if (status === MakeupCreditStatus.AVAILABLE) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === MakeupCreditStatus.USED) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (status === MakeupCreditStatus.EXPIRED) {
    return "border-gray-200 bg-gray-100 text-gray-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
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
      <div className="space-y-6">
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">Makeups</h1>
              <p className="mt-2 text-sm text-gray-600">Use available credits before they expire.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-700">
                Available: {summary.availableCount}
              </Badge>
              <Button onClick={() => setOpen(true)} disabled={!availableCredits.length}>
                Book makeup
              </Button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
          <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
            <h2 className="text-base font-semibold text-gray-900">Credits</h2>
            <p className="mt-1 text-sm text-gray-600">Track credits, bookings, and expiry dates.</p>
          </div>

          {summary.credits.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-medium text-gray-900">No makeup credits yet.</p>
              <p className="mt-2 text-sm text-gray-500">Credits will appear here when absences are converted to makeups.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {summary.credits.map((credit) => (
                <article key={credit.id} className="px-4 py-4 sm:px-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-gray-900">{credit.student.name}</p>
                      <p className="text-xs text-gray-600">
                        {credit.reason} · Expires {formatBrisbaneDate(credit.expiresAt)}
                      </p>
                      <p className="text-xs text-gray-600">
                        Missed {credit.earnedFromClass?.name ?? "Class"} on {formatBrisbaneDate(credit.earnedFromSessionDate)}
                      </p>
                      {credit.booking ? (
                        <p className="text-xs text-gray-600">
                          Booked into {credit.booking.targetClass?.name ?? "Class"} on {formatBrisbaneDate(credit.booking.targetSessionDate)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={statusBadgeClass(credit.status)}>
                        {credit.status}
                      </Badge>
                      {credit.booking && credit.booking.status === "BOOKED" ? (
                        <Button size="sm" variant="outline" onClick={() => handleCancelBooking(credit.booking!.id)}>
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

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
                <p className="text-xs text-gray-500">No eligible sessions are currently available for this credit.</p>
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
