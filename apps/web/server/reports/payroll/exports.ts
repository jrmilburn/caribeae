"use server";

import { format } from "date-fns";

import { formatCurrencyFromCents } from "@/lib/currency";
import { getPayRunDetail } from "@/server/payroll/getPayRunDetail";

/**
 * Audit-first notes:
 * - CSV helpers mirror existing teacher-hours exporters: escape quotes/commas, filename includes period.
 * - Pay run entries export includes entry-level detail for audit.
 */

function toCsvValue(value: string | number | null | undefined) {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes("\"")) return `"${str.replace(/"/g, '""')}"`;
  if (str.includes(",") || str.includes("\n")) return `"${str}"`;
  return str;
}

function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((row) => row.map((cell) => toCsvValue(cell)).join(",")).join("\n");
}

function minutesToHours(minutes: number) {
  return (minutes / 60).toFixed(2);
}

export async function exportPayRunSummaryCsv(id: string) {
  const payRun = await getPayRunDetail(id);
  if (!payRun) throw new Error("Pay run not found");

  const rows: (string | number | null | undefined)[][] = [];
  rows.push(["Name", "Hours", "Minutes", "Days worked", "Gross"]);

  const entryDatesByTeacher = new Map<string, Set<string>>();
  payRun.entries.forEach((entry) => {
    if (!entry.teacherId) return;
    const set = entryDatesByTeacher.get(entry.teacherId) ?? new Set<string>();
    set.add(format(entry.date, "yyyy-MM-dd"));
    entryDatesByTeacher.set(entry.teacherId, set);
  });

  payRun.lines.forEach((line) => {
    const hours = minutesToHours(line.minutesTotal);
    const dates =
      line.teacherId && entryDatesByTeacher.has(line.teacherId)
        ? Array.from(entryDatesByTeacher.get(line.teacherId) ?? []).sort().join(" | ")
        : Array.isArray(line.rateBreakdownJson)
          ? Array.from(
              new Set(
                (line.rateBreakdownJson as { date?: string }[])
                  .map((b) => (b.date ? format(new Date(b.date), "yyyy-MM-dd") : undefined))
                  .filter(Boolean) as string[]
              )
            )
              .sort()
              .join(" | ")
          : "";
    rows.push([
      line.teacher?.name ?? line.staffName ?? "Unassigned",
      hours,
      line.minutesTotal,
      dates,
      formatCurrencyFromCents(line.grossCents),
    ]);
  });
  rows.push([]);
  rows.push(["Total gross", "", "", "", formatCurrencyFromCents(payRun.grossCents)]);

  const filename = `pay-run-${format(payRun.periodStart, "yyyyMMdd")}-to-${format(payRun.periodEnd, "yyyyMMdd")}-summary.csv`;
  return { filename, content: toCsv(rows) };
}

export async function exportPayRunEntriesCsv(id: string) {
  const payRun = await getPayRunDetail(id);
  if (!payRun) throw new Error("Pay run not found");

  const rows: (string | number | null | undefined)[][] = [];
  rows.push([
    "Name",
    "Date",
    "Template/Source",
    "Status",
    "Minutes",
    "Hours",
    "Gross at rate",
    "Rate cents",
  ]);

  const rateByKey = new Map(
    payRun.lines.map((l) => {
      const key = l.teacherId ?? `staff:${l.staffName ?? ""}`;
      return [key, l.hourlyRateCentsSnapshot ?? null];
    })
  );

  payRun.entries.forEach((entry) => {
    const rate = rateByKey.get(entry.teacherId ?? "");
    const cents = rate ? Math.round((entry.minutesFinal * rate) / 60) : null;
    rows.push([
      entry.teacher?.name ?? "Unassigned",
      format(entry.date, "yyyy-MM-dd"),
      entry.template.name ?? "Class",
      entry.status,
      entry.minutesFinal,
      minutesToHours(entry.minutesFinal),
      cents ? formatCurrencyFromCents(cents) : "",
      rate ?? "",
    ]);
  });

  payRun.lines
    .filter((line) => !line.teacherId && Array.isArray(line.rateBreakdownJson))
    .forEach((line) => {
      (line.rateBreakdownJson as { date?: string; minutes?: number; hourlyRateCents?: number; cents?: number }[]).forEach(
        (b) => {
          rows.push([
            line.staffName ?? "Staff",
            b.date ? format(new Date(b.date), "yyyy-MM-dd") : "",
            "Manual",
            "CONFIRMED",
            b.minutes ?? line.minutesTotal,
            minutesToHours(b.minutes ?? line.minutesTotal),
            b.cents ? formatCurrencyFromCents(b.cents) : formatCurrencyFromCents(line.grossCents),
            b.hourlyRateCents ?? line.hourlyRateCentsSnapshot ?? "",
          ]);
        }
      );
    });

  const filename = `pay-run-${format(payRun.periodStart, "yyyyMMdd")}-to-${format(payRun.periodEnd, "yyyyMMdd")}-entries.csv`;
  return { filename, content: toCsv(rows) };
}
