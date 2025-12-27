"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

type TeacherInput = {
  name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
};

export async function createTeacher(input: TeacherInput) {
  await getOrCreateUser();
  await requireAdmin();

  const name = input.name.trim();
  if (!name) {
    throw new Error("Name is required");
  }

  const email = input.email?.trim() || null;
  if (email && !email.includes("@")) {
    throw new Error("Email must be valid");
  }

  const teacher = await prisma.teacher.create({
    data: {
      name,
      position: input.position?.trim() || null,
      phone: input.phone?.trim() || null,
      email,
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/class");
  revalidatePath("/admin/schedule");

  return teacher;
}
