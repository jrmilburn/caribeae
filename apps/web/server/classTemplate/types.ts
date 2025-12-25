export type ClientTemplate = {
  name?: string;
  levelId: string;

  dayOfWeek?: number | null; // 0-6
  startTime?: number | null; // minutes since midnight
  endTime?: number | null;
  startDate: Date | string;
  endDate?: Date | string | null;

  capacity?: number | null;
  active?: boolean;

  teacherId?: string | null;
};
