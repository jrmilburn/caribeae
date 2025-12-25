import getClassTemplates from "@/server/classTemplate/getClassTemplates";
import { getLevels } from "@/server/level/getLevels";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeachers } from "@/server/teacher/getTeachers";
import TemplateList from "./templates/TemplateList";

export default async function AdminClassesPage() {
  await getOrCreateUser();
  await requireAdmin();

  const templates = await getClassTemplates();
  const levels = await getLevels();
  const teachers = await getTeachers();

  return (
    <div className="max-h-screen overflow-y-auto">
      <TemplateList templates={templates} levels={levels} teachers={teachers} />
    </div>
  );
}
