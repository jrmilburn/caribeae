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

export async function exportPayRunSummaryCsv(id: string) {
  const payRun = await getPayRunDetail(id);
  if (!payRun) throw new Error("Pay run not found");

  const rows: (string | number | null | undefined)[][] = [];
  rows.push(["Teacher", "Minutes", "Gross"]);
  payRun.lines.forEach((line) => {
    rows.push([line.teacher.name, line.minutesTotal, formatCurrencyFromCents(line.grossCents)]);
  });
  rows.push([]);
  rows.push(["Total gross", formatCurrencyFromCents(payRun.grossCents)]);

  const filename = `pay-run-${format(payRun.periodStart, "yyyyMMdd")}-to-${format(payRun.periodEnd, "yyyyMMdd")}-summary.csv`;
  return { filename, content: toCsv(rows) };
}

export async function exportPayRunEntriesCsv(id: string) {
  const payRun = await getPayRunDetail(id);
  if (!payRun) throw new Error("Pay run not found");

  const rows: (string | number | null | undefined)[][] = [];
  rows.push([
    "Teacher",
    "Date",
    "Template",
    "Level",
    "Status",
    "Minutes final",
    "Gross at rate",
    "Rate cents",
  ]);

  const rateByTeacher = new Map(payRun.lines.map((l) => [l.teacherId, l.hourlyRateCentsSnapshot ?? null]));

  payRun.entries.forEach((entry) => {
    const rate = rateByTeacher.get(entry.teacherId ?? "");
    const cents = rate ? Math.round((entry.minutesFinal * rate) / 60) : null;
    rows.push([
      entry.teacher?.name ?? "Unassigned",
      format(entry.date, "yyyy-MM-dd"),
      entry.template.name ?? "Class",
      entry.template.level.name,
      entry.status,
      entry.minutesFinal,
      cents ? formatCurrencyFromCents(cents) : "",
      rate ?? "",
    ]);
  });

  const filename = `pay-run-${format(payRun.periodStart, "yyyyMMdd")}-to-${format(payRun.periodEnd, "yyyyMMdd")}-entries.csv`;
  return { filename, content: toCsv(rows) };
}
