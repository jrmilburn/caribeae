export type EnrolmentNewPageData = {
  student: { id: string; name: string };
  family: { id: string; name: string };

  template: { id: string; levelId: string };
  templateName: string;
  levelName: string;

  plan: { id: string; name: string; blockLength: number };

  startDateIso: string;

  preview: {
    targetCount: number;
    required: Array<{
      classInstanceId: string;
      startTimeIso: string;
      endTimeIso: string;
      total: number;
      used: number;
      remaining: number;
      isFull: boolean;
    }>;
  };
};
