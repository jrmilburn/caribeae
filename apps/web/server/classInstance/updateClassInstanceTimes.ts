import { prisma } from "@/lib/prisma";

export type UpdateClassInstanceTimesInput = {
  id: string;
  startTime: Date;
  endTime: Date;
};

export async function updateClassInstanceTimes(input: UpdateClassInstanceTimesInput) {
  const { id, startTime, endTime } = input;

  return prisma.classInstance.update({
    where: { id },
    data: {
      startTime,
      endTime,
    },
    include: {
      level: true,
      template: true,
    },
  });
}
