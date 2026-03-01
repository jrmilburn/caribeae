import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { getTeacherForCurrentUser } from "@/server/teacher/getTeacherForCurrentUser";

export const requireTeacherAccess = cache(async () => {
  const access = await getTeacherForCurrentUser();

  if (access.status === "SIGNED_OUT") {
    redirect("/teacher/auth");
  }

  if (access.status !== "OK") {
    redirect("/teacher/auth?blocked=1");
  }

  return access.teacher;
});
