"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

type LevelInput = {
  name: string;
  levelOrder: number;
  defaultLengthMin: number;
  defaultCapacity?: number | null;
};

function validateLevelInput(input: LevelInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");

  if (!Number.isFinite(input.levelOrder)) throw new Error("Level order is invalid");
  if (!Number.isFinite(input.defaultLengthMin) || input.defaultLengthMin <= 0) {
    throw new Error("Default length must be greater than 0");
  }

  let defaultCapacity: number | null = null;
  if (input.defaultCapacity !== null && typeof input.defaultCapacity !== "undefined") {
    if (!Number.isFinite(input.defaultCapacity) || input.defaultCapacity <= 0) {
      throw new Error("Default capacity must be greater than 0");
    }
    defaultCapacity = input.defaultCapacity;
  }

  return {
    name,
    levelOrder: input.levelOrder,
    defaultLengthMin: input.defaultLengthMin,
    defaultCapacity,
  };
}

export async function createLevel(input: LevelInput) {
  await getOrCreateUser();
  await requireAdmin();

  const validated = validateLevelInput(input);

  const level = await prisma.level.create({
    data: validated,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/class");
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/enrolment-plans");

  return level;
}
