"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function deleteSkill(id: string) {
  await getOrCreateUser();
  await requireAdmin();

  await prisma.skill.delete({
    where: {
      id,
    },
  });

  revalidatePath("/admin/settings/skills");
  revalidatePath("/teacher/students");
}
