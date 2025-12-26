import { getLevels } from "@/server/level/getLevels"
import { requireAdmin } from "@/lib/requireAdmin";
import ScheduleWithTemplateModal from "./ScheduleWithTemplateModal";
import { getTeachers } from "@/server/teacher/getTeachers";

export default async function AdminSchedule() {

    await requireAdmin();

    const levels = await getLevels();
    const teachers = await getTeachers();

    return(
        <ScheduleWithTemplateModal levels={levels} teachers={teachers} />
    )

}
