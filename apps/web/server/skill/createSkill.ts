"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

type SkillInput = {
  name: string;
  levelId: string;
  description?: string | null;
  sortOrder?: number;
  active?: boolean;
};

export async function createSkill(input: SkillInput) {
  await getOrCreateUser();
  await requireAdmin();

  const name = input.name.trim();
  if (!name) {
    throw new Error("Skill name is required.");
  }

  const levelId = input.levelId.trim();
  if (!levelId) {
    throw new Error("Level is required.");
  }

  const level = await prisma.level.findUnique({
    where: { id: levelId },
    select: { id: true },
  });

  if (!level) {
    throw new Error("Level not found.");
  }

  const skill = await prisma.skill.create({
    data: {
      name,
      levelId,
      description: input.description?.trim() || null,
      sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
      active: input.active ?? true,
    },
  });

  revalidatePath("/admin/settings/skills");
  revalidatePath("/teacher/students");

  return skill;
}
