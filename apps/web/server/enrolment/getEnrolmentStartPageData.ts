"use server";

import { prisma } from "@/lib/prisma";

export type EnrolmentStartPageData = {
  students: Array<{
    id: string;
    name: string;
    familyName?: string | null;
  }>;
  templates: Array<{
    id: string;
    name: string | null;
    levelName: string;
    schedule: string;
  }>;
};

export async function getEnrolmentStartPageData(): Promise<EnrolmentStartPageData> {
  const [students, templates] = await Promise.all([
    prisma.student.findMany({
      select: {
        id: true,
        name: true,
        family: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.classTemplate.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        level: { select: { id: true, name: true } },
      },
      orderBy: [
        { level: { name: "asc" } },
        { name: "asc" },
      ],
    }),
  ]);

  return {
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      familyName: s.family?.name,
    })),
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      levelName: t.level?.name ?? "—",
      schedule: formatSchedule(t.dayOfWeek, t.startTime, t.endTime),
    })),
  };
}

function formatSchedule(dayOfWeek?: number | null, startMin?: number | null, endMin?: number | null) {
  const day = formatDay(dayOfWeek) ?? "—";
  const start = typeof startMin === "number" ? minTo12h(startMin) : "—";
  const end = typeof endMin === "number" ? minTo12h(endMin) : "—";

  if (day === "—" && start === "—" && end === "—") return "No schedule set";
  return `${day} ${start}–${end}`;
}

function formatDay(dayOfWeek?: number | null) {
  if (dayOfWeek === null || dayOfWeek === undefined) return null;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days[dayOfWeek] ?? null;
}

function minTo12h(totalMin: number) {
  const h24 = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12raw = h24 % 12;
  const h12 = h12raw === 0 ? 12 : h12raw;

  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
