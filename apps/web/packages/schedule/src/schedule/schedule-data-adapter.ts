import { addDays, setHours, setMinutes } from "date-fns";
import {
  type ClassInstance,
  type NormalizedClassInstance,
  normalizeClassInstance,
  type Teacher,
  type Level,
} from "./schedule-types";

export type FetchClassInstancesParams = {
  from: Date;
  to: Date;
};

export type MoveClassInstanceInput = {
  id: string;
  startTime: Date;
  endTime: Date;
};

export type ScheduleDataAdapter = {
  /** Load only concrete ClassInstances (no templates). */
  fetchClassInstances: (params: FetchClassInstancesParams) => Promise<ClassInstance[]>;
  /** Persist a drag-and-drop move. */
  moveClassInstance?: (input: MoveClassInstanceInput) => Promise<ClassInstance>;
  /** Optional: load supporting metadata (teachers/levels) for labels. */
  fetchTeachers?: () => Promise<Teacher[]>;
  fetchLevels?: () => Promise<Level[]>;
};

// Minimal placeholder for consumers to wire in their own server actions later.
export const placeholderScheduleDataAdapter: ScheduleDataAdapter = {
  async fetchClassInstances() {
    return [];
  },
  async moveClassInstance(input) {
    return normalizeClassInstance({
      id: input.id,
      startTime: input.startTime,
      endTime: input.endTime,
      level: { id: "unknown", name: "Level TBD" },
    });
  },
};

/**
 * API-backed adapter for fetching class instances through a Next.js route handler.
 * Keeps credentials for authenticated access and uses no-store caching to avoid stale data.
 */
export function createApiScheduleDataAdapter(
  endpoint: string = "/api/admin/class-instances"
): ScheduleDataAdapter {
  return {
    async fetchClassInstances({ from, to }) {
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });

      const response = await fetch(`${endpoint}?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Unable to load class instances");
      }

      const payload = (await response.json()) as { classInstances?: ClassInstance[] };
      return Array.isArray(payload.classInstances) ? payload.classInstances : [];
    },

    async moveClassInstance(input) {
      const response = await fetch(`${endpoint}/${encodeURIComponent(input.id)}`, {
        method: "PATCH",
        credentials: "include",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          startTime: input.startTime.toISOString(),
          endTime: input.endTime.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to move class instance");
      }

      const payload = (await response.json()) as { classInstance?: ClassInstance };
      if (!payload.classInstance) {
        throw new Error("Invalid response from server");
      }
      return payload.classInstance;
    },
  };
}

// Simple demo adapter that produces in-memory sample data so the component can render
// in isolation or storybook-like environments. Consumers should replace this with
// real implementations against their own API.
export const demoScheduleDataAdapter: ScheduleDataAdapter = {
  async fetchClassInstances({ from }) {
    const base = new Date(from);
    const startOfDay = (daysFromStart: number, hour: number, minute: number) => {
      const d = addDays(base, daysFromStart);
      return setMinutes(setHours(d, hour), minute);
    };

    const sample: ClassInstance[] = [
      {
        id: "demo-1",
        startTime: startOfDay(0, 9, 0),
        endTime: startOfDay(0, 9, 45),
        level: { id: "l1", name: "Beginner" },
        teacher: { id: "t1", name: "Alex" },
        capacity: 6,
        status: "SCHEDULED",
        location: "Pool A",
      },
      {
        id: "demo-2",
        startTime: startOfDay(1, 11, 0),
        endTime: startOfDay(1, 12, 0),
        level: { id: "l2", name: "Intermediate" },
        teacher: { id: "t2", name: "Blake" },
        capacity: 8,
        status: "SCHEDULED",
        location: "Pool B",
      },
      {
        id: "demo-3",
        startTime: startOfDay(2, 15, 15),
        endTime: startOfDay(2, 16, 0),
        level: { id: "l1", name: "Beginner" },
        teacher: { id: "t1", name: "Alex" },
        capacity: 4,
        status: "SCHEDULED",
        location: "Pool A",
      },
    ];

    return sample;
  },

  async moveClassInstance(input) {
    // No-op demo move: echo back a normalized instance with the new times.
    const norm: NormalizedClassInstance = normalizeClassInstance({
      id: input.id,
      startTime: input.startTime,
      endTime: input.endTime,
      level: { id: "l1", name: "Beginner" },
      teacher: { id: "t1", name: "Alex" },
    });
    return norm;
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
