import { getLevels } from "@/server/level/getLevels"
import { requireAdmin } from "@/lib/requireAdmin";
import ScheduleWithTemplateModal from "./ScheduleWithTemplateModal";
import { getTeachers } from "@/server/teacher/getTeachers";
import { getOrCreateUser } from "@/lib/getOrCreateUser";

export default async function AdminSchedule() {

    await getOrCreateUser();
    await requireAdmin();

    const levels = await getLevels();
    const teachers = await getTeachers();

    return(
        <ScheduleWithTemplateModal levels={levels} teachers={teachers} />
    )

}
