// /app/admin/class/[id]/utils/time.ts
export const DAY_OPTIONS = [0, 1, 2, 3, 4, 5, 6] as const;

export function dayLabel(d: number) {
  // Your schema says 0-6 Mon-Sun
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return labels[d] ?? "—";
}

export function minutesToTimeInput(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeInputToMinutes(v: string) {
  // "HH:MM"
  const [hh, mm] = v.split(":").map((x) => Number(x));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0;
  return hh * 60 + mm;
}
