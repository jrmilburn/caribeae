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

export type TemplateModalTemplate = {
  id: string;
  name: string | null;
  levelId: string;
  teacherId: string | null;
  startDate: Date;
  endDate: Date | null;
  dayOfWeek: number | null;
  startTime: number | null;
  endTime: number | null;
  capacity: number | null;
  active: boolean;
};
