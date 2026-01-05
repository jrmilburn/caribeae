import { addDays, format, setHours, setMinutes } from "date-fns";
import {
  type ScheduleClass,
  normalizeScheduleClass,
  type Teacher,
  type Level,
} from "./schedule-types";

export type FetchClassesParams = {
  from: Date;
  to: Date;
  levelId?: string | null;
};

export type ScheduleDataAdapter = {
  /** Load projected class occurrences from templates. */
  fetchClasses: (params: FetchClassesParams) => Promise<ScheduleClass[]>;
  /** Persist a drag-and-drop move for a template occurrence. */
  moveTemplate?: (input: {
    templateId: string;
    startTime: Date;
    endTime: Date;
  }) => Promise<ScheduleClass>;
  /** Optional: load supporting metadata (teachers/levels) for labels. */
  fetchTeachers?: () => Promise<Teacher[]>;
  fetchLevels?: () => Promise<Level[]>;
};

// Minimal placeholder for consumers to wire in their own server actions later.
export const placeholderScheduleDataAdapter: ScheduleDataAdapter = {
  async fetchClasses(_params: FetchClassesParams) {
    void _params;
    return [];
  },
};

/**
 * API-backed adapter for fetching class occurrences through a Next.js route handler.
 * Keeps credentials for authenticated access and uses no-store caching to avoid stale data.
 */
export function createApiScheduleDataAdapter(
  endpoint: string = "/api/admin/class-templates"
): ScheduleDataAdapter {
  return {
    async fetchClasses({ from, to, levelId }) {
      const params = new URLSearchParams({
        from: format(from, "yyyy-MM-dd"),
        to: format(to, "yyyy-MM-dd"),
      });
      if (levelId) {
        params.set("levelId", levelId);
      }

      const response = await fetch(`${endpoint}?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Unable to load class schedule");
      }

      const payload = (await response.json()) as { classes?: ScheduleClass[] };

      if (!Array.isArray(payload.classes)) return [];

      return payload.classes.map((c) => ({
        ...c,
        startTime: new Date(c.startTime),
        endTime: new Date(c.endTime),
      }));
    },

    async moveTemplate(input) {
      const response = await fetch(`${endpoint}/${encodeURIComponent(input.templateId)}`, {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startTime: input.startTime.toISOString(),
          endTime: input.endTime.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to move class template");
      }

      const payload = (await response.json()) as { template?: ScheduleClass };
      if (!payload.template) {
        throw new Error("Invalid response from server");
      }
      return payload.template;
    },
  };
}

// Simple demo adapter that produces in-memory sample data so the component can render
// in isolation or storybook-like environments. Consumers should replace this with
// real implementations against their own API.
export const demoScheduleDataAdapter: ScheduleDataAdapter = {
  async fetchClasses({ from }) {
    const base = new Date(from);
    const startOfDay = (daysFromStart: number, hour: number, minute: number) => {
      const d = addDays(base, daysFromStart);
      return setMinutes(setHours(d, hour), minute);
    };

    const sample: ScheduleClass[] = [
      {
        id: "demo-1",
        templateId: "t1",
        templateName: "Beginner",
        startTime: startOfDay(0, 9, 0),
        endTime: startOfDay(0, 9, 45),
        level: { id: "l1", name: "Beginner" },
        teacher: { id: "t1", name: "Alex" },
        capacity: 6,
      },
      {
        id: "demo-2",
        templateId: "t2",
        templateName: "Intermediate",
        startTime: startOfDay(1, 11, 0),
        endTime: startOfDay(1, 12, 0),
        level: { id: "l2", name: "Intermediate" },
        teacher: { id: "t2", name: "Blake" },
        capacity: 8,
      },
      {
        id: "demo-3",
        templateId: "t3",
        templateName: "Beginner",
        startTime: startOfDay(2, 15, 15),
        endTime: startOfDay(2, 16, 0),
        level: { id: "l1", name: "Beginner" },
        teacher: { id: "t1", name: "Alex" },
        capacity: 4,
      },
    ];

    return sample.map(normalizeScheduleClass);
  },

  async fetchTeachers() {
    return [
      { id: "t1", name: "Alex" },
      { id: "t2", name: "Blake" },
    ];
  },

  async fetchLevels() {
    return [
      { id: "l1", name: "Beginner" },
      { id: "l2", name: "Intermediate" },
    ];
  },
};
