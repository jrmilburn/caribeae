"use server";

import { format } from "date-fns";

import type { TeacherHoursReport } from "./getTeacherHoursReport";
import { getTeacherHoursReport } from "./getTeacherHoursReport";

export type CsvExport = {
  filename: string;
  content: string;
};

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

function buildFilename(prefix: string, report: TeacherHoursReport) {
  const from = format(report.filters.from, "yyyy-MM-dd");
  const to = format(report.filters.to, "yyyy-MM-dd");
  return `${prefix}-${from}-to-${to}.csv`;
}

export async function exportTeacherSummaryCsv(filters: Parameters<typeof getTeacherHoursReport>[0]): Promise<CsvExport> {
  const report = await getTeacherHoursReport(filters);
  const rows: (string | number | null | undefined)[][] = [];
  rows.push(["Teacher", "Total classes", "Base hours", "Adjustment hours", "Final hours"]);

  report.teachers.forEach((teacher) => {
    rows.push([
      teacher.teacherName,
      teacher.totalClasses,
      minutesToHours(teacher.baseMinutes),
      minutesToHours(teacher.adjustmentMinutes),
      minutesToHours(teacher.finalMinutes),
    ]);
  });

  return {
    filename: buildFilename("teacher-hours-summary", report),
    content: toCsv(rows),
  };
}

export async function exportTeacherEntriesCsv(filters: Parameters<typeof getTeacherHoursReport>[0]): Promise<CsvExport> {
  const report = await getTeacherHoursReport(filters);
  const rows: (string | number | null | undefined)[][] = [];
  rows.push([
    "Teacher",
    "Date",
    "Class/Template",
    "Level",
    "Start time (min)",
    "End time (min)",
    "Status",
    "Source",
    "Base minutes",
    "Adjustment minutes",
    "Final minutes",
    "Substituted",
    "Cancelled",
  ]);

  report.teachers.forEach((teacher) => {
    teacher.entries.forEach((entry) => {
      rows.push([
        teacher.teacherName,
        format(entry.date, "yyyy-MM-dd"),
        entry.templateName ?? "Class",
        entry.levelName,
        entry.startTime ?? "",
        entry.endTime ?? "",
        entry.status,
        entry.source,
        entry.minutesBase,
        entry.minutesAdjustment,
        entry.minutesFinal,
        entry.substituted ? "yes" : "",
        entry.cancelled ? "yes" : "",
      ]);
    });
  });

  return {
    filename: buildFilename("teacher-hours-entries", report),
    content: toCsv(rows),
  };
}

export async function exportTeacherAdjustmentsCsv(filters: Parameters<typeof getTeacherHoursReport>[0]): Promise<CsvExport> {
  const report = await getTeacherHoursReport(filters);
  const rows: (string | number | null | undefined)[][] = [];
  rows.push(["Teacher", "Entry ID", "Date", "Minutes delta", "Reason", "Created at"]);

  const entryDateMap = new Map(report.teachers.flatMap((t) => t.entries.map((e) => [e.id, e.date] as const)));

  report.adjustments.forEach((adj) => {
    rows.push([
      adj.teacherName,
      adj.entryId,
      entryDateMap.get(adj.entryId) ? format(entryDateMap.get(adj.entryId) as Date, "yyyy-MM-dd") : "",
      adj.minutesDelta,
      adj.reason ?? "",
      format(adj.createdAt, "yyyy-MM-dd HH:mm"),
    ]);
  });

  return {
    filename: buildFilename("teacher-hours-adjustments", report),
    content: toCsv(rows),
  };
}
